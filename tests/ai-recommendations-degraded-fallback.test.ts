import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Phase 20 (spec section 8): ai-recommendations TMDB degraded fallback contract.
 *
 * - The degraded TMDB fallback fires ONLY for eligible Gemini availability
 *   errors (AI_UNAVAILABLE / AI_RATE_LIMITED / AI_TIMEOUT). Auth errors
 *   (AI_AUTH_ERROR) and malformed upstream output (AI_INVALID_RESPONSE) are
 *   normalized by the outer catch WITHOUT a fallback.
 * - A degraded response identifies itself: source 'tmdb-fallback',
 *   degraded true. The Gemini success path reports source 'gemini',
 *   degraded false.
 * - Degraded (fallback) results are NEVER cached; only the Gemini success
 *   path is stored (TTL 3600s).
 * - If the fallback also fails to produce recommendations after an eligible
 *   error, the route returns the normalized ORIGINAL AI error -- it never
 *   masks both failures as a 200 success.
 * - The per-user 20/day quota is still consumed exactly once on the fallback
 *   path (quota accounting is unchanged by Phase 20).
 *
 * The real gemini-provider module runs against a stubbed global fetch
 * (same pattern as ai-recommendations-ownership-exclusion.test.ts).
 */

vi.mock('@/lib/redis', () => ({
  default: vi.fn().mockResolvedValue(null),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue({}),
}));

const authMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertSameOriginOrReject: vi.fn(),
  applyRateLimitPublic: vi.fn(),
  applyRateLimitUser: vi.fn(),
  consumeQuota: vi.fn(),
}));

vi.mock('@/lib/security/auth', () => ({
  requireUser: authMocks.requireUser,
  assertSameOriginOrReject: authMocks.assertSameOriginOrReject,
  requireAdmin: vi.fn(),
  requireOwner: vi.fn(),
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitPublic: authMocks.applyRateLimitPublic,
  applyRateLimitUser: authMocks.applyRateLimitUser,
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: {
    chat: { maxRequests: 10, windowMs: 60_000, prefix: 'chat' },
    aiRecommendations: { maxRequests: 5, windowMs: 60_000, prefix: 'ai-recs' },
    aiSimilar: { maxRequests: 10, windowMs: 60_000, prefix: 'ai-similar' },
    search: { maxRequests: 30, windowMs: 60_000, prefix: 'search' },
    tmdbProxy: { maxRequests: 60, windowMs: 60_000, prefix: 'tmdb' },
    tmdbProxyStrict: { maxRequests: 10, windowMs: 60_000, prefix: 'tmdb-strict' },
    listWrite: { maxRequests: 20, windowMs: 60_000, prefix: 'list-write' },
    mood: { maxRequests: 20, windowMs: 60_000, prefix: 'mood' },
    read: { maxRequests: 120, windowMs: 60_000, prefix: 'read' },
  },
}));

vi.mock('@/lib/security/quota', () => ({
  consumeQuota: authMocks.consumeQuota,
}));

const cacheMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@/lib/cache', () => ({
  redisCache: {
    get: cacheMocks.get,
    set: cacheMocks.set,
  },
}));

vi.mock('@/lib/models/History', () => ({
  History: { find: vi.fn() },
}));

vi.mock('@/lib/models/WatchlistModel', () => ({
  WatchlistModel: { find: vi.fn() },
}));

