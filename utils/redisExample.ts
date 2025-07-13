import redisCache from '../lib/cache';

/**
 * Example function to show how to use Redis caching for API calls
 * @param movieId ID of the movie to fetch
 * @returns Movie data either from cache or from API
 */
export async function getMovieWithCache(movieId: string) {
  const cacheKey = `movie:${movieId}`;
  
  // This will check cache first, and if not found, fetch from API and cache the result
  return redisCache.getOrSet(
    cacheKey,
    async () => {
      // This is the function that runs only when cache is empty
      console.log('Cache miss - fetching movie from API:', movieId);
      
      // Replace with your actual movie fetch logic
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch movie: ${response.status}`);
      }
      
      return response.json();
    },
    // Cache for 30 minutes (1800 seconds)
    1800
  );
}

/**
 * Example function to invalidate cached movie data
 * @param movieId ID of the movie to invalidate from cache
 */
export async function invalidateMovieCache(movieId: string) {
  const cacheKey = `movie:${movieId}`;
  await redisCache.delete(cacheKey);
  console.log(`Cache invalidated for movie: ${movieId}`);
}

/**
 * Example function to store a user's movie preferences in Redis
 * @param userId User ID
 * @param preferences Array of genre IDs or preference objects
 */
export async function storeUserPreferences(userId: string, preferences: any[]) {
  const key = `user:${userId}:preferences`;
  await redisCache.set(key, preferences, 86400); // Cache for 24 hours
  console.log(`Stored preferences for user: ${userId}`);
}

/**
 * Example function to get a user's movie preferences from Redis
 * @param userId User ID
 * @returns User preferences or null if not found
 */
export async function getUserPreferences(userId: string) {
  const key = `user:${userId}:preferences`;
  return redisCache.get(key);
} 