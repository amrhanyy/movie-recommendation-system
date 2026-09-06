import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  applyRateLimitPublic: vi.fn(),
  applyRateLimitUser: vi.fn(),
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitPublic: mocks.applyRateLimitPublic,
  applyRateLimitUser: mocks.applyRateLimitUser,
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: {
    chat: { maxRequests: 10, windowMs: 60_000 },
    aiRecommendations: { maxRequests: 5, windowMs: 60_000 },
    aiSimilar: { maxRequests: 10, windowMs: 60_000 },
    search: { maxRequests: 30, windowMs: 60_000 },
    tmdbProxy: { maxRequests: 60, windowMs: 60_000 },
    tmdbProxyStrict: { maxRequests: 10, windowMs: 60_000 },
    listWrite: { maxRequests: 20, windowMs: 60_000 },
    mood: { maxRequests: 20, windowMs: 60_000 },
    auth: { maxRequests: 10, windowMs: 60_000 },
    adminMutation: { maxRequests: 30, windowMs: 60_000 },
    profileUpdate: { maxRequests: 10, windowMs: 60_000 },
    chatHistoryWrite: { maxRequests: 20, windowMs: 60_000 },
    cacheAdmin: { maxRequests: 10, windowMs: 60_000 },
  },
}));

vi.mock('@/lib/redis', () => ({
  default: vi.fn().mockResolvedValue(null),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

async function importRoute(path: string) {
  return await import(path);
}

describe('M-03: TMDB proxy routes validate inputs before upstream work', () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.applyRateLimitPublic.mockReset().mockResolvedValue(null);
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          Promise.resolve(
            new Response(JSON.stringify({ results: [] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          )
      )
    );
    process.env.TMDB_API_KEY = 'test-key';
  });

  it('genre/[id]/content: invalid id + type returns 400 without upstream', async () => {
    const { GET } = await importRoute('@/app/api/genre/[id]/content/route.ts');
    const res = await GET(
      makeRequest('http://localhost/api/genre/invalid/content?type=unknown'),
      { params: Promise.resolve({ id: 'invalid' }) }
    );
    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('genre/[id]/content: valid id, invalid type returns 400 without upstream', async () => {
    const { GET } = await importRoute('@/app/api/genre/[id]/content/route.ts');
    const res = await GET(
      makeRequest('http://localhost/api/genre/28/content?type=movie/../search'),
      { params: Promise.resolve({ id: '28' }) }
    );
    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('genre/[id]: invalid id returns 400 without upstream', async () => {
    const { GET } = await importRoute('@/app/api/genre/[id]/route.ts');
    const res = await GET(
      makeRequest('http://localhost/api/genre/../../etc?type=movie'),
      { params: Promise.resolve({ id: '../../etc' }) }
    );
    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('movie/[id]/similar: non-numeric id returns 400 without upstream', async () => {
    const { GET } = await importRoute('@/app/api/movie/[id]/similar/route.ts');
    const res = await GET(
      makeRequest('http://localhost/api/movie/abc/similar'),
      { params: Promise.resolve({ id: 'abc' }) }
    );
    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('movie/[id]/recommendations: non-numeric id returns 400 without upstream', async () => {
    const { GET } = await importRoute(
      '@/app/api/movie/[id]/recommendations/route.ts'
    );
    const res = await GET(
      makeRequest('http://localhost/api/movie/1;2/recommendations'),
      { params: Promise.resolve({ id: '1;2' }) }
    );
    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('tv/[id]/recommendations: non-numeric id returns 400 without upstream', async () => {
    const { GET } = await importRoute('@/app/api/tv/[id]/recommendations/route.ts');
    const res = await GET(
      makeRequest('http://localhost/api/tv/xyz/recommendations'),
      { params: Promise.resolve({ id: 'xyz' }) }
    );
    expect(res.status).toBe(400);
  });

  it('tv/[id]/similar: non-numeric id returns 400 without upstream', async () => {
    const { GET } = await importRoute('@/app/api/tv/[id]/similar/route.ts');
    const res = await GET(
      makeRequest('http://localhost/api/tv/xyz/similar'),
      { params: Promise.resolve({ id: 'xyz' }) }
    );
    expect(res.status).toBe(400);
  });

  it('all nine public proxy routes apply public rate limiting', async () => {
    // Short-circuit via a 429 rate-limit response: the handler must call
    // applyRateLimitPublic before any upstream work, so no fetch occurs.
    const limited = new Response(
      JSON.stringify({ error: 'Too many requests. Please try again later.' }),
      { status: 429 }
    );
    mocks.applyRateLimitPublic.mockResolvedValue(limited);

    const routes: {
      path: string;
      url: string;
      params: Record<string, string>;
    }[] = [
      {
        path: '@/app/api/genre/[id]/content/route.ts',
        url: 'http://localhost/api/genre/28/content?type=movie',
        params: { id: '28' },
      },
      {
        path: '@/app/api/movie/[id]/recommendations/route.ts',
        url: 'http://localhost/api/movie/603/recommendations',
        params: { id: '603' },
      },
      {
        path: '@/app/api/movie/[id]/similar/route.ts',
        url: 'http://localhost/api/movie/603/similar',
        params: { id: '603' },
      },
      {
        path: '@/app/api/tv/[id]/recommendations/route.ts',
        url: 'http://localhost/api/tv/1396/recommendations',
        params: { id: '1396' },
      },
      {
        path: '@/app/api/tv/[id]/similar/route.ts',
        url: 'http://localhost/api/tv/1396/similar',
        params: { id: '1396' },
      },
      {
        path: '@/app/api/movies/route.ts',
        url: 'http://localhost/api/movies',
        params: {},
      },
      {
        path: '@/app/api/genres/route.ts',
        url: 'http://localhost/api/genres',
        params: {},
      },
      {
        path: '@/app/api/trailers/route.ts',
        url: 'http://localhost/api/trailers',
        params: {},
      },
      {
        path: '@/app/api/genre/[id]/route.ts',
        url: 'http://localhost/api/genre/28',
        params: { id: '28' },
      },
    ];

    for (const route of routes) {
      const mod = await importRoute(route.path);
      const fn = mod.GET as (
        req: NextRequest,
        ctx?: { params: Promise<Record<string, string>> }
      ) => Promise<Response>;
      const req = makeRequest(route.url);
      const res = Object.keys(route.params).length > 0
        ? await fn(req, { params: Promise.resolve(route.params) })
        : await fn(req);
      expect(res.status, `${route.path} must rate-limit before upstream`).toBe(429);
      expect(
        mocks.applyRateLimitPublic,
        `${route.path} must call applyRateLimitPublic`
      ).toHaveBeenCalled();
      expect(globalThis.fetch, `${route.path} must not hit upstream when limited`).not.toHaveBeenCalled();
      mocks.applyRateLimitPublic.mockClear();
      (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
    }
  });

  it('L-07: movie/[id]/similar does not reflect raw upstream error text', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('internal tmdb status message', { status: 500 })
      );
    const { GET } = await importRoute('@/app/api/movie/[id]/similar/route.ts');
    const res = await GET(
      makeRequest('http://localhost/api/movie/603/similar'),
      { params: Promise.resolve({ id: '603' }) }
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('internal tmdb status message');
    expect(body.error).toBeTruthy();
    fetchMock.mockRestore();
  });
});
