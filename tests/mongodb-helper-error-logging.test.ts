import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 23 security close-out - SCP-LIBMONGODB-RAW-ERROR-LOGGING-001.
 *
 * The shared MongoDB helper must never write the raw driver error object to
 * the platform logs: a connection failure message carries the cluster
 * hostname and port, and Vercel serialises the full stack. The catch block
 * may log only a fixed message, the error name, and - when it is actually
 * numeric - the driver code.
 *
 * The helper itself stays REAL in every case; only the driver boundary
 * (mongoose.connect) is mocked, so the promise cache, the reset-on-failure
 * semantics, and the rethrow identity all remain under test. Isolation is
 * explicit: vi.resetModules() alone is not enough, because lib/mongodb.ts
 * stores its cache on globalThis.mongoose.
 *
 * No network, no real Atlas connection, no arbitrary sleeps: outcomes are
 * observed through promise contracts and an explicit deferred barrier.
 */

const SENSITIVE_URI =
  'mongodb+srv://dbuser_23@mongo-0.example.invalid:27017/topologyDb';
const SENSITIVE_MESSAGE =
  'connect ECONNREFUSED mongo-0.example.invalid:27017 for dbuser_23 via mongodb+srv://dbuser_23@mongo-0.example.invalid:27017/topologyDb';

const harness = vi.hoisted(() => ({
  mode: 'ok' as 'ok' | 'deferred' | 'reject',
  rejectValue: undefined as unknown,
  deferredResolve: null as ((v: unknown) => void) | null,
  successValue: { phase23: 'connected' },
  connectCalls: 0,
}));

vi.mock('mongoose', () => {
  const connect = vi.fn(() => {
    harness.connectCalls += 1;
    if (harness.mode === 'reject') {
      return Promise.reject(harness.rejectValue);
    }
    if (harness.mode === 'deferred') {
      return new Promise<unknown>((resolve) => {
        harness.deferredResolve = resolve;
      });
    }
    return Promise.resolve(harness.successValue);
  });
  return { default: { connect }, connect };
});

function capturedLogText(calls: readonly (readonly unknown[])[]): string {
  return calls
    .map((args) =>
      args
        .map((arg) => inspect(arg, { depth: 8, breakLength: Infinity }))
        .join(' '),
    )
    .join('\n');
}

async function freshHelper() {
  // The helper binds its cache to globalThis.mongoose at evaluation time,
  // so resetModules() without clearing the global reuses the previous
  // case's connection state.
  delete (globalThis as { mongoose?: unknown }).mongoose;
  vi.resetModules();
  const mod = await import('@/lib/mongodb');
  return mod.connectToMongoDB;
}

let consoleLogCalls: unknown[][] = [];
let consoleErrorCalls: unknown[][] = [];
let savedMongoUri: string | undefined;

