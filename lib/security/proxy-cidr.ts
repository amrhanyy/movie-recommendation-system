/**
 * Trusted-proxy CIDR matching (M-01 / W3-003).
 *
 * Single Responsibility: all `node:net` BlockList parsing/matching lives here.
 * `lib/env.ts` keeps pure string validation only so edge-safe consumers
 * (instrumentation, health/ready) can import it freely without pulling
 * `node:` builtins into bundles that reject `node:` URIs.
 */

import { BlockList } from "node:net";

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
