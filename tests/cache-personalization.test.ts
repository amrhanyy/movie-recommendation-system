import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

interface TmdbMovie {
  id: number;
  genre_ids?: number[];
}

interface UserListItem {
  itemId?: number;
  tmdbId?: number;
  genreIds?: number[];
}

const mocks = vi.hoisted(() => ({
  tryRequireUser: vi.fn(),
  applyRateLimitPublic: vi.fn(),
  tmdbFetch: vi.fn(),
  watchlistDocs: new Map<string, UserListItem[]>(),
  favoritesDocs: new Map<string, UserListItem[]>(),
}));

vi.mock('@/lib/security/auth', () => ({
  tryRequireUser: mocks.tryRequireUser,
}));

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitPublic: mocks.applyRateLimitPublic,
  RATE_LIMITS: { tmdbProxy: {} },
}));

vi.mock('@/lib/redis', () => ({
  default: vi.fn().mockResolvedValue(null),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/redis.ts', () => ({
  default: vi.fn().mockResolvedValue(null),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/models/WatchlistModel', () => ({
  WatchlistModel: {
    find: (filter: { userId: string }) => ({
      select: () => ({
        lean: () =>
          Promise.resolve(mocks.watchlistDocs.get(filter.userId) ?? []),
      }),
    }),
  },
}));

vi.mock('@/lib/models/FavoritesModel', () => ({
  FavoritesModel: {
    find: (filter: { userId: string }) => ({
      select: () => ({
        lean: () =>
          Promise.resolve(mocks.favoritesDocs.get(filter.userId) ?? []),
      }),
    }),
  },
}));

const BASE_RESULTS: TmdbMovie[] = [
  { id: 101, genre_ids: [28] },
  { id: 202, genre_ids: [35] },
  { id: 303, genre_ids: [28, 35] },
  { id: 404, genre_ids: [18] },
];

function setUser(email: string): void {
  mocks.tryRequireUser.mockResolvedValue({ email });
}

function requestUrl(page: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/movies/time-based?duration=medium&page=${page}&genre=28`
  );
}

function payloadIds(body: { results: TmdbMovie[] }): number[] {
  return body.results.map((m: TmdbMovie) => m.id);
}

interface DurationInfoBody {
  results: TmdbMovie[];
  duration_info: { range: string; description: string };
}

describe('W3-007 time-based cache personalization', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.tryRequireUser.mockReset();
    mocks.applyRateLimitPublic.mockReset().mockResolvedValue(null);
    mocks.tmdbFetch.mockReset().mockResolvedValue(
      new Response(JSON.stringify({ results: BASE_RESULTS }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    globalThis.fetch = mocks.tmdbFetch as unknown as typeof fetch;
    mocks.watchlistDocs.clear();
    mocks.favoritesDocs.clear();
    process.env.TMDB_API_KEY = 'test-key';
  });

  it('two users with disjoint lists get different payloads with one upstream fetch', async () => {
    // Disjoint ownership: user A owns 101 (genre 28), user B owns 202 (genre 35).
    mocks.watchlistDocs.set('a@example.com', [{ itemId: 101, genreIds: [28] }]);
    mocks.favoritesDocs.set('a@example.com', []);
    mocks.watchlistDocs.set('b@example.com', [{ itemId: 202, genreIds: [35] }]);
    mocks.favoritesDocs.set('b@example.com', []);

    const { GET } = await import('@/app/api/movies/time-based/route.ts');

    setUser('a@example.com');
    const resA = await GET(requestUrl('41'));
    expect(resA.status).toBe(200);
    const bodyA = (await resA.json()) as { results: TmdbMovie[] };

    setUser('b@example.com');
    const resB = await GET(requestUrl('41'));
    expect(resB.status).toBe(200);
    const bodyB = (await resB.json()) as { results: TmdbMovie[] };

    const idsA = payloadIds(bodyA);
    const idsB = payloadIds(bodyB);

    // Per-user exclusion applied after the shared cached base.
    expect(idsA).not.toContain(101);
    expect(idsB).not.toContain(202);
    expect(idsA).toContain(202);
    expect(idsB).toContain(101);
    expect(idsA).not.toEqual(idsB);

    // Same params within TTL: exactly one upstream TMDB fetch per slot.
    expect(mocks.tmdbFetch).toHaveBeenCalledTimes(1);

    // Exact response shape preserved for both users.
    for (const body of [bodyA as DurationInfoBody, bodyB as DurationInfoBody]) {
      expect(body.duration_info.range).toBe('90-120 minutes');
      expect(typeof body.duration_info.description).toBe('string');
    }
  });

  it('cached base is not polluted by the first user personalization', async () => {
    mocks.watchlistDocs.set('c@example.com', [{ itemId: 101 }]);
    mocks.favoritesDocs.set('c@example.com', []);
    mocks.watchlistDocs.set('d@example.com', []);
    mocks.favoritesDocs.set('d@example.com', []);

    const { GET } = await import('@/app/api/movies/time-based/route.ts');

    setUser('c@example.com');
    const resC = await GET(requestUrl('42'));
    const bodyC = (await resC.json()) as { results: TmdbMovie[] };
    expect(payloadIds(bodyC)).not.toContain(101);

    // Second user with an empty list must still see the full base result:
    // the cached entry holds the unpersonalized payload.
    setUser('d@example.com');
    const resD = await GET(requestUrl('42'));
    const bodyD = (await resD.json()) as { results: TmdbMovie[] };
    expect(payloadIds(bodyD)).toEqual([101, 202, 303, 404]);
    expect(mocks.tmdbFetch).toHaveBeenCalledTimes(1);
  });
});
