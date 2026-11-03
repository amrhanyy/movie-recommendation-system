import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * REL-003 / BUG-RECOMMENDATION-OWNED-ITEM-IDENTIFIER regression suite.
 *
 * Proves stable-identifier owned-item exclusion in /api/ai-recommendations:
 * - current-schema (itemId) favorites/watchlist items are excluded by ID even
 *   when title similarity does NOT match,
 * - legacy tmdbId-only records are excluded via the read-time fallback,
 * - unrelated recommendations are not over-excluded,
 * - the deterministic content snapshot hash includes the effective identifier
 *   (same set -> same key; different id -> different key; different user ->
 *   different key) under the existing user-recommendations namespace,
 * - empty-content, cache-hit, quota, and prompt-hygiene contracts unchanged.
 *
 * No real services or databases: auth, models, redis, quota, and fetch are
 * mocked following the patterns in tests/performance-m4.test.ts and
 * tests/cache-personalization.test.ts.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  applyRateLimitUser: vi.fn(),
  consumeQuota: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  fetchMock: vi.fn(),
  historyDocs: [] as Array<Record<string, unknown>>,
  watchlistDocs: [] as Array<Record<string, unknown>>,
  favoritesDocs: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/redis', () => ({
  default: vi.fn().mockResolvedValue(null),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/security/auth', () => ({
  requireUser: mocks.requireUser,
  assertSameOriginOrReject: vi.fn().mockReturnValue(null),
  requireAdmin: vi.fn(),
  requireOwner: vi.fn(),
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitPublic: vi.fn().mockResolvedValue(null),
  applyRateLimitUser: mocks.applyRateLimitUser,
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: {
    aiRecommendations: { maxRequests: 5, windowMs: 60_000, prefix: 'ai-recs' },
  },
}));

vi.mock('@/lib/security/quota', () => ({
  consumeQuota: mocks.consumeQuota,
}));

vi.mock('@/lib/cache', () => ({
  redisCache: {
    get: mocks.redisGet,
    set: mocks.redisSet,
  },
}));

vi.mock('@/lib/models/History', () => ({
  History: { find: vi.fn() },
}));

vi.mock('@/lib/models/WatchlistModel', () => ({
  WatchlistModel: { find: vi.fn() },
}));

vi.mock('@/lib/models/FavoritesModel', () => ({
  FavoritesModel: { find: vi.fn() },
}));

const USER_A = { id: 'u1', email: 'owner-a@example.com', role: 'user' };
const USER_B = { id: 'u2', email: 'owner-b@example.com', role: 'user' };

// Owned-item fixtures: current-schema (itemId) + legacy-shape (tmdbId only).
// Titles are chosen so isTitleSimilar(suggestion, stored) and
// isTitleSimilar(tmdbMatch, stored) are BOTH false: the substring ratio is
// below the 0.7 threshold, so only an identifier check can exclude them.
const FAV_INCEPTION = { itemId: 603, title: 'Oppenheimer', type: 'movie' };
const WATCH_MATRIX = { itemId: 155, title: 'The Matrix', type: 'movie' };
const WATCH_LEGACY = { tmdbId: 657, title: 'Legacy Title', type: 'tv' };

const GEMINI_JSON = JSON.stringify({
  recommendations: [
    // Case A: title dissimilar to stored 'Oppenheimer' (9/28 = 0.32 < 0.7),
    // TMDB first match resolves to owned id 603.
    { title: 'Oppenheimer: The Complete Cut', confidence: 0.9, 'sub-genre': 'drama', type: 'movie' },
    // Case B: title dissimilar to stored 'The Matrix' (9/35 = 0.26 < 0.7),
    // TMDB first match resolves to owned id 155.
    { title: 'The Matrix: Extended Director Cut', confidence: 0.85, 'sub-genre': 'sci-fi', type: 'movie' },
    // Case C: unrelated, different id, dissimilar title -> must remain.
    { title: 'Totally Different Story', confidence: 0.8, 'sub-genre': 'comedy', type: 'movie' },
    // Case D (used in the legacy fixture run): dissimilar (11/24 = 0.46 < 0.7),
    // TMDB first match resolves to owned legacy id 657.
    { title: 'Legacy Title: Remastered', confidence: 0.7, 'sub-genre': 'docu', type: 'tv' },
  ],
});

