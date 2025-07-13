import { NextResponse } from 'next/server'

const TMDB_API_KEY = process.env.TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params to get the id
    const { id: actorId } = await params
    
    // Fetch actor details with additional data
    const actorRes = await fetch(
      `${BASE_URL}/person/${actorId}?api_key=${TMDB_API_KEY}&append_to_response=images,movie_credits,tv_credits`,
      { next: { revalidate: 3600 } }
    )

    if (!actorRes.ok) {
      throw new Error(`Actor fetch failed: ${actorRes.status}`)
    }

    const actorData = await actorRes.json()

    return NextResponse.json(actorData)
  } catch (error) {
    console.error('Error in actor route:', error)
    return NextResponse.json(
      { error: 'Failed to fetch actor details' },
      { status: 500 }
    )
  }
}
