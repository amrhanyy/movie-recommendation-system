import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { CACHE_SCOPES, buildCacheKey } from '@/lib/cache-namespace.ts';

/*
 * Every mock handle and fetch seam below is typed to its real shape:
 * `typeof globalThis.fetch` for the fetch doubles, `ReturnType<typeof vi.fn>`
 * for the bare `vi.fn()` handles, and explicit interfaces (`CacheDouble`,
 * `GETRouteHandle`) for the cache singleton and the route handler plus its
 * test-helper properties. `.mock.calls` reads are consolidated in
 * fetchCallCount()/countFetches() — the only code in this file that crosses
 * the untyped mock-context boundary — and the per-test `denied` counter is a
 * local Mock whose calls are read through its own typed `.mock`.
 */

type FetchFn = typeof globalThis.fetch;
type FnMock = ReturnType<typeof vi.fn>;

interface CacheDouble {
  getOrSet: FnMock;
  set: FnMock;
  get: FnMock;
  delete: FnMock;
  invalidatePrefix: FnMock;
  invalidatePattern: FnMock;
  getStats: FnMock;
  clearStats: FnMock;
  flushAll: FnMock;
}

interface CacheState {
  cacheStore: Map<string, { value: string; ttl: number }>;
  recordedKeys: Set<string>;
  recordedTtls: number[];
}

interface GETRouteHandle {
  (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ): Promise<NextResponse>;
  __cacheState?: CacheState;
  __resetCache?: () => void;
}


// -----------------------------------------------------------------------------
// Test-local imports of the route-under-test and cache helper.  Both modules are
// loaded after the auth/rate-limit/cache fakes are installed so the route sees
// the same controlled objects the tests manipulate.
// -----------------------------------------------------------------------------

let GET: GETRouteHandle;

// Module-level mock handles.  `vi.mock` factories are hoisted to the top of the
// file, so every value they reference must already exist at module-eval time.
// `redisCache` is therefore created here — NOT inside beforeEach — so the cache
// factory closes over the same object the tests later rebind methods on.
const redisCache: CacheDouble = {
  getOrSet: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  invalidatePrefix: vi.fn(),
  invalidatePattern: vi.fn(),
  getStats: vi.fn(),
  clearStats: vi.fn(),
  flushAll: vi.fn(),
};
const requireUserMock = vi.fn();
const applyRateLimitUserMock = vi.fn(async (): Promise<Response | null> => null);
// Test credentials.  The route reads these from process.env at module-eval time;
// the fetch guards below match on '?api_key=dummy', so the key must be exactly
// 'dummy'.  Set before any route import.
process.env.TMDB_API_KEY = 'dummy';
process.env.GOOGLE_API_KEY = 'dummy';

// Global fetch guard: deny by default; allow only explicitly-configured
// Gemini/TMDB shapes below.
const FETCH_ALLOWLIST: Array<{ method: string; host: string; path: string }> = [];
let fetchGuard: FetchFn | null = null;

// -----------------------------------------------------------------------------
// Module mocks (hoisted).  Factories reference only module-level bindings.
// -----------------------------------------------------------------------------

// The route imports the DEFAULT redisCache instance (lib/cache.ts).
vi.mock('@/lib/cache.ts', () => ({ default: redisCache }));

// The route calls requireUser() from @/lib/security/auth.
vi.mock('@/lib/security/auth.ts', () => ({ requireUser: requireUserMock }));

// The route imports { applyRateLimitUser, RATE_LIMITS } and calls
// applyRateLimitUser(request, email, RATE_LIMITS.aiSimilar).
vi.mock('@/lib/security/rateLimit.ts', () => ({
  RATE_LIMITS: { aiSimilar: { maxRequests: 10, windowMs: 60_000, prefix: 'ai-similar' } },
  applyRateLimitUser: applyRateLimitUserMock,
}));

