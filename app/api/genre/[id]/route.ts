import { NextResponse } from 'next/server'

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_API_KEY = process.env.TMDB_API_KEY

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'movie'

    if (!TMDB_API_KEY) {
      throw new Error('TMDB API key is not configured');
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
      throw new Error('Failed to fetch genres');
    }

    const [movieData, tvData] = await Promise.all([
      movieGenres.json(),
      tvGenres.json()
    ]);

    // Combine all genres
    const allGenres = [...movieData.genres, ...tvData.genres];
    
    // Find unique genre by ID
    const genre = allGenres.find((g: any) => g.id.toString() === id);
    
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
      { error: error instanceof Error ? error.message : 'Failed to fetch genre' },
      { status: 500 }
    )
  }
}
