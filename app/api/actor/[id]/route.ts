import { NextRequest, NextResponse } from 'next/server'
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit'

const TMDB_API_KEY = process.env.TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit public TMDB proxy (F-011/F-028)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // Await params to get the id
    const { id: actorId } = await params

    // Validate TMDB person ID: positive integer (F-033)
    if (!/^\d{1,8}$/.test(actorId)) {
      return NextResponse.json({ error: 'Invalid actor ID' }, { status: 400 });
    }

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