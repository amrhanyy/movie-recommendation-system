import { NextRequest, NextResponse } from "next/server"
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit'

export async function GET(request: NextRequest) {
  // Rate limit public TMDB proxy (F-011/F-028)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url)
  const timeWindow = searchParams.get('time_window') || 'day'

  // Validate time window (F-033)
  if (timeWindow !== 'day' && timeWindow !== 'week') {
    return NextResponse.json({ error: 'Invalid time window' }, { status: 400 });
  }

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