import { randomUUID } from 'node:crypto';
import getRedisClient from '../lib/redis';
import { closeRedisConnection } from '../lib/redis';
import { CACHE_NAMESPACE } from '../lib/cache-namespace';

/**
 * W3-011: connectivity probe only. Uses a namespaced probe key that is always
 * deleted afterwards so shared Redis instances are never polluted.
 * Key shape: movie-recommendation-system:{env}:v1:ops:probe:<uuid>.
 */
async function testRedisConnection() {
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const probeKey = `${CACHE_NAMESPACE}ops:probe:${randomUUID()}`;
  void env;
  try {
    console.log('Testing Redis Cloud connection...');
    const redis = await getRedisClient();

    if (!redis) {
      console.error('Redis client is unavailable (null). Check Redis configuration.');
      return;
    }

    // Test setting a value
    await redis.set(probeKey, 'Hello from Redis Cloud test!');
    console.log('Successfully set test key.');

    // Test getting the value
    const value = await redis.get(probeKey);
    console.log('Retrieved test value:', value);
    console.log(`probe key: ${probeKey}`);
  } catch (error) {
    console.error('Redis Cloud connection test failed:', error);
  } finally {
    // Always remove the probe key, even on failure paths.
    try {
      const redis = await getRedisClient();
      if (redis) {
        await redis.del(probeKey);
        console.log('Deleted test key.');
      }
    } catch {
      console.error('Failed to delete probe key.');
    }
    // Close the connection
    await closeRedisConnection();
  }
}

// Run the test
testRedisConnection();