const TMDB_RESULTS: Record<string, Array<Record<string, unknown>>> = {
  'oppenheimer: the complete cut': [
    { id: 603, title: 'Oppenheimer: The Complete Cut', media_type: 'movie', vote_average: 8.1 },
  ],
  'thematrix: extended director cut': [
    { id: 155, title: 'The Matrix: Extended Director Cut', media_type: 'movie', vote_average: 7.9 },
  ],
  'totally different story': [
    { id: 999, title: 'Totally Different Story', media_type: 'movie', vote_average: 6.0 },
  ],
  'legacy title: remastered': [
    { id: 657, name: 'Legacy Title: Remastered', media_type: 'tv', vote_average: 7.2 },
  ],
};

function geminiOkText(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function wireFetch(geminiText: string | null) {
  const f = mocks.fetchMock as ReturnType<typeof vi.fn>;
  f.mockReset();
  f.mockImplementation(mkFetch(geminiText));
}

function mkFetch(
  geminiText: string | null,
  tmdb: Record<string, Array<Record<string, unknown>>> = TMDB_RESULTS
) {
  const json = (value: unknown) =>
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('generativelanguage.googleapis.com')) {
      if (geminiText === null) {
        return new Response('nope', { status: 200 });
      }
      return json(geminiOkText(geminiText));
    }
    if (url.includes('search/multi')) {
      const query = new URL(url).searchParams.get('query') ?? '';
      const results = tmdb[query.toLowerCase().replace(/[^\w\s:]+/g, '').trim()] ?? [];
      return json({ results });
    }
    return json({});
  };
}

function mkChain(docs: unknown[]) {
  return {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(docs),
    then(resolve: (v: unknown) => void) {
      resolve(docs);
    },
  };
}

function setUser(user: { id: string; email: string; role: string }) {
  mocks.requireUser.mockResolvedValue({ ok: true, user });
}

async function importRoute() {
  const mod = await import('@/app/api/ai-recommendations/route');
  return mod.GET;
}

function cacheKeysSeen(): string[] {
  return mocks.redisGet.mock.calls.map((c: unknown[]) => c[0] as string);
}

