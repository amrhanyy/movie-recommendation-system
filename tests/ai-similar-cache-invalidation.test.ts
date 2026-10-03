import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import redisCache from '@/lib/cache.ts';
import cacheManager from '@/lib/cacheManager.ts';
import { CACHE_NAMESPACE, CACHE_SCOPES, buildCacheKey } from '@/lib/cache-namespace.ts';
import getRedisClient from '@/lib/redis.ts';

/**
 * CACHE-OPS-001 / BUG-AI-SIMILAR-CACHE-INVALIDATION-GAP — focused regression suite.
 *
 * The AI-similar route stores its enriched result under
 * `buildCacheKey(CACHE_SCOPES.aiSimilar, `${movieId}:v2`)`, i.e. the stored key
 * `movie-recommendation-system:{env}:v1:public:ai-similar:{id}_v2`.  For a long
 * time `invalidateMovieCache(movieId)` deleted only the three `movie:{id}:*`
 * keys, so the v2 entry was never invalidated (24h TTL was the only bound).
 *
 * This suite proves the correction at both storage tiers:
 * - Scenario A pins the exact deletion-call contract (canonical RED).
 * - Scenario B exercises the real RedisCache + RedisCache.delete against a
 *   controlled FakeRedis.
 * - Scenario C exercises the real memory tier with Redis unavailable.
 *
 * Isolation: @/lib/redis is replaced by an in-memory FakeRedis, @/lib/mongodb
 * is mocked, and no fetch is installed or permitted.  No real Redis, database,
 * Gemini, TMDB, or admin endpoint is contacted.
 */

// --- In-memory Redis fake (same shape as tests/redis-cache-security.test.ts) --
// Created inside vi.hoisted so the vi.mock factory can reference the instance
// before any module code evaluates (hoisting order).
const fake = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, string>();
    scanCalls: Array<{ cursor: number; MATCH: string; COUNT: number }> = [];
    delCalls: Array<string[]> = [];
    keysCalls = 0;
    flushDbCalls = 0;
    flushAllCalls = 0;

    async get(key: string): Promise<string | null> {
      return this.store.get(key) ?? null;
    }
    async set(key: string, value: string, opts?: { EX?: number }): Promise<string> {
      void opts;
      this.store.set(key, value);
      return 'OK';
    }
    async del(...keys: Array<string | string[]>): Promise<number> {
      const flat = keys.flat() as string[];
      this.delCalls.push(flat);
      let removed = 0;
      for (const k of flat) {
        if (this.store.delete(k)) removed++;
      }
      return removed;
    }
    // Bounded SCAN fake with deterministic iteration stop
    async scan(cursor: number, opts: { MATCH: string }): Promise<{ cursor: number; keys: string[] }> {
      this.scanCalls.push({ cursor, MATCH: opts.MATCH, COUNT: 100 });
      const all = Array.from(this.store.keys()).filter((k) =>
        k.includes(opts.MATCH.replace(/\*/g, ''))
      );
      const pageSize = 5;
      const page = all.slice(cursor, cursor + pageSize);
      const next = cursor + pageSize >= all.length ? 0 : cursor + pageSize;
      return { cursor: next, keys: page };
    }
    async keys(pattern: string): Promise<string[]> {
      this.keysCalls++;
      void pattern;
      return [];
    }
    async flushDb(): Promise<string> {
      this.flushDbCalls++;
      return 'OK';
    }
    async flushAll(): Promise<string> {
      this.flushAllCalls++;
      return 'OK';
    }
    get isOpen(): boolean {
      return true;
    }
  }
  return new FakeRedis();
});

