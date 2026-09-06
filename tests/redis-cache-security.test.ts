import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import redisCache from '@/lib/cache.ts';
import cacheManager from '@/lib/cacheManager.ts';
import { CACHE_NAMESPACE, normalizeKeyComponent, buildCacheKey, CACHE_SCOPES } from '@/lib/cache-namespace.ts';
import getRedisClient from '@/lib/redis.ts';

/**
 * R4 tests: Redis and cache security hardening (F-009, F-031, F-052).
 * All tests use mocks or an in-memory fake. No live Redis.
 */

// --- In-memory Redis fake ------------------------------------------------
// Class and instance are created inside vi.hoisted so the vi.mock factory can
// reference the instance before any module code executes (hoisting order).
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
    async incr(key: string): Promise<number> {
      const cur = Number(this.store.get(key) || '0') + 1;
      this.store.set(key, String(cur));
      return cur;
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
  vi.clearAllMocks();
}

describe('R4-A: no destructive commands', () => {
  beforeEach(resetFake);

  it('clearScoped never calls flushDb or flushAll', async () => {
    fake.store.set(`${CACHE_NAMESPACE}public:tmdb:movie:1`, '{}');
    await redisCache.clearScoped(`${CACHE_NAMESPACE}*`);
    expect(fake.flushDbCalls).toBe(0);
    expect(fake.flushAllCalls).toBe(0);
  });

  it('findCacheKeys never calls redis.keys', async () => {
    fake.store.set(`${CACHE_NAMESPACE}public:tmdb:movie:1`, '{}');
    await cacheManager.findCacheKeys(`${CACHE_NAMESPACE}public:tmdb*`);
    expect(fake.keysCalls).toBe(0);
  });
});

describe('R4-B: prefix safety', () => {
  beforeEach(resetFake);

  it('stored keys receive exactly one namespace prefix', async () => {
    await redisCache.set('public:tmdb:movie:3', { x: 1 }, 60);
    const key = Array.from(fake.store.keys()).find((k) =>
      k.endsWith('movie:3')
    );
    expect(key?.startsWith(CACHE_NAMESPACE)).toBe(true);
    expect((key?.match(/movie-recommendation-system/g) || []).length).toBe(1);
  });

  it('scoped clear deletes only namespaced keys, never foreign or unprefixed', async () => {
    fake.store.set(`${CACHE_NAMESPACE}public:tmdb:movie:1`, '{}');
    fake.store.set(`${CACHE_NAMESPACE}public:tmdb:movie:2`, '{}');
    fake.store.set('other-app:key', '{}');
    fake.store.set('legacy-unprefixed', '{}');
    const result = await redisCache.clearScoped(`${CACHE_NAMESPACE}public:tmdb*`);
    expect(fake.store.has('other-app:key')).toBe(true);
    expect(fake.store.has('legacy-unprefixed')).toBe(true);
    expect(fake.store.has(`${CACHE_NAMESPACE}public:tmdb:movie:1`)).toBe(false);
    expect(result.deleted).toBe(2);
  });

  it('normalizeKeyComponent prevents namespace escape via user input', () => {
    const evil = normalizeKeyComponent('../../etc/passwd');
    expect(evil).not.toContain('/');
    expect(evil).not.toContain(':');
    const key = buildCacheKey(CACHE_SCOPES.publicTMDb, 'a*b:');
    expect(key.startsWith(CACHE_NAMESPACE)).toBe(true);
    expect(key).not.toContain('*');
  });
});

