import { NextRequest, NextResponse } from 'next/server'
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit'

const TMDB_API_KEY = process.env.TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

export async function GET(request: NextRequest) {
  // Rate limit public TMDB proxy (F-011/F-028)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

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