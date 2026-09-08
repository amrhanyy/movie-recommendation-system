import { NextRequest, NextResponse } from 'next/server'
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit';
import { tmdbIdSchema, mediaTypeStrictSchema } from '@/lib/security/schemas';
import { redisCache } from '@/lib/cache';
import { CACHE_SCOPES, buildCacheKey } from '@/lib/cache-namespace';

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_API_KEY = process.env.TMDB_API_KEY

const GENRE_CONTENT_TTL = 3600;

// Complete genre mapping between movies and TV shows
const genreMapping: { [key: string]: { movie: string; tv: string } } = {
  '28': { movie: '28', tv: '10759' },    // Action -> Action & Adventure
  '12': { movie: '12', tv: '10759' },    // Adventure -> Action & Adventure
  '16': { movie: '16', tv: '16' },       // Animation
  '35': { movie: '35', tv: '35' },       // Comedy
  '80': { movie: '80', tv: '80' },       // Crime
  '99': { movie: '99', tv: '99' },       // Documentary
  '18': { movie: '18', tv: '18' },       // Drama
  '10751': { movie: '10751', tv: '10751' }, // Family
  '14': { movie: '14', tv: '10765' },    // Fantasy -> Sci-Fi & Fantasy
  '36': { movie: '36', tv: '36' },       // History
  '27': { movie: '27', tv: '9648' },     // Horror -> Mystery
  '10402': { movie: '10402', tv: '10402' }, // Music
  '9648': { movie: '9648', tv: '9648' }, // Mystery
  '10749': { movie: '10749', tv: '10749' }, // Romance
  '878': { movie: '878', tv: '10765' },  // Science Fiction -> Sci-Fi & Fantasy
  '10770': { movie: '10770', tv: '10770' }, // TV Movie
  '53': { movie: '53', tv: '9648' },     // Thriller -> Mystery
  '10752': { movie: '10752', tv: '10768' }, // War -> War & Politics
  '37': { movie: '37', tv: '37' },       // Western
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Rate limit public TMDB proxy (M-03)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url)
    const page = searchParams.get('page') || '1'
    const type = searchParams.get('type') || 'movie'

    // M-03: validate id (numeric genre id) and type (movie|tv only)
    const idParse = tmdbIdSchema.safeParse(Number(id));
    if (!idParse.success || !/^\d{1,8}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid genre ID' }, { status: 400 });
    }
    const typeParse = mediaTypeStrictSchema.safeParse(type);
    if (!typeParse.success) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
    // Page must be a positive integer to avoid upstream query tampering
    const pageParse = /^\d{1,4}$/.test(page);
    if (!pageParse) {
      return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
    }

    if (!TMDB_API_KEY) {
      return NextResponse.json({ error: 'Upstream service unavailable' }, { status: 503 });
    }

    // Get the correct genre ID for the content type
    let genreId = id;
    if (genreMapping[id]) {
      genreId = typeParse.data === 'tv' ? genreMapping[id].tv : genreMapping[id].movie;
    }

    // Fetch the content with the mapped genre ID (server cache, 1 hour)
    const cacheKey = buildCacheKey(CACHE_SCOPES.publicTMDb, `genre:${typeParse.data}:${genreId}:${page}`);
    const data = await redisCache.getOrSet(cacheKey, async () => {
      const res = await fetch(
        `${TMDB_API_URL}/discover/${typeParse.data}?api_key=${TMDB_API_KEY}&with_genres=${genreId}&page=${page}&language=en-US&include_adult=false&sort_by=popularity.desc`,
        {
          headers: {
            'Accept': 'application/json'
          }
        }
      )

      if (!res.ok) {
        throw Object.assign(new Error('Failed to fetch genre content'), {
          status: res.status >= 400 && res.status < 500 ? res.status : 502,
        });
      }

      const body = await res.json()
      if (!body.results) {
        throw Object.assign(new Error('Invalid response from upstream service'), { status: 500 });
      }

      return body;
    }, GENRE_CONTENT_TTL);

    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && 'status' in error && typeof (error as { status?: unknown }).status === 'number') {
      // L-07: fixed error text, no upstream status_message passthrough
      const status = (error as { status: number }).status;
      const message = status === 500 && error.message !== 'Failed to fetch genre content'
        ? error.message
        : 'Failed to fetch genre content';
      return NextResponse.json({ error: message }, { status });
    }
    console.error('Genre content API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch genre content' },
      { status: 500 }
    )
  }
}