describe('REL-003 owned-item identifier exclusion (ai-recommendations)', () => {
  beforeEach(async () => {
    vi.resetModules();
    setUser(USER_A);
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.consumeQuota.mockReset().mockResolvedValue({ allowed: true });
    mocks.redisGet.mockReset().mockResolvedValue(null);
    mocks.redisSet.mockReset().mockResolvedValue(undefined);
    mocks.historyDocs = [{ title: 'History Title', type: 'movie' }];
    mocks.watchlistDocs = [WATCH_MATRIX];
    mocks.favoritesDocs = [FAV_INCEPTION];
    mocks.fetchMock.mockReset();
    vi.stubGlobal('fetch', mocks.fetchMock);
    vi.stubEnv('GOOGLE_API_KEY', 'test-key');
  });

  it('case A: current-schema Favorite with itemId is excluded by ID despite dissimilar titles', async () => {
    const { History } = await import('@/lib/models/History');
    const { WatchlistModel } = await import('@/lib/models/WatchlistModel');
    const { FavoritesModel } = await import('@/lib/models/FavoritesModel');
    (History.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.historyDocs));
    (WatchlistModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.watchlistDocs));
    (FavoritesModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.favoritesDocs));
    wireFetch(GEMINI_JSON);

    const GET = await importRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recommendations: Array<{ id: number }> };
    const ids = body.recommendations.map((r) => r.id);

    // Title similarity is false for this pair, so only the identifier check
    // can remove the owned item.
    expect(ids).not.toContain(603);
    expect(ids).toContain(999);
  });

  it('case A (projection): watchlist and favorites queries select both identifier fields, typed lean', async () => {
    const expectedProjection = { itemId: 1, tmdbId: 1, title: 1, type: 1, _id: 0 };
    const { History } = await import('@/lib/models/History');
    const { WatchlistModel } = await import('@/lib/models/WatchlistModel');
    const { FavoritesModel } = await import('@/lib/models/FavoritesModel');
    const watchChain = mkChain(mocks.watchlistDocs);
    const favChain = mkChain(mocks.favoritesDocs);
    (History.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.historyDocs));
    (WatchlistModel.find as ReturnType<typeof vi.fn>).mockReturnValue(watchChain);
    (FavoritesModel.find as ReturnType<typeof vi.fn>).mockReturnValue(favChain);
    wireFetch(GEMINI_JSON);

    const GET = await importRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));
    expect(res.status).toBe(200);
    expect(watchChain.select).toHaveBeenCalledWith(expectedProjection);
    expect(favChain.select).toHaveBeenCalledWith(expectedProjection);
    // Typed lean results: the route consumes plain projected objects.
    expect(watchChain.lean).toHaveBeenCalled();
    expect(favChain.lean).toHaveBeenCalled();
    // History projection untouched by the fix.
    const historyChain = (History.find as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(historyChain.select).toHaveBeenCalledWith({ title: 1, type: 1, _id: 0 });
  });

  it('case B: current-schema Watchlist item with itemId is excluded by ID despite dissimilar titles', async () => {
    const { History } = await import('@/lib/models/History');
    const { WatchlistModel } = await import('@/lib/models/WatchlistModel');
    const { FavoritesModel } = await import('@/lib/models/FavoritesModel');
    (History.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.historyDocs));
    (WatchlistModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.watchlistDocs));
    (FavoritesModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain([]));
    wireFetch(GEMINI_JSON);

    const GET = await importRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recommendations: Array<{ id: number }> };
    expect(body.recommendations.map((r) => r.id)).not.toContain(155);
  });

  it('case C: unrelated recommendation with different id and dissimilar title remains', async () => {
    const { History } = await import('@/lib/models/History');
    const { WatchlistModel } = await import('@/lib/models/WatchlistModel');
    const { FavoritesModel } = await import('@/lib/models/FavoritesModel');
    (History.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.historyDocs));
    (WatchlistModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.watchlistDocs));
    (FavoritesModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.favoritesDocs));
    wireFetch(GEMINI_JSON);

    const GET = await importRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recommendations: Array<{ id: number }> };
    expect(body.recommendations.map((r) => r.id)).toContain(999);
  });

  it('case D: legacy tmdbId-only record is excluded via read-time fallback (typed lean shape)', async () => {
    mocks.watchlistDocs = [WATCH_LEGACY]; // plain projected object, not a hydrated doc
    mocks.favoritesDocs = [];
    const { History } = await import('@/lib/models/History');
    const { WatchlistModel } = await import('@/lib/models/WatchlistModel');
    const { FavoritesModel } = await import('@/lib/models/FavoritesModel');
    (History.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.historyDocs));
    (WatchlistModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.watchlistDocs));
    (FavoritesModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.favoritesDocs));
    wireFetch(GEMINI_JSON);

    const GET = await importRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recommendations: Array<{ id: number }> };
    expect(body.recommendations.map((r) => r.id)).not.toContain(657);
    // Unrelated movie still present: no over-exclusion from the legacy item.
    expect(body.recommendations.map((r) => r.id)).toContain(999);
  });

  it('case E: snapshot hash identity (deterministic, id-sensitive, user-scoped, namespaced)', async () => {
    const { History } = await import('@/lib/models/History');
    const { WatchlistModel } = await import('@/lib/models/WatchlistModel');
    const { FavoritesModel } = await import('@/lib/models/FavoritesModel');
    const wire = () => {
      (History.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.historyDocs));
      (WatchlistModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.watchlistDocs));
      (FavoritesModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.favoritesDocs));
    };
    wireFetch(GEMINI_JSON);
    const GET = await importRoute();

    // E1: same user + same owned set -> same key (deterministic).
    setUser(USER_A);
    wire();
    expect((await GET(new NextRequest('http://localhost/api/ai-recommendations'))).status).toBe(200);
    const key1 = cacheKeysSeen().at(-1);
    wire();
    expect((await GET(new NextRequest('http://localhost/api/ai-recommendations'))).status).toBe(200);
    const key2 = cacheKeysSeen().at(-1);
    expect(key2).toBe(key1);

    // E2: same titles/types but a different stable identifier -> different key.
    mocks.watchlistDocs = [];
    mocks.favoritesDocs = [{ itemId: 999, title: 'Oppenheimer', type: 'movie' }];
    wire();
    expect((await GET(new NextRequest('http://localhost/api/ai-recommendations'))).status).toBe(200);
    const keyOtherId = cacheKeysSeen().at(-1);
    expect(keyOtherId).not.toBe(key1);

    // E3: different user email, identical owned content -> different key.
    setUser(USER_B);
    mocks.watchlistDocs = [WATCH_MATRIX];
    mocks.favoritesDocs = [FAV_INCEPTION];
    wire();
    expect((await GET(new NextRequest('http://localhost/api/ai-recommendations'))).status).toBe(200);
    const keyOtherUser = cacheKeysSeen().at(-1);
    expect(keyOtherUser).not.toBe(key1);

    // E4: key stays under the normalized user-recommendations namespace.
    expect(key1).toMatch(
      /^movie-recommendation-system:development:v1:user:recommendations:recs_[0-9a-f]{16}$/
    );
  });

  it('case F: empty owned content preserves needsContent short-circuit (no AI/TMDB/quota/cache-write)', async () => {
    mocks.watchlistDocs = [];
    mocks.favoritesDocs = [];
    const { History } = await import('@/lib/models/History');
    const { WatchlistModel } = await import('@/lib/models/WatchlistModel');
    const { FavoritesModel } = await import('@/lib/models/FavoritesModel');
    (History.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.historyDocs));
    (WatchlistModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.watchlistDocs));
    (FavoritesModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.favoritesDocs));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const GET = await importRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recommendations: unknown[]; needsContent: boolean };
    expect(body.needsContent).toBe(true);
    expect(body.recommendations).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it('case G: cache-hit skips quota; cache-miss consumes once; denial shape preserved; no ids in Gemini payload', async () => {
    const { History } = await import('@/lib/models/History');
    const { WatchlistModel } = await import('@/lib/models/WatchlistModel');
    const { FavoritesModel } = await import('@/lib/models/FavoritesModel');
    const wire = () => {
      (History.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.historyDocs));
      (WatchlistModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.watchlistDocs));
      (FavoritesModel.find as ReturnType<typeof vi.fn>).mockReturnValue(mkChain(mocks.favoritesDocs));
    };
    wireFetch(GEMINI_JSON);
    const GET = await importRoute();

    // G1: cache hit -> cached payload returned, quota NOT consumed.
    const cachedPayload = { recommendations: [{ id: 42, title: 'Cached' }], needsContent: false };
    mocks.redisGet.mockResolvedValue(cachedPayload);
    wire();
    const hitRes = await GET(new NextRequest('http://localhost/api/ai-recommendations'));
    expect(hitRes.status).toBe(200);
    expect((await hitRes.json())).toEqual(cachedPayload);
    expect(mocks.consumeQuota).not.toHaveBeenCalled();

    // G2: cache miss -> quota consumed exactly once with ('recs', 20).
    mocks.redisGet.mockResolvedValue(null);
    wire();
    const missRes = await GET(new NextRequest('http://localhost/api/ai-recommendations'));
    expect(missRes.status).toBe(200);
    expect(mocks.consumeQuota).toHaveBeenCalledTimes(1);
    expect(mocks.consumeQuota).toHaveBeenCalledWith(USER_A.email, 'recs', 20);

    // G3: quota denial -> established 429 response preserved.
    mocks.consumeQuota.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    wire();
    const deniedRes = await GET(new NextRequest('http://localhost/api/ai-recommendations'));
    expect(deniedRes.status).toBe(429);
    const deniedBody = (await deniedRes.json()) as { error: string; retryAfterSeconds: number };
    expect(deniedBody.error).toBe('Daily recommendation limit reached');
    expect(deniedBody.retryAfterSeconds).toBe(42);

    // G4: Gemini payload carries titles/types only — no owned identifiers.
    let geminiBody: unknown = null;
    for (const call of mocks.fetchMock.mock.calls as Array<[string, { body?: string } | undefined]>) {
      if (call[0].includes('generativelanguage.googleapis.com')) {
        geminiBody = JSON.parse(call[1]?.body ?? '');
      }
    }
    expect(geminiBody).not.toBeNull();
    const geminiJson = JSON.stringify(geminiBody);
    expect(geminiJson).not.toContain('603');
    expect(geminiJson).not.toContain('155');
    expect(geminiJson).not.toContain('657');
  });
});
