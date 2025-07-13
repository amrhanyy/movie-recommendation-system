import { NextResponse } from 'next/server';
import redisCache from '../../../lib/cache';

// Example API route that uses Redis caching
export async function GET(request: Request) {
  try {
    // Get movie ID from search params
    const { searchParams } = new URL(request.url);
    const movieId = searchParams.get('id') || '550';  // Default to movie ID 550 (Fight Club)
    
    // Get the movie data with caching (30 minute cache)
    const cacheKey = `movie:${movieId}`;
    const movieData = await redisCache.getOrSet(
      cacheKey,
      async () => {
        console.log('Cache miss - fetching movie from API:', movieId);
        
        // Fetch from TMDB API
        const response = await fetch(
          `https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}`
        );
        
        if (!response.ok) {
          throw new Error(`Failed to fetch movie: ${response.status}`);
        }
        
        return response.json();
      },
      1800 // 30 minutes cache
    );
    
    return NextResponse.json({ 
      success: true, 
      data: movieData,
      fromCache: true // In a real app, you could track if it came from cache
    });
  } catch (error) {
    console.error('Error fetching movie data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch movie data' },
      { status: 500 }
    );
  }
} 