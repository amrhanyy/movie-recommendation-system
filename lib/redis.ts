import { createClient } from 'redis';
import redisHealth from './redis-health';

// Strict connection management
let redisClient: ReturnType<typeof createClient> | null = null;
let connectionBlocked = false;
let lastErrorTime = 0;
const BLOCK_DURATION = 60000; // 60 seconds
const MAX_CLIENTS_ERROR = 'ERR max number of clients reached';

/**
 * Check if a client is truly usable
 */
const isClientUsable = (client: ReturnType<typeof createClient> | null): boolean => {
  if (!client) return false;
  return client.isOpen;
};

/**
 * Safely clean up a Redis client
 */
const cleanupClient = async (client: ReturnType<typeof createClient> | null): Promise<void> => {
  if (!client) return;
  
  try {
    if (client.isOpen) {
      await client.disconnect();
    }
  } catch (e) {
    // Ignore disconnect errors
    console.log('Error disconnecting Redis client, ignoring:', e);
  }
};

/**
 * Get a Redis client or null if unavailable
 */
const getRedisClient = async () => {
  // Check Redis health status first
  if (!redisHealth.shouldUseRedis()) {
    return null;
  }

  // Check if connections are temporarily blocked
  if (connectionBlocked) {
    const now = Date.now();
    // If block period hasn't expired yet, don't try to connect
    if (now - lastErrorTime < BLOCK_DURATION) {
      return null;
    } else {
      // Reset the block after the timeout period
      connectionBlocked = false;
    }
  }

  // If we have a usable client, return it
  if (isClientUsable(redisClient)) {
    return redisClient;
  }

  // If client exists but is not usable, clean it up
  if (redisClient && !isClientUsable(redisClient)) {
    await cleanupClient(redisClient);
    redisClient = null;
  }

  // Don't create a new client if we just cleaned one up
  if (connectionBlocked) {
    return null;
  }

  try {
    // Create a new Redis client
    redisClient = createClient({
      username: 'default',
      password: 'tpMgAnUWsq3hYBWp5L5Hzyyswcq18aiQ',
      socket: {
        host: 'redis-19982.crce176.me-central-1-1.ec2.redns.redis-cloud.com',
        port: 19982,
        connectTimeout: 3000, // 3 second timeout
        reconnectStrategy: (retry) => {
          // Only retry 3 times max with exponential backoff
          if (retry > 3) {
            return false; // Stop retrying
          }
          return Math.min(retry * 1000, 3000); // 1s, 2s, 3s
        }
      },
      // Set a reasonable connection limit to avoid hogging all connections
      commandsQueueMaxLength: 5,
      disableOfflineQueue: true
    });

    // Listen for connection events
    redisClient.on('error', (err) => {
      // Handle max clients error specifically
      if (err.message && err.message.includes(MAX_CLIENTS_ERROR)) {
        connectionBlocked = true;
        lastErrorTime = Date.now();
        
        // Block reconnection for longer on max clients errors
        // This gives other connections time to clean up
        const extendedBlockDuration = BLOCK_DURATION * 2;
        setTimeout(() => {
          connectionBlocked = false;
        }, extendedBlockDuration);
        
        // Notify health monitor of error
        const shouldDisable = redisHealth.recordError(err.message);
        if (shouldDisable) {
          // Clean up any existing connection
          cleanupClient(redisClient).catch(() => {});
          redisClient = null;
        }
      } else {
        // For other errors, mark connection as blocked temporarily
        connectionBlocked = true;
        lastErrorTime = Date.now();
      }
      
      console.error('Redis connection error:', err);
    });

    // Connect to Redis
    await redisClient.connect();
    console.log('Connected to Redis Cloud');
    
    // Record successful connection
    redisHealth.recordSuccess();
    
    return redisClient;
  } catch (error: any) {
    // If we get a max clients error, immediately block reconnection attempts
    if (error?.message && typeof error.message === 'string') {
      if (error.message.includes(MAX_CLIENTS_ERROR)) {
        connectionBlocked = true;
        lastErrorTime = Date.now();
        
        // Block for extended period on connection limit errors
        const extendedBlockDuration = BLOCK_DURATION * 2;
        setTimeout(() => {
          connectionBlocked = false;
        }, extendedBlockDuration);
        
        // Notify health monitor of error
        redisHealth.recordError(error.message);
      } else if (error.message.includes('offline')) {
        // Handle offline errors
        connectionBlocked = true;
        lastErrorTime = Date.now();
      }
    }
    
    console.error('Failed to connect to Redis:', error);
    
    // Clean up the failed client
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