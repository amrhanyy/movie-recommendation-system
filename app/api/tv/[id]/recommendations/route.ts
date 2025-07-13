import { NextResponse } from 'next/server'
import redisCache from '../../../../../lib/cache';
import tmdbClient from '@/lib/tmdb';

// Remove these unused constants
// const BASE_URL = 'https://api.themoviedb.org/3'
// const TMDB_API_KEY = process.env.TMDB_API_KEY

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Cache key for TV show recommendations
    const cacheKey = `tv:${id}:recommendations`;
    
    // Try to get from cache or fetch from API
    const data = await redisCache.getOrSet(
      cacheKey,
      async () => {
        console.log(`Cache miss - fetching recommendations for TV show ${id} from TMDB API`);
        
        // Use our TMDB client with built-in retry logic
        return await tmdbClient.fetchTVRecommendations(id);
      },
      // Cache for 1 hour (3600 seconds)
      3600
    );
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching TV recommendations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch TV show recommendations' }, 
      { status: 500 }
    )
  }
}
