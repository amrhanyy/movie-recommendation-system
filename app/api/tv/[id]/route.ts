import { NextResponse } from 'next/server'
import redisCache from '../../../../lib/cache';

const TMDB_API_KEY = process.env.TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Cache key for this TV show
    const cacheKey = `tv:${id}:details`;
    
    // Try to get from cache or fetch from API
    const data = await redisCache.getOrSet(
      cacheKey,
      async () => {
        console.log(`Cache miss - fetching TV show ${id} from TMDB API`);
        
        const response = await fetch(
          `${BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=videos,images,credits`
        )

        if (!response.ok) {
          throw new Error('Failed to fetch TV show details')
        }

        return response.json();
      },
      // Cache for 30 minutes (1800 seconds)
      1800
    );
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed to fetch TV show details' }, { status: 500 })
  }
}
