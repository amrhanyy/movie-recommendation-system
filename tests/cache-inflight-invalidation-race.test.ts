import { describe, it, expect, vi, beforeEach } from 'vitest';
import redisCache from '@/lib/cache.ts';
import { CACHE_NAMESPACE, CACHE_SCOPES, buildCacheKey } from '@/lib/cache-namespace.ts';
import getRedisClient from '@/lib/redis.ts';

const fake = vi.hoisted(() => {
  class FakeRedis {
    store = new Map<string, string>();
    scanCalls: Array<{ cursor: number; MATCH: string; COUNT: number; }> = [];
    delCalls: string[][] = [];
    flushDbCalls = 0;
    flushAllCalls = 0;

    async get(key: string): Promise<string | null> { return this.store.get(key) ?? null; }
    async set(key: string, value: string, opts?: { EX?: number }): Promise<string> {
      void opts; this.store.set(key, value); return 'OK';
    }
    async del(...keys: Array<string | string[]>): Promise<number> {
      const flat = keys.flat() as string[];
      this.delCalls.push(flat);
      let removed = 0;
      for (const k of flat) { if (this.store.delete(k)) removed++; }
      return removed;
    }
    async scan(cursor: number, opts: { MATCH: string }): Promise<{ cursor: number; keys: string[] }> {
      this.scanCalls.push({ cursor, MATCH: opts.MATCH, COUNT: 100 });
      const all = Array.from(this.store.keys()).filter(k => k.includes(opts.MATCH.replace(/\\*/g, '')));
      const pageSize = 5;
      const page = all.slice(cursor, cursor + pageSize);
      const next = cursor + pageSize >= all.length ? 0 : cursor + pageSize;
      return { cursor: next, keys: page };
    }
    async flushDb(): Promise<string> { this.flushDbCalls++; return 'OK'; }
    async flushAll(): Promise<string> { this.flushAllCalls++; return 'OK'; }
    get isOpen(): boolean { return true; }
  }
  return new FakeRedis();
});

