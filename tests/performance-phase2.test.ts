import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  userCreate: vi.fn(),
  connectToMongoDB: vi.fn(),
  redisGetOrSet: vi.fn(),
  redisSet: vi.fn(),
  redisGet: vi.fn(),
  requireUser: vi.fn(),
  watchlistFind: vi.fn(),
  fetchMediaDetails: vi.fn(),
  applyRateLimitPublic: vi.fn(),
}));

// The auth callbacks are tested in isolation; block any DB access they make.
vi.mock('@/lib/models/User', () => ({
  User: {
    findOne: mocks.userFindOne,
    create: mocks.userCreate,
  },
}));

vi.mock('@/lib/mongodb', () => ({
  default: mocks.connectToMongoDB,
}));

// Cache facade: getOrSet records origin invocations; behavior driven per test.
vi.mock('@/lib/cache', () => ({
  default: {
    getOrSet: mocks.redisGetOrSet,
    get: mocks.redisGet,
    set: mocks.redisSet,
  },
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitPublic: mocks.applyRateLimitPublic,
  applyRateLimitUser: vi.fn(),
  RATE_LIMITS: {
    tmdbProxy: { maxRequests: 60, windowMs: 60_000 },
    mood: { maxRequests: 20, windowMs: 60_000 },
  },
}));

vi.mock('@/lib/security/auth', () => ({
  requireSession: mocks.requireUser,
  requireUser: mocks.requireUser,
}));

vi.mock('@/lib/models/WatchlistModel', () => ({
  WatchlistModel: {
    find: mocks.watchlistFind,
  },
}));

vi.mock('@/lib/tmdb', () => ({
  default: {
    fetchMediaDetails: mocks.fetchMediaDetails,
  },
}));

const sessionUser = {
  id: '507f1f77bcf86cd799439011',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
};

// A faithful in-memory getOrSet for cache-hit tests: mirrors the real
// getOrSet, including in-flight (stampede) dedup so concurrent first-time
// hits on the same key share one origin call.
function makeMemoryGetOrSet() {
  const store = new Map<string, unknown>();
  const inflight = new Map<string, Promise<unknown>>();
  const calls: string[] = [];
  const fn = async (key: string, origin: () => Promise<unknown>, _ttl?: number) => {
    if (store.has(key)) return store.get(key);
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = (async () => {
      calls.push(key);
      return origin();
    })();
    inflight.set(key, p);
    try {
      const value = await p;
      if (value !== undefined) store.set(key, value);
      return value;
    } finally {
      inflight.delete(key);
    }
  };
  return { fn, calls, store };
}

// Local shape of the projected session user (matches types/next-auth.d.ts).
interface ProjectedUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  role: "user" | "admin" | "owner";
  preferences?: {
    favorite_genres?: string[];
    selected_moods?: string[];
    historyTrackingEnabled?: boolean;
  };
}

