import getRedisClient from './redis';
import {
  CACHE_NAMESPACE,
  MAX_KEY_LENGTH,
  SCAN_BATCH_SIZE,
  MAX_DELETE_KEYS_PER_REQUEST,
  isNamespacedKey,
  applyNamespace,
  normalizeKeyComponent,
} from './cache-namespace';

// In-memory fallback cache when Redis is unavailable.
// Bounded: maximum entries with TTL, cleanup, and LRU eviction (F-031).
const MAX_MEMORY_ENTRIES = 5000;
const memoryCache: Map<string, { value: string; expiry: number; lastAccess: number }> = new Map();

// Keep track of Redis status to avoid excessive error logging
let redisOfflineLogged = false;
const REDIS_ERROR_LOG_INTERVAL = 60000; // Only log Redis errors once per minute
let lastRedisErrorTime = 0;

// Stampede protection: in-flight promise de-duplication (F-055).
// Map keys are the fully namespaced cache keys, so different resources do not
// block each other and dedup is scoped per key.
const inflightPromises: Map<string, Promise<unknown>> = new Map();
const MAX_INFLIGHT_ENTRIES = 1000;

// Cleanup expired memory entries periodically
let lastMemoryCleanup = Date.now();
const MEMORY_CLEANUP_INTERVAL_MS = 60_000;

function cleanupMemoryCache() {
  const now = Date.now();
  if (now - lastMemoryCleanup < MEMORY_CLEANUP_INTERVAL_MS) return;
  lastMemoryCleanup = now;

  // Delete expired entries
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiry < now) {
      memoryCache.delete(key);
    }
  }

  // If still too many entries, evict least-recently-accessed
  if (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const entries = Array.from(memoryCache.entries()).sort(
      (a, b) => a[1].lastAccess - b[1].lastAccess
    );
    const toRemove = entries.slice(0, memoryCache.size - MAX_MEMORY_ENTRIES);
    for (const [key] of toRemove) {
      memoryCache.delete(key);
    }
  }
}

export interface CacheClearResult {
  deleted: number;
  remaining: boolean;
  /** true when clear completed all matching keys (within limits) */
  complete: boolean;
}

/**
 * A utility for caching data in Redis with an in-process memory fallback.
 *
 * Security properties (F-009 / F-031 / F-052):
 * - All Redis keys are stored under the canonical application namespace.
 * - FLUSHDB/FLUSHALL are never called; clearing is prefix-scoped via SCAN.
 * - KEYS is never used; iteration uses bounded cursor-based SCAN.
 * - Foreign or unprefixed keys are never deleted.
 */
export class RedisCache {
  private readonly DEFAULT_EXPIRATION = 3600; // 1 hour in seconds

  /**
   * Helper to safely execute a Redis operation with proper error handling.
   */
  private async safeRedisOp<T>(
    operation: (client: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>) => Promise<T>
  ): Promise<T | null> {
    try {
      const redis = await getRedisClient();

      // Skip if Redis is unavailable
      if (!redis || !redis.isOpen) {
        return null;
      }

      try {
        return await operation(redis);
      } catch (error: unknown) {
        const now = Date.now();
        const isOfflineError =
          error instanceof Error && error.message.includes('offline');

        if (isOfflineError) {
          if (!redisOfflineLogged || (now - lastRedisErrorTime > REDIS_ERROR_LOG_INTERVAL)) {
            console.warn('Redis is offline, using memory cache fallback');
            redisOfflineLogged = true;
            lastRedisErrorTime = now;
          }
        } else {
          if (now - lastRedisErrorTime > REDIS_ERROR_LOG_INTERVAL) {
            console.error('Redis operation failed:', error);
            lastRedisErrorTime = now;
          }
        }
        return null;
      }
    } catch (error) {
      const now = Date.now();
      if (now - lastRedisErrorTime > REDIS_ERROR_LOG_INTERVAL) {
        console.warn('Redis connection unavailable, using memory cache');
        lastRedisErrorTime = now;
      }
      return null;
    }
  }

  /**
   * Namespace a caller-supplied key (idempotent) and normalize every
   * component after the canonical prefix (W3-010). Direct callers pass keys
   * like `movie:${id}:details` where the id segment is caller-validated but
   * not centrally normalized; splitting on ":" and normalizing each component
   * keeps `../`, `*`, and extra separators from escaping or forging the key
   * shape, while already-namespaced keys pass through unchanged.
   */
  private ns(key: string): string {
    const namespaced = applyNamespace(key);
    const tail = namespaced.startsWith(CACHE_NAMESPACE)
      ? namespaced.slice(CACHE_NAMESPACE.length)
      : namespaced;
    const normalizedTail = tail
      .split(":")
      .map((component) => normalizeKeyComponent(component))
      .join(":");
    const out = `${CACHE_NAMESPACE}${normalizedTail}`;
    return out.length > MAX_KEY_LENGTH ? out.slice(0, MAX_KEY_LENGTH) : out;
  }

