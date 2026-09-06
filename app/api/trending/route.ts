import { NextRequest, NextResponse } from 'next/server'
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit'
import redisCache from '@/lib/cache'
import { buildCacheKey, CACHE_SCOPES } from '@/lib/cache-namespace'

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_API_KEY = process.env.TMDB_API_KEY

// R3: trending responses are cached server-side. `{ next: { revalidate } }` is
// a no-op inside a dynamic Route Handler (the handler is always dynamic), so
// caching must be explicit via redisCache.
const TRENDING_TTL = 3600 // 1 hour

export async function GET(request: NextRequest) {
  // Rate limit public TMDB proxy (F-011/F-028)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { searchParams } = new URL(request.url)
    const timeWindow = searchParams.get('time_window') || 'week'

    // Validate time window (F-033)
    if (timeWindow !== 'day' && timeWindow !== 'week') {
      return NextResponse.json({ error: 'Invalid time window' }, { status: 400 });
    }

    if (!TMDB_API_KEY) {
      return NextResponse.json({ error: 'Upstream service unavailable' }, { status: 503 });
    }

    // Canonical, namespaced key: only the validated time window is embedded.
    const cacheKey = buildCacheKey(
      CACHE_SCOPES.publicTMDb,
      `trending:movie:${timeWindow}`
    );

    // R3: cache the upstream TMDB trending fetch (1h TTL). Subsequent requests
    // within the window never hit TMDB.
    const data = await redisCache.getOrSet(
      cacheKey,
      async () => {
        const res = await fetch(
          `${TMDB_API_URL}/trending/movie/${timeWindow}?api_key=${TMDB_API_KEY}&language=en-US`
        );
        if (!res.ok) {
          throw new Error('Failed to fetch trending movies');
        }
        return res.json();
      },
      TRENDING_TTL
    );

    return NextResponse.json(data)
  } catch (error) {
    console.error('Trending API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trending movies' },
      { status: 500 }
    )
  }
}