vi.mock('@/lib/models/FavoritesModel', () => ({
  FavoritesModel: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    exists: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

const sessionUser = { id: 'u1', email: 'fallback@example.com', role: 'user' };

/**
 * Fixture: 3 popular movies + 3 popular shows (the fallback source) plus
 * Gemini-success titles. ENRICHED_IDS maps every title to the id the
 * stubbed /search/multi enrichment returns.
 */
const POPULAR_MOVIE_TITLES = ['Pop Movie One', 'Pop Movie Two', 'Pop Movie Three'];
const POPULAR_TV_TITLES = ['Pop Show One', 'Pop Show Two', 'Pop Show Three'];
const GEMINI_REC_TITLES = ['Rec Movie A', 'Rec Movie B', 'Rec Show A', 'Rec Show B'];
const ENRICHED_IDS: Record<string, number> = {
  'Pop Movie One': 9001,
  'Pop Movie Two': 9002,
  'Pop Movie Three': 9003,
  'Pop Show One': 9101,
  'Pop Show Two': 9102,
  'Pop Show Three': 9103,
  'Rec Movie A': 9201,
  'Rec Movie B': 9202,
  'Rec Show A': 9301,
  'Rec Show B': 9302,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function geminiTextResponse(text: string) {
  return json({ candidates: [{ content: { parts: [{ text }] } }] });
}

function mkChain(docs: Record<string, unknown>[]) {
  const thenable = {
    sort: () => thenable,
    limit: () => thenable,
    skip: () => thenable,
    select: () => thenable,
    lean: () => thenable,
    then: (
      onFulfilled?: (v: Record<string, unknown>[]) => unknown,
      onRejected?: (e: unknown) => unknown
    ) => Promise.resolve(docs).then(onFulfilled, onRejected),
  };
  return thenable;
}

/** Stubbed TMDB side: popular lists + search/multi enrichment hits. */
function tmdbStub(url: string): Response {
  if (url.includes('/movie/popular')) {
    return json({ results: POPULAR_MOVIE_TITLES.map((t) => ({ title: t })) });
  }
  if (url.includes('/tv/popular')) {
    return json({ results: POPULAR_TV_TITLES.map((n) => ({ name: n })) });
  }
  if (url.includes('/search/multi')) {
    const query = new URL(url).searchParams.get('query') ?? '';
    const id = ENRICHED_IDS[query];
    if (!id) return json({ results: [] });
    return json({
      results: [
        {
          id,
          title: query,
          name: query,
          media_type: id >= 9101 ? 'tv' : 'movie',
          vote_average: 7,
          release_date: '2020-01-01',
          first_air_date: '2020-01-01',
          poster_path: null,
        },
      ],
    });
  }
  return json({ results: [] });
}

function fetchedUrls(): string[] {
  return (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
    (c) => String(c[0])
  );
}

const GEMINI_REC_JSON = JSON.stringify({
  recommendations: [
    { title: 'Rec Movie A', type: 'movie', confidence: 0.9 },
    { title: 'Rec Movie B', type: 'movie', confidence: 0.8 },
    { title: 'Rec Show A', type: 'tv', confidence: 0.85 },
    { title: 'Rec Show B', type: 'tv', confidence: 0.8 },
  ],
});

async function loadRoute() {
  // The registry was already reset in beforeEach (after the model mock
  // setup), so this import returns a fresh route module wired to the
  // mocked model instances.
  const mod = await import('@/app/api/ai-recommendations/route');
  return mod.GET;
}

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv('GOOGLE_API_KEY', 'test-key');
  vi.stubEnv('TMDB_API_KEY', 'tmdb-test-key');
  authMocks.requireUser.mockReset().mockResolvedValue({ ok: true, user: sessionUser });
  authMocks.assertSameOriginOrReject.mockReset().mockReturnValue(null);
  authMocks.applyRateLimitPublic.mockReset().mockResolvedValue(null);
  authMocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
  authMocks.consumeQuota.mockReset().mockResolvedValue({ allowed: true });
  cacheMocks.get.mockReset().mockResolvedValue(null);
  cacheMocks.set.mockReset().mockResolvedValue(undefined);

  vi.resetModules();
  const { History } = await import('@/lib/models/History');
  const { WatchlistModel } = await import('@/lib/models/WatchlistModel');
  const { FavoritesModel } = await import('@/lib/models/FavoritesModel');
  (History.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    mkChain([{ title: 'Hist One', type: 'movie' }])
  );
  (WatchlistModel.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    mkChain([{ itemId: 900, title: 'Owned One', type: 'movie' }])
  );
  (FavoritesModel.find as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    mkChain([])
  );
  vi.stubGlobal('fetch', vi.fn());
});

describe('Phase 20 section 8: ai-recommendations TMDB degraded fallback', () => {
  it('persistent 503 (AI_UNAVAILABLE) degrades to the TMDB popular fallback', async () => {
    let geminiCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('generativelanguage')) {
          geminiCalls += 1;
          return json({ error: { message: 'backend busy' } }, 503);
        }
        return tmdbStub(String(url));
      })
    );
    const GET = await loadRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('tmdb-fallback');
    expect(body.degraded).toBe(true);
    expect(body.needsContent).toBe(false);
    expect(body.recommendations).toHaveLength(6);
    const titles = body.recommendations.map((r: { title: string }) => r.title).sort();
    expect(titles).toEqual([...POPULAR_MOVIE_TITLES, ...POPULAR_TV_TITLES].sort());

    // the provider exhausts its 3-attempt retry budget before degrading
    expect(geminiCalls).toBe(3);
    // the per-user daily quota is still consumed exactly once on the fallback path
    expect(authMocks.consumeQuota).toHaveBeenCalledTimes(1);
    // degraded fallback results are never cached
    expect(cacheMocks.set).not.toHaveBeenCalled();
  }, 30000);

  it('persistent 429 (AI_RATE_LIMITED) degrades to the TMDB popular fallback', async () => {
    let geminiCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('generativelanguage')) {
          geminiCalls += 1;
          return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
            status: 429,
            headers: { 'content-type': 'application/json', 'retry-after': '1' },
          });
        }
        return tmdbStub(String(url));
      })
    );
    const GET = await loadRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('tmdb-fallback');
    expect(body.degraded).toBe(true);
    expect(body.recommendations).toHaveLength(6);
    expect(geminiCalls).toBe(3);
    expect(cacheMocks.set).not.toHaveBeenCalled();
  }, 30000);

  it('auth error (401 -> AI_AUTH_ERROR) is normalized WITHOUT the fallback', async () => {
    let geminiCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('generativelanguage')) {
          geminiCalls += 1;
          return json({ error: { message: 'API key not valid' } }, 401);
        }
        return tmdbStub(String(url));
      })
    );
    const GET = await loadRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('AI_AUTH_ERROR');
    expect(body.recommendations).toEqual([]);
    expect(body.source).toBeUndefined();
    expect(body.degraded).toBeUndefined();
    // auth errors are non-retryable: exactly one upstream attempt
    expect(geminiCalls).toBe(1);
    const urls = fetchedUrls();
    expect(urls.some((u) => u.includes('/movie/popular'))).toBe(false);
    expect(urls.some((u) => u.includes('/tv/popular'))).toBe(false);
    expect(cacheMocks.set).not.toHaveBeenCalled();
  }, 30000);

  it('malformed upstream output (AI_INVALID_RESPONSE) is normalized WITHOUT the fallback', async () => {
    let geminiCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('generativelanguage')) {
          geminiCalls += 1;
          return new Response('not json at all', {
            status: 200,
            headers: { 'content-type': 'text/plain' },
          });
        }
        return tmdbStub(String(url));
      })
    );
    const GET = await loadRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('AI_INVALID_RESPONSE');
    expect(body.recommendations).toEqual([]);
    expect(body.source).toBeUndefined();
    expect(body.degraded).toBeUndefined();
    expect(geminiCalls).toBe(1);
    const urls = fetchedUrls();
    expect(urls.some((u) => u.includes('/movie/popular'))).toBe(false);
    expect(cacheMocks.set).not.toHaveBeenCalled();
  }, 30000);

  it('eligible failure + failed fallback surfaces the normalized ORIGINAL AI error', async () => {
    let geminiCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('generativelanguage')) {
          geminiCalls += 1;
          return json({ error: { message: 'backend busy' } }, 503);
        }
        if (String(url).includes('/movie/popular') || String(url).includes('/tv/popular')) {
          return Promise.reject(new Error('tmdb down'));
        }
        return tmdbStub(String(url));
      })
    );
    const GET = await loadRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));

    // the ORIGINAL Gemini error (AI_UNAVAILABLE -> 503) is surfaced, not a
    // fallback-specific message and not a 200 success
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('AI_UNAVAILABLE');
    expect(body.error).toBe('Failed to generate recommendations');
    expect(body.recommendations).toEqual([]);
    expect(body.source).toBeUndefined();
    expect(geminiCalls).toBe(3);
    expect(cacheMocks.set).not.toHaveBeenCalled();
  }, 30000);

  it('unparseable-but-valid Gemini text (no AIUpstreamError) still degrades via the fallback', async () => {
    let geminiCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('generativelanguage')) {
          geminiCalls += 1;
          return geminiTextResponse('I cannot produce recommendations right now.');
        }
        return tmdbStub(String(url));
      })
    );
    const GET = await loadRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));

    // no AIUpstreamError was thrown, so this is the no-eligible-error path:
    // 200 degraded fallback body
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('tmdb-fallback');
    expect(body.degraded).toBe(true);
    expect(body.recommendations).toHaveLength(6);
    expect(geminiCalls).toBe(1);
    expect(cacheMocks.set).not.toHaveBeenCalled();
  }, 30000);

  it('Gemini success reports source gemini / degraded false and caches the result', async () => {
    let geminiCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('generativelanguage')) {
          geminiCalls += 1;
          return geminiTextResponse(GEMINI_REC_JSON);
        }
        return tmdbStub(String(url));
      })
    );
    const GET = await loadRoute();
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('gemini');
    expect(body.degraded).toBe(false);
    expect(body.needsContent).toBe(false);
    expect(body.recommendations).toHaveLength(4);
    const titles = body.recommendations.map((r: { title: string }) => r.title).sort();
    expect(titles).toEqual([...GEMINI_REC_TITLES].sort());
    expect(geminiCalls).toBe(1);
    const urls = fetchedUrls();
    expect(urls.some((u) => u.includes('/movie/popular'))).toBe(false);
    expect(urls.some((u) => u.includes('/tv/popular'))).toBe(false);

    // only the Gemini success path is cached, with the 3600s TTL
    expect(cacheMocks.set).toHaveBeenCalledTimes(1);
    const setArgs = cacheMocks.set.mock.calls[0];
    expect(setArgs[1]).toMatchObject({
      source: 'gemini',
      degraded: false,
      needsContent: false,
    });
    expect(setArgs[2]).toBe(3600);
  }, 30000);
});
