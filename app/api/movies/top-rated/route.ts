import { NextResponse } from 'next/server'

const TMDB_API_KEY = process.env.TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

export async function GET() {
  try {
    const response = await fetch(
      `${BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=1`
    )

    if (!response.ok) throw new Error('Failed to fetch top rated movies')
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch top rated movies' }, 
      { status: 500 }
    )
  }
}
