import { createClient, type RedisClientType } from 'redis';
import { buildRedisConfig } from './redis-config';
import redisHealth from './redis-health';

// Strict connection management
let redisClient: RedisClientType | null = null;
let connectionBlocked = false;
let lastErrorTime = 0;
const BLOCK_DURATION = 60000; // 60 seconds
const MAX_CLIENTS_ERROR = 'ERR max number of clients reached';

const isClientUsable = (client: RedisClientType | null): boolean => {
  if (!client) return false;
  return client.isOpen;
};

const cleanupClient = async (client: RedisClientType | null): Promise<void> => {
  if (!client) return;

  try {
    if (client.isOpen) {
      await client.disconnect();
    }
  } catch (e) {
    // Ignore disconnect errors
    console.log('Error disconnecting Redis client, ignoring');
  }
};

/**
 * Get a Redis client or null if unavailable.
 * Returns null when Redis is optional and not configured, when a config error
 * exists, or when Redis is unhealthy - the memory fallback handles those cases.
 */
const getRedisClient = async (): Promise<RedisClientType | null> => {
  const { clientConfig: config, error: configError } = buildRedisConfig();

  // Redis is optional: memory fallback is used when not configured.
  if (configError) {
    console.error('Redis configuration error. Memory cache fallback active.');
    return null;
  }
  if (!config) {
    // Not configured - safe no-op fallback
    return null;
  }

  // Check Redis health status first
  if (!redisHealth.shouldUseRedis()) {
    return null;
  }

  // Check if connections are temporarily blocked
  if (connectionBlocked) {
    const now = Date.now();
    if (now - lastErrorTime < BLOCK_DURATION) {
      return null;
    } else {
      connectionBlocked = false;
    }
  }

  if (isClientUsable(redisClient)) {
    return redisClient;
  }

  if (redisClient && !isClientUsable(redisClient)) {
    await cleanupClient(redisClient);
    redisClient = null;
  }

  if (connectionBlocked) {
    return null;
  }

  try {
    redisClient = createClient(config) as RedisClientType;

    redisClient.on('error', (err: Error & { message?: string }) => {
      const message = err?.message || '';
      if (message.includes(MAX_CLIENTS_ERROR)) {
        connectionBlocked = true;
        lastErrorTime = Date.now();
        const extendedBlockDuration = BLOCK_DURATION * 2;
        setTimeout(() => {
          connectionBlocked = false;
        }, extendedBlockDuration);
        const shouldDisable = redisHealth.recordError(message);
        if (shouldDisable) {
          cleanupClient(redisClient).catch(() => {});
          redisClient = null;
        }
      } else {
        connectionBlocked = true;
        lastErrorTime = Date.now();
      }
      console.error('Redis connection error');
    });

    await redisClient.connect();

    redisHealth.recordSuccess();
    return redisClient;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes(MAX_CLIENTS_ERROR)) {
      connectionBlocked = true;
      lastErrorTime = Date.now();
      const extendedBlockDuration = BLOCK_DURATION * 2;
      setTimeout(() => {
        connectionBlocked = false;
      }, extendedBlockDuration);
      redisHealth.recordError(errorMessage);
    } else if (errorMessage.includes('offline')) {
      connectionBlocked = true;
      lastErrorTime = Date.now();
    }

    console.error('Failed to connect to Redis');
    await cleanupClient(redisClient);
    redisClient = null;
    return null;
  }
};

// Close Redis connection
export const closeRedisConnection = async (): Promise<void> => {
  await cleanupClient(redisClient);
  redisClient = null;
  console.log('Redis connection closed');
};

export default getRedisClient;