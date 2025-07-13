import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const timeWindow = searchParams.get('time_window') || 'day'

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/trending/tv/${timeWindow}?api_key=${process.env.TMDB_API_KEY}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) throw new Error('Failed to fetch trending TV shows')
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch trending TV shows' }, { status: 500 })
  }
}
