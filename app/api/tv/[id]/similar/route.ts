import { NextRequest, NextResponse } from 'next/server'
import redisCache from '../../../../../lib/cache';
import tmdbClient from '@/lib/tmdb';
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit';
import { tmdbIdSchema } from '@/lib/security/schemas';

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
    const { id } = await params

    // Validate TMDB ID (M-03): positive integer only
    const idParse = tmdbIdSchema.safeParse(Number(id));
    if (!idParse.success || !/^\d{1,8}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid TV show ID' }, { status: 400 });
    }

    // Cache key for similar TV shows
    const cacheKey = `tv:${id}:similar`;

    // Try to get from cache or fetch from API
    const data = await redisCache.getOrSet(
      cacheKey,
      async () => {
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