beforeEach(async () => {
  vi.clearAllMocks();
  requireUserMock.mockReset();
  applyRateLimitUserMock.mockReset();
  applyRateLimitUserMock.mockImplementation(async () => null);
  requireUserMock.mockResolvedValue({ ok: true, user: { email: 'user@example.com' } });

  // Default allow: authenticated user.

  // Cache double (production-compatible contract):
  // - non-empty stringified value is stored under the key with the given TTL;
  // - undefined is NOT stored;
  // - warm hit returns the stored stringified value without invoking the
  //   producer;
  // - keys are tracked so tests can assert v1-vs-v2 separation;
  // - resetCache() isolates each test case.
  const cacheStore = new Map<string, { value: string; ttl: number }>();
  const recordedKeys = new Set<string>();
  const recordedTtls: number[] = [];
  redisCache.getOrSet = vi.fn(async (key: string, producer: () => unknown, ttl?: number) => {
    recordedKeys.add(key);
    const hit = cacheStore.get(key);
    if (hit && hit.value !== undefined) return JSON.parse(hit.value);
    const result = await producer();
    if (result === undefined) return undefined;
    if (ttl !== undefined) recordedTtls.push(ttl);
    // Mirror RedisCache.set: stored values are JSON-serialized strings.
    cacheStore.set(key, { value: JSON.stringify(result), ttl: ttl ?? -1 });
    return result;
  });
  redisCache.get = vi.fn(async (key: string) => {
    recordedKeys.add(key);
    const v = cacheStore.get(key)?.value;
    if (v === undefined) return null;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  });
  redisCache.set = vi.fn(async (key: string, value: string | object, ttl: number) => {
    recordedKeys.add(key);
    cacheStore.set(key, { value: typeof value === 'string' ? value : JSON.stringify(value), ttl });
    return true;
  });
  // Fresh fetch allowlist per test.
  FETCH_ALLOWLIST.length = 0;
  // The mock's call shape doesn't match the fetch overloads, so it is asserted
  // to the declared fetch type.  `fetchGuard!` is only read after assignment.
  fetchGuard = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
    throw new Error(`DENIED: network guard refused this host/method: ${httpMethod(input, init)} ${typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input)}`);
  }) as FetchFn;
  globalThis.fetch = fetchGuard!;

  const routeModule = await import('@/app/api/movie/[id]/ai-similar/route.ts');
  GET = routeModule.GET;
  // Attach helpers for assertions.
  // __resetCache mutates the SAME Map/Set/array that __cacheState exposes, so
  // assertions always observe the live state (reassigning cacheStore would leave
  // __cacheState.cacheStore pointing at a stale, never-written Map).
  GET.__cacheState = { recordedKeys, recordedTtls, cacheStore };
  GET.__resetCache = () => { cacheStore.clear(); recordedKeys.clear(); recordedTtls.length = 0; };
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

function makeMovie(id: number, title: string, genres = ['Action']) {
  return { id, title, overview: '', genres, vote_average: 7.5, popularity: 10, release_date: '2025-01-01' };
}

function searchResult(title: string, id: number) {
  return tmdbFetchResponse({ results: [{ id, title, overview: '', genres: ['Action'], vote_average: 7.5, release_date: '2025-01-01' }] });
}

function geminiResponse(suggestions: string[]) {
  // The route validates Gemini output against aiSimilarMoviesSchema, whose items
  // are objects {title, year?, reasoning?} — not bare strings.
  return tmdbFetchResponse({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ similar_movies: suggestions.map(t => ({ title: t })) }) }] } }],
  });
}

function tmdbFetchResponse(json: unknown, status = 200) {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(json), { status, headers });
}

// Extract the HTTP method from a fetch call.  `init.method` wins; otherwise read
// it off a Request object.  Coerce to a string first so `.toUpperCase()` never
// receives an object (the `&&` form below can yield a non-string).
function httpMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init && typeof init.method === 'string') return init.method.toUpperCase();
  if (typeof input === 'object' && input && typeof (input as { method?: string }).method === 'string') {
    return (input as { method: string }).method.toUpperCase();
  }
  return 'GET';
}

function geminiHandler(input: RequestInfo | URL, init?: RequestInit): Response | null {
  // Returns a Gemini-shaped response for an allowlisted generateContent POST,
  // else null so the caller can fall through to its next handler.
  const allowedPath = /\/v1beta\/models\/[^/]+:generateContent$/;
  const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
  const method = httpMethod(input, init);
  if (url.includes('generativelanguage.googleapis.com') && allowedPath.test(url) && method === 'POST') {
    return geminiResponse([...Array(12)].map((_, i) => `Suggested Movie ${i + 1}`));
  }
  return null;
}