describe('R1: session callback is CPU-bound (no DB on hot path)', () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.userFindOne.mockReset();
    mocks.userCreate.mockReset();
    mocks.connectToMongoDB.mockReset();
  });

  it('projects all session claims from the JWT and performs zero DB queries', async () => {
    const { authOptions } = await import('@/lib/auth');
    const sessionCb = authOptions.callbacks!.session!;

    const token = {
      sub: 'google-123',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://lh3.googleusercontent.com/av',
      id: '507f1f77bcf86cd799439011',
      role: 'owner',
      preferences: { favorite_genres: ['Drama'], historyTrackingEnabled: true },
    };
    const session = {
      user: { id: '', email: token.email, name: null as string | null, image: null as string | null, role: 'user' as const },
      expires: new Date().toISOString(),
    };

    const result = (await sessionCb({ session, token: token as never, user: undefined } as never)) as {
      user: ProjectedUser;
    };

    // The critical guarantee: no DB access on the request hot path.
    expect(mocks.userFindOne).not.toHaveBeenCalled();
    expect(mocks.connectToMongoDB).not.toHaveBeenCalled();

    // Claims projected straight from the token (not a fresh DB read).
    expect(result.user.id).toBe('507f1f77bcf86cd799439011');
    expect(result.user.email).toBe('test@example.com');
    expect(result.user.role).toBe('owner');
    expect(result.user.name).toBe('Test User');
    expect(result.user.image).toBe('https://lh3.googleusercontent.com/av');
    expect(result.user.preferences).toEqual({
      favorite_genres: ['Drama'],
      historyTrackingEnabled: true,
    });
  });

  it('falls back to a safe default role when the token role is absent', async () => {
    const { authOptions } = await import('@/lib/auth');
    const sessionCb = authOptions.callbacks!.session!;
    const token = { email: 'x@example.com', sub: 'google-9' };
    const session = {
      user: { id: '', email: token.email, name: null, image: null, role: 'user' },
      expires: new Date().toISOString(),
    };
    const result = (await sessionCb({ session, token: token as never, user: undefined } as never)) as {
      user: ProjectedUser;
    };
    expect(result.user.role).toBe('user');
    expect(result.user.id).toBe('google-9'); // falls back to token.sub
    expect(mocks.userFindOne).not.toHaveBeenCalled();
  });
});

describe('R3-A: /api/trending serves cached results without re-hitting TMDB', () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.applyRateLimitPublic.mockReset().mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          Promise.resolve(
            new Response(
              JSON.stringify({ page: 1, results: [{ id: 1, title: 'A' }] }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          )
      )
    );
    process.env.TMDB_API_KEY = 'test-key';
  });

  it('hits upstream once, then serves the cached value on the second call', async () => {
    const mem = makeMemoryGetOrSet();
    mocks.redisGetOrSet.mockImplementation(mem.fn);

    const { GET } = await import('@/app/api/trending/route.ts');
    const req1 = new NextRequest('http://localhost/api/trending?time_window=week');
    const res1 = await GET(req1);
    expect(res1.status).toBe(200);

    const req2 = new NextRequest('http://localhost/api/trending?time_window=week');
    const res2 = await GET(req2);
    expect(res2.status).toBe(200);

    const body = await res2.json();
    expect(body.results).toEqual([{ id: 1, title: 'A' }]);

    // Upstream (fetch) was invoked exactly once across both requests.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    // The cache origin ran once and the key used the canonical scope.
    expect(mem.calls.length).toBe(1);
    expect(mem.calls[0]).toContain('public:tmdb');
  });

  it('still applies the public rate limit before any caching work', async () => {
    mocks.redisGetOrSet.mockImplementation(makeMemoryGetOrSet().fn);
    const { GET } = await import('@/app/api/trending/route.ts');
    await GET(new NextRequest('http://localhost/api/trending?time_window=day'));
    expect(mocks.applyRateLimitPublic).toHaveBeenCalled();
  });
});

describe('R3-B: /api/mood-recommendations caches the combined result', () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.applyRateLimitPublic.mockReset().mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                page: 1,
                results: [{ id: 1, title: 'A', popularity: 10 }, { id: 2, title: 'B', popularity: 5 }],
                total_pages: 3,
                total_results: 30,
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          )
      )
    );
    process.env.TMDB_API_KEY = 'test-key';
  });

  it('makes 2 upstream discover calls on a miss, 0 on a cached re-request', async () => {
    const mem = makeMemoryGetOrSet();
    mocks.redisGetOrSet.mockImplementation(mem.fn);

    const { GET } = await import('@/app/api/mood-recommendations/route.ts');
    const r1 = await GET(new NextRequest('http://localhost/api/mood-recommendations?mood=happy&page=1'));
    expect(r1.status).toBe(200);
    const r2 = await GET(new NextRequest('http://localhost/api/mood-recommendations?mood=happy&page=1'));
    expect(r2.status).toBe(200);

    const body = await r2.json();
    expect(body.results.length).toBeGreaterThan(0);
    // First request: exactly two discover calls (genres + keywords).
    // Second request: served from cache => no new upstream calls.
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(mem.calls.length).toBe(1);
    expect(mem.calls[0]).toContain('public:tmdb');
    // normalizeKeyComponent maps ':' to '_', so the resource is mood_happy_page_1.
    expect(mem.calls[0]).toContain('mood_happy');
  });

  it('rejects an unknown mood before any upstream/caching work (400)', async () => {
    const mem = makeMemoryGetOrSet();
    mocks.redisGetOrSet.mockImplementation(mem.fn);
    const { GET } = await import('@/app/api/mood-recommendations/route.ts');
    const res = await GET(new NextRequest('http://localhost/api/mood-recommendations?mood=nonexistent'));
    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mem.calls.length).toBe(0);
  });
});

