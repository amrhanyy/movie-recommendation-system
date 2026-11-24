import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  rateLimit: vi.fn(),
  cacheGetOrSet: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitPublic: mocks.rateLimit,
  applyRateLimitUser: mocks.rateLimit,
  RATE_LIMITS: new Proxy({}, { get: () => ({}) }),
}));
vi.mock('@/lib/cache', () => ({
  redisCache: { getOrSet: mocks.cacheGetOrSet },
  CacheService: class {},
}));

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Phase 25 N: approved public GET cache policy', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.rateLimit.mockReset().mockResolvedValue(null);
    mocks.cacheGetOrSet.mockReset().mockImplementation(async (_key: string, producer: () => Promise<unknown>) => producer());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ page: 1, results: [] }), { status: 200 })));
  });

  it('serves search with a bounded CDN TTL and stale-while-revalidate', async () => {
    const { GET } = await import('@/app/api/search/route');
    const { NextRequest } = await import('next/server');
    const response = await GET(new NextRequest('http://localhost/api/search?query=dune'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe(
      's-maxage=60, stale-while-revalidate=300'
    );
  });

  it('serves trailers with a longer CDN TTL and stale-while-revalidate', async () => {
    // The route answers 503 when the upstream key is absent; the key is read at
    // module load, so it must be present before the dynamic import.
    process.env.TMDB_API_KEY = 'phase25-test-key';
    try {
      mocks.cacheGetOrSet.mockResolvedValue([{ id: 1, trailer_key: 'abc' }]);
      const { GET } = await import('@/app/api/trailers/route');
      const { NextRequest } = await import('next/server');
      const response = await GET(new NextRequest('http://localhost/api/trailers?filter=all'));
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
      expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe(
        's-maxage=1800, stale-while-revalidate=7200'
      );
    } finally {
      delete process.env.TMDB_API_KEY;
    }
  });

  it('does not mark search validation failures as publicly cacheable', async () => {
    const { GET } = await import('@/app/api/search/route');
    const { NextRequest } = await import('next/server');
    const response = await GET(new NextRequest('http://localhost/api/search'));
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control') ?? '').not.toMatch(/public/);
  });

  it('adds private, no-store to authenticated API responses in middleware', async () => {
    mocks.getToken.mockResolvedValue({ email: 'user@example.com' });
    const { middleware } = await import('@/middleware');
    const { NextRequest } = await import('next/server');

    const privateResponse = await middleware(new NextRequest('http://localhost/api/favorites'));
    expect(privateResponse.status).toBe(200);
    expect(privateResponse.headers.get('Cache-Control')).toBe('private, no-store');

    const publicResponse = await middleware(new NextRequest('http://localhost/api/movie/123'));
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get('Cache-Control')).toBeNull();
  });

  it('opts every approved public route into the shared cache policy', () => {
    for (const rel of [
      'app/api/trending/route.ts',
      'app/api/trending/movie/route.ts',
      'app/api/trending/tv/route.ts',
      'app/api/movies/route.ts',
      'app/api/movies/top-rated/route.ts',
      'app/api/movies/time-based/route.ts',
      'app/api/tv/top-rated/route.ts',
      'app/api/genres/route.ts',
      'app/api/genre/[id]/route.ts',
      'app/api/genre/[id]/content/route.ts',
      'app/api/movie/[id]/route.ts',
      'app/api/tv/[id]/route.ts',
      'app/api/actor/[id]/route.ts',
      'app/api/movie/[id]/similar/route.ts',
      'app/api/movie/[id]/recommendations/route.ts',
      'app/api/tv/[id]/similar/route.ts',
      'app/api/tv/[id]/recommendations/route.ts',
      'app/api/celebrities/route.ts',
      'app/api/mood-recommendations/route.ts',
      'app/api/search/route.ts',
      'app/api/trailers/route.ts',
    ]) {
      const source = read(rel);
      expect(source, rel).toContain('publicCacheHeaders(');
      expect(source, rel).not.toMatch(/s-maxage/);
    }
  });

  it('never marks personalized list routes publicly cacheable', () => {
    for (const rel of [
      'app/api/favorites/route.ts',
      'app/api/watchlist/route.ts',
      'app/api/history/route.ts',
      'app/api/user/route.ts',
    ]) {
      const source = read(rel);
      expect(source, rel).not.toMatch(/s-maxage/);
    }
  });
});

describe('Phase 25 O: Redis quota exhaustion fails fast to the memory cache', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('disables Redis on a provider quota/limit error', async () => {
    const { redisHealth } = await import('@/lib/redis-health');
    const disabled = redisHealth.recordError('ERR max requests limit exceeded. Limit: 500000, Usage: 500001');
    expect(disabled).toBe(true);
    expect(redisHealth.shouldUseRedis()).toBe(false);
  });

  it('does not disable Redis for an ordinary operation error', async () => {
    const { redisHealth } = await import('@/lib/redis-health');
    const disabled = redisHealth.recordError('WRONGTYPE Operation against a key holding the wrong kind of value');
    expect(disabled).toBe(false);
  });

  it('keeps the max-clients disable behaviour', async () => {
    const { redisHealth } = await import('@/lib/redis-health');
    for (let i = 0; i < 4; i += 1) {
      expect(redisHealth.recordError('ERR max number of clients reached')).toBe(false);
    }
    expect(redisHealth.recordError('ERR max number of clients reached')).toBe(true);
    expect(redisHealth.shouldUseRedis()).toBe(false);
  });
});
