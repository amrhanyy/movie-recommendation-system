import getRedisClient from './redis';

// In-memory fallback cache when Redis is unavailable
const memoryCache: Record<string, { value: string; expiry: number }> = {};

// Keep track of Redis status to avoid excessive error logging
let redisOfflineLogged = false;
const REDIS_ERROR_LOG_INTERVAL = 60000; // Only log Redis errors once per minute
let lastRedisErrorTime = 0;

/**
 * A utility for caching data in Redis
 */
export class RedisCache {
  private readonly DEFAULT_EXPIRATION = 3600; // 1 hour in seconds

  /**
   * Helper to safely execute a Redis operation with proper error handling
   * @param operation Function that performs a Redis operation
   * @returns Result of the operation or null if failed
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
      
      // Execute the operation with non-null Redis client
      try {
        // At this point we know redis is not null
        return await operation(redis);
      } catch (error: any) {
        // Only log Redis errors periodically to avoid flooding logs
        const now = Date.now();
        const isOfflineError = error?.message?.includes('offline');
        
        // If it's an offline error, only log it once or at intervals
        if (isOfflineError) {
          if (!redisOfflineLogged || (now - lastRedisErrorTime > REDIS_ERROR_LOG_INTERVAL)) {
            console.warn('Redis is offline, using memory cache fallback');
            redisOfflineLogged = true;
            lastRedisErrorTime = now;
          }
        } else {
          // For other errors, log once per interval
          if (now - lastRedisErrorTime > REDIS_ERROR_LOG_INTERVAL) {
            console.error('Redis operation failed:', error);
            lastRedisErrorTime = now;
          }
        }
        return null;
      }
    } catch (error) {
      // Only log connection errors periodically
      const now = Date.now();
      if (now - lastRedisErrorTime > REDIS_ERROR_LOG_INTERVAL) {
        console.warn('Redis connection unavailable, using memory cache');
        lastRedisErrorTime = now;
      }
      return null;
    }
  }

  /**
   * Set a value in the cache
   * @param key - The cache key
   * @param value - The value to cache (will be JSON stringified)
   * @param expireInSeconds - Optional expiration time in seconds
   */
  async set(key: string, value: any, expireInSeconds?: number): Promise<void> {
    const serializedValue = JSON.stringify(value);
    const expirySeconds = expireInSeconds || this.DEFAULT_EXPIRATION;
    
    // Always store in memory cache first - this never fails
    memoryCache[key] = { 
      value: serializedValue, 
      expiry: Date.now() + (expirySeconds * 1000) 
    };
    
    // Try Redis, errors are handled silently since we use memory cache
    await this.safeRedisOp(async (redis) => {
      return redis.set(key, serializedValue, { EX: expirySeconds });
    });
  }

  /**
   * Get a value from the cache
   * @param key - The cache key
   * @returns The cached value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    // Try Redis first
    const redisValue = await this.safeRedisOp(async (redis) => {
      return redis.get(key);
    });
    
    // If we got a value from Redis, parse and return it
    if (redisValue) {
      try {
        return JSON.parse(redisValue) as T;
      } catch (error) {
        // Don't log parsing errors, just fall back to memory cache
      }
    }
    
    // Fall back to memory cache
    return this.getFromMemoryCache<T>(key);
  }

  /**
   * Helper to get a value from the memory cache
   */
  private getFromMemoryCache<T>(key: string): T | null {
    const cached = memoryCache[key];
    
    if (!cached) return null;
    
    // Check if expired
    if (cached.expiry < Date.now()) {
      delete memoryCache[key];
      return null;
    }
    
    try {
      return JSON.parse(cached.value) as T;
    } catch (error) {
      // Silently fail on parse errors to avoid flooding logs
      return null;
    }
  }

  /**
   * Delete a value from the cache
   * @param key - The cache key
   */
  async delete(key: string): Promise<void> {
    // Always remove from memory cache
    delete memoryCache[key];
    
    // Try to delete from Redis
    await this.safeRedisOp(async (redis) => {
      return redis.del(key);
    });
  }

  /**
   * Clear all cache entries (use with caution)
   */
  async clear(): Promise<void> {
    // Always clear memory cache
    Object.keys(memoryCache).forEach(key => delete memoryCache[key]);
    
    // Try to clear Redis
    await this.safeRedisOp(async (redis) => {
      return redis.flushDb();
    });
  }

  /**
   * Get or set cache value - useful pattern for caching API responses
   * @param key - The cache key
   * @param fetchFn - Function to fetch data if not in cache
   * @param expireInSeconds - Optional expiration time in seconds
   * @returns The cached or fetched value
   */
  async getOrSet<T>(key: string, fetchFn: () => Promise<T>, expireInSeconds?: number): Promise<T> {
    // Try to get from cache first - any errors will be caught
    let cachedValue = null;
    try {
      cachedValue = await this.get<T>(key);
      if (cachedValue !== null) {
        return cachedValue;
      }
    } catch (error) {
      // Errors are already handled in the get method
    }
    
    // If not in cache or error, fetch fresh data
    const freshData = await fetchFn();
    
    // Store in cache for next time (this won't fail even if Redis is down)
    try {
      await this.set(key, freshData, expireInSeconds);
    } catch (error) {
      // Errors are already handled in the set method
    }
    
    return freshData;
  }
}

// Export a singleton instance
const redisCache = new RedisCache();
export default redisCache;
