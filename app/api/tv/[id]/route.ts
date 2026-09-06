import { NextRequest, NextResponse } from 'next/server'
import redisCache from '../../../../lib/cache';
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit';

const TMDB_API_KEY = process.env.TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit public TMDB proxy (F-011/F-028)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { id } = await params

    // Validate TMDB ID: positive integer (F-033)
    if (!/^\d{1,8}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid TV show ID' }, { status: 400 });
    }

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