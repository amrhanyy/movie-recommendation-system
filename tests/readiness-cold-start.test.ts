import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Focused readiness cold-start contract (Phase 22).
 *
 * Proves, with no real Atlas calls, no real network and no arbitrary sleeps,
 * that GET /api/health/ready:
 *   1. does not declare a healthy database "disconnected" merely because a
 *      fresh function instance starts with module-local readyState 0;
 *   2. returns 200 after a successful bounded connection;
 *   3. returns 503 after a real connection failure, with no secret leakage;
 *   4. returns a bounded 503 when the connection never settles (never hangs);
 *   5. does not open a second connection when one is already ready;
 *   6. lets concurrent probes share the helper's in-flight promise;
 *   7. keeps Redis optional and never downgrades a ready database;
 *   8. keeps config-invalid behavior unchanged and never probes on bad config;
 *   9. bounds a ping that never settles by the shallow-ping timeout;
 *  10. fails closed when the helper promise resolves but readyState stays 0;
 *  11. fails closed when readyState is 1 but no database handle exists;
 *  12. fails closed when the wall clock passes the budget before the ping.
 *
 * The shared helper (lib/mongodb.ts) is deliberately NOT mocked: promise
 * caching and connection reuse are properties of that real module, and
 * mocking it would make the concurrency assertions test the mock instead of
 * the shipped code. Only the mongoose driver boundary is replaced.
 */

// Controllable driver/config state. vi.hoisted keeps it visible to the
// vi.mock factories, which are hoisted above the imports below.
const harness = vi.hoisted(() => ({
  configReady: true,
  readyState: 0,
  pingMode: 'ok' as 'ok' | 'fail' | 'hang',
  connectMode: 'ok' as 'ok' | 'fail' | 'hang' | 'defer' | 'stale',
  connectCalls: 0,
  pingCalls: 0,
  dbPresent: true,
  deferred: null as null | {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  },
}));

// Mongoose boundary: controllable readyState + shallow ping + connect. The
// connect mock stands in for a real driver connection attempt; the route and
// the real helper only ever see this one object (one Mongoose instance).
vi.mock('mongoose', () => {
  const connect = vi.fn(async () => {
    harness.connectCalls += 1;
    if (harness.connectMode === 'fail') {
      // Deliberately contains a fake credential, host and database name so
      // tests can prove the route never echoes driver error text.
      throw new Error(
        'server selection timeout: mongodb://readinessUser:***@readiness-test.invalid:27017/readinessDb'
      );
    }
    if (harness.connectMode === 'hang') {
      return new Promise<unknown>(() => undefined);
    }
    if (harness.connectMode === 'defer') {
      return new Promise<unknown>((resolve, reject) => {
        harness.deferred = {
          resolve: (value: unknown) => {
            harness.readyState = 1;
            resolve(value);
          },
          reject,
        };
      });
    }
    if (harness.connectMode === 'stale') {
      // The helper's promise resolves, but the driver never reports a
      // connected state (partial or poisoned handshake). The route must
      // re-check driver state instead of trusting the resolved promise.
      return {};
    }
    harness.readyState = 1;
    return {};
  });

  const connection = {
    get readyState() {
      return harness.readyState;
    },
    get db() {
      if (!harness.dbPresent) return undefined;
      return {
        admin: () => ({
          ping: async () => {
            harness.pingCalls += 1;
            if (harness.pingMode === 'fail') {
              throw new Error('ping failed');
            }
            if (harness.pingMode === 'hang') {
              return new Promise<unknown>(() => undefined);
            }
            return { ok: 1 };
          },
        }),
      };
    },
  };

  return { default: { connect, connection }, connect, connection };
});

// Config gate: real validateEnv semantics remain, but isCoreConfigReady is
// driven by harness.configReady so the config-invalid path is deterministic.
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    isCoreConfigReady: vi.fn(() => harness.configReady),
  };
});

import { GET as readyGET } from '@/app/api/health/ready/route';
import { setBootRedisState } from '@/lib/boot-state';

const FAKE_MONGO_URI = 'mongodb://readiness-test.invalid/readinessDb';

