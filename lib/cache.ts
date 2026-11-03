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

interface InFlightEntry<T> {
  promise: Promise<T>;
  invalidated: boolean;
}

// Stampede protection: in-flight promise de-duplication (F-055).
// Map keys are the fully namespaced cache keys, so different resources do not
// block each other and dedup is scoped per key.
const inflightEntries: Map<string, InFlightEntry<unknown>> = new Map();
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
  /** true when Redis was unavailable and only memory was cleared */
  degraded: boolean;
  /** machine-readable cause when degraded */
  reason?: string;
  /** memory-cache entries cleared in the degraded path */
  clearedMemory?: number;
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

    // Invalidate in-flight entry if present
    const entry = inflightEntries.get(namespacedKey);
    if (entry) {
      entry.invalidated = true;
      // Remove from the in-flight registry as well: the entry is dead and
      // must not block a later getOrSet from starting a fresh producer, nor
      // grow the map without bound. The pending producer's .then write gate
      // already prevents the stale write, and its finally is a no-op because
      // the entry is no longer in the map.
      inflightEntries.delete(namespacedKey);
    }

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
    // Namespace the match pattern without normalizing wildcard characters
    const namespacedMatch = applyNamespace(match);
    // Determine pattern prefix for matching
    const pattern = namespacedMatch.endsWith('*') ? namespacedMatch : `${namespacedMatch}*`;
    const prefix = pattern.replace('*', '');

    // First, invalidate matching in-flight entries by directly scanning the map
    // We collect keys to delete to avoid modifying map during iteration
    const forDeletion: string[] = [];
    for (const [key, entry] of inflightEntries.entries()) {
      // Use boundary-safe prefix matching to avoid partial key name confusion
      // A key matches if it starts with the prefix AND either:
      // - the key exactly equals the prefix, OR
      // - the prefix itself ends with ':' (meaning it's a scope prefix), OR
      // - the character immediately after the prefix is a ':' (segment separator)
      if (key.startsWith(prefix) && (key.length === prefix.length || prefix.endsWith(':') || key[prefix.length] === ':')) {
        entry.invalidated = true;
        forDeletion.push(key);
      }
    }
    for (const key of forDeletion) {
      inflightEntries.delete(key);
    }

    // Clear memory cache with the pattern
    const clearedMemory = this.clearMemoryPrefix(namespacedMatch);

    // Scan and delete from Redis
    const redisResult = await this.safeRedisOp<CacheClearResult>(async (redis) => {
      // For Redis, we need to scan properly
      const keys = await this.scanNamespacedKeys(redis, pattern, maxDelete);
      if (keys.length === 0) {
        return { deleted: 0, remaining: false, complete: true, degraded: false };
      }

      let deleted = 0;
      for (let i = 0; i < keys.length; i += SCAN_BATCH_SIZE) {
        const batch = keys.slice(i, i + SCAN_BATCH_SIZE);
        const removed = await redis.del(batch);
        deleted += typeof removed === 'number' ? removed : batch.length;
      }

      return {
        deleted,
        remaining: keys.length >= maxDelete,
        complete: keys.length < maxDelete,
        degraded: false,
      };
    });

    if (redisResult !== null) {
      return redisResult;
    }

    // Redis unavailable: memory-fallback deletion result (degraded, explicit)
    return { deleted: 0, remaining: false, complete: false, degraded: true, reason: "redis-unavailable", clearedMemory };
  }

  /**
   * Remove memory-cache entries whose namespaced key matches a prefix filter.
   */
  clearMemoryPrefix(filter: string): number {
    let deleted = 0;
    const prefix = filter.endsWith('*') ? filter.slice(0, -1) : filter;
    for (const key of Array.from(memoryCache.keys())) {
      // Use boundary-safe prefix matching to avoid partial key name confusion
      // A key matches if it starts with the prefix AND either:
      // - the key exactly equals the prefix, OR
      // - the prefix itself ends with ':' (meaning it's a scope prefix), OR
      // - the character immediately after the prefix is a ':' (segment separator)
      if (key.startsWith(prefix) && (key.length === prefix.length || prefix.endsWith(':') || key[prefix.length] === ':')) {
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

    // In-flight entry check (synchronous) so a concurrent caller joins the
    // already-registered flight instead of starting a duplicate producer.
    const existingEntry = inflightEntries.get(namespacedKey);
    if (existingEntry) {
      return existingEntry.promise as Promise<T>;
    }

    // Build a real Promise before the entry becomes visible, then register
    // the complete entry SYNCHRONOUSLY (before the async cache check), so
    // that an invalidation arriving during the await (delete / clear / capacity
    // eviction) is observed on this entry instead of being lost. fetchFn()
    // starts only after registration (deferred by a microtask).
    let resolve!: (value: T) => void;
    let reject!: (err: unknown) => void;
    const entryPromise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const entry: InFlightEntry<T> = {
      promise: entryPromise,
      invalidated: false,
    };

    // Register entry BEFORE the async cache check so invalidations that arrive
    // during the await land on this entry.
    inflightEntries.set(namespacedKey, entry);

    // Bound the in-flight map (capacity invalidation before registry eviction).
    if (inflightEntries.size >= MAX_INFLIGHT_ENTRIES) {
      const oldestKey = inflightEntries.keys().next().value;
      if (oldestKey) {
        const oldestEntry = inflightEntries.get(oldestKey);
        if (oldestEntry) {
          oldestEntry.invalidated = true;
          inflightEntries.delete(oldestKey);
        }
      }
    }

    // Try cache (async). An invalidation during this await sets
    // entry.invalidated and may remove the entry from the registry, but we
    // still resolve correctly below.
    let cachedValue: T | null = null;
    try {
      cachedValue = await this.get<T>(namespacedKey);
      if (cachedValue !== null) {
        const ce = inflightEntries.get(namespacedKey);
        if (ce === entry) {
          inflightEntries.delete(namespacedKey);
        }
        resolve(cachedValue);
        return entryPromise;
      }
    } catch (error) {
      // Errors are already handled in the get method
    }

    // Deferred producer start: the entry is visible with a valid promise
    // before fetchFn() executes.
    //
    // The producer MUST always run and settle the original promise, even if
    // the entry was invalidated / removed / evicted / superseded before this
    // microtask fired. Invalidation suppresses cache writes (entry.invalidated)
    // and a removed or superseded entry never writes (registry identity check),
    // but it must NOT leave the original caller's promise pending forever.
    queueMicrotask(() => {
      Promise.resolve()
        .then(() => fetchFn())
        .then((freshData: T) => {
          const ce = inflightEntries.get(namespacedKey);
          // Write only when not invalidated AND the registry still points to
          // this entry (i.e. not removed or superseded by a newer flight).
          if (!entry.invalidated && ce === entry && freshData !== undefined) {
            this.set(namespacedKey, freshData, expireInSeconds).catch(() => {
              // Cache write failures must not change caller-visible semantics
            });
          }
          resolve(freshData);
        })
        .catch((err: unknown) => {
          reject(err);
        })
        .finally(() => {
          const ce = inflightEntries.get(namespacedKey);
          if (ce === entry) {
            inflightEntries.delete(namespacedKey);
          }
        });
    });

    return entryPromise;
  }
}

// Export a singleton instance
const redisCache = new RedisCache();
export { redisCache };
export default redisCache;
export { CACHE_NAMESPACE };