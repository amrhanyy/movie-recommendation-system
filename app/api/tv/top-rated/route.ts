import { NextResponse } from 'next/server'
import redisCache from '../../../../lib/cache';

const TMDB_API_KEY = process.env.TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

export async function GET() {
  try {
    // Cache key for top rated TV shows
    const cacheKey = 'tv:top-rated';
    
    // Try to get from cache or fetch from API
    const data = await redisCache.getOrSet(
      cacheKey,
      async () => {
        console.log('Cache miss - fetching top rated TV shows from TMDB API');
        
        const response = await fetch(
          `${BASE_URL}/tv/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=1`
        )

        if (!response.ok) throw new Error('Failed to fetch top rated TV shows')
        return response.json()
      },
      // Cache for 6 hours (21600 seconds) since this doesn't change often
      21600
    );
    
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch top rated TV shows' }, 
      { status: 500 }
    )
  }
}