describe('R3-C: /api/watchlist/details caps fan-out, caches, and has no sleeps', () => {
  const ROOT = process.cwd();
  const routeSrc = readFileSync(
    resolve(ROOT, 'app/api/watchlist/details/route.ts'),
    'utf8'
  );

  it('contains no artificial setTimeout batch delays (source contract)', () => {
    expect(routeSrc).not.toContain('setTimeout');
  });

  beforeEach(async () => {
    vi.resetModules();
    mocks.requireUser.mockReset();
    mocks.requireUser.mockResolvedValue({ ok: true, user: sessionUser });
    mocks.connectToMongoDB.mockReset().mockResolvedValue({});
    mocks.watchlistFind.mockReset();
    mocks.fetchMediaDetails.mockReset();
  });

  function fakeItem(itemId: number, type: 'movie' | 'tv') {
    const doc = {
      _id: { toString: () => `doc-${itemId}` },
      itemId,
      type,
      title: `Title ${itemId}`,
      posterPath: null,
    };
    return { ...doc, toObject: () => ({ itemId, type, title: `Title ${itemId}`, posterPath: null }) };
  }

  it('caps detail resolution at 50 items even when the list is larger', async () => {
    const items = Array.from({ length: 80 }, (_, i) => fakeItem(1000 + i, 'movie'));
    mocks.watchlistFind.mockReturnValue(items);
    mocks.fetchMediaDetails.mockImplementation(
      (id: number) => Promise.resolve({ id, title: `T${id}`, popularity: 5, poster_path: null, vote_average: 8 })
    );
    // Real caching: each unique key fetched once.
    mocks.redisGetOrSet.mockImplementation(makeMemoryGetOrSet().fn);

    const { GET } = await import('@/app/api/watchlist/details/route.ts');
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    // Only the first 50 items are resolved; the rest are omitted.
    expect(body.length).toBe(50);
    // At most 50 upstream detail fetches (one per resolved item).
    expect(mocks.fetchMediaDetails).toHaveBeenCalledTimes(50);
  });

  it('caches per-item details so identical items are fetched once', async () => {
    // Two list rows for the SAME movie+type => one upstream call (cached).
    const items = [fakeItem(42, 'movie'), fakeItem(42, 'movie')];
    mocks.watchlistFind.mockReturnValue(items);
    mocks.fetchMediaDetails.mockResolvedValue({
      id: 42,
      title: 'Cached',
      popularity: 9,
      poster_path: '/p.jpg',
      vote_average: 9,
    });
    mocks.redisGetOrSet.mockImplementation(makeMemoryGetOrSet().fn);

    const { GET } = await import('@/app/api/watchlist/details/route.ts');
    const res = await GET();
    const body = await res.json();

    expect(body.length).toBe(2);
    expect(body[0].title).toBe('Cached');
    // Same media => single upstream detail fetch despite two list rows.
    expect(mocks.fetchMediaDetails).toHaveBeenCalledTimes(1);
  });
});
