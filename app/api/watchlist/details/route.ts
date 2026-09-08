import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/security/auth';
import { applyRateLimitUser, RATE_LIMITS } from '@/lib/security/rateLimit';
import connectToMongoDB from '@/lib/mongodb';
import { WatchlistModel } from '@/lib/models/WatchlistModel';
import tmdbClient from '@/lib/tmdb';
import type { TMDBDetails } from '@/lib/tmdb';
import redisCache from '@/lib/cache';
import { buildCacheKey, CACHE_SCOPES } from '@/lib/cache-namespace';

// R3: cap details resolution per call to bound upstream TMDB fan-out and
// prevent quota spikes from oversized lists.
const MAX_DETAIL_ITEMS = 50;
// Per-item detail cache TTL (30 min) — matches /api/movie/[id].
const DETAIL_TTL = 1800;
// REDIS-CAL: bounded concurrency for the per-item detail fan-out (max 8
// in-flight), mirroring the M4 ai-recommendations enrichment pool. Caps
// per-invocation Redis pressure (GET + SET per item) and smooths the TMDB
// origin burst on cold misses, regardless of list size.
const DETAIL_POOL_SIZE = 8;

export async function GET(request: NextRequest) {
  try {
    // Server-authoritative session (M-04: no PII logging of session email)
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    const readLimit = await applyRateLimitUser(request, authResult.user.email, RATE_LIMITS.read);
    if (readLimit) return readLimit;

    await connectToMongoDB();
    const watchlistItems = await WatchlistModel.find({ userId: authResult.user.email });

    // R3: bound fan-out — resolve at most MAX_DETAIL_ITEMS per call.
    const toResolve = watchlistItems.slice(0, MAX_DETAIL_ITEMS);

    // R3: no artificial batch sleeps. Each item's TMDB detail fetch is
    // cached server-side (30 min), so repeated reads do not re-hit TMDB and
    // upstream calls stay bounded and parallel.
    // REDIS-CAL: process in batches of DETAIL_POOL_SIZE so both the Redis
    // getOrSet calls and the TMDB origin fetches are smoothed (pool also
    // bounds in-flight TMDB requests on a full-cold miss).
    const results: Awaited<ReturnType<typeof resolveItem>>[] = [];
    for (let i = 0; i < toResolve.length; i += DETAIL_POOL_SIZE) {
      const batch = toResolve.slice(i, i + DETAIL_POOL_SIZE);
      const batchResults = await Promise.all(batch.map(resolveItem));
      results.push(...batchResults);
    }

    async function resolveItem(item: (typeof toResolve)[number]) {
        const baseItem = item.toObject();

        if (!item.itemId || !item.type || !['movie', 'tv'].includes(item.type)) {
          return baseItem;
        }

        try {
          // Cache the per-media detail by validated itemId + type.
          const detailKey = buildCacheKey(
            CACHE_SCOPES.publicTMDb,
            `media:${item.type}:${item.itemId}:details`
          );
          const details = await redisCache.getOrSet<TMDBDetails>(
            detailKey,
            () => tmdbClient.fetchMediaDetails(item.itemId, item.type as 'movie' | 'tv'),
            DETAIL_TTL
          );

          return {
            ...baseItem,
            releaseDate: 'release_date' in details ? details.release_date :
                        'first_air_date' in details ? details.first_air_date : null,
            popularity: typeof details.popularity === 'number' ? details.popularity : 0,
            runtime: 'runtime' in details && typeof details.runtime === 'number' ? details.runtime :
                    'episode_run_time' in details && Array.isArray(details.episode_run_time) && details.episode_run_time.length > 0 ?
                    details.episode_run_time[0] : 0,
            // Add additional details for UI
            title: 'title' in details ? details.title : 'name' in details ? details.name : baseItem.title,
            posterPath: details.poster_path || baseItem.posterPath,
            voteAverage: details.vote_average || 0
          };
        } catch {
          // Fixed message: no error object in logs (M-04 policy)
          console.error(`Error fetching details for ${item.type} ${item.itemId}`);
          return baseItem; // Return base item on error
        }
    }

    return NextResponse.json(results);
  } catch {
    // No error object in logs: avoid leaking upstream/DB details (M-04 policy)
    console.error('Watchlist details error: upstream fetch failed');
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 });
  }
}
