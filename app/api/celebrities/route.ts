import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit';
import { redisCache } from '@/lib/cache';
import { CACHE_SCOPES, buildCacheKey } from '@/lib/cache-namespace';

const CELEBRITIES_TTL = 300;

export async function GET(request: NextRequest) {
  // Rate limit public TMDB proxy (F-011 / F-028)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.mood);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const API_KEY = process.env.TMDB_API_KEY;
  const { searchParams } = new URL(request.url);
  const pageParam = searchParams.get('page') || '1';

  // Validate page (1-1000)
  const page = Number(pageParam);
  if (!Number.isInteger(page) || page < 1 || page > 1000) {
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  }

  const cacheKey = buildCacheKey(CACHE_SCOPES.publicTMDb, `celebrities:${page}`);
  try {
    const data = await redisCache.getOrSet(cacheKey, async () => {
      const response = await fetch(
        `https://api.themoviedb.org/3/person/popular?api_key=${API_KEY}&language=en-US&page=${page}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch celebrities');
      }

      return await response.json();
    }, CELEBRITIES_TTL);

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch celebrities' }, { status: 502 });
  }
}
