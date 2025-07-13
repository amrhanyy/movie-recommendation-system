import redisCache from './cache';
import getRedisClient from './redis';

/**
 * Utility functions to manage Redis caching for the application
 */
export const cacheManager = {
  /**
   * Invalidate (clear) cache for a specific movie
   * @param movieId The movie ID to invalidate cache for
   */
  async invalidateMovieCache(movieId: string): Promise<void> {
    console.log(`Invalidating cache for movie: ${movieId}`);
    
    // Get all related cache keys
    const cacheKeys = [
      `movie:${movieId}:details`,
      `movie:${movieId}:recommendations`,
      `movie:${movieId}:similar`
    ];
    
    // Delete all cache keys
    await Promise.all(cacheKeys.map(key => redisCache.delete(key)));
  },
  
  /**
   * Invalidate (clear) cache for a specific TV show
   * @param tvId The TV show ID to invalidate cache for
   */
  async invalidateTVCache(tvId: string): Promise<void> {
    console.log(`Invalidating cache for TV show: ${tvId}`);
    
    // Get all related cache keys
    const cacheKeys = [
      `tv:${tvId}:details`,
      `tv:${tvId}:recommendations`,
      `tv:${tvId}:similar`
    ];
    
    // Delete all cache keys
    await Promise.all(cacheKeys.map(key => redisCache.delete(key)));
  },
  
  /**
   * Invalidate home page caches (popular/top-rated movies and shows)
   */
  async invalidateHomeCache(): Promise<void> {
    console.log('Invalidating home page caches');
    
    const cacheKeys = [
      'movies:home',
      'tv:top-rated'
    ];
    
    await Promise.all(cacheKeys.map(key => redisCache.delete(key)));
  },
  
  /**
   * Safe wrapper to execute Redis command with proper error handling
   * (Internal use only)
   * @param operation Function to execute a Redis operation
   * @param defaultValue Default value to return if operation fails
   * @param operationName Optional name of the operation for logging
   */
  async safeRedisOp<T>(
    operation: (redis: any) => Promise<T>,
    defaultValue: T,
    operationName?: string
  ): Promise<T> {
    try {
      const redis = await getRedisClient();
      
      if (!redis || !redis.isOpen) {
        // Only log this once per operation set rather than for each call
        return defaultValue;
      }
      
      return await operation(redis);
    } catch (error) {
      const err = error as Error;
      
      // Only log detailed errors for unexpected errors, not for known offline condition
      if (err.message !== 'The client is offline') {
        console.error(`Redis operation ${operationName ? `'${operationName}'` : ''} failed:`, err);
      }
      
      return defaultValue;
    }
  },
  
  /**
   * Get cache stats (number of keys, memory usage)
   * @returns Cache statistics or placeholder values if Redis is offline
   */
  async getCacheStats(): Promise<any> {
    try {
      const redis = await getRedisClient();
      
      // If Redis is offline, return placeholder values immediately without trying operations
      if (!redis || !redis.isOpen) {
        console.warn('Redis is offline, returning placeholder cache stats');
        return {
          totalKeys: 0,
          memory: {
            used_memory_human: 'N/A (Redis offline)',
            used_memory_peak_human: 'N/A'
          },
          keyspace: {
            db0: 'N/A'
          },
          uptime_in_days: 0,
          connected_clients: 0,
          hit_rate: 'N/A',
          status: 'offline'
        };
      }
      
      // Get all Redis info with safe operations
      const keysCount = await this.safeRedisOp(r => r.dbSize(), 0, 'dbSize');
      const memoryInfo = await this.safeRedisOp(r => r.info('memory'), '', 'info(memory)');
      
      // Quick check after first operation - if it failed, Redis might have gone offline
      // after our initial check but before we could complete operations
      if (memoryInfo === '') {
        console.warn('Redis appears to be offline after connection check');
        return {
          totalKeys: 0,
          memory: {
            used_memory_human: 'N/A (Redis connection lost)',
            used_memory_peak_human: 'N/A'
          },
          keyspace: {
            db0: 'N/A'
          },
          uptime_in_days: 0,
          connected_clients: 0,
          hit_rate: 'N/A',
          status: 'offline'
        };
      }
      
      // Continue with other operations since Redis appears to be working
      const serverInfo = await this.safeRedisOp(r => r.info('server'), '', 'info(server)');
      const clientsInfo = await this.safeRedisOp(r => r.info('clients'), '', 'info(clients)');
      const statsInfo = await this.safeRedisOp(r => r.info('stats'), '', 'info(stats)');
      
      // Parse info responses
      const memoryMatch = memoryInfo.match(/used_memory_human:([^\r\n]+)/);
      const memoryPeakMatch = memoryInfo.match(/used_memory_peak_human:([^\r\n]+)/);
      const uptimeMatch = serverInfo.match(/uptime_in_days:([^\r\n]+)/);
      const connectedClientsMatch = clientsInfo.match(/connected_clients:([^\r\n]+)/);
      const keyspaceHitsMatch = statsInfo.match(/keyspace_hits:([^\r\n]+)/);
      const keyspaceMissesMatch = statsInfo.match(/keyspace_misses:([^\r\n]+)/);
      
      // Calculate hit rate
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
        status: 'online'
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      
      // Return placeholder values on error
      return {
        totalKeys: 0,
        memory: {
          used_memory_human: 'Error',
          used_memory_peak_human: 'Error'
        },
        uptime_in_days: 0,
        connected_clients: 0,
        hit_rate: 'Error',
        status: 'error'
      };
    }
  },
  
  /**
   * Clear all cache data (use with caution)
   */
  async clearAllCache(): Promise<void> {
    console.log('Clearing all Redis cache data');
    await redisCache.clear();
  },
  
  /**
   * Find all cache keys matching a pattern
   * @param pattern Pattern to match (e.g., 'movie:*')
   * @returns Array of matching keys or empty array if Redis is offline
   */
  async findCacheKeys(pattern: string): Promise<string[]> {
    try {
      return await this.safeRedisOp(
        async (redis) => {
          const keys = await redis.keys(pattern);
          return keys;
        }, 
        [],
        'keys'
      );
    } catch (error) {
      console.error('Error finding cache keys:', error);
      return [];
    }
  }
};

export default cacheManager; 