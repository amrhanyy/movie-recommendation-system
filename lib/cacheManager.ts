import redisCache, { type CacheClearResult } from './cache';
import getRedisClient from './redis';
import {
  CACHE_NAMESPACE,
  MAX_SCAN_RESULTS,
  isNamespacedKey,
  buildCacheKey,
  CACHE_SCOPES,
} from './cache-namespace';

/**
 * Utility functions to manage Redis caching for the application.
 *
 * Security (F-009 / F-052):
 * - clearAllCache is prefix-scoped; FLUSHDB/FLUSHALL are never called.
 * - findCacheKeys uses bounded SCAN; redis.keys() is never called.
 */
export const cacheManager = {
  /**
   * Invalidate (clear) cache for a specific movie.
   */
  async invalidateMovieCache(movieId: string): Promise<void> {
    const id = String(movieId).slice(0, 50);
    const cacheKeys = [
      `movie:${id}:details`,
      `movie:${id}:recommendations`,
      `movie:${id}:similar`
    ];
    await Promise.all(cacheKeys.map(key => redisCache.delete(key)));
  },

  /**
   * Invalidate (clear) cache for a specific TV show.
   */
  async invalidateTVCache(tvId: string): Promise<void> {
    const id = String(tvId).slice(0, 50);
    const cacheKeys = [
      `tv:${id}:details`,
      `tv:${id}:recommendations`,
      `tv:${id}:similar`
    ];
    await Promise.all(cacheKeys.map(key => redisCache.delete(key)));
  },

  /**
   * Invalidate home page caches (popular/top-rated movies and shows).
   */
  async invalidateHomeCache(): Promise<void> {
    const cacheKeys = [
      'movies:home',
      'tv:top-rated'
    ];
    await Promise.all(cacheKeys.map(key => redisCache.delete(key)));
  },
  invalidateCacheKey: async (key: string): Promise<void> => {
    await redisCache.delete(key);
  },

  /**
   * Safe wrapper to execute a Redis command with proper error handling.
   * (Internal use only)
   */
  async safeRedisOp<T>(
    operation: (redis: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>) => Promise<T>,
    defaultValue: T,
    operationName?: string
  ): Promise<T> {
    try {
      const redis = await getRedisClient();

      if (!redis || !redis.isOpen) {
        return defaultValue;
      }

      return await operation(redis);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (err.message !== 'The client is offline') {
        console.error(`Redis operation ${operationName ? `'${operationName}'` : ''} failed:`, err);
      }

      return defaultValue;
    }
  },

/**
 * Get cache stats (number of keys, memory usage).
 * Returns only sanitized aggregate metrics - never raw key names or secrets.
 * Status is truthful about the backend in use:
 * - 'online': live Redis connection.
 * - 'fallback-memory': Redis unconfigured/unreachable; in-memory cache active.
 * - 'offline' is kept only when callers explicitly need the legacy label
 *   (mapped to 'fallback-memory' semantics); admin UI shows the fallback mode.
 */
async getCacheStats(): Promise<Record<string, unknown>> {
  const fallback = (status: string) => ({
    totalKeys: 0,
    memory: { used_memory_human: 'N/A (Redis offline)', used_memory_peak_human: 'N/A' },
    keyspace: { db0: 'N/A' },
    uptime_in_days: 0,
    connected_clients: 0,
    hit_rate: 'N/A',
    status,
    backend: 'memory',
  });
  const offline = fallback('fallback-memory');
    try {
      const redis = await getRedisClient();

      if (!redis || !redis.isOpen) {
        return offline;
      }

      const keysCount = await this.safeRedisOp(r => r.dbSize(), 0, 'dbSize');
      const memoryInfo = await this.safeRedisOp(r => r.info('memory'), '', 'info(memory)');

      if (memoryInfo === '') {
        return offline;
      }

      const serverInfo = await this.safeRedisOp(r => r.info('server'), '', 'info(server)');
      const clientsInfo = await this.safeRedisOp(r => r.info('clients'), '', 'info(clients)');
      const statsInfo = await this.safeRedisOp(r => r.info('stats'), '', 'info(stats)');

      const memoryMatch = memoryInfo.match(/used_memory_human:([^\r\n]+)/);
      const memoryPeakMatch = memoryInfo.match(/used_memory_peak_human:([^\r\n]+)/);
      const uptimeMatch = serverInfo.match(/uptime_in_days:([^\r\n]+)/);
      const connectedClientsMatch = clientsInfo.match(/connected_clients:([^\r\n]+)/);
      const keyspaceHitsMatch = statsInfo.match(/keyspace_hits:([^\r\n]+)/);
      const keyspaceMissesMatch = statsInfo.match(/keyspace_misses:([^\r\n]+)/);

      const hits = keyspaceHitsMatch ? parseInt(keyspaceHitsMatch[1], 10) : 0;
      const misses = keyspaceMissesMatch ? parseInt(keyspaceMissesMatch[1], 10) : 0;
      const hitRate = hits + misses > 0 ? ((hits / (hits + misses)) * 100).toFixed(2) + '%' : 'N/A';

    return {
      totalKeys: keysCount,
      memory: {
        used_memory_human: memoryMatch ? memoryMatch[1].trim() : 'unknown',
        used_memory_peak_human: memoryPeakMatch ? memoryPeakMatch[1].trim() : 'unknown'
      },
      uptime_in_days: uptimeMatch ? parseInt(uptimeMatch[1], 10) : 0,
      connected_clients: connectedClientsMatch ? parseInt(connectedClientsMatch[1], 10) : 0,
      hit_rate: hitRate,
      status: 'online',
      backend: 'redis'
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return { ...offline, status: 'error', backend: 'memory' };
  }
},

  /**
   * Clear application-scoped cache entries only.
   * Never wipes the Redis database (no FLUSHDB).
   */
  async clearAllCache(): Promise<CacheClearResult> {
    const result = await redisCache.clearScoped(`${CACHE_NAMESPACE}*`);
    console.log('Cleared application-scoped cache entries');
    return result;
  },

  /**
   * Find application cache keys matching an INTERNAL pattern.
   * The caller passes a scope (from CACHE_SCOPES) or a literal sub-pattern that
   * is normalized server-side. Bounded SCAN - never redis.keys().
   */
  async findCacheKeys(pattern: string): Promise<string[]> {
    // Never accept a raw Redis glob from caller input; always anchor to our
    // namespace and normalize.
    const safePattern = pattern.startsWith(CACHE_NAMESPACE)
      ? pattern
      : `${CACHE_NAMESPACE}${pattern.replace(/[^a-zA-Z0-9:*._-]/g, '_')}`;

    try {
      return await this.safeRedisOp(
        async (redis) => {
          const results = new Set<string>();
          let cursor = 0;
          let iterations = 0;
          const maxIterations = Math.ceil(MAX_SCAN_RESULTS / 100) + 5;

          do {
            const reply = await redis.scan(cursor, { MATCH: safePattern, COUNT: 100 });
            cursor = reply.cursor;
            for (const key of reply.keys) {
              // Only return keys under the canonical namespace
              if (isNamespacedKey(key)) {
                results.add(key);
              }
            }
            iterations++;
          } while (cursor !== 0 && iterations < maxIterations && results.size < MAX_SCAN_RESULTS);

          return Array.from(results).slice(0, MAX_SCAN_RESULTS);
        },
        [],
        'scan'
      );
    } catch (error) {
      console.error('Error finding cache keys:', error);
      return [];
    }
  },

  /**
   * List keys for a safe, validated resource type used by the admin UI.
   * Returns sanitized key tails (must be ≤ a short length) rather than
   * arbitrary full keys.
   */
  async listKeys(scope: string, limit: number = 100): Promise<string[]> {
    const normalizedScope = scope.replace(/[^a-zA-Z0-9:_-]/g, '');
    const cappedLimit = Math.max(1, Math.min(limit, MAX_SCAN_RESULTS));
    const keys = await this.findCacheKeys(`${CACHE_NAMESPACE}${normalizedScope}*`);
    return keys.slice(0, cappedLimit);
  },
};

export default cacheManager;
export { CACHE_SCOPES, buildCacheKey };