function readyRequest(): NextRequest {
  return new NextRequest('http://localhost/api/health/ready');
}

/** Deterministic microtask barrier: no timers, no sleeps. */
async function flushMicrotasks(turns = 25): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  // Reset the shared helper's global cache in place. lib/mongodb.ts captures
  // this object once at module evaluation, so it must be mutated, never
  // replaced, to model a fresh serverless instance per scenario.
  const globalCache = globalThis as typeof globalThis & {
    mongoose?: { conn: unknown; promise: unknown };
  };
  if (!globalCache.mongoose) {
    globalCache.mongoose = { conn: null, promise: null };
  } else {
    globalCache.mongoose.conn = null;
    globalCache.mongoose.promise = null;
  }

  harness.configReady = true;
  harness.readyState = 0;
  harness.pingMode = 'ok';
  harness.connectMode = 'ok';
  harness.connectCalls = 0;
  harness.pingCalls = 0;
  harness.dbPresent = true;
  harness.deferred = null;

  setBootRedisState('ok');
  vi.stubEnv('MONGODB_URI', FAKE_MONGO_URI);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// Suppress the helper's pre-existing connection log lines so the runner stays
// readable. Assertions target the HTTP contract, not console output.
vi.spyOn(console, 'log').mockImplementation(() => undefined);
vi.spyOn(console, 'error').mockImplementation(() => undefined);

