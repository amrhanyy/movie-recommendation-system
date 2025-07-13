import { NextResponse } from 'next/server'

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_API_KEY = process.env.TMDB_API_KEY

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
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url)
    const page = searchParams.get('page') || '1'
    const type = searchParams.get('type') || 'movie'

    if (!TMDB_API_KEY) {
      throw new Error('TMDB API key is not configured');
    }

    // Get the correct genre ID for the content type
    let genreId = id;
    if (genreMapping[id]) {
      genreId = type === 'tv' ? genreMapping[id].tv : genreMapping[id].movie;
    }

    // Fetch the content with the mapped genre ID
    const res = await fetch(
      `${TMDB_API_URL}/discover/${type}?api_key=${TMDB_API_KEY}&with_genres=${genreId}&page=${page}&language=en-US&include_adult=false&sort_by=popularity.desc`,
      { 
        next: { revalidate: 3600 },
        headers: {
          'Accept': 'application/json'
        }
      }
    )

    if (!res.ok) {
      const error = await res.json()
      return NextResponse.json(
        { error: error.status_message || `Failed to fetch ${type} for genre` },
        { status: res.status }
      )
    }

    const data = await res.json()
    if (!data.results) {
      return NextResponse.json(
        { error: 'Invalid response from TMDB API' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Genre content API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch genre content' },
      { status: 500 }
    )
  }
}