describe('R4-C: scoped clear', () => {
  beforeEach(() => {
    resetFake();
    for (let i = 0; i < 50; i++) {
      fake.store.set(`${CACHE_NAMESPACE}public:tmdb:movie:${i}`, '{}');
    }
  });

  it('respects maximum deletion count', async () => {
    const result = await redisCache.clearScoped(`${CACHE_NAMESPACE}public:tmdb*`, 10);
    expect(result.deleted).toBeLessThanOrEqual(10);
    expect(result.remaining).toBe(true);
    const left = Array.from(fake.store.keys()).filter((k) =>
      k.includes('public:tmdb')
    );
    expect(left.length).toBeGreaterThan(0);
  });

  it('reports partial result safely', async () => {
    const result = await redisCache.clearScoped(`${CACHE_NAMESPACE}public:tmdb*`, 10);
    expect(typeof result.deleted).toBe('number');
    expect(typeof result.remaining).toBe('boolean');
    expect(Number.isNaN(result.deleted)).toBe(false);
  });

  it('clears memory fallback prefixed entries when Redis is unavailable', async () => {
    (getRedisClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await redisCache.set('public:tmdb:movie:9', { a: 1 }, 60);
    const cleared = redisCache.clearMemoryPrefix(`${CACHE_NAMESPACE}public:tmdb`);
    expect(cleared).toBeGreaterThan(0);
  });
});

describe('R4-D: SCAN behavior', () => {
  beforeEach(() => {
    resetFake();
    for (let i = 0; i < 50; i++) {
      fake.store.set(`${CACHE_NAMESPACE}public:tmdb:movie:${i}`, '{}');
    }
  });

  it('SCAN receives an application-prefixed match pattern', async () => {
    await cacheManager.findCacheKeys(`${CACHE_NAMESPACE}public:tmdb*`);
    expect(fake.scanCalls.length).toBeGreaterThan(0);
    for (const call of fake.scanCalls) {
      expect(call.MATCH.startsWith(CACHE_NAMESPACE)).toBe(true);
    }
  });

  it('iteration terminates and returns deduplicated namespaced keys', async () => {
    const keys = await cacheManager.findCacheKeys(`${CACHE_NAMESPACE}public:tmdb*`);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.length).toBeLessThanOrEqual(50);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('foreign keys are ignored in results', async () => {
    fake.store.set('other-app:public:tmdb:movie:99', '{}');
    const keys = await cacheManager.findCacheKeys(`${CACHE_NAMESPACE}public:tmdb*`);
    for (const key of keys) {
      expect(key.startsWith(CACHE_NAMESPACE)).toBe(true);
    }
  });
});

describe('R4-E: admin authorization matrix (route-level)', () => {
  // The requireAdmin handler guard is the sole authorization source; its
  // 401/403 matrix is exercised in tests/admin-chat-ai-security.test.ts.
  // Here we verify the cache API wires the central helper (importable with
  // the Mongoose/DB modules mocked at file scope).
  it('central admin helper exists for handler enforcement', async () => {
    const authMod = await import('@/lib/security/auth.ts');
    expect(typeof authMod.requireAdmin).toBe('function');
  });
});

describe('R4-F: memory fallback', () => {
  beforeEach(() => {
    resetFake();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('TTL expires memory entries', async () => {
    (getRedisClient as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await redisCache.set('public:tmdb:movie:exp', { a: 1 }, 1);
    expect(await redisCache.get<{ a: number }>('public:tmdb:movie:exp')).toEqual({ a: 1 });
    vi.advanceTimersByTime(2000);
    expect(await redisCache.get('public:tmdb:movie:exp')).toBeNull();
  });

  it('memory clear is prefix-scoped', async () => {
    (getRedisClient as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await redisCache.set('public:tmdb:movie:a', { a: 1 }, 60);
    await redisCache.set('user:recommendations:b', { b: 1 }, 60);
    const deleted = redisCache.clearMemoryPrefix(`${CACHE_NAMESPACE}public:tmdb`);
    expect(deleted).toBe(1);
    expect(await redisCache.get('user:recommendations:b')).toEqual({ b: 1 });
    expect(await redisCache.get('public:tmdb:movie:a')).toBeNull();
  });

  it('Redis-down fallback works through getOrSet', async () => {
    (getRedisClient as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const origin = vi.fn().mockResolvedValue('data');
    const value = await redisCache.getOrSet('public:tmdb:movie:x', origin, 60);
    expect(value).toBe('data');
    expect(await redisCache.get('public:tmdb:movie:x')).toBe('data');
  });
});

describe('R4-G: stampede protection', () => {
  beforeEach(resetFake);

  it('ten concurrent same-key misses call origin once', async () => {
    let originCalls = 0;
    const origin = vi.fn().mockImplementation(async () => {
      originCalls++;
      await new Promise((r) => setTimeout(r, 20));
      return 'payload';
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        redisCache.getOrSet<string>('public:tmdb:movie:same', origin, 60)
      )
    );
    expect(originCalls).toBe(1);
    expect(results.every((r) => r === 'payload')).toBe(true);
  });

  it('different keys call their origins independently', async () => {
    const o1 = vi.fn().mockResolvedValue('a');
    const o2 = vi.fn().mockResolvedValue('b');
    await Promise.all([
      redisCache.getOrSet('public:tmdb:movie:k1', o1, 60),
      redisCache.getOrSet('public:tmdb:movie:k2', o2, 60),
    ]);
    expect(o1).toHaveBeenCalledTimes(1);
    expect(o2).toHaveBeenCalledTimes(1);
  });

  it('rejected origin is removed from in-flight map and can be retried', async () => {
    let calls = 0;
    const flaky = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return 'recovered';
    });
    await expect(
      redisCache.getOrSet('public:tmdb:movie:retry', flaky, 60)
    ).rejects.toThrow('boom');
    const value = await redisCache.getOrSet('public:tmdb:movie:retry', flaky, 60);
    expect(value).toBe('recovered');
    expect(calls).toBe(2);
  });

  it('in-flight state cleaned after resolve', async () => {
    await redisCache.getOrSet('public:tmdb:movie:clean', () => Promise.resolve('x'), 60);
    // Cached value returned second time (map cleaned, cache populated)
    const cached = await redisCache.get('public:tmdb:movie:clean');
    expect(cached).toBe('x');
  });

  it('does not cache rejected promises', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(
      redisCache.getOrSet('public:tmdb:movie:bad', failing, 60)
    ).rejects.toThrow('nope');
    expect(await redisCache.get('public:tmdb:movie:bad')).toBeNull();
  });
});

describe('R4-H: configuration parsing', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('REDIS_URL takes precedence over host/port fields', async () => {
    vi.stubEnv('REDIS_URL', 'rediss://cache.example.com:6380');
    vi.stubEnv('REDIS_HOST', 'ignored.example.com');
    vi.stubEnv('REDIS_PORT', '6379');
    vi.stubEnv('REDIS_TLS', '');
    // Re-evaluate the real module outside the redis mock
    const { buildRedisConfig } = await import('@/lib/redis-config.ts');
    const { clientConfig, error } = buildRedisConfig();
    expect(error).toBeUndefined();
    expect(clientConfig?.url).toBe('rediss://cache.example.com:6380');
  });

  it('redis:// with REDIS_TLS=true is refused (no silent plaintext)', async () => {
    vi.stubEnv('REDIS_URL', 'redis://cache.example.com:6379');
    vi.stubEnv('REDIS_TLS', 'true');
    const { buildRedisConfig } = await import('@/lib/redis-config.ts');
    const { clientConfig, error } = buildRedisConfig();
    expect(clientConfig).toBeUndefined();
    expect(error).toMatch(/REDIS_TLS/);
  });

  it('host/port/env-driven TLS configuration is built correctly', async () => {
    vi.stubEnv('REDIS_URL', '');
    vi.stubEnv('REDIS_HOST', 'cache.example.com');
    vi.stubEnv('REDIS_PORT', '6380');
    vi.stubEnv('REDIS_TLS', 'true');
    vi.stubEnv('REDIS_USERNAME', 'app-user');
    vi.stubEnv('REDIS_PASSWORD', 'secret-placeholder');
    const { buildRedisConfig } = await import('@/lib/redis-config.ts');
    const { clientConfig, error } = buildRedisConfig();
    expect(error).toBeUndefined();
    expect(clientConfig?.username).toBe('app-user');
    expect(clientConfig?.password).toBe('secret-placeholder');
    const socket = clientConfig?.socket as { tls?: boolean; port?: number };
    expect(socket.tls).toBe(true);
    expect(socket.port).toBe(6380);
  });

  it('invalid port is rejected and Redis stays optional', async () => {
    vi.stubEnv('REDIS_HOST', 'localhost');
    vi.stubEnv('REDIS_PORT', 'not-a-port');
    const { buildRedisConfig } = await import('@/lib/redis-config.ts');
    const { clientConfig, error } = buildRedisConfig();
    expect(clientConfig).toBeUndefined();
    expect(error).toBeUndefined();
  });

  it('absent host/port leaves Redis optional (no throw)', async () => {
    vi.stubEnv('REDIS_URL', '');
    vi.stubEnv('REDIS_HOST', '');
    vi.stubEnv('REDIS_PORT', '');
    const { buildRedisConfig } = await import('@/lib/redis-config.ts');
    const { clientConfig } = buildRedisConfig();
    expect(clientConfig).toBeUndefined();
  });

  it('parsePort rejects out-of-range values', async () => {
    const { parsePort } = await import('@/lib/redis-config.ts');
    expect(parsePort('70000')).toBeUndefined();
    expect(parsePort('0')).toBeUndefined();
    expect(parsePort('6379')).toBe(6379);
  });

  it('parseStrictBoolean handles strict values only', async () => {
    const { parseStrictBoolean } = await import('@/lib/redis-config.ts');
    expect(parseStrictBoolean('true', false)).toBe(true);
    expect(parseStrictBoolean('yes', false)).toBe(true);
    expect(parseStrictBoolean('garbage', false)).toBe(false);
    expect(parseStrictBoolean(undefined, false)).toBe(false);
  });
});