describe('readiness cold-start contract', () => {
  it('1. a fresh instance (readyState 0) does not declare a healthy database disconnected', async () => {
    // Exact serverless cold-start shape: module-local readyState 0, no
    // in-flight promise, but the shared helper can connect successfully.
    harness.readyState = 0;
    harness.connectMode = 'ok';

    const res = await readyGET(readyRequest());

    expect(harness.connectCalls).toBe(1);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ready');
    expect(body.components.database).toBe('ready');
  });

  it('2. a successful bounded connection returns the exact production readiness JSON', async () => {
    harness.readyState = 0;
    harness.connectMode = 'ok';

    const res = await readyGET(readyRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const body = await res.json();
    expect(body).toEqual({
      status: 'ready',
      components: { config: 'ready', database: 'ready', redis: 'optional' },
    });
  });

  it('3. a failed connection returns 503 degraded and leaks no connection detail', async () => {
    harness.readyState = 0;
    harness.connectMode = 'fail';

    const res = await readyGET(readyRequest());

    expect(harness.connectCalls).toBe(1);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.components).toEqual({
      config: 'ready',
      database: 'disconnected',
      redis: 'optional',
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain('mongodb://');
    expect(text).not.toContain('readinessUser');
    expect(text).not.toContain('readiness-test.invalid');
    expect(text).not.toContain('readinessDb');
    expect(text).not.toContain('timeout');
    expect(text).not.toContain('Error');
  });

  it('4. a connection that never settles yields a bounded 503 and never hangs', async () => {
    vi.useFakeTimers();
    const fakeStart = Date.now();
    harness.readyState = 0;
    harness.connectMode = 'hang';

    let settledAt: number | null = null;
    const pending = readyGET(readyRequest()).then((res) => {
      settledAt = Date.now();
      return res;
    });
    // Keep a handler attached so a rejected probe cannot become unhandled.
    pending.catch(() => undefined);

    // Just before the readiness budget: still waiting, connect was attempted.
    await vi.advanceTimersByTimeAsync(2999);
    expect(harness.connectCalls).toBe(1);
    expect(settledAt).toBeNull();

    // The budget fires and the probe settles instead of hanging.
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(settledAt).toBe(fakeStart + 3000);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.components.database).toBe('disconnected');
  });

  it('5. an already-ready connection is not connected a second time', async () => {
    // Warm instance: the driver is already connected, so readiness must only
    // ping, never open another connection.
    harness.readyState = 1;
    harness.connectMode = 'ok';

    const res = await readyGET(readyRequest());

    expect(res.status).toBe(200);
    expect(harness.connectCalls).toBe(0);
    const body = await res.json();
    expect(body.components.database).toBe('ready');
  });

  it('6. concurrent probes share the helper in-flight promise (no connection storm)', async () => {
    harness.readyState = 0;
    harness.connectMode = 'defer';

    const first = readyGET(readyRequest());
    const second = readyGET(readyRequest());

    // Both probes must reach the helper while the first connect is still in
    // flight. The helper promise cache means exactly one driver connect.
    await flushMicrotasks();
    expect(harness.connectCalls).toBe(1);
    expect(harness.deferred).not.toBeNull();

    harness.deferred!.resolve({});
    const [a, b] = await Promise.all([first, second]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(harness.connectCalls).toBe(1);
  });

  it('7. Redis stays optional and never downgrades a ready database', async () => {
    harness.readyState = 0;
    harness.connectMode = 'ok';

    const first = await readyGET(readyRequest());
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.components.redis).toBe('optional');

    // Redis misconfiguration degrades only its own label; overall readiness
    // still returns 200 while the database is ready.
    setBootRedisState('misconfigured');
    const second = await readyGET(readyRequest());
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.status).toBe('ready');
    expect(secondBody.components.redis).toBe('misconfigured');
  });

  it('8. invalid config returns 503 unavailable without touching the database', async () => {
    harness.configReady = false;
    harness.readyState = 0;
    harness.connectMode = 'ok';

    const res = await readyGET(readyRequest());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({
      status: 'unavailable',
      components: { config: 'unavailable', database: 'disconnected', redis: 'optional' },
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain('env');
    expect(text).not.toContain('mongodb');
    // The config gate short-circuits before any connection attempt.
    expect(harness.connectCalls).toBe(0);
  });

  it('9. a ping that never settles is bounded by the existing shallow-ping timeout', async () => {
    vi.useFakeTimers();
    const fakeStart = Date.now();
    // Already connected, so only the ping step runs.
    harness.readyState = 1;
    harness.pingMode = 'hang';

    let settledAt: number | null = null;
    const pending = readyGET(readyRequest()).then((res) => {
      settledAt = Date.now();
      return res;
    });
    pending.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(1999);
    expect(settledAt).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(settledAt).toBe(fakeStart + 2000);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.components.database).toBe('disconnected');
  });

  it('10. a resolved helper promise with readyState still 0 is reported disconnected', async () => {
    // Partial-failure shape: the connect call settles, but the driver never
    // reaches readyState 1 (e.g. a poisoned or half-finished handshake).
    // Readiness must re-check driver state and fail closed instead of
    // trusting the helper's resolved promise. If the re-check were removed
    // this probe would proceed to a successful ping and wrongly return 200.
    harness.readyState = 0;
    harness.connectMode = 'stale';

    const res = await readyGET(readyRequest());

    expect(harness.connectCalls).toBe(1);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.components.database).toBe('disconnected');
  });

  it('11. a connected driver with no database handle is not ready', async () => {
    // Transient reconnect shape: readyState reports 1 but the Db handle is
    // not yet assigned. A shallow ping cannot run, so readiness fails closed
    // and reports the database disconnected.
    harness.readyState = 1;
    harness.dbPresent = false;

    const res = await readyGET(readyRequest());

    expect(harness.connectCalls).toBe(0);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.components.database).toBe('disconnected');
  });

  it('12. a probe whose wall clock passes the budget before ping fails closed', async () => {
    // Isolate-pause shape: the readiness deadline is computed at entry, then
    // the process is suspended (serverless freeze) for longer than the
    // budget. On resume the shallow ping must NOT run; the probe fails closed
    // with the budget already exhausted.
    vi.useFakeTimers();
    const fakeStart = Date.now();
    harness.readyState = 0;
    harness.connectMode = 'ok';

    const pending = readyGET(readyRequest());
    pending.catch(() => undefined);
    // Simulate the isolate pause: jump the wall clock past the deadline
    // before the in-flight probe resumes.
    vi.setSystemTime(fakeStart + 5000);

    const res = await pending;

    // Discriminator: without the budget guard the ping would run (with a
    // non-positive timeout) and also yield 503, so the ping must be proven
    // not to have been attempted.
    expect(harness.pingCalls).toBe(0);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.components.database).toBe('disconnected');
  });
});