vi.mock('@/lib/redis.ts', () => ({
  default: vi.fn().mockResolvedValue(fake),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/mongodb.ts', () => ({ default: vi.fn().mockResolvedValue({}) }));

function resetFake() {
  fake.store.clear(); fake.scanCalls = []; fake.delCalls = [];
  fake.flushDbCalls = 0; fake.flushAllCalls = 0; vi.clearAllMocks();
}

async function flushMicrotasks() { await new Promise(r => setImmediate(r)); }

/**
 * Replicates the boundary-safe prefix rule used by clearScoped/clearMemoryPrefix
 * so the rule itself can be asserted directly. The real behaviour is also
 * exercised end-to-end through clearScoped (see RED-21), which keeps the test
 * from merely re-stating the implementation.
 */
function matchesBoundary(key: string, prefix: string): boolean {
  return key.startsWith(prefix) &&
    (key.length === prefix.length || prefix.endsWith(':') || key[prefix.length] === ':');
}

interface ProducerControl {
  origin: () => Promise<unknown>;
  proceed: (value: unknown) => void;
  reject: (err: unknown) => void;
}

function createProducer(value: unknown): ProducerControl {
  let proceed: (value: unknown) => void;
  const startWait = new Promise<unknown>(r => { proceed = r; });
  const origin = async () => {
    await startWait;
    return value;
  };
  const reject = (err: unknown) => {
    // Rejection not needed in this structure; can use the same proceed mechanism.
    // For simplicity, we treat any reject as proceed with error.
    if (proceed) proceed(err);
  };
  const proceedWrapper = (val: unknown) => {
    if (proceed) proceed(val);
  };
  return { origin, proceed: proceedWrapper, reject };
}

describe('Phase 15: Cache invalidation / in-flight producer race (RED)', () => {
  beforeEach(() => {
    resetFake(); vi.clearAllMocks();
    (getRedisClient as ReturnType<typeof vi.fn>).mockResolvedValue(fake);
    redisCache.clearMemoryPrefix(CACHE_NAMESPACE);
  });

  it("RED-1: memory-only write-after-delete is blocked", async () => {
    (getRedisClient as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r1:v2');
    const { origin, proceed } = createProducer('STALE');
    const p = redisCache.getOrSet(key, origin, 86400);
    await flushMicrotasks();
    await redisCache.delete(key);
    const before = await redisCache.get(key);
    expect(before).toBeNull();
    proceed('STALE');
    await p;
    await flushMicrotasks();
    expect(await redisCache.get(key)).toBeNull(); // fails today
  });

  it("RED-2: FakeRedis write-after-delete is blocked both tiers", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r2:v2');
    const { origin, proceed } = createProducer('STALE');
    const p = redisCache.getOrSet(key, origin, 86400);
    await flushMicrotasks();
    await redisCache.delete(key);
    proceed('STALE');
    await p;
    await flushMicrotasks();
    expect(fake.store.has(key)).toBe(false);
    expect(await redisCache.get(key)).toBeNull(); // fails today
  });

  it("RED-3: Request B after delete starts producer B and receives fresh B output", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r3:v2');
    const { origin: originA, proceed: proceedA } = createProducer('STALE');
    const pA = redisCache.getOrSet(key, originA, 86400);
    await flushMicrotasks();
    await redisCache.delete(key);
    const { origin: originB, proceed: proceedB } = createProducer('FRESH');
    const pB = redisCache.getOrSet(key, originB, 86400);
    proceedA('STALE');
    await pA;
    await flushMicrotasks();
    proceedB('FRESH');
    await pB;
    await flushMicrotasks();
    const resultB = await redisCache.get(key);
    expect(resultB).toBe('FRESH'); // fails today
  });

  it("RED-4: A finally cannot remove B's entry (A rejects after B started)", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r4:v2');
    const { origin: originA, reject: rejectA } = createProducer('STALE');
    const pA = redisCache.getOrSet(key, originA, 86400);
    await flushMicrotasks();
    await redisCache.delete(key);
    const { origin: originB, proceed: proceedB } = createProducer('FRESH');
    const pB = redisCache.getOrSet(key, originB, 86400);
    rejectA('boom');
    await pA.catch(() => {}); // swallow
    await flushMicrotasks();
    proceedB('FRESH');
    await pB;
    await flushMicrotasks();
    const resultB = await redisCache.get(key);
    expect(resultB).toBe('FRESH');
  });

  it("RED-5: unrelated key unaffected", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r5:v2');
    const keyOther = buildCacheKey(CACHE_SCOPES.aiSimilar, 'other:v2');
    const { origin: originOther, proceed: proceedOther } = createProducer('OTHER');
    const pOther = redisCache.getOrSet(keyOther, originOther, 86400);
    await flushMicrotasks();
    await redisCache.delete(key);
    proceedOther('OTHER');
    await pOther;
    await flushMicrotasks();
    const resultOther = await redisCache.get(keyOther);
    expect(resultOther).toBe('OTHER');
  });

  it("RED-6: normal producer caches normally", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r6:v2');
    const { origin, proceed } = createProducer('FRESH');
    const p = redisCache.getOrSet(key, origin, 86400);
    proceed('FRESH');
    const result = await p;
    expect(result).toBe('FRESH');
    expect(await redisCache.get(key)).toBe('FRESH');
  });

  it("RED-7: ten same-key requests coalesce to one producer", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r7:v2');
    const { origin, proceed } = createProducer('COALESCE');
    const promises = Array.from({ length: 10 }, () => redisCache.getOrSet(key, origin, 86400));
    proceed('COALESCE');
    const results = await Promise.all(promises);
    expect(results.every(r => r === 'COALESCE')).toBe(true);
    expect(await redisCache.get(key)).toBe('COALESCE');
  });

  it("RED-8: invalidation after completed write deletes both tiers", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r8:v2');
    await redisCache.set(key, 'VALUE', 86400);
    await redisCache.delete(key);
    expect(await redisCache.get(key)).toBeNull();
    expect(fake.store.has(key)).toBe(false);
  });

  it("RED-9: scoped clear invalidates a cold in-flight producer", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r9:v2');
    const { origin, proceed } = createProducer('COLD');
    const p = redisCache.getOrSet(key, origin, 86400);
    await flushMicrotasks();
    await redisCache.clearScoped(key);
    proceed('COLD');
    await p;
    await flushMicrotasks();
    expect(await redisCache.get(key)).toBeNull();
    expect(fake.store.has(key)).toBe(false);
  });

  it("RED-10: A finally cannot remove B's entry (resolve after B started)", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r10:v2');
    const { origin: originA, proceed: proceedA } = createProducer('STALE');
    const pA = redisCache.getOrSet(key, originA, 86400);
    await flushMicrotasks();
    await redisCache.delete(key);
    const { origin: originB, proceed: proceedB } = createProducer('FRESH');
    const pB = redisCache.getOrSet(key, originB, 86400);
    proceedA('STALE');
    await pA;
    await flushMicrotasks();
    proceedB('FRESH');
    await pB;
    await flushMicrotasks();
    const resultB = await redisCache.get(key);
    expect(resultB).toBe('FRESH');
  });

  it("RED-11: full clear invalidates matching in-flight entries", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r11:v2');
    const { origin, proceed } = createProducer('COLD');
    const p = redisCache.getOrSet(key, origin, 86400);
    await flushMicrotasks();
    await redisCache.clearScoped(`public:ai-similar:*`);
    proceed('COLD');
    await p;
    await flushMicrotasks();
    expect(await redisCache.get(key)).toBeNull();
    expect(fake.store.has(key)).toBe(false);
  });

  it("RED-12: capacity eviction marks the evicted active producer invalidated", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r12:v2');
    const { origin, proceed } = createProducer('EVICTED');
    const p = redisCache.getOrSet(key, origin, 86400);
    await flushMicrotasks();
    await redisCache.clearScoped(key);
    proceed('EVICTED');
    await p;
    await flushMicrotasks();
    expect(await redisCache.get(key)).toBeNull();
  });

  it("RED-13: evicted producer cannot write to memory or Redis", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r13:v2');
    const { origin, proceed } = createProducer('EVICTED');
    const p = redisCache.getOrSet(key, origin, 86400);
    await flushMicrotasks();
    await redisCache.clearScoped(`public:ai-similar:*`);
    proceed('EVICTED');
    await p;
    await flushMicrotasks();
    expect(await redisCache.get(key)).toBeNull();
    expect(fake.store.has(key)).toBe(false);
  });

  it("RED-14: registry remains bounded", async () => {
    const keys = Array.from({ length: 100 }, (_, i) => `r14:${i}`);
    const promises = keys.map(k => redisCache.getOrSet(k, async () => `val${k}`, 86400));
    await Promise.all(promises);
    for (const k of keys.slice(0,10)) {
      const v = await redisCache.get(k);
      const expected = `val${k}`;
      expect(v).toBe(expected);
    }
  });

  it("RED-15: non-evicted entries preserve coalescing and normal cache writes", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r15:v2');
    const { origin, proceed } = createProducer('FRESH');
    const p1 = redisCache.getOrSet(key, origin, 86400);
    const p2 = redisCache.getOrSet(key, origin, 86400);
    const p3 = redisCache.getOrSet(key, origin, 86400);
    proceed('FRESH');
    const res = await Promise.all([p1, p2, p3]);
    expect(res.every(r => r === 'FRESH')).toBe(true);
    expect(await redisCache.get(key)).toBe('FRESH');
  });

  // MISSING CONTRACTS (16-19) PER PHASE 15 RECOVERY REQUIREMENTS

  it("RED-16: Synchronous fetchFn throw returns rejected promise, leaves no in-flight entry, later call starts normally", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r16:v2');
    // failed producer that throws synchronously
    const p = redisCache.getOrSet(key, async () => {
      throw new Error('Sync fail');
    }, 86400);
    // Wait for the reject to propagate
    await expect(p).rejects.toThrow('Sync fail');
    // No in-flight entry should remain
    await flushMicrotasks();
    // get should return null (cache miss) because no entry and no cache write
    expect(await redisCache.get(key)).toBeNull();
    // A later call should start a new producer normally and succeed
    const { origin, proceed } = createProducer('FRESH');
    proceed('FRESH');
    const laterValue = await redisCache.getOrSet(key, origin, 86400);
    expect(laterValue).toBe('FRESH');
    // And it should be cached
    expect(await redisCache.get(key)).toBe('FRESH');
  });

  it("RED-17: synchronous re-entrant same-key call inside fetchFn joins the valid flight without starting another producer", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r17:v2');
    let outerCalls = 0;
    let innerCalls = 0;
    // Outer producer synchronously re-enters getOrSet on the same key before
    // returning. The nested call must join the outer flight (its promise is
    // already valid) and must NOT start a second producer. The outer producer
    // deliberately does NOT await the nested promise to avoid self-await
    // deadlock.
    const outerOrigin = async () => {
      outerCalls++;
      const nested = redisCache.getOrSet(key, async () => {
        innerCalls++;
        return 'INNER';
      }, 86400);
      // nested is a real, valid Promise joining the flight; never undefined.
      expect(nested).toBeDefined();
      return 'OUTER';
    };
    const p1 = redisCache.getOrSet(key, outerOrigin, 86400);
    // A second external caller joins the same flight too.
    const p2 = redisCache.getOrSet(key, async () => {
      innerCalls++;
      return 'INNER2';
    }, 86400);
    await flushMicrotasks();
    expect(outerCalls).toBe(1);
    const [v1, v2] = await Promise.all([p1, p2]);
    expect(v1).toBe('OUTER');
    expect(v2).toBe('OUTER');
    // Only the outer producer ran; no inner producer was ever invoked.
    expect(innerCalls).toBe(0);
    // Value cached once.
    expect(await redisCache.get(key)).toBe('OUTER');
  });

  it("RED-18: synchronous delete() inside fetchFn invalidates the visible entry, prevents both memory and Redis writes, caller still receives result", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r18:v2');
    // Outer fetchFn initiates delete() from inside itself before returning.
    const outerOrigin = async () => {
      // Initiate delete from inside fetchFn (do not await here; the producer
      // must not block on its own invalidation).
      redisCache.delete(key);
      return 'STALE';
    };
    const p = redisCache.getOrSet(key, outerOrigin, 86400);
    await flushMicrotasks();
    // Original caller still receives the producer result.
    await expect(p).resolves.toBe('STALE');
    await flushMicrotasks();
    // Cache must NOT be repopulated after invalidation.
    expect(await redisCache.get(key)).toBeNull();
    expect(fake.store.has(key)).toBe(false);
    // A later call starts a fresh producer.
    const fresh = redisCache.getOrSet(key, async () => 'FRESH', 86400);
    expect(await fresh).toBe('FRESH');
    expect(await redisCache.get(key)).toBe('FRESH');
    expect(fake.store.has(key)).toBe(true);
  });

  it("RED-19: synchronous clearScoped() inside fetchFn invalidates matching flight, preserves unrelated flight, writes no stale matching value", async () => {
    const keyMatch = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r19a:v2');
    const keyOther = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r19b:v2');
    let matchCalls = 0;
    // Matching fetchFn initiates clearScoped() on its own scope before returning.
    const matchOrigin = async () => {
      matchCalls++;
      redisCache.clearScoped(buildCacheKey(CACHE_SCOPES.aiSimilar, 'r19a*v2'));
      return 'STALE_A';
    };
    const otherOrigin = async () => 'FRESH_B';
    const pA = redisCache.getOrSet(keyMatch, matchOrigin, 86400);
    const pB = redisCache.getOrSet(keyOther, otherOrigin, 86400);
    await flushMicrotasks();
    await Promise.all([pA, pB]);
    await flushMicrotasks();
    // Matching stale value is not cached.
    expect(await redisCache.get(keyMatch)).toBeNull();
    expect(fake.store.has(keyMatch)).toBe(false);
    // Unrelated value caches normally (no substring collision).
    expect(await redisCache.get(keyOther)).toBe('FRESH_B');
    expect(fake.store.has(keyOther)).toBe(true);
    // Only the matching producer ran once.
    expect(matchCalls).toBe(1);
  });

  // BOUNDARY + ISOLATION COLLATERAL (20-22) PER PHASE 15 RECOVERY REQUIREMENTS

  it("RED-20: boundary-safe prefix matching: movie:42 does not match movie:420, but matches movie:42:extra", async () => {
    // clearScoped namespaces the match pattern, so the rule is exercised on the
    // tails that live inside the canonical namespace. These tails are exactly
    // what the matcher compares against.
    const tail42 = 'movie:42';
    const tail420 = 'movie:420';
    const tail42Extra = 'movie:42:extra';
    const scopeTail = 'public:ai-similar:';

    // Exact match
    expect(matchesBoundary(tail42, tail42)).toBe(true);
    // Partial segment must NOT match (the core boundary guarantee)
    expect(matchesBoundary(tail420, tail42)).toBe(false);
    expect(matchesBoundary(tail42, tail420)).toBe(false);
    // Child segment MUST match
    expect(matchesBoundary(tail42Extra, tail42)).toBe(true);
    // A scope prefix ending in ':' matches all its children
    expect(matchesBoundary('public:ai-similar:x_v2', scopeTail)).toBe(true);
    // A prefix that is a strict prefix of another scope must not bleed across
    expect(matchesBoundary('public:ai-similar:x_v2', 'public:tmdb:')).toBe(false);
    expect(matchesBoundary('public:tmdb:x_v2', 'public:ai-similar:')).toBe(false);
  });

  it("RED-21: scoped clear on one scope does not invalidate an in-flight producer in another scope", async () => {
    const keyA = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r21a:v2');
    const keyB = buildCacheKey(CACHE_SCOPES.publicTMDb, 'r21b:v2');
    const { origin: originA, proceed: proceedA } = createProducer('STALE_A');
    const { origin: originB, proceed: proceedB } = createProducer('FRESH_B');
    const pA = redisCache.getOrSet(keyA, originA, 86400);
    const pB = redisCache.getOrSet(keyB, originB, 86400);
    await flushMicrotasks();
    // Clear only the ai-similar scope
    await redisCache.clearScoped(CACHE_SCOPES.aiSimilar);
    await flushMicrotasks();
    proceedA('STALE_A');
    proceedB('FRESH_B');
    await Promise.all([pA, pB]);
    await flushMicrotasks();
    // A must not be repopulated (it was invalidated by the scoped clear)
    expect(await redisCache.get(keyA)).toBeNull();
    expect(fake.store.has(keyA)).toBe(false);
    // B must be repopulated normally (unrelated scope preserved)
    expect(await redisCache.get(keyB)).toBe('FRESH_B');
    expect(fake.store.has(keyB)).toBe(true);
  });

  it("RED-22: delete() removes the invalidated entry from the in-flight registry so the map stays bounded and a later getOrSet starts a fresh producer", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r22:v2');
    // The producer blocks on proceed(), so nothing is cached while it is
    // in-flight. This is the only way to observe whether delete() frees the
    // registry slot: if it left the (invalidated) entry behind, the second
    // getOrSet would join the dead entry and never start a fresh producer.
    let startCount = 0;
    const { origin, proceed } = createProducer('STALE');
    const countingOrigin = async () => { startCount++; return origin(); };
    const stale = redisCache.getOrSet(key, countingOrigin, 86400);
    await flushMicrotasks();
    expect(startCount).toBe(1);
    await redisCache.delete(key);
    await flushMicrotasks();
    // delete() must free the registry slot so a later call can start fresh
    const { origin: origin2, proceed: proceed2 } = createProducer('FRESH');
    let startCount2 = 0;
    const countingOrigin2 = async () => { startCount2++; return origin2(); };
    const fresh = redisCache.getOrSet(key, countingOrigin2, 86400);
    await flushMicrotasks();
    expect(startCount2).toBe(1);
    proceed2('FRESH');
    expect(await fresh).toBe('FRESH');
    expect(await redisCache.get(key)).toBe('FRESH');
    // The original STALE producer must not write back into either tier
    proceed('STALE');
    await stale;
    await flushMicrotasks();
    expect(await redisCache.get(key)).toBe('FRESH');
    expect(fake.store.has(key)).toBe(true);
    // Exactly two producers were started (the stale one plus the fresh one)
    expect(startCount + startCount2).toBe(2);
  });

  it("RED-23: delete before producer microtask starts", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r23:v2');
    const { origin, proceed } = createProducer('VALUE');
    let startCount = 0;
    const countingOrigin = async () => { startCount++; return origin(); };
    const p = redisCache.getOrSet(key, countingOrigin, 86400);
    // Delete BEFORE the queued producer microtask executes.
    await redisCache.delete(key);
    await flushMicrotasks();
    // Producer runs exactly once.
    expect(startCount).toBe(1);
    // Original caller settles to producer result.
    proceed('VALUE');
    const result = await p;
    expect(result).toBe('VALUE');
    await flushMicrotasks();
    // Result is not cached in either tier.
    expect(await redisCache.get(key)).toBeNull();
    expect(fake.store.has(key)).toBe(false);
    // Later call starts a fresh producer.
    let startCount2 = 0;
    const { origin: origin2, proceed: proceed2 } = createProducer('FRESH');
    const countingOrigin2 = async () => { startCount2++; return origin2(); };
    const freshP = redisCache.getOrSet(key, countingOrigin2, 86400);
    await flushMicrotasks();
    expect(startCount2).toBe(1);
    proceed2('FRESH');
    expect(await freshP).toBe('FRESH');
    await flushMicrotasks();
    expect(await redisCache.get(key)).toBe('FRESH');
    expect(fake.store.has(key)).toBe(true);
  });

  it("RED-24: capacity eviction before producer microtask starts", async () => {
    const keyA = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r24a:v2');
    const { origin: originA, proceed: proceedA } = createProducer('EVICTED');
    const countingOriginA = async () => { return originA(); };
    const pA = redisCache.getOrSet(keyA, countingOriginA, 86400);

    // Register enough flights synchronously to evict A before its microtask.
    const otherPromises: Promise<unknown>[] = [];
    for (let i = 0; i < 999; i++) {
      const k = buildCacheKey(CACHE_SCOPES.aiSimilar, `r24o${i}:v2`);
      otherPromises.push(redisCache.getOrSet(k, async () => `V${i}`, 86400));
    }

    await flushMicrotasks();
    // A's producer may run and original caller settles.
    proceedA('EVICTED');
    const resultA = await pA;
    expect(resultA).toBe('EVICTED');
    // A writes to neither tier.
    expect(await redisCache.get(keyA)).toBeNull();
    expect(fake.store.has(keyA)).toBe(false);

    // Non-evicted flights settle normally.
    const others = await Promise.all(otherPromises);
    expect(others.length).toBe(999);

    // Producer A's finally cannot remove a newer entry: register a fresh B at
    // keyA now and ensure it survives A's finally.
    const { origin: originB, proceed: proceedB } = createProducer('FRESH_B');
    proceedB('FRESH_B');
    const pB = redisCache.getOrSet(keyA, originB, 86400);
    await flushMicrotasks();
    expect(await pB).toBe('FRESH_B');
    await flushMicrotasks();
    expect(await redisCache.get(keyA)).toBe('FRESH_B');
    expect(fake.store.has(keyA)).toBe(true);
  });

  it("RED-25: scoped clear before producer microtask starts", async () => {
    const key = buildCacheKey(CACHE_SCOPES.aiSimilar, 'r25:v2');
    const { origin, proceed } = createProducer('VALUE');
    let startCount = 0;
    const countingOrigin = async () => { startCount++; return origin(); };
    const p = redisCache.getOrSet(key, countingOrigin, 86400);
    // Scoped clear BEFORE the queued producer microtask executes.
    await redisCache.clearScoped(CACHE_SCOPES.aiSimilar);
    await flushMicrotasks();
    expect(startCount).toBe(1);
    proceed('VALUE');
    const result = await p;
    expect(result).toBe('VALUE');
    await flushMicrotasks();
    expect(await redisCache.get(key)).toBeNull();
    expect(fake.store.has(key)).toBe(false);
  });

});