function installFullMockChain(opts: { similarResults?: object[] } = {}) {
  // Gemini first, then the TMDB shapes, then the deny-by-default guard.
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
    const gemini = await geminiHandler(input, init);
    if (gemini !== null) return gemini;

    const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
    const method = httpMethod(input, init);
    if (url.includes('api.themoviedb.org/3/movie/')) {
      if (url.includes('/similar') && url.includes('?api_key=dummy')) {
        if (method !== 'GET') throw new Error(`DENIED: ${method} ${url}`);
        return tmdbFetchResponse({ results: opts.similarResults ?? [] });
      }
      if (url.includes('?api_key=dummy') && !url.includes('/similar')) {
        if (method !== 'GET') throw new Error(`DENIED: ${method} ${url}`);
        const match = url.match(/movie\/(\d+)(\?|$)/);
        const id = match ? Number(match[1]) : 42;
        return tmdbFetchResponse(makeMovie(id, 'Original Movie', ['Action']));
      }
    }
    if (url.includes('api.themoviedb.org/3/movie/popular') && url.includes('?api_key=dummy')) {
      if (method !== 'GET') throw new Error(`DENIED: ${method} ${url}`);
      return tmdbFetchResponse({ results: [] });
    }
    if (url.includes('api.themoviedb.org/3/search/movie')) {
      if (url.includes('?api_key=dummy')) {
        if (method !== 'GET') throw new Error(`DENIED: ${method} ${url}`);
        // Resolve the suggestion to a TMDB id; return a canonical title derived
        // from the id (NOT the query), so the cached enriched payload is
        // distinguishable from the raw Gemini suggestion strings.
        const titleMatch = url.match(/query=([^&]+)/);
        const title = titleMatch ? decodeURIComponent(titleMatch[1]) : 'unknown';
        const matchIndex = title.match(/(\d+)$/);
        const resolvedId = matchIndex ? Number(matchIndex[1]) : 200;
        return searchResult(`Mock Film ${resolvedId}`, resolvedId);
      }
    }
    throw new Error(`DENIED: ${method} ${url}`);
  }) as typeof globalThis.fetch;
}

function makeRequest(key = 'user:1') {
  return new NextRequest('http://localhost/api/movie/42/ai-similar', {
    headers: { Authorization: `Bearer dummy-key`, 'x-user-id': key },
  });
}

/**
 * The number of fetch calls made so far. `globalThis.fetch` is re-bound to a
 * fresh `vi.fn()` in every test, so it carries no static type; assert the mock
 * shape explicitly rather than falling back to `any`.
 */
