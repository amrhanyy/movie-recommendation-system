import { NextRequest, NextResponse } from 'next/server'
import redisCache from '../../../../../lib/cache';
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit';
import { tmdbIdSchema } from '@/lib/security/schemas';

const TMDB_API_KEY = process.env.TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit public TMDB proxy (M-03)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { id: movieId } = await params

    // Validate TMDB ID (M-03): positive integer only
    const idParse = tmdbIdSchema.safeParse(Number(movieId));
    if (!idParse.success || !/^\d{1,8}$/.test(movieId)) {
      return NextResponse.json({ error: 'Invalid movie ID' }, { status: 400 });
    }

    if (!TMDB_API_KEY) {
      return NextResponse.json({ error: 'Upstream service unavailable' }, { status: 503 });
    }

    // Cache key for movie recommendations
    const cacheKey = `movie:${movieId}:recommendations`;

    // Try to get from cache or fetch from API
    const data = await redisCache.getOrSet(
      cacheKey,
      async () => {
        const response = await fetch(
          `${BASE_URL}/movie/${movieId}/recommendations?api_key=${TMDB_API_KEY}`,
          { next: { revalidate: 3600 } }
        )

        if (!response.ok) {
          // L-07: never reflect raw upstream error text to the client
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
