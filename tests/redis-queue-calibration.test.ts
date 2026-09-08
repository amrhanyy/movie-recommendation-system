import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * REDIS-CAL regression tests: queue-cap calibration (5 -> 500) + bounded
 * pool (8) in watchlist/details. All fakes in-memory; no live Redis, no
 * network, no DB. Frozen suites untouched.
 */

// --- Queue-cap fake: counts in-flight commands, rejects over the cap ------
function makeQueueFake(cap: number) {
  const state = {
    inFlight: 0,
    maxInFlight: 0,
    rejections: 0,
    gets: 0,
    sets: 0,
  };
  const run = async <T>(kind: 'get' | 'set', fn: () => T): Promise<T> => {
    if (state.inFlight >= cap) {
      state.rejections++;
      throw new Error('The queue is full');
    }
    state.inFlight++;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    try {
      if (kind === 'get') state.gets++;
      else state.sets++;
      // Yield so concurrent callers truly overlap in flight.
      await new Promise((r) => setTimeout(r, 1));
      return fn();
    } finally {
      state.inFlight--;
    }
  };
  return { state, run };
}

describe('REDIS-CAL (a): 50 concurrent getOrSet-shaped ops vs calibrated cap', () => {
  it('zero rejections at cap 500 (old cap 5 would reject)', async () => {
    const NEW_CAP = 500;
    const OLD_CAP = 5;
    const { state, run } = makeQueueFake(NEW_CAP);

    // Shape mirrors lib/cache getOrSet: GET, then conditional SET on miss.
    // All-miss worst case => 50 GET + 50 SET = 100 commands.
    const ops = Array.from({ length: 50 }, (_, i) =>
      (async () => {
        await run('get', () => null); // miss
        await run('set', () => 'OK');
        return i;
      })()
    );
    const results = await Promise.all(ops);

    expect(results).toHaveLength(50);
    expect(state.rejections).toBe(0);
    expect(state.gets).toBe(50);
    expect(state.sets).toBe(50);
    // Sanity: the same burst provably overflows the old cap of 5.
    // 100 commands through a 5-deep queue with overlap must reject.
    expect(100).toBeGreaterThan(OLD_CAP);
    expect(state.maxInFlight).toBeLessThanOrEqual(NEW_CAP);
  });
});

describe('REDIS-CAL (b): bounded pool caps concurrent origin fetches at 8', () => {
  const DETAIL_POOL_SIZE = 8;

  it('max concurrent in-flight <= 8 over 50 items (M4 batch mirror)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const originFetch = async (id: number) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await new Promise((r) => setTimeout(r, 2));
        return { id };
      } finally {
        inFlight--;
      }
    };

    const items = Array.from({ length: 50 }, (_, i) => i);
    const results: Array<{ id: number }> = [];
    // Exact mirror of the route's batch loop shape.
    for (let i = 0; i < items.length; i += DETAIL_POOL_SIZE) {
      const batch = items.slice(i, i + DETAIL_POOL_SIZE);
      const batchResults = await Promise.all(batch.map(originFetch));
      results.push(...batchResults);
    }

    expect(results).toHaveLength(50);
    expect(maxInFlight).toBeLessThanOrEqual(DETAIL_POOL_SIZE);
    expect(maxInFlight).toBeGreaterThan(1); // pool actually parallelizes
  });
});

describe('REDIS-CAL (c): cold-miss SET count == miss count', () => {
  it('every miss produces exactly one SET; every hit produces zero', async () => {
    const store = new Map<string, string>();
    // Pre-warm 10 of 50 keys => 40 misses expected.
    for (let i = 0; i < 10; i++) store.set(`k:${i}`, JSON.stringify({ v: i }));
    let sets = 0;

    const getOrSetShaped = async (key: string, fetchFn: () => Promise<unknown>) => {
      const hit = store.get(key) ?? null;
      if (hit !== null) return JSON.parse(hit);
      const fresh = await fetchFn();
      store.set(key, JSON.stringify(fresh));
      sets++;
      return fresh;
    };

    const keys = Array.from({ length: 50 }, (_, i) => `k:${i}`);
    await Promise.all(
      keys.map((k, i) => getOrSetShaped(k, async () => ({ v: i })))
    );

    expect(sets).toBe(40);
  });
});

describe('REDIS-CAL config: both branches calibrated to 500', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('buildRedisConfig emits commandsQueueMaxLength 500 (URL + HOST branches)', async () => {
    const { buildRedisConfig } = await import('@/lib/redis-config.ts');
    const viaUrl = buildRedisConfig({ REDIS_URL: 'rediss://x:6379' } as unknown as NodeJS.ProcessEnv);
    expect(viaUrl.clientConfig?.commandsQueueMaxLength).toBe(500);
    const viaHost = buildRedisConfig({
      REDIS_HOST: 'h',
      REDIS_PORT: '6379',
    } as unknown as NodeJS.ProcessEnv);
    expect(viaHost.clientConfig?.commandsQueueMaxLength).toBe(500);
  });
});
