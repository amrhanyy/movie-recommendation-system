import { NextRequest, NextResponse } from 'next/server'
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit'
import { redactSensitive } from '@/lib/ai-security'
import { redisCache } from '@/lib/cache'
import { CACHE_SCOPES, buildCacheKey } from '@/lib/cache-namespace'

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_API_KEY = process.env.TMDB_API_KEY

// Common streaming services IDs (Netflix, Amazon Prime, Disney+, Apple TV+, Hulu)
const STREAMING_SERVICES = '8|9|337|350|384'

const TRAILERS_TTL = 3600;

// M-03: filter values are matched against this strict allowlist; unknown
// values fall back to the safe default. This prevents upstream query tampering.
const ALLOWED_FILTERS = ['streaming', 'on tv', 'for rent', 'in theaters', 'popular'] as const

type TrailerFilter = (typeof ALLOWED_FILTERS)[number]

const getEndpoint = (filter: TrailerFilter) => {
  switch (filter) {
    case 'streaming':
      return {
        url: `/discover/movie`,
        params: `&with_watch_providers=${STREAMING_SERVICES}&watch_region=US&with_watch_monetization_types=flatrate`
      }
    case 'on tv':
      return {
        url: `/tv/on_the_air`,
        params: ''
      }
    case 'for rent':
      return {
        url: `/discover/movie`,
        params: '&with_watch_monetization_types=rent'
      }
    case 'in theaters':
      return {
        url: `/movie/now_playing`,
        params: '&region=US'
      }
    case 'popular':
    default:
      return {
        url: `/movie/popular`,
        params: ''
      }
  }
}

export async function GET(request: NextRequest) {
  // Rate limit public TMDB proxy (M-03) — strict limit: this route fans out
  // to 1 + up to 10 upstream calls per request
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxyStrict);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!TMDB_API_KEY) {
    return NextResponse.json({ error: 'Upstream service unavailable' }, { status: 503 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const rawFilter = (searchParams.get('filter') || 'popular').toLowerCase()
    // M-03: only accept known filter values, else default to 'popular'
    const filter: TrailerFilter = (ALLOWED_FILTERS as readonly string[]).includes(rawFilter)
      ? (rawFilter as TrailerFilter)
      : 'popular'
    const { url, params } = getEndpoint(filter)

    const cacheKey = buildCacheKey(CACHE_SCOPES.publicTMDb, `trailers:${filter}`);
    const validMovies = await redisCache.getOrSet(cacheKey, async () => {
      const moviesRes = await fetch(
        `${TMDB_API_URL}${url}?api_key=${TMDB_API_KEY}&language=en-US&page=1${params}`,
        {
          headers: {
            'Accept': 'application/json'
          }
        }
      )

      if (!moviesRes.ok) {
        // L-07: log the upstream detail server-side, return a fixed message
        const errorText = redactSensitive((await moviesRes.text()).slice(0, 500))
        console.error('Movies fetch failed:', errorText)
        const status = moviesRes.status >= 400 && moviesRes.status < 500 ? moviesRes.status : 502
        throw Object.assign(new Error('Failed to fetch movies'), { status });
      }

      const contentType = moviesRes.headers.get('content-type')
      if (!contentType?.includes('application/json')) {
        console.error('Invalid content type:', contentType)
        throw Object.assign(new Error('Invalid response from upstream service'), { status: 500 });
      }

      const moviesData = await moviesRes.json()
      if (!moviesData.results) {
        throw Object.assign(new Error('Invalid data format'), { status: 500 });
      }

      // Fetch trailers for each movie
      const moviesWithTrailers = await Promise.all(
        moviesData.results.slice(0, 10).map(async (movie: {
          id: number;
          title?: string;
          name?: string;
          overview?: string;
          poster_path?: string;
          backdrop_path?: string;
          release_date?: string;
          first_air_date?: string;
          vote_average?: number;
        }) => {
          try {
            const mediaType = url.includes('/tv/') ? 'tv' : 'movie'
            const videosRes = await fetch(
              `${TMDB_API_URL}/${mediaType}/${movie.id}/videos?api_key=${TMDB_API_KEY}`,
              {
                headers: {
                  'Accept': 'application/json'
                }
              }
            )

            if (!videosRes.ok) return null
            const videosData = await videosRes.json()

            const trailer = videosData.results?.find((video: { type: string; site: string }) =>
              video.type === 'Trailer' && video.site === 'YouTube'
            ) || videosData.results?.[0]

            return trailer ? {
              id: movie.id,
              title: movie.title || movie.name,
              overview: movie.overview,
              poster_path: movie.poster_path,
              backdrop_path: movie.backdrop_path,
              release_date: movie.release_date || movie.first_air_date,
              vote_average: movie.vote_average,
              trailer_key: trailer.key
            } : null
          } catch (error) {
            console.error(`Error fetching trailer for movie ${movie.id}:`, error)
            return null
          }
        })
      )

      // Filter out items without trailers
      return moviesWithTrailers.filter(movie => movie && movie.trailer_key)
    }, TRAILERS_TTL);

    if (validMovies.length === 0) {
      return NextResponse.json({ error: `No trailers found for ${filter}` }, { status: 404 })
    }

    return NextResponse.json({ results: validMovies })
  } catch (error) {
    if (error instanceof Error && 'status' in error && typeof (error as { status?: unknown }).status === 'number') {
      const status = (error as { status: number }).status;
      const message = status === 404 ? 'Failed to fetch movies'
        : status === 500 && error.message !== 'Failed to fetch movies' ? error.message
        : 'Failed to fetch movies';
      if (status === 404 || status === 500) {
        return NextResponse.json({ error: message }, { status });
      }
      return NextResponse.json({ error: 'Failed to fetch movies' }, { status });
    }
    console.error('Trailers API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trailers' },
      { status: 500 }
    )
  }
}