describe('lib/mongodb.ts connection-error logging (SCP-LIBMONGODB-RAW-ERROR-LOGGING-001)', () => {
  beforeEach(() => {
    consoleLogCalls = [];
    consoleErrorCalls = [];
    savedMongoUri = process.env.MONGODB_URI;
    process.env.MONGODB_URI = SENSITIVE_URI;
    harness.mode = 'ok';
    harness.rejectValue = undefined;
    harness.deferredResolve = null;
    harness.connectCalls = 0;
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleLogCalls.push(args);
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrorCalls.push(args);
    });
  });

  afterEach(() => {
    delete (globalThis as { mongoose?: unknown }).mongoose;
    if (savedMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = savedMongoUri;
    }
    vi.restoreAllMocks();
  });

  it('sanitizes a rejected connect: the original error is rethrown but no host, port, URI, username, message, or stack reaches the log', async () => {
    const raw = new Error(SENSITIVE_MESSAGE);
    harness.mode = 'reject';
    harness.rejectValue = raw;
    const connect = await freshHelper();

    let caught: unknown;
    try {
      await connect();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(raw); // thrown error identity is preserved
    expect(harness.connectCalls).toBe(1);
    expect(consoleErrorCalls.length).toBeGreaterThan(0); // console.error was called

    const logText = capturedLogText(consoleErrorCalls);
    expect(logText).toContain('MongoDB connection error.'); // fixed message
    expect(logText).toContain('errorName'); // allowed metadata only
    expect((logText.match(/:/g) || []).length).toBe(1); // exactly one field
    expect(logText).not.toContain(SENSITIVE_MESSAGE); // no raw message
    expect(logText).not.toContain('mongo-0.example.invalid'); // no host
    expect(logText).not.toContain('27017'); // no port
    expect(logText).not.toContain('mongodb+srv://'); // no URI scheme
    expect(logText).not.toContain('dbuser_23'); // no username
    expect(logText).not.toContain('    at '); // no stack frames
  });

  it('retains the error name as the only logged detail and never the raw message', async () => {
    const raw = Object.assign(new Error(SENSITIVE_MESSAGE), {
      name: 'MongooseServerSelectionError',
    });
    harness.mode = 'reject';
    harness.rejectValue = raw;
    const connect = await freshHelper();

    await expect(connect()).rejects.toBe(raw);

    const logText = capturedLogText(consoleErrorCalls);
    expect(logText).toContain('errorName'); // the allowed field
    expect(logText).toContain('MongooseServerSelectionError'); // name retained
    expect(logText).not.toContain(SENSITIVE_MESSAGE); // message never logged
  });

  it('retains a numeric driver code beside the error name and never the message', async () => {
    const raw = Object.assign(new Error(SENSITIVE_MESSAGE), { code: 18 });
    harness.mode = 'reject';
    harness.rejectValue = raw;
    const connect = await freshHelper();

    await expect(connect()).rejects.toBe(raw);

    const logText = capturedLogText(consoleErrorCalls);
    expect(logText).toContain('errorName');
    expect(logText).toContain('errorCode'); // numeric code under the allowed key
    expect(logText).toContain('18');
    expect((logText.match(/:/g) || []).length).toBe(2); // exactly two fields
    expect(logText).not.toContain(SENSITIVE_MESSAGE);
  });

  it('omits a string or object driver code and keeps only the allowed fields', async () => {
    for (const code of ['18', { value: 18 }] as unknown[]) {
      const raw = Object.assign(new Error(SENSITIVE_MESSAGE), { code });
      harness.mode = 'reject';
      harness.rejectValue = raw;
      consoleErrorCalls = [];
      const connect = await freshHelper();

      await expect(connect()).rejects.toBe(raw);

      const logText = capturedLogText(consoleErrorCalls);
      expect(logText).toContain('errorName'); // allowed field still present
      expect(logText).not.toContain('errorCode'); // non-numeric code omitted
      expect(logText).not.toContain(SENSITIVE_MESSAGE); // no raw message
    }
  });

  it('turns an unknown non-Error rejection value into UnknownError without masking the rejection', async () => {
    harness.mode = 'reject';
    harness.rejectValue = null;
    const connect = await freshHelper();

    let caught: unknown = 'not-called';
    try {
      await connect();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(null); // the original rejection value is rethrown
    const logText = capturedLogText(consoleErrorCalls);
    expect(logText).toContain('MongoDB connection error.');
    expect(logText).toContain('UnknownError'); // unknown becomes a fixed name
    expect((logText.match(/:/g) || []).length).toBe(1);
  });

  it('resets cached.promise after a failure so the next call retries mongoose.connect', async () => {
    const raw = new Error(SENSITIVE_MESSAGE);
    harness.mode = 'reject';
    harness.rejectValue = raw;
    const connect = await freshHelper();

    await expect(connect()).rejects.toBe(raw);
    expect(harness.connectCalls).toBe(1);

    harness.mode = 'ok'; // the driver recovers for the retry
    const recovered = await connect();

    expect(harness.connectCalls).toBe(2); // the cached promise was reset
    expect(recovered).toBe(harness.successValue);
  });

  it('reuses one in-flight promise for two concurrent successful calls', async () => {
    harness.mode = 'deferred';
    const connect = await freshHelper();

    const p1 = connect();
    const p2 = connect();

    expect(harness.connectCalls).toBe(1); // the second caller joins the first
    const resolve = harness.deferredResolve;
    expect(resolve).not.toBeNull();
    resolve?.(harness.successValue);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(harness.successValue);
    expect(r2).toBe(harness.successValue);
    expect(harness.connectCalls).toBe(1);
  });

  it('keeps successful connect behavior unchanged', async () => {
    const connect = await freshHelper();

    const result = await connect();

    expect(result).toBe(harness.successValue);
    expect(harness.connectCalls).toBe(1);
    expect(consoleLogCalls).toEqual([['MongoDB connected successfully.']]);
    expect(consoleErrorCalls).toEqual([]);

    const allLogs = capturedLogText([...consoleLogCalls, ...consoleErrorCalls]);
    expect(allLogs).not.toContain('dbuser_23');
    expect(allLogs).not.toContain('example.invalid');
    expect(allLogs).not.toContain('mongodb+srv://');
  });

  it('performs no real network: a guaranteed-unresolvable .invalid URI still connects through the mocked driver boundary', async () => {
    expect(SENSITIVE_URI).toContain('.invalid'); // RFC 2606: this name never resolves
    expect(process.env.MONGODB_URI).toBe(SENSITIVE_URI);

    const connect = await freshHelper();
    const result = await connect(); // succeeds only because mongoose.connect is mocked

    expect(result).toBe(harness.successValue);
    expect(harness.connectCalls).toBe(1);
  });

  it('needs no arbitrary sleeps: a rejection is delivered on the microtask queue with fake timers never advanced', async () => {
    vi.useFakeTimers();
    try {
      harness.mode = 'reject';
      harness.rejectValue = new Error(SENSITIVE_MESSAGE);
      const connect = await freshHelper();

      let observed = false;
      const pending = connect().then(
        () => {
          observed = true;
        },
        () => {
          observed = true;
        },
      );

      await vi.advanceTimersByTimeAsync(0); // flush microtasks only; no time elapses
      await pending;

      expect(observed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isolates the helper module cache with vi.resetModules() and a fresh import', async () => {
    const first = await freshHelper();
    await first(); // establishes a cached connection
    const callsAfterFirst = harness.connectCalls;

    const second = await freshHelper(); // resetModules() + cleared global cache

    expect(second).not.toBe(first); // a distinct module instance
    await second(); // the fresh cache must connect again
    expect(harness.connectCalls).toBe(callsAfterFirst + 1);
  });
});
