import { NextResponse } from 'next/server'
import redisCache from '../../../../../lib/cache';
import tmdbClient from '@/lib/tmdb';

// Remove these unused constants
// const TMDB_API_KEY = process.env.TMDB_API_KEY
// const BASE_URL = 'https://api.themoviedb.org/3'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Cache key for similar TV shows
    const cacheKey = `tv:${id}:similar`;
    
    // Try to get from cache or fetch from API
    const data = await redisCache.getOrSet(
      cacheKey,
      async () => {
        console.log(`Cache miss - fetching similar TV shows for ${id} from TMDB API`);
        
        // Use our TMDB client with built-in retry logic
        return await tmdbClient.fetchSimilarTVShows(id);
      },
      // Cache for 1 hour (3600 seconds)
      3600
    );
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching similar TV shows:', error);
    return NextResponse.json(
      { error: 'Failed to fetch similar TV shows' }, 
      { status: 500 }
    )
  }
}
