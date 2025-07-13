import { NextResponse } from 'next/server'
import redisCache from '../../../../../lib/cache';

const TMDB_API_KEY = process.env.TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: movieId } = await params
    
    // Cache key for movie recommendations
    const cacheKey = `movie:${movieId}:recommendations`;
    
    // Try to get from cache or fetch from API
    const data = await redisCache.getOrSet(
      cacheKey,
      async () => {
        console.log(`Cache miss - fetching recommendations for movie ${movieId} from TMDB API`);
        
        const response = await fetch(
          `${BASE_URL}/movie/${movieId}/recommendations?api_key=${TMDB_API_KEY}`,
          { next: { revalidate: 3600 } }
        )

        if (!response.ok) {
          throw new Error(`Recommendations fetch failed: ${response.status}`)
        }

        return response.json()
      },
      // Cache for 1 hour (3600 seconds)
      3600
    );
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in recommendations route:', error)
    return NextResponse.json(
      { error: 'Failed to fetch recommendations' },
      { status: 500 }
    )
  }
}