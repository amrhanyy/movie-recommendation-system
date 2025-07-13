import getRedisClient from '../lib/redis';
import { closeRedisConnection } from '../lib/redis';

async function testRedisConnection() {
  try {
    console.log('Testing Redis Cloud connection...');
    const redis = await getRedisClient();
    
    // Test setting a value
    await redis.set('test-key', 'Hello from Redis Cloud test!');
    console.log('Successfully set test key.');
    
    // Test getting the value
    const value = await redis.get('test-key');
    console.log('Retrieved test value:', value);
    
    // Test deleting the value
    await redis.del('test-key');
    console.log('Deleted test key.');
    
    console.log('Redis Cloud connection test successful!');
  } catch (error) {
    console.error('Redis Cloud connection test failed:', error);
  } finally {
    // Close the connection
    await closeRedisConnection();
  }
}

// Run the test
testRedisConnection(); 