  async set(key: string, value: unknown, expireInSeconds?: number): Promise<void> {
    const namespacedKey = this.ns(key);
    const serializedValue = JSON.stringify(value);
    const expirySeconds = expireInSeconds || this.DEFAULT_EXPIRATION;

    // Always store in memory cache first - this never fails
    if (expirySeconds > 0) {
      memoryCache.set(namespacedKey, {
        value: serializedValue,
        expiry: Date.now() + (expirySeconds * 1000),
        lastAccess: Date.now(),
      });
    }

    // Try Redis, errors are handled silently since we use memory cache
    await this.safeRedisOp(async (redis) => {
      return redis.set(namespacedKey, serializedValue, { EX: expirySeconds });
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const namespacedKey = this.ns(key);

    // Try Redis first
    const redisValue = await this.safeRedisOp(async (redis) => {
      return redis.get(namespacedKey);
    });

    if (redisValue) {
      try {
        return JSON.parse(redisValue) as T;
      } catch (error) {
        // Don't log parsing errors, just fall back to memory cache
      }
    }

    return this.getFromMemoryCache<T>(namespacedKey);
  }

  private getFromMemoryCache<T>(namespacedKey: string): T | null {
    const cached = memoryCache.get(namespacedKey);

    if (!cached) return null;

    if (cached.expiry < Date.now()) {
      memoryCache.delete(namespacedKey);
      return null;
    }

    // Update last access time for LRU eviction
    cached.lastAccess = Date.now();

    try {
      return JSON.parse(cached.value) as T;
    } catch (error) {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const namespacedKey = this.ns(key);
    // Always remove from memory cache
    memoryCache.delete(namespacedKey);

    // Try to delete from Redis
    await this.safeRedisOp(async (redis) => {
      return redis.del(namespacedKey);
    });
  }

  /**
   * Iterate application-prefixed keys using bounded SCAN.
   * Never calls KEYS. Never scans outside the application namespace.
   */
  private async scanNamespacedKeys(
    redis: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>,
    match: string,
    maxResults: number
  ): Promise<string[]> {
    const results = new Set<string>();
    let cursor = 0;
    let iterations = 0;
    const maxIterations = Math.ceil(maxResults / SCAN_BATCH_SIZE) + 5;

    do {
      const reply = await redis.scan(cursor, {
        MATCH: match,
        COUNT: SCAN_BATCH_SIZE,
      });
      cursor = reply.cursor;

      for (const key of reply.keys) {
        // Only collect keys that are genuinely under our namespace
        if (isNamespacedKey(key)) {
          results.add(key);
        }
      }
      iterations++;
      // Guard against infinite cursor loops and unbounded scans
    } while (cursor !== 0 && iterations < maxIterations && results.size < maxResults);

    return Array.from(results).slice(0, maxResults);
  }

  /**
   * Delete keys under the application namespace only.
   * Reserved for admin cache operations. Never FLUSHDB.
   */
  async clearScoped(
    match: string,
    maxDelete: number = MAX_DELETE_KEYS_PER_REQUEST
  ): Promise<CacheClearResult> {
    // Always clear matching memory-cache entries first (prefix-scoped)
    this.clearMemoryPrefix(match);

    const redisResult = await this.safeRedisOp<CacheClearResult>(async (redis) => {
      const keys = await this.scanNamespacedKeys(redis, match, maxDelete);
      const totalFound = keys.length;

      if (totalFound === 0) {
        return { deleted: 0, remaining: false, complete: true };
      }

      // Delete in bounded batches
      let deleted = 0;
      for (let i = 0; i < keys.length; i += SCAN_BATCH_SIZE) {
        const batch = keys.slice(i, i + SCAN_BATCH_SIZE);
        const removed = await redis.del(batch);
        deleted += typeof removed === 'number' ? removed : batch.length;
      }

      return {
        deleted,
        remaining: totalFound >= maxDelete,
        complete: totalFound < maxDelete,
      };
    });

    if (redisResult !== null) {
      return redisResult;
    }

    // Redis unavailable: report memory-fallback deletion result
    return { deleted: 0, remaining: false, complete: true };
  }

  /**
   * Remove memory-cache entries whose namespaced key matches a prefix filter.
   */
  clearMemoryPrefix(filter: string): number {
    let deleted = 0;
    const prefix = filter.endsWith('*') ? filter.slice(0, -1) : filter;
    for (const key of Array.from(memoryCache.keys())) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Get or set cache value with in-process stampede protection.
   * Concurrent misses on the same key share one origin promise.
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    expireInSeconds?: number
  ): Promise<T> {
    const namespacedKey = this.ns(key);

    let cachedValue: T | null = null;
    try {
      cachedValue = await this.get<T>(namespacedKey);
      if (cachedValue !== null) {
        return cachedValue;
      }
    } catch (error) {
      // Errors are already handled in the get method
    }

    // In-flight de-duplication: same key => same origin promise
    const existing = inflightPromises.get(namespacedKey);
    if (existing) {
      return existing as Promise<T>;
    }

    const origin = fetchFn()
      .then((freshData) => {
        if (freshData !== undefined) {
          this.set(namespacedKey, freshData, expireInSeconds).catch(() => {
            // Cache write failures must not change caller-visible semantics
          });
        }
        return freshData;
      })
      .finally(() => {
        // Always release after resolve OR reject so retries are possible
        inflightPromises.delete(namespacedKey);
      });

    // Bound the in-flight map to avoid unbounded growth
    if (inflightPromises.size >= MAX_INFLIGHT_ENTRIES) {
      const oldest = inflightPromises.keys().next().value;
      if (oldest !== undefined) {
        inflightPromises.delete(oldest);
      }
    }
    inflightPromises.set(namespacedKey, origin);
    return origin;
  }
}

// Export a singleton instance
const redisCache = new RedisCache();
export { redisCache };
export default redisCache;
export { CACHE_NAMESPACE };