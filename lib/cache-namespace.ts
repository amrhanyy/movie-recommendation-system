/**
 * Canonical cache namespace (F-009 / F-031 / F-052 hardening).
 *
 * Single server-only module that owns every cache-key prefix used by the
 * application:
 *
 *   movie-recommendation-system:{environment}:{cacheVersion}:{scope}:{resource}
 *
 * Properties:
 * - No email, IP, OAuth id, secret, or user-supplied text may appear in scope
 *   or resource components (callers must pass already-sanitized values).
 * - Keys are built here so the prefix is applied exactly once.
 * - Unknown/unprefixed Redis keys are never touched by scoped operations.
 * - Legacy unprefixed keys are left alone; they expire naturally via TTL or
 *   a controlled manual migration (documented in DEPLOYMENT_SECURITY_CHECKLIST.md).
 */

const APP_NAME = "movie-recommendation-system";
const ENVIRONMENT = process.env.NODE_ENV === "production" ? "production" : "development";
// Bump when the serialized cache schema changes (invalidates old keys)
const CACHE_VERSION = "v1";

export const CACHE_NAMESPACE = `${APP_NAME}:${ENVIRONMENT}:${CACHE_VERSION}:`;
export const LEGACY_NAMESPACE = `${APP_NAME}:`;

/** Logical cache scopes used across the application. */
export const CACHE_SCOPES = {
  publicTMDb: "public:tmdb",
  userRecommendations: "user:recommendations",
  rateLimit: "security:rate-limit",
  adminMetadata: "admin:cache-metadata",
  aiSimilar: "public:ai-similar",
} as const;

export type CacheScope = (typeof CACHE_SCOPES)[keyof typeof CACHE_SCOPES];

/** Maximum pipeline size for SCAN-batch deletion and single-request deletes. */
export const SCAN_BATCH_SIZE = 100;
export const MAX_DELETE_KEYS_PER_REQUEST = 1000;
export const MAX_SCAN_RESULTS = 2000;
/** Since we pre-suffix all internal keys, VALUES (not just prefix) are safe URLs. */
export const MAX_KEY_LENGTH = 512;

/**
 * Normalize a resource component so user-controlled input cannot escape the
 * namespace (e.g. "../../", "*", ":" separators).
 */
export function normalizeKeyComponent(input: string, maxLength = 120): string {
  return input
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, maxLength);
}

/**
 * Build a fully namespaced cache key.
 * `scope` must be one of CACHE_SCOPES; `resource` is normalized.
 * Never accepts raw user strings as the whole key.
 */
export function buildCacheKey(scope: CacheScope, resource: string): string {
  const normalized = normalizeKeyComponent(resource);
  const key = `${CACHE_NAMESPACE}${scope}:${normalized}`;
  if (key.length > MAX_KEY_LENGTH) {
    return key.slice(0, MAX_KEY_LENGTH);
  }
  return key;
}

/**
 * Wrap a logical key with the application prefix exactly once.
 * Used by RedisCache public methods so legacy callers keep working while all
 * stored keys live under the canonical namespace.
 */
export function applyNamespace(key: string): string {
  if (key.startsWith(CACHE_NAMESPACE)) return key;
  if (key.startsWith(LEGACY_NAMESPACE)) {
    // Re-key legacy entries into the versioned namespace
    return `${CACHE_NAMESPACE}${key.slice(LEGACY_NAMESPACE.length)}`;
  }
  return `${CACHE_NAMESPACE}${key}`;
}

/**
 * True if the key belongs to this application's canonical namespace.
 * Used to guard scoped SCAN/delete operations so foreign or unprefixed keys
 * are never touched.
 */
export function isNamespacedKey(key: string): boolean {
  return key.startsWith(CACHE_NAMESPACE);
}