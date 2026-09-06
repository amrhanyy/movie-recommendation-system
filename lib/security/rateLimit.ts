/**
 * Rate limiting module.
 *
 * Design:
 * - Redis-backed rate limiting when Redis is healthy.
 * - Safe in-memory bounded fallback for development or Redis failure.
 * - Per-user key for authenticated routes.
 * - Privacy-aware IP fallback for public routes.
 * - Environment and route prefixes.
 * - Bounded memory storage with cleanup.
 *
 * F-011 fix: no rate limiting existed anywhere.
 */

import { createHash } from "node:crypto";
import getRedisClient from "@/lib/redis";
import { CACHE_NAMESPACE } from "@/lib/cache-namespace";
import { parseTrustedProxyCidrList, ipInCidrList } from "@/lib/env";
import { NextRequest, NextResponse } from "next/server";

// In-memory fallback store
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const memoryStore = new Map<string, RateLimitEntry>();
const MAX_MEMORY_ENTRIES = 10_000;

// Cleanup expired entries periodically
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanupMemoryStore() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of memoryStore.entries()) {
    if (now > entry.resetTime) {
      memoryStore.delete(key);
    }
  }

  // If still too many entries, evict oldest
  if (memoryStore.size > MAX_MEMORY_ENTRIES) {
    const entries = Array.from(memoryStore.entries()).sort(
      (a, b) => a[1].resetTime - b[1].resetTime
    );
    const toRemove = entries.slice(0, memoryStore.size - MAX_MEMORY_ENTRIES);
    for (const [key] of toRemove) {
      memoryStore.delete(key);
    }
  }
}

export interface RateLimitConfig {
  // Maximum requests allowed in the window
  maxRequests: number;
  // Time window in milliseconds
  windowMs: number;
  // Optional: use a specific key prefix (default: "rl")
  prefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfterMs: number;
}

/**
 * Conservative IP shape validation (not a full RFC parse — this feeds a
 * rate-limit bucket key, not an authorization decision).
 */
function isValidIp(value: string): boolean {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split(".").every((octet) => Number(octet) <= 255);
  }
  // IPv6 (incl. IPv4-mapped / abbreviated): hex, colons, optional dots
  return (
    /^[0-9a-fA-F:.]+$/.test(value) &&
    value.includes(":") &&
    value.length <= 45
  );
}

/**
 * Get a spoof-resistant client identifier from the request (M-01).
 *
 * Old behavior trusted the *first* hop of `X-Forwarded-For`, which is
 * client-controlled and allowed unlimited rate-limit budget rotation.
 *
 * Hardened behavior (the identifier must NOT depend on any client-forgeable
 * value, otherwise the attacker can mint fresh budgets by rotating a header):
 * - If `TRUSTED_PROXY_CIDRS` is configured, drop rightmost hops that match a
 *   trusted proxy and use the first remaining (untrusted) hop — RFC 7239
 *   style. That hop is the real client as recorded by the trusted edge.
 * - If no allowlist is configured, use the *rightmost* hop only, which is the
 *   entry a sanitizing reverse proxy/CDN appends last. We deliberately do NOT
 *   include a hash of the raw header in the key: any client-writable component
 *   would allow trivial budget rotation.
 * - The candidate must pass IP shape validation, else we fall back to a
 *   privacy-aware user-agent fingerprint (no raw IP is ever logged).
 * - `X-Real-IP` is honored only when it is a single valid IP; it is a last
 *   resort before the UA fingerprint.
 */
function getClientIdentifier(request: NextRequest): string {
  const ua = request.headers.get("user-agent") || "unknown";
  const uaHash = createHash("sha256").update(`ua:${ua}`).digest("hex").slice(0, 16);

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) {
      let candidate = "";
      let trustedList: { network: string[]; mask: number }[] = [];
      try {
        trustedList = parseTrustedProxyCidrList(process.env);
      } catch {
        trustedList = [];
      }
      if (trustedList.length > 0) {
        // RFC 7239: walk from the right, skipping trusted-proxy addresses,
        // and take the first untrusted hop (the real client).
        for (let i = hops.length - 1; i >= 0; i--) {
          if (ipInCidrList(hops[i], trustedList)) continue;
          candidate = hops[i];
          break;
        }
      } else {
        // No allowlist: the rightmost hop is the proxy-appended client IP.
        candidate = hops[hops.length - 1];
      }
      if (isValidIp(candidate)) {
        // Compound with a UA hash so a shared NAT/egress IP doesn't let
        // unrelated users share one budget (stability preserved per client).
        return `ip:${candidate}:${uaHash}`;
      }
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    const trimmed = realIp.trim();
    if (isValidIp(trimmed)) {
      return `ip:${trimmed}:${uaHash}`;
    }
  }

  // No trustworthy IP: privacy-aware UA fingerprint (no raw IP logged).
  return `ua:${uaHash}`;
}

/**
 * Check rate limit for a request.
 * Uses Redis if available, falls back to in-memory.
 */
