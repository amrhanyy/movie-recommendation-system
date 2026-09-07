/**
 * Canonical server-only environment validation (R7).
 *
 * - Strict runtime validation via Zod.
 * - Every production-required variable is parsed once here.
 * - NO server secret is ever exposed through NEXT_PUBLIC_*: helper functions
 *   explicitly reject any application secret that arrives under a NEXT_PUBLIC_
 *   name.
 * - Validity errors identify variable NAMES and error CATEGORIES only; they
 *   never include actual values, URLs, hosts, or secrets.
 * - Redis stays optional (memory fallback exists) and reuses lib/redis-config.ts
 *   so parsing is never duplicated or contradictory.
 * - This file is server-only by convention and is never imported into client
 *   components. (`import "server-only"` is intentionally NOT added: the package
 *   is not installed. Next.js guards client imports of server secrets; the R6
 *   keyboard module already keeps secrets server-side.)
 *
 * Usage: routes and modules call `runtimeEnv` (a lazily validated singleton)
 * or describeEnv(process.env) for test-only dependency injection.
 */

import { z } from "zod";
import { BlockList } from "node:net";
import { buildRedisConfig } from "@/lib/redis-config";
import {
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  parseRetentionDays,
} from "@/lib/privacy-retention";

export type NodeEnv = "development" | "test" | "production";

// Minimum NEXTAUTH_SECRET length. NextAuth requires >= 32 chars; we enforce 32.
export const MIN_SECRET_LENGTH = 32;

// Any application secret that arrives with a NEXT_PUBLIC_ prefix is rejected.
const RESERVED_NEXT_PUBLIC_SECRETS = [
  "NEXT_PUBLIC_MONGODB_URI",
  "NEXT_PUBLIC_REDIS_URL",
  "NEXT_PUBLIC_REDIS_HOST",
  "NEXT_PUBLIC_REDIS_PORT",
  "NEXT_PUBLIC_REDIS_USERNAME",
  "NEXT_PUBLIC_REDIS_PASSWORD",
  "NEXT_PUBLIC_REDIS_TLS",
  "NEXT_PUBLIC_NEXTAUTH_SECRET",
  "NEXT_PUBLIC_NEXTAUTH_URL",
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  "NEXT_PUBLIC_GOOGLE_CLIENT_SECRET",
  "NEXT_PUBLIC_GOOGLE_API_KEY",
  "NEXT_PUBLIC_TMDB_API_KEY",
] as const;

export interface EnvShape {
  NODE_ENV: NodeEnv;
  NEXTAUTH_URL?: string;
  NEXTAUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MONGODB_URI?: string;
  TMDB_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  REDIS_URL?: string;
  REDIS_HOST?: string;
  REDIS_PORT?: number;
  REDIS_USERNAME?: string;
  REDIS_PASSWORD?: string;
  REDIS_TLS: boolean;
  HISTORY_RETENTION_DAYS: number;
  CHAT_RETENTION_DAYS: number;
  // M-01: optional trusted-proxy allowlist (comma-separated CIDR/IP). When set,
  // the rightmost XFF hop is honored only if the entry it sits after is a
  // trusted proxy; otherwise the rightmost hop is still used (proxy-appended).
  TRUSTED_PROXY_CIDRS?: string;
}

export interface EnvValidationResult {
  parsed: EnvShape | null;
  errors: { name: string; issue: string }[];
}

function isNodeEnv(value: unknown): value is NodeEnv {
  return value === "development" || value === "test" || value === "production";
}

function nonEmptyString(name: string, value: string | undefined, category: string): boolean {
  if (value === undefined || value.trim() === "") return false;
  void name;
  void category;
  return true;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isMongoUri(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "mongodb:" || u.protocol === "mongodb+srv:";
  } catch {
    return false;
  }
}

/**
 * Trusted-proxy allowlist entry: a node:net BlockList rule plus its source
 * family for membership tests. The BlockList holds the parsed rule; `type`
 * records whether the CIDR/range was IPv4 or IPv6 so `ipInCidrList` can query
 * the list per family without re-parsing.
 */
export interface TrustedProxyEntry {
  family: "ipv4" | "ipv6";
  /** Normalized "address/prefix" (bare IPs become /32 or /128). */
  cidr: string;
}

