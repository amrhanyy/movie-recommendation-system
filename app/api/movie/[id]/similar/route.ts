import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit';
import { tmdbIdSchema } from '@/lib/security/schemas';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit public TMDB proxy (M-03)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { id: movieId } = await params;

    // Validate TMDB ID (M-03): positive integer only
    const idParse = tmdbIdSchema.safeParse(Number(movieId));
    if (!idParse.success || !/^\d{1,8}$/.test(movieId)) {
      return NextResponse.json({ error: 'Invalid movie ID' }, { status: 400 });
    }

    if (!TMDB_API_KEY) {
      return NextResponse.json({ error: 'Upstream service unavailable' }, { status: 503 });
    }

    // Fetch similar movies from TMDB
    const response = await fetch(
      `${BASE_URL}/movie/${movieId}/similar?api_key=${TMDB_API_KEY}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    );

    if (!response.ok) {
      // L-07: fixed error text, no upstream status/body passthrough
      const status = response.status >= 400 && response.status < 500 ? response.status : 502;
      return NextResponse.json(
        { error: 'Failed to fetch similar movies' },
        { status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching similar movies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch similar movies' },
      { status: 500 }
    );
  }
}
