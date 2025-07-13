import { NextResponse } from 'next/server'

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_API_KEY = process.env.TMDB_API_KEY

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const timeWindow = searchParams.get('time_window') || 'week'

    const res = await fetch(
      `${TMDB_API_URL}/trending/movie/${timeWindow}?api_key=${TMDB_API_KEY}&language=en-US`,
      { next: { revalidate: 3600 } }
    )

    if (!res.ok) throw new Error('Failed to fetch trending movies')
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Trending API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trending movies' },
      { status: 500 }
    )
  }
}