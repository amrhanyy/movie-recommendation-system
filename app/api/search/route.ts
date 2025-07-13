import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')

  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 })
  }

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch from TMDB')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Failed to search movies and TV shows' }, { status: 500 })
  }
}

