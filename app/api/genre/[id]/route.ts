import { NextRequest, NextResponse } from 'next/server'
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit'
import { tmdbIdSchema, mediaTypeStrictSchema } from '@/lib/security/schemas'

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_API_KEY = process.env.TMDB_API_KEY

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
    const type = searchParams.get('type') || 'movie'

    // M-03: validate id and type before any upstream work
    const idParse = tmdbIdSchema.safeParse(Number(id));
    if (!idParse.success || !/^\d{1,8}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid genre ID' }, { status: 400 });
    }
    const typeParse = mediaTypeStrictSchema.safeParse(type);
    if (!typeParse.success) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    if (!TMDB_API_KEY) {
      return NextResponse.json({ error: 'Upstream service unavailable' }, { status: 503 });
    }

    // Fetch both movie and TV genres to ensure we find the genre
    const [movieGenres, tvGenres] = await Promise.all([
      fetch(
        `${TMDB_API_URL}/genre/movie/list?api_key=${TMDB_API_KEY}&language=en-US`,
        { 
          next: { revalidate: 86400 },
          headers: { 'Accept': 'application/json' }
        }
      ),
      fetch(
        `${TMDB_API_URL}/genre/tv/list?api_key=${TMDB_API_KEY}&language=en-US`,
        { 
          next: { revalidate: 86400 },
          headers: { 'Accept': 'application/json' }
        }
      )
    ]);

    if (!movieGenres.ok || !tvGenres.ok) {
      return NextResponse.json({ error: 'Failed to fetch genres' }, { status: 502 });
    }

    const [movieData, tvData] = await Promise.all([
      movieGenres.json(),
      tvGenres.json()
    ]);

    // Combine all genres
    const allGenres = [...movieData.genres, ...tvData.genres];
    
    // Find unique genre by ID
    const genre = allGenres.find((g: { id: number; toString(): string }) => g.id.toString() === id);
    
    if (!genre) {
      return NextResponse.json(
        { error: 'Genre not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(genre)
  } catch (error) {
    console.error('Genre API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch genre' },
      { status: 500 }
    )
  }
}