vi.mock('@/lib/redis.ts', () => ({
  default: vi.fn().mockResolvedValue(fake),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/mongodb.ts', () => ({ default: vi.fn().mockResolvedValue({}) }));

function resetFake() {
  fake.store.clear();
  fake.scanCalls = [];
  fake.delCalls = [];
  fake.keysCalls = 0;
  fake.flushDbCalls = 0;
  fake.flushAllCalls = 0;
}

// The memory tier (lib/cache.ts) is module-level, so it is reset between tests
// via the public clearMemoryPrefix helper scoped to the application namespace.
beforeEach(() => {
  resetFake();
  vi.clearAllMocks();
  (getRedisClient as ReturnType<typeof vi.fn>).mockResolvedValue(fake);
  redisCache.clearMemoryPrefix(CACHE_NAMESPACE);
});

// Expected keys are always derived from the canonical builder and the imported
// namespace constant, never hand-written, so the suite stays correct in any
// environment segment.
const v2Key = buildCacheKey(CACHE_SCOPES.aiSimilar, '42:v2');
const v2KeyOtherMovie = buildCacheKey(CACHE_SCOPES.aiSimilar, '43:v2');
const v1Key = `${CACHE_NAMESPACE}movie:42:ai-similar`;
const movieDetails = `${CACHE_NAMESPACE}movie:42:details`;
const movieRecommendations = `${CACHE_NAMESPACE}movie:42:recommendations`;
const movieSimilar = `${CACHE_NAMESPACE}movie:42:similar`;

describe('Scenario A: exact deletion-call contract', () => {
  let deleteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    deleteSpy = vi.spyOn(redisCache, 'delete');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invalidateMovieCache("42") requests deletion of exactly the three movie keys plus the AI-similar v2 key', async () => {
    await cacheManager.invalidateMovieCache('42');

    // map() evaluates delete() synchronously in array order, so the recorded
    // call order is deterministic.
    const requested = deleteSpy.mock.calls.map((call: string[]) => call[0]);

    expect(requested).toEqual([
      'movie:42:details',
      'movie:42:recommendations',
      'movie:42:similar',
      buildCacheKey(CACHE_SCOPES.aiSimilar, '42:v2'),
    ]);
  });

  it('requests no unrelated movie key, no other scope, no v1 key, and no prefix/global clear', async () => {
    const clearScopedSpy = vi.spyOn(redisCache, 'clearScoped');

    await cacheManager.invalidateMovieCache('42');

    const requested = deleteSpy.mock.calls.map((call: string[]) => call[0]);

    expect(deleteSpy).toHaveBeenCalledTimes(4);
    // Legacy v1 key (different key: `ai-similar`, not `similar`) stays untouched.
    expect(requested).not.toContain(v1Key);
    // No collateral movie and no other scope.
    expect(requested).not.toContain(v2KeyOtherMovie);
    expect(requested).not.toContain('movie:43:details');
    expect(requested).not.toContain('public:tmdb:movie:42');
    // No wildcard or namespace-level operation.
    expect(requested.every((key: string) => !key.includes('*'))).toBe(true);
    expect(requested.every((key: string) => !key.endsWith('*'))).toBe(true);
    expect(clearScopedSpy).not.toHaveBeenCalled();
  });

  it('builds the v2 key with the canonical builder and scope constant, and the key carries no user identifier', async () => {
    await cacheManager.invalidateMovieCache('42');

    const requested = deleteSpy.mock.calls.map((call: string[]) => call[0]);
    const requestedV2 = requested.find((key: string) => key.startsWith(`${CACHE_NAMESPACE}public:ai-similar:`));

    expect(requestedV2).toBeDefined();
    // Equal to what the route stores (route.ts buildCacheKey call), so one
    // invalidation serves every user of this shared/public key.
    expect(requestedV2).toBe(v2Key);
    expect(requestedV2 as string).not.toMatch(/@/);
    expect(requestedV2 as string).not.toContain('user:');
    expect(requestedV2 as string).not.toContain('email');
  });

  it('applies the same ID normalization and truncation to the v2 key as to the existing keys', async () => {
    const longId = '9'.repeat(60);
    const truncated = '9'.repeat(50);

    await cacheManager.invalidateMovieCache(longId);

    const requested = deleteSpy.mock.calls.map((call: string[]) => call[0]);

    expect(requested).toEqual([
      `movie:${truncated}:details`,
      `movie:${truncated}:recommendations`,
      `movie:${truncated}:similar`,
      buildCacheKey(CACHE_SCOPES.aiSimilar, `${truncated}:v2`),
    ]);
  });
});

describe('Scenario B: Redis-backed tier consistency', () => {
  const unrelatedScoped = `${CACHE_NAMESPACE}public:tmdb:movie:42`;
  const foreignKey = 'other-app:unrelated:key';

  beforeEach(() => {
    fake.store.set(v2Key, JSON.stringify([{ id: 1, title: 'Cached 42' }]));
    fake.store.set(v2KeyOtherMovie, JSON.stringify([{ id: 2, title: 'Cached 43' }]));
    fake.store.set(unrelatedScoped, '{}');
    fake.store.set(foreignKey, '{}');
    fake.store.set(movieDetails, '{}');
    fake.store.set(movieRecommendations, '{}');
    fake.store.set(movieSimilar, '{}');
  });

  it('removes the movie-42 v2 entry from Redis while keeping movie 43, other scopes, and foreign keys', async () => {
    await cacheManager.invalidateMovieCache('42');

    expect(fake.store.has(v2Key)).toBe(false);
    expect(fake.store.has(v2KeyOtherMovie)).toBe(true);
    expect(fake.store.has(unrelatedScoped)).toBe(true);
    expect(fake.store.has(foreignKey)).toBe(true);
  });

  it('still removes the three existing movie keys from Redis', async () => {
    await cacheManager.invalidateMovieCache('42');

    expect(fake.store.has(movieDetails)).toBe(false);
    expect(fake.store.has(movieRecommendations)).toBe(false);
    expect(fake.store.has(movieSimilar)).toBe(false);
  });

  it('does not delete the legacy v1 AI-similar key', async () => {
    fake.store.set(v1Key, '{}');

    await cacheManager.invalidateMovieCache('42');

    expect(fake.store.has(v1Key)).toBe(true);
  });

  it('uses exact-key DEL only: no FLUSHDB, no FLUSHALL, no KEYS, no SCAN, no batched delete', async () => {
    await cacheManager.invalidateMovieCache('42');

    expect(fake.flushDbCalls).toBe(0);
    expect(fake.flushAllCalls).toBe(0);
    expect(fake.keysCalls).toBe(0);
    expect(fake.scanCalls.length).toBe(0);
    expect(fake.delCalls.length).toBe(4);
    for (const batch of fake.delCalls) {
      expect(batch.length).toBe(1);
      expect(batch[0].startsWith(CACHE_NAMESPACE)).toBe(true);
    }
  });
});

describe('Scenario C: memory-only degradation when Redis is unavailable', () => {
  beforeEach(() => {
    // Redis unreachable: RedisCache.delete must still clear the memory tier and
    // must not throw.
    (getRedisClient as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('clears the memory tier for movie 42 while keeping movie 43', async () => {
    await redisCache.set(v2Key, [{ id: 1, title: 'Cached 42' }], 86400);
    await redisCache.set(v2KeyOtherMovie, [{ id: 2, title: 'Cached 43' }], 86400);
    expect(await redisCache.get(v2Key)).toEqual([{ id: 1, title: 'Cached 42' }]);

    await expect(cacheManager.invalidateMovieCache('42')).resolves.toBeUndefined();

    expect(await redisCache.get(v2Key)).toBeNull();
    expect(await redisCache.get(v2KeyOtherMovie)).toEqual([{ id: 2, title: 'Cached 43' }]);
  });

  it('still clears the memory tier for the three existing movie keys', async () => {
    await redisCache.set('movie:42:details', { title: 'details' }, 3600);
    await redisCache.set('movie:42:recommendations', { items: [] }, 3600);
    await redisCache.set('movie:42:similar', { items: [] }, 3600);

    await cacheManager.invalidateMovieCache('42');

    expect(await redisCache.get('movie:42:details')).toBeNull();
    expect(await redisCache.get('movie:42:recommendations')).toBeNull();
    expect(await redisCache.get('movie:42:similar')).toBeNull();
  });

  it('issues no Redis command while degraded', async () => {
    await redisCache.set(v2Key, [{ id: 1 }], 86400);
    fake.delCalls = [];

    await cacheManager.invalidateMovieCache('42');

    expect(fake.delCalls.length).toBe(0);
    expect(fake.scanCalls.length).toBe(0);
    expect(fake.keysCalls).toBe(0);
    expect(fake.flushDbCalls).toBe(0);
    expect(fake.flushAllCalls).toBe(0);
  });
});