function fetchCallCount(): number {
  return (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
}

function countFetches(predicate: (u: string) => boolean): number {
  return (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(([input]: unknown[]) => {
    const u = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
    return predicate(u);
  }).length;
}

// -----------------------------------------------------------------------------
// Canonical RED-to-GREEN suite
// -----------------------------------------------------------------------------

describe('Phase 9 — AI-similar warm-hit enrichment volume correction', () => {

  it('RED (future contract) — warm hit does NOT repeat the 12 TMDB /search/movie enrichment calls', async () => {
    GET.__resetCache?.();
    installFullMockChain();

    const r1 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r1.status).toBe(200);
    const body1 = await r1.json();
    expect(body1.results).toHaveLength(12);

    const searchAfterCold = countFetches(u => u.includes('/search/movie'));
    expect(searchAfterCold).toBe(12);

    // Warm hit: same key, cache should short-circuit.
    const r2 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r2.status).toBe(200);
    const body2 = await r2.json();
    expect(body2.results).toHaveLength(12);
    // Canonical future contract: warm hit performs zero search calls.
    const searchOnWarm = countFetches(u => u.includes('/search/movie')) - searchAfterCold;
    expect(searchOnWarm, 'warm hit must not repeat TMDB /search/movie calls').toBe(0);
  }, 20000);

  it('warm hit performs zero Gemini, details, similar, and popular calls', async () => {
    GET.__resetCache?.();
    installFullMockChain();

    await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    const geminiAfterCold = countFetches(u => u.includes('generativelanguage'));
    const detailsAfterCold = countFetches(u => u.includes('/movie/42?api_key=dummy'));
    const similarAfterCold = countFetches(u => u.includes('/similar'));
    const popularAfterCold = countFetches(u => u.includes('/popular'));
    const searchAfterCold = countFetches(u => u.includes('/search/movie'));

    await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });

    expect(countFetches(u => u.includes('generativelanguage')) - geminiAfterCold).toBe(0);
    expect(countFetches(u => u.includes('/movie/42?api_key=dummy')) - detailsAfterCold).toBe(0);
    expect(countFetches(u => u.includes('/similar')) - similarAfterCold).toBe(0);
    expect(countFetches(u => u.includes('/popular')) - popularAfterCold).toBe(0);
    expect(countFetches(u => u.includes('/search/movie')) - searchAfterCold).toBe(0);
  }, 20000);

  it('cold miss: details once, Gemini once, 12 enrichment searches, max in-flight ≤ 4', async () => {
    GET.__resetCache?.();
    installFullMockChain();

    let peakInFlight = 0;
    let inFlight = 0;
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (...args: Parameters<typeof globalThis.fetch>) => {
      const u = typeof args[0] === 'string' ? args[0] : (args[0] as { url?: string })?.url ?? '';
      if (u.includes('/search/movie')) {
        inFlight += 1;
        if (inFlight > peakInFlight) peakInFlight = inFlight;
        const r = await original.apply(globalThis, args);
        inFlight -= 1;
        return r;
      }
      return original.apply(globalThis, args);
    }) as typeof globalThis.fetch;

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(12);
    expect(countFetches(u => u.includes('/movie/42?api_key=dummy'))).toBe(1);
    expect(countFetches(u => u.includes('generativelanguage'))).toBe(1);
    expect(countFetches(u => u.includes('/search/movie'))).toBe(12);
    expect(peakInFlight).toBeLessThanOrEqual(4);
  }, 20000);

  it('caches the FINAL enriched array under the route-local v2 scoped key, never raw suggestions', async () => {
    GET.__resetCache?.();
    installFullMockChain();

    await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });

    const state = GET.__cacheState!;
    const storedKeys = Array.from(state.recordedKeys);
    // The v2-scoped key must have been written (and the v1 key must NOT).
    const v2Key = buildCacheKey(CACHE_SCOPES.aiSimilar, '42:v2');
    expect(storedKeys).toContain(v2Key);
    const v1Key = buildCacheKey(CACHE_SCOPES.aiSimilar, '42');
    expect(storedKeys).not.toContain(v1Key);

    // TTL must be exactly 86400.
    expect(state.recordedTtls).toContain(86400);

    // The cached value must be the FINAL enriched array (with tmdb ids),
    // not the raw string suggestions.
    const storedValue = state.cacheStore.get(v2Key);
    expect(storedValue).toBeDefined();
    // `toBeDefined()` is an assertion-only check, so narrow manually to read
    // the stored payload below.  The assertion above is unchanged.
    const stored = storedValue as { value: string };
    const parsed = JSON.parse(stored.value);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(12);
    // Enriched results have numeric tmdb ids from the search results (1..12).
    expect(parsed[0].id).toBe(1);
    // And they must NOT be the raw suggestion strings.
    expect(stored.value).not.toContain('Suggested Movie');
  }, 20000);

  it('does not cache an empty final result; second request retries the producer', async () => {
    GET.__resetCache?.();
    // Force an empty chain: Gemini returns zero suggestions and there is no
    // TMDB similar fallback content.
    installGeminiAllowWithSuggestions([]);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
      const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
      const method = httpMethod(input, init);
      if (url.includes('api.themoviedb.org/3/movie/42') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse(makeMovie(42, 'Original Movie', ['Action']));
      }
      if (url.includes('/similar') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [] });
      }
      if (url.includes('/popular') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [] });
      }
      if (url.includes('generativelanguage.googleapis.com') && method === 'POST') {
        return geminiResponse([]);
      }
      throw new Error(`DENIED: ${method} ${url}`);
    }) as typeof globalThis.fetch;

    const r1 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ results: [] });

    // No v2 key should have been written.
    const v2Key = buildCacheKey(CACHE_SCOPES.aiSimilar, '42:v2');
    expect(GET.__cacheState!.cacheStore.has(v2Key)).toBe(false);

    // The second request must invoke the producer again (new Gemini call).
    const geminiBefore = countFetches(u => u.includes('generativelanguage'));
    await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(countFetches(u => u.includes('generativelanguage')) - geminiBefore).toBe(1);
  }, 20000);

  it('partial enrichment: surviving results are cached and returned verbatim on the warm hit', async () => {
    GET.__resetCache?.();
    installFullMockChain();

    // Introduce per-item failure for one search so only 11 results survive.
    // Bind an async arrow (no own `arguments` scope) so we can forward all args.
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async function (...args: Parameters<typeof globalThis.fetch>) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as { url?: string })?.url ?? String(args[0]);
      if (url.includes('/search/movie') && url.includes('Suggested%20Movie%205')) {
        throw new Error('transient search failure');
      }
      return original.apply(globalThis, args);
    }) as typeof globalThis.fetch;
    // The route's per-item try/catch should preserve the other 11.

    const r1 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r1.status).toBe(200);
    const body1 = await r1.json();
    expect(body1.results).toHaveLength(11);

    const v2Key = buildCacheKey(CACHE_SCOPES.aiSimilar, '42:v2');
    expect(GET.__cacheState!.cacheStore.has(v2Key)).toBe(true);

    // Restore stable fetch and warm-hit.
    installFullMockChain();
    const before = fetchCallCount();
    const r2 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r2.status).toBe(200);
    const body2 = await r2.json();
    expect(body2.results).toHaveLength(11);
    expect(JSON.stringify(body2.results)).toBe(JSON.stringify(body1.results));
    // Zero upstream calls on the warm hit.
    expect(fetchCallCount() - before).toBe(0);
  }, 20000);

  it('popular fallback runs inside the producer and its non-empty result is cached', async () => {
    GET.__resetCache?.();
    // Gemini returns zero suggestions; similar is empty; popular returns
    // two results that then enrich successfully.
    installGeminiAllowWithSuggestions([]);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
      const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
      const method = httpMethod(input, init);
      if (url.includes('api.themoviedb.org/3/movie/42') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse(makeMovie(42, 'Original Movie', ['Action']));
      }
      if (url.includes('/similar') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [] });
      }
      if (url.includes('/popular') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [{ id: 900, title: 'Popular A', overview: '', genres: ['Drama'], vote_average: 7, release_date: '2024-01-01' }, { id: 901, title: 'Popular B', overview: '', genres: ['Drama'], vote_average: 7, release_date: '2024-01-01' }] });
      }
      if (url.includes('/search/movie') && url.includes('?api_key=dummy')) {
        if (url.includes('Popular%20A')) return searchResult('Popular A', 900);
        if (url.includes('Popular%20B')) return searchResult('Popular B', 901);
        return searchResult('?', 999);
      }
      if (url.includes('generativelanguage.googleapis.com') && method === 'POST') {
        return geminiResponse([]);
      }
      throw new Error(`DENIED: ${method} ${url}`);
    }) as typeof globalThis.fetch;

    const r1 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r1.status).toBe(200);
    const body1 = await r1.json();
    expect(body1.results).toHaveLength(2);

    // Popular fallback result cached.
    const v2Key = buildCacheKey(CACHE_SCOPES.aiSimilar, '42:v2');
    expect(GET.__cacheState!.cacheStore.has(v2Key)).toBe(true);

    // Warm hit: zero upstream work.
    const before = fetchCallCount();
    const r2 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual(body1);
    expect(fetchCallCount() - before).toBe(0);
  }, 20000);

  // The three cache-boundary cases below close the gap the initial review found:
  // test 7 only exercised the NON-EMPTY popular-fallback path.  Empty results for
  // similar and popular, and the "popular resolves to nothing" branch, were never
  // asserted.  Each is asserted on its own so the three cases cannot mask each
  // other.  (The fully-empty chain — Gemini zero, similar empty, popular empty —
  // is already covered by the earlier "does not cache an empty final result" test.)

  it('empty similar results plus empty popular produce an uncached empty result', async () => {
    GET.__resetCache?.();
    installGeminiAllowWithSuggestions([]);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
      const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
      const method = httpMethod(input, init);
      if (url.includes('api.themoviedb.org/3/movie/42') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse(makeMovie(42, 'Original Movie', ['Action']));
      }
      if (url.includes('/similar') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [] });
      }
      if (url.includes('/popular') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [] });
      }
      if (url.includes('generativelanguage.googleapis.com') && method === 'POST') {
        return geminiResponse([]);
      }
      throw new Error(`DENIED: ${method} ${url}`);
    }) as typeof globalThis.fetch;

    const r1 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ results: [] });

    // Empty final result must NOT be cached.
    const v2Key = buildCacheKey(CACHE_SCOPES.aiSimilar, '42:v2');
    expect(GET.__cacheState!.cacheStore.has(v2Key)).toBe(false);

    // Retry re-invokes the producer rather than serving a cached empty array.
    const geminiBefore = countFetches(u => u.includes('generativelanguage'));
    await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(countFetches(u => u.includes('generativelanguage')) - geminiBefore).toBe(1);
  }, 20000);

  it('partial popular fallback (below the >= 4 threshold) is cached and served', async () => {
    GET.__resetCache?.();
    installGeminiAllowWithSuggestions([]);
    // Popular returns only 2 results — below the >= 4 "enough suggestions"
    // threshold.  The route does NOT filter them away: a non-empty partial is an
    // intentional, cacheable success.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
      const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
      const method = httpMethod(input, init);
      if (url.includes('api.themoviedb.org/3/movie/42') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse(makeMovie(42, 'Original Movie', ['Action']));
      }
      if (url.includes('/similar') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [] });
      }
      if (url.includes('/popular') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [{ id: 900, title: 'Popular A', overview: '', genres: ['Drama'], vote_average: 7, release_date: '2024-01-01' }, { id: 901, title: 'Popular B', overview: '', genres: ['Drama'], vote_average: 7, release_date: '2024-01-01' }] });
      }
      if (url.includes('/search/movie') && url.includes('?api_key=dummy')) {
        if (url.includes('Popular%20A')) return searchResult('Popular A', 900);
        if (url.includes('Popular%20B')) return searchResult('Popular B', 901);
        return searchResult('?', 999);
      }
      if (url.includes('generativelanguage.googleapis.com') && method === 'POST') {
        return geminiResponse([]);
      }
      throw new Error(`DENIED: ${method} ${url}`);
    }) as typeof globalThis.fetch;

    const r1 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r1.status).toBe(200);
    const body1 = await r1.json();
    expect(body1.results).toHaveLength(2);

    // The non-empty partial IS cached.
    const v2Key = buildCacheKey(CACHE_SCOPES.aiSimilar, '42:v2');
    expect(GET.__cacheState!.cacheStore.has(v2Key)).toBe(true);

    // Warm hit returns it verbatim with zero upstream work.
    const before = fetchCallCount();
    const r2 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual(body1);
    expect(fetchCallCount() - before).toBe(0);
  }, 20000);

  it('popular fallback whose titles fail resolution yields an uncached empty result', async () => {
    GET.__resetCache?.();
    installGeminiAllowWithSuggestions([]);
    // Popular returns titles that resolve to nothing in TMDB, so every enrichment
    // yields a null id and the final filtered array is empty.  The producer must
    // return `undefined` so nothing is cached.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
      const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
      const method = httpMethod(input, init);
      if (url.includes('api.themoviedb.org/3/movie/42') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse(makeMovie(42, 'Original Movie', ['Action']));
      }
      if (url.includes('/similar') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [] });
      }
      if (url.includes('/popular') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [{ title: 'Unresolvable A' }, { title: 'Unresolvable B' }] });
      }
      if (url.includes('/search/movie') && url.includes('?api_key=dummy')) {
        return tmdbFetchResponse({ results: [] });
      }
      if (url.includes('generativelanguage.googleapis.com') && method === 'POST') {
        return geminiResponse([]);
      }
      throw new Error(`DENIED: ${method} ${url}`);
    }) as typeof globalThis.fetch;

    const r1 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ results: [] });

    // Empty final array must NOT be cached.
    const v2Key = buildCacheKey(CACHE_SCOPES.aiSimilar, '42:v2');
    expect(GET.__cacheState!.cacheStore.has(v2Key)).toBe(false);

    // Retry re-invokes the producer rather than serving a cached empty array.
    const geminiBefore = countFetches(u => u.includes('generativelanguage'));
    await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(countFetches(u => u.includes('generativelanguage')) - geminiBefore).toBe(1);
  }, 20000);

  it('cold miss searches each suggestion (duplicates not deduplicated); warm hit performs none', async () => {
    GET.__resetCache?.();
    // Gemini returns four suggestions, two of them the SAME title.  Neither
    // searches NOR results are deduplicated: the route only filters out items
    // whose TMDB search resolved to a null id.  So 4 suggestions → 4 searches
    // (the duplicated title searched twice) and 4 results (the two identical
    // titles both returned).  The >=4 suggestion count is required to clear the
    // route's `aiResults.length < 4` TMDB-similar fallback threshold.
    const dupSuggestions = ['Same Movie', 'Same Movie', 'Unique A', 'Unique B'];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
      const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
      const method = httpMethod(input, init);
      if (url.includes('api.themoviedb.org/3/movie/42') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse(makeMovie(42, 'Original Movie', ['Action']));
      }
      if (url.includes('/similar') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [] });
      }
      if (url.includes('/popular') && url.includes('?api_key=dummy') && method === 'GET') {
        return tmdbFetchResponse({ results: [] });
      }
      if (url.includes('/search/movie') && url.includes('?api_key=dummy')) {
        const q = new URL(url).searchParams.get('query') || '';
        const rank = dupSuggestions.indexOf(q);
        return searchResult(q, rank >= 0 ? 500 + rank : 600);
      }
      if (url.includes('generativelanguage.googleapis.com') && method === 'POST') {
        return geminiResponse([...dupSuggestions]);
      }
      throw new Error(`DENIED: ${method} ${url}`);
    }) as typeof globalThis.fetch;

    const r1 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(r1.status).toBe(200);
    const body1 = await r1.json();
    expect(countFetches(u => u.includes('/search/movie'))).toBe(4);
    // The route builds the URL with encodeURIComponent(title), so the query
    // param is %-encoded (%20 for space). countFetches does NOT decode.
    expect(countFetches(u => u.includes('/search/movie') && u.includes('Same%20Movie'))).toBe(2);
    // The route never deduplicates results by title — it only filters out items
    // with a null TMDB id.  Two identical titles therefore produce two identical
    // results (both enriched, both returned).
    expect(body1.results).toHaveLength(4);

    const before = fetchCallCount();
    await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(fetchCallCount() - before).toBe(0);
  }, 20000);

  it('auth denial: zero fetches, zero cache-producer invocation', async () => {
    GET.__resetCache?.();
    installFullMockChain();
    requireUserMock.mockResolvedValue({ ok: false, response: tmdbFetchResponse({ error: 'Authentication required' }, 401) });

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(401);
    expect(fetchCallCount()).toBe(0);
  }, 10000);

  it('rate-limit denial: zero fetches, zero cache-producer invocation', async () => {
    GET.__resetCache?.();
    installFullMockChain();
    applyRateLimitUserMock.mockResolvedValue(tmdbFetchResponse({ error: 'Too many requests' }, 429));

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(429);
    expect(fetchCallCount()).toBe(0);
  }, 10000);

  it('invalid movie id: zero fetches, zero cache-producer invocation', async () => {
    GET.__resetCache?.();
    installFullMockChain();
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(400);
    expect(fetchCallCount()).toBe(0);
  }, 10000);

  it('network-deny guard: unknown host and wrong Gemini method are rejected (never reach real fetch)', async () => {
    GET.__resetCache?.();
    // The network guard has exactly one policy: allow only exact approved
    // categories, and fail LOUDLY (throw) for every other request.  It must
    // never return a generic HTTP Response for a denied call — a 404/200
    // Response would let an unapproved request look like a normal response —
    // and it must never fall through to real fetch.
    //
    // Each approved category is asserted in isolation so one passing case can
    // not mask a failure of another.  allowlist() throws on every non-approved
    // request, so an allowed shape can only be reached if the guard let it
    // through.

    function allowlist(ok: (url: string, method: string) => boolean) {
      const denied = vi.fn();
      return {
        denied,
        mock: vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
          const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
          const method = httpMethod(input, init);
          if (ok(url, method)) {
            return geminiResponse([...Array(12)].map((_, i) => `Suggested Movie ${i + 1}`));
          }
          denied(method, url);
          throw new Error(`DENIED: network guard refused this host/method: ${method} ${url}`);
        }) as typeof globalThis.fetch,
      };
    }

    // Prove the guard actually rejects unapproved shapes, and that no denied
    // call can be the one approved shape.  These are assertions about denial,
    // not call-shape-only assertions.
    function assertGuardFailsLoudly(denied: ReturnType<typeof vi.fn>) {
      expect(denied.mock.calls.length).toBeGreaterThan(0);
      for (const [method, url] of denied.mock.calls) {
        expect(String(method).toUpperCase() === 'POST' && String(url).includes(':generateContent')).toBe(false);
      }
    }

    // 1) Unknown host — nothing is allowed, so the route's very first call
    //    (the TMDB details fetch) must be refused and the route must 500.
    {
      GET.__resetCache?.();
      const g = allowlist(() => false);
      globalThis.fetch = g.mock;
      const res = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
      expect(res.status).toBe(500);
      assertGuardFailsLoudly(g.denied);
    }

    // 2) Wrong Gemini method — a call to the trusted Gemini host that is not
    //    the approved POST /:generateContent shape is refused.  Exercised
    //    directly against the guard: the route always sends POST to
    //    GEMINI_GENERATE_URL, so a wrong-method Gemini call cannot originate
    //    from the route and would not reach the guard through GET().
    {
      GET.__resetCache?.();
      const g = allowlist((url, method) => method === 'POST' && url.includes('generativelanguage.googleapis.com') && url.includes(':generateContent'));
      await expect(
        g.mock('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash', { method: 'GET' })
      ).rejects.toThrow(/^DENIED:/);
      expect(g.denied.mock.calls.length).toBe(1);
      expect(String(g.denied.mock.calls[0][0]).toUpperCase()).not.toBe('POST');
      expect(g.denied.mock.calls[0][1]).toContain('generativelanguage.googleapis.com');
    }

    // 3) Unknown TMDB path — a TMDB host URL that does not match any approved
    //    path is refused.  Exercised directly against the guard, since the route
    //    only ever constructs its own known TMDB endpoints.
    {
      GET.__resetCache?.();
      const g = allowlist((url, method) => url.includes(':generateContent') && method === 'POST');
      await expect(g.mock('https://api.themoviedb.org/3/discover/movie?api_key=dummy', { method: 'GET' })).rejects.toThrow(/^DENIED:/);
      expect(g.denied.mock.calls.length).toBe(1);
      expect(g.denied.mock.calls[0][1]).toContain('/discover/movie');
      expect(g.denied.mock.calls[0][0]).toBe('GET');
    }
  }, 20000);

  it('preserves response shape { results: [...] } on both cold and warm', async () => {
    GET.__resetCache?.();
    installFullMockChain();
    const r1 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    const b1 = await r1.json();
    expect(Object.keys(b1)).toEqual(['results']);
    expect(Array.isArray(b1.results)).toBe(true);
    expect(b1.results).toHaveLength(12);

    const r2 = await GET(makeRequest(), { params: Promise.resolve({ id: '42' }) });
    const b2 = await r2.json();
    expect(Object.keys(b2)).toEqual(['results']);
    expect(JSON.stringify(b2)).toBe(JSON.stringify(b1));
  }, 20000);
});

// Auxiliary helpers for tests that need a specific Gemini suggestion list.
function installGeminiAllowWithSuggestions(suggestions: string[]) {
  const allowedPath = /\/v1beta\/models\/[^/]+:generateContent$/;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> => {
    const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
    const method = httpMethod(input, init);
    if (url.includes('generativelanguage.googleapis.com') && allowedPath.test(url) && method === 'POST') {
      return geminiResponse([...suggestions]);
    }
    throw new Error(`DENIED: ${method} ${url}`);
  }) as typeof globalThis.fetch;
}