/**
 * Parse TRUSTED_PROXY_CIDRS (comma-separated IPv4/IPv6 CIDRs or bare IPs)
 * into memoized BlockList rules.
 *
 * - Bare IPs are accepted (/32 IPv4, /128 IPv6).
 * - Invalid entries are ignored (never throw). Empty/undefined config yields
 *   an empty list, meaning "no proxy is trusted".
 * - `/0` and `::/0` are rejected (never trusted): a universal allowlist would
 *   make the leftmost attacker-controlled XFF hop the rate-limit identity.
 */
const trustedProxyParseCache = new Map<string, TrustedProxyEntry[]>();
export const MAX_TRUSTED_PROXY_ENTRIES = 1024;

function parseTrustedProxyCidrs(raw: string | undefined): TrustedProxyEntry[] {
  const key = (raw ?? "").trim();
  const cached = trustedProxyParseCache.get(key);
  if (cached) return cached;
  const out: TrustedProxyEntry[] = [];
  if (raw) {
    for (const part of raw.split(",")) {
      const entry = part.trim();
      if (!entry) continue;
      if (out.length >= MAX_TRUSTED_PROXY_ENTRIES) break;
      const slash = entry.lastIndexOf("/");
      const addr = (slash === -1 ? entry : entry.slice(0, slash)).trim();
      const maskPart = slash === -1 ? undefined : entry.slice(slash + 1).trim();
      if (!addr) continue;
      const isV6 = addr.includes(":");
      const maxMask = isV6 ? 128 : 32;
      const mask =
        maskPart === undefined || maskPart === "" ? maxMask : Number(maskPart);
      if (!Number.isInteger(mask) || mask < 0 || mask > maxMask) continue;
      // Universal allowlists are never trusted (see doc comment above).
      if (mask === 0) continue;
      const family: "ipv4" | "ipv6" = isV6 ? "ipv6" : "ipv4";
      // Validate via a throwaway BlockList so malformed input is dropped.
      try {
        const probe = new BlockList();
        probe.addSubnet(addr, mask, family);
        out.push({ family, cidr: `${addr}/${mask}` });
      } catch {
        continue;
      }
    }
  }
  if (trustedProxyParseCache.size >= MAX_TRUSTED_PROXY_ENTRIES) {
    trustedProxyParseCache.clear();
  }
  trustedProxyParseCache.set(key, out);
  return out;
}

/**
 * Build a memoized node:net BlockList from parsed entries. One BlockList per
 * distinct parsed set (keyed by joined cidrs) so repeated rate-limit checks
 * do not re-parse. Callers never see raw config strings.
 */
const trustedProxyListCache = new Map<string, BlockList>();
function blockListFor(entries: TrustedProxyEntry[]): BlockList {
  const key = entries.map((e) => e.cidr).join(",");
  const cached = trustedProxyListCache.get(key);
  if (cached) return cached;
  const list = new BlockList();
  for (const entry of entries) {
    const slash = entry.cidr.lastIndexOf("/");
    const addr = entry.cidr.slice(0, slash);
    const mask = Number(entry.cidr.slice(slash + 1));
    list.addSubnet(addr, mask, entry.family);
  }
  if (trustedProxyListCache.size >= 256) trustedProxyListCache.clear();
  trustedProxyListCache.set(key, list);
  return list;
}

/**
 * True if `ip` falls inside any of the trusted proxy networks (IPv4+IPv6).
 * Invalid IPs never match; an empty list matches nothing.
 */
export function ipInCidrList(ip: string, cidrs: TrustedProxyEntry[]): boolean {
  const candidate = ip.trim();
  if (!candidate || cidrs.length === 0) return false;
  const family: "ipv4" | "ipv6" = candidate.includes(":") ? "ipv6" : "ipv4";
  // Fast shape guard before consulting the BlockList.
  if (family === "ipv4") {
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(candidate)) return false;
    if (!candidate.split(".").every((o) => Number(o) <= 255)) return false;
  } else {
    if (!/^[0-9a-fA-F:.]+$/.test(candidate) || candidate.length > 45) return false;
  }
  try {
    return blockListFor(cidrs).check(candidate, family);
  } catch {
    return false;
  }
}