export async function checkRateLimit(
  request: NextRequest,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const prefix = config.prefix || "rl";
  // Rate-limit keys live under the canonical application namespace with the
  // security:rate-limit scope (isolated from content-cache keys), and the
  // fullKey is built server-side from validated components only.
  const fullKey = `${CACHE_NAMESPACE}${prefix}:${key}`
  const now = Date.now();
  const resetTime = now + config.windowMs;

  cleanupMemoryStore();

  // Try Redis first
  try {
    const redis = await getRedisClient();
    if (redis && redis.isOpen) {
      const current = await redis.incr(fullKey);
      if (current === 1) {
        await redis.pExpire(fullKey, config.windowMs);
      }
      const ttl = await redis.pTTL(fullKey);
      const retryAfterMs = ttl > 0 ? ttl : config.windowMs;

      if (current > config.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: now + retryAfterMs,
          retryAfterMs,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, config.maxRequests - current),
        resetTime: now + retryAfterMs,
        retryAfterMs: 0,
      };
    }
  } catch {
    // Redis failed — fall through to in-memory
  }

  // In-memory fallback
  const entry = memoryStore.get(fullKey);

  if (!entry || now > entry.resetTime) {
    memoryStore.set(fullKey, { count: 1, resetTime });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime,
      retryAfterMs: 0,
    };
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      retryAfterMs: entry.resetTime - now,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetTime: entry.resetTime,
    retryAfterMs: 0,
  };
}

/**
 * Create a rate-limit response (429 with Retry-After header).
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": Math.ceil(result.retryAfterMs / 1000).toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": Math.ceil(result.resetTime / 1000).toString(),
      },
    }
  );
}

/**
 * Rate limit configurations for different route types.
 */
export const RATE_LIMITS = {
  // AI routes — strict per-user limits
  chat: { maxRequests: 10, windowMs: 60_000, prefix: "chat" }, // 10/min
  aiRecommendations: { maxRequests: 5, windowMs: 60_000, prefix: "ai-recs" }, // 5/min
  aiSimilar: { maxRequests: 10, windowMs: 60_000, prefix: "ai-similar" }, // 10/min

  // Search — moderate per-IP limit
  search: { maxRequests: 30, windowMs: 60_000, prefix: "search" }, // 30/min

  // Public TMDB proxy routes — moderate per-IP limit (F-028)
  tmdbProxy: { maxRequests: 60, windowMs: 60_000, prefix: "tmdb" }, // 60/min

  // Expensive TMDB proxy routes with heavy upstream fan-out (M-03):
  // /api/genres (~20+ discover calls), /api/trailers (1 + up to 10 calls)
  tmdbProxyStrict: { maxRequests: 10, windowMs: 60_000, prefix: "tmdb-strict" }, // 10/min

  // Per-user list writes (M-05): favorites / watchlist POST
  listWrite: { maxRequests: 20, windowMs: 60_000, prefix: "list-write" }, // 20/min

  // Mood recommendations
  mood: { maxRequests: 20, windowMs: 60_000, prefix: "mood" }, // 20/min

  // Auth-sensitive operations
  auth: { maxRequests: 10, windowMs: 60_000, prefix: "auth" }, // 10/min

  // Admin mutations
  adminMutation: { maxRequests: 30, windowMs: 60_000, prefix: "admin" }, // 30/min

  // Profile updates
  profileUpdate: { maxRequests: 10, windowMs: 60_000, prefix: "profile" }, // 10/min

  // Chat history writes
  chatHistoryWrite: { maxRequests: 20, windowMs: 60_000, prefix: "chat-hist" }, // 20/min

  // Cache administration
  cacheAdmin: { maxRequests: 10, windowMs: 60_000, prefix: "cache-admin" }, // 10/min

  // Privacy operations (R6)
  userExport: { maxRequests: 5, windowMs: 300_000, prefix: "user-export" }, // 5/5min
  accountDelete: { maxRequests: 2, windowMs: 300_000, prefix: "user-delete" }, // 2/5min
  historyDelete: { maxRequests: 10, windowMs: 60_000, prefix: "history-del" }, // 10/min
  chatDeleteAll: { maxRequests: 5, windowMs: 60_000, prefix: "chat-del" }, // 5/min
  historyPreference: { maxRequests: 10, windowMs: 60_000, prefix: "hist-pref" }, // 10/min
} as const;

/**
 * Helper: apply rate limit to an authenticated request.
 * Uses the user's email as the key.
 */
export async function applyRateLimitUser(
  request: NextRequest,
  userEmail: string,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const result = await checkRateLimit(request, `user:${userEmail}`, config);
  if (!result.allowed) {
    return rateLimitResponse(result);
  }
  return null;
}

/**
 * Helper: apply rate limit to a public (unauthenticated) request.
 * Uses a privacy-aware client identifier.
 */
export async function applyRateLimitPublic(
  request: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const clientId = getClientIdentifier(request);
  const result = await checkRateLimit(request, clientId, config);
  if (!result.allowed) {
    return rateLimitResponse(result);
  }
  return null;
}