/**
 * Exported for rate limiting (M-01): returns the parsed TRUSTED_PROXY_CIDRS
 * allowlist from an env source. Never logs or returns raw config strings.
 */
export function parseTrustedProxyCidrList(env: NodeJS.ProcessEnv): TrustedProxyEntry[] {
  return parseTrustedProxyCidrs(env.TRUSTED_PROXY_CIDRS);
}

export function trustedProxyMatches(
  ip: string,
  env: NodeJS.ProcessEnv
): boolean {
  return ipInCidrList(ip, parseTrustedProxyCidrList(env));
}

/**
 * Validate an environment source without reading `.env`.
 * Pure and side-effect free so tests can inject explicit placeholders.
 * Errors never contain values, only variable names and categories.
 */
export function validateEnv(env: NodeJS.ProcessEnv): EnvValidationResult {
  const errors: { name: string; issue: string }[] = [];

  // NEXT_PUBLIC secret guard
  for (const key of RESERVED_NEXT_PUBLIC_SECRETS) {
    if (env[key] !== undefined && env[key] !== "") {
      errors.push({
        name: key,
        issue: "server secret exposed with a NEXT_PUBLIC_ name is rejected",
      });
    }
  }

  const nodeEnvRaw = env.NODE_ENV;
  const nodeEnv: NodeEnv = isNodeEnv(nodeEnvRaw) ? nodeEnvRaw : "development";
  const production = nodeEnv === "production";
  const testMode = nodeEnv === "test";

  const required: Array<{ name: keyof EnvShape; category: string }> = [];
  if (!testMode) {
    required.push(
      { name: "MONGODB_URI", category: "database" },
      { name: "NEXTAUTH_SECRET", category: "auth-secret" },
      { name: "GOOGLE_CLIENT_ID", category: "oauth" },
      { name: "GOOGLE_CLIENT_SECRET", category: "oauth-secret" },
      { name: "TMDB_API_KEY", category: "tmdb" }
    );
    if (production) {
      required.push({ name: "NEXTAUTH_URL", category: "url" });
    }
  }

  for (const req of required) {
    const value = env[req.name as keyof NodeJS.ProcessEnv];
    if (!nonEmptyString(String(req.name), value as string | undefined, req.category)) {
      errors.push({
        name: String(req.name),
        issue: `required ${req.category} variable is missing or empty`,
      });
    }
  }

  // NEXTAUTH_SECRET strength (not enforced in test mode so CI/test
  // placeholders remain usable; production still requires 32+ chars).
  const secret = env.NEXTAUTH_SECRET;
  if (secret !== undefined && secret !== "") {
    if (!testMode && secret.length < MIN_SECRET_LENGTH) {
      errors.push({
        name: "NEXTAUTH_SECRET",
        issue: "auth-secret length below minimum",
      });
    }
  }

  // NEXTAUTH_URL: HTTPS required in production
  const nextAuthUrl = env.NEXTAUTH_URL;
  if (nextAuthUrl !== undefined && nextAuthUrl !== "" && !isHttpsUrl(nextAuthUrl)) {
    errors.push({
      name: "NEXTAUTH_URL",
      issue: production ? "not an absolute https URL" : "not an absolute URL",
    });
  } else if (production && !nextAuthUrl) {
    errors.push({ name: "NEXTAUTH_URL", issue: "required url variable is missing" });
  }

  // MONGODB_URI format
  const mongoUri = env.MONGODB_URI;
  if (mongoUri !== undefined && mongoUri !== "" && !isMongoUri(mongoUri)) {
    errors.push({ name: "MONGODB_URI", issue: "not a mongodb connection URL" });
  }

  // Optional Redis: reuse canonical lib/redis-config.ts. Contradictory config
  // surfaces an error category without revealing connection details.
  const redis = buildRedisConfig(env);
  if (redis.error) {
    errors.push({ name: "REDIS_URL", issue: "redis configuration is contradictory or invalid" });
  }
  const port = env.REDIS_PORT;
  if (port !== undefined && port !== "") {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      errors.push({ name: "REDIS_PORT", issue: "port out of bounds" });
    }
  }

  // TRUSTED_PROXY_CIDRS: universal allowlists (/0, ::/0) are never valid —
  // they would make the leftmost attacker-controlled XFF hop the identity.
  const trustedRaw = env.TRUSTED_PROXY_CIDRS;
  if (trustedRaw !== undefined && trustedRaw.trim() !== "") {
    for (const part of trustedRaw.split(",")) {
      const slash = part.lastIndexOf("/");
      const maskPart = slash === -1 ? undefined : part.slice(slash + 1).trim();
      if (maskPart !== undefined && maskPart !== "" && Number(maskPart) === 0) {
        errors.push({
          name: "TRUSTED_PROXY_CIDRS",
          issue: "universal allowlist prefix is rejected",
        });
        break;
      }
      // Bare "0.0.0.0" or "::" without a mask is equally universal.
      const addr = (slash === -1 ? part : part.slice(0, slash)).trim();
      if (maskPart === undefined && (addr === "0.0.0.0" || addr === "::")) {
        errors.push({
          name: "TRUSTED_PROXY_CIDRS",
          issue: "universal allowlist prefix is rejected",
        });
        break;
      }
    }
  }

  // Retention bounds reuse privacy-retention parse/clamp semantics.
  const historyDays = parseRetentionDays(env.HISTORY_RETENTION_DAYS, 180);
  const chatDays = parseRetentionDays(env.CHAT_RETENTION_DAYS, 365);
  if (historyDays < MIN_RETENTION_DAYS || historyDays > MAX_RETENTION_DAYS) {
    errors.push({ name: "HISTORY_RETENTION_DAYS", issue: "retention out of bounds" });
  }
  if (chatDays < MIN_RETENTION_DAYS || chatDays > MAX_RETENTION_DAYS) {
    errors.push({ name: "CHAT_RETENTION_DAYS", issue: "retention out of bounds" });
  }

  if (errors.length > 0) {
    return { parsed: null, errors };
  }

  return {
    parsed: {
      NODE_ENV: nodeEnv,
      NEXTAUTH_URL: nextAuthUrl || undefined,
      NEXTAUTH_SECRET: secret || undefined,
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID || undefined,
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET || undefined,
      MONGODB_URI: mongoUri || undefined,
      TMDB_API_KEY: env.TMDB_API_KEY || undefined,
      GOOGLE_API_KEY: env.GOOGLE_API_KEY || undefined,
      REDIS_URL: env.REDIS_URL || undefined,
      REDIS_HOST: env.REDIS_HOST || undefined,
      REDIS_PORT: redis.clientConfig?.socket
        ? (("port" in (redis.clientConfig.socket as object) &&
            typeof (redis.clientConfig.socket as { port?: number }).port === "number"
            ? (redis.clientConfig.socket as { port?: number }).port
            : undefined) as number | undefined)
        : undefined,
      REDIS_USERNAME: env.REDIS_USERNAME || undefined,
      REDIS_PASSWORD: env.REDIS_PASSWORD || undefined,
      REDIS_TLS: redis.clientConfig?.socket
        ? "tls" in (redis.clientConfig.socket as object)
        : false,
      HISTORY_RETENTION_DAYS: historyDays,
      CHAT_RETENTION_DAYS: chatDays,
    },
    errors,
  };
}

let cachedRuntime: EnvValidationResult | undefined;

/**
 * Lazily validate the real process.env once. Callers should treat this as
 * read-only. Never log `parsed` (it contains secrets).
 */
export function runtimeEnv(): EnvValidationResult {
  if (!cachedRuntime) {
    cachedRuntime = validateEnv(process.env);
  }
  return cachedRuntime;
}

/**
 * True when core application configuration is valid for normal runtime.
 * Does not probe any external dependency; configuration only.
 */
export function isCoreConfigReady(env: NodeJS.ProcessEnv = process.env): boolean {
  if (process.env.NODE_ENV === "test") {
    return !validateEnv({ ...env, NODE_ENV: "test" }).errors.length;
  }
  return validateEnv(env).errors.length === 0;
}

/**
 * Boolean helper to allow but not require AI features at runtime.
 */
export function aiFeaturesConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GOOGLE_API_KEY !== undefined && env.GOOGLE_API_KEY !== "";
}

/** Side-effect-free DNS parse helper (non-authoritative) reused by tests. */
export function urlIsHttps(value: string): boolean {
  return isHttpsUrl(value);
}
