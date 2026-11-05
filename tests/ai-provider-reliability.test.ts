import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIErrorCode } from '@/lib/ai-security';

/**
 * PHASE 20 — Shared Gemini provider (lib/gemini-provider) focused suite.
 *
 * TEST-FIRST (RED): this suite pins the contract of the new shared provider
 * BEFORE it exists, so the honest behavioral RED is "module not found /
 * capability missing". It then flips GREEN once lib/gemini-provider.ts is
 * implemented (b4-b7).
 *
 * It asserts:
 *  - model resolution: default gemini-3.5-flash-lite, GEMINI_MODEL override,
 *    blank->default, invalid-model rejection (no static 'gemini-3.7-flash')
 *  - URL built from the RESOLVED model (call-time, not module-load)
 *  - Retry-After parsing (seconds -> ms, absent/invalid -> null, capped)
 *  - retry policy: 5xx max 3 attempts, 429 max 2 calls (one bounded Retry-After
 *    <= 5s), 429 without a valid Retry-After is not retried at all, HTTP-date
 *    is parsed against an injected clock, timeout and 4xx are NON-retryable,
 *    empty response non-retryable
 *  - API-key gate: no fetch issued when the provider is unconfigured
 *  - structured observability metadata (redacted; API key never logged)
 *
 * All external I/O (fetch, backoff sleep, jitter RNG, logger) is dependency-
 * injected so the suite is deterministic and performs no real network call.
 */

type CallOpts = {
  payload: Record<string, unknown>;
  fetchImpl?: unknown;
  sleep?: (ms: number) => Promise<void>;
  rng?: () => number;
  /**
   * Injectable clock (ms) used for HTTP-date Retry-After delay math.
   * Defaults to Date.now.
   */
  clock?: () => number;
  log?: (level: 'info' | 'warn' | 'error', message: string, meta: Record<string, unknown>) => void;
};

type ProviderModule = {
  getGeminiModel: () => string;
  buildGeminiGenerateUrl: (model?: string) => string;
  parseRetryAfter: (header: string | undefined) => number | null;
  callGemini: (opts: CallOpts) => Promise<string>;
};

type Ctor = new (code: AIErrorCode, message: string) => Error;

let provider: ProviderModule;
let AIUpstreamError: Ctor;

const ORIGINAL_GEMINI_MODEL = process.env.GEMINI_MODEL;
const ORIGINAL_GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

beforeAll(async () => {
  const mod = await import('@/lib/gemini-provider');
  provider = mod as unknown as ProviderModule;
  AIUpstreamError = (await import('@/lib/ai-security')).AIUpstreamError;
});

beforeEach(() => {
  delete process.env.GEMINI_MODEL;
  process.env.GOOGLE_API_KEY = 'test-key-should-never-leak';
  vi.restoreAllMocks();
});

afterAll(() => {
  if (ORIGINAL_GEMINI_MODEL === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = ORIGINAL_GEMINI_MODEL;
  if (ORIGINAL_GOOGLE_API_KEY === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = ORIGINAL_GOOGLE_API_KEY;
});

// ---- response / fetch helpers --------------------------------------------

function gemini200(text: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
}

function geminiStatus(status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: { message: 'simulated upstream failure' } }), { status, headers });
}

/** A fetch mock that returns a scripted sequence (responses or thunk-per-step). */
function seqFetch(seq: Array<Response | (() => Response | Promise<Response>)>) {
  let i = 0;
  const fn = vi.fn(async (): Promise<Response> => {
    const step = seq[i++];
    if (step === undefined) return geminiStatus(503);
    return typeof step === 'function' ? step() : step;
  });
  return fn as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

const noopSleep = (): Promise<void> => Promise.resolve();
const halfRng = (): number => 0.5;
const silentLog = (): void => {};

function call(opts: Partial<CallOpts> = {}) {
  return provider.callGemini({
    payload: { contents: [] },
    fetchImpl: opts.fetchImpl,
    sleep: opts.sleep ?? noopSleep,
    rng: opts.rng ?? halfRng,
    clock: opts.clock ?? Date.now,
    log: opts.log ?? silentLog,
  });
}

// ==========================================================================
// 1. Model resolution (getGeminiModel)
// ==========================================================================
describe('getGeminiModel — model resolution', () => {
  it('defaults to gemini-3.5-flash-lite when GEMINI_MODEL is unset', () => {
    expect(provider.getGeminiModel()).toBe('gemini-3.5-flash-lite');
  });

  it('does NOT fall back to the legacy gemini-3.7-flash', () => {
    expect(provider.getGeminiModel()).not.toContain('3.7');
  });

  it('respects a valid GEMINI_MODEL override', () => {
    process.env.GEMINI_MODEL = 'gemini-2.0-flash';
    expect(provider.getGeminiModel()).toBe('gemini-2.0-flash');
  });

  it('trims surrounding whitespace from GEMINI_MODEL', () => {
    process.env.GEMINI_MODEL = '  gemini-2.0-flash  ';
    expect(provider.getGeminiModel()).toBe('gemini-2.0-flash');
  });

  it('treats a blank/whitespace GEMINI_MODEL as the safe default', () => {
    process.env.GEMINI_MODEL = '   ';
    expect(provider.getGeminiModel()).toBe('gemini-3.5-flash-lite');
  });

  it('accepts a tuned-model id (single slash segment)', () => {
    process.env.GEMINI_MODEL = 'tunedModels/abc123';
    expect(provider.getGeminiModel()).toBe('tunedModels/abc123');
  });

  it('rejects a path-traversal GEMINI_MODEL with AI_AUTH_ERROR', () => {
    process.env.GEMINI_MODEL = '../../evil';
    expect(() => provider.getGeminiModel()).toThrowError(AIUpstreamError);
    expect(() => provider.getGeminiModel()).toThrow(/GEMINI_MODEL/i);
  });

  it('rejects a GEMINI_MODEL containing a query string', () => {
    process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite?x=1';
    expect(() => provider.getGeminiModel()).toThrowError(AIUpstreamError);
  });

  it('rejects a GEMINI_MODEL with a second slash segment', () => {
    process.env.GEMINI_MODEL = 'a/b/c';
    expect(() => provider.getGeminiModel()).toThrowError(AIUpstreamError);
  });
});

// ==========================================================================
// 2. URL building (buildGeminiGenerateUrl)
// ==========================================================================
describe('buildGeminiGenerateUrl — URL from resolved model', () => {
  it('builds the generateContent URL for an explicit model', () => {
    expect(provider.buildGeminiGenerateUrl('gemini-3.5-flash-lite')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'
    );
  });

  it('with no argument uses the resolved (default) model', () => {
    expect(provider.buildGeminiGenerateUrl()).toContain('gemini-3.5-flash-lite:generateContent');
    expect(provider.buildGeminiGenerateUrl()).not.toContain('gemini-3.7-flash');
  });

  it('honours a valid GEMINI_MODEL override', () => {
    process.env.GEMINI_MODEL = 'gemini-2.0-flash';
    expect(provider.buildGeminiGenerateUrl()).toContain('gemini-2.0-flash:generateContent');
  });
});

// ==========================================================================
// 3. Retry-After parsing (parseRetryAfter)
// ==========================================================================
describe('parseRetryAfter — header parsing', () => {
  it('parses integer seconds to milliseconds', () => {
    expect(provider.parseRetryAfter('2')).toBe(2000);
  });

  it('parses fractional seconds', () => {
    expect(provider.parseRetryAfter('0.5')).toBe(500);
  });

  it('returns null for missing / empty / non-numeric / negative', () => {
    expect(provider.parseRetryAfter(undefined)).toBeNull();
    expect(provider.parseRetryAfter('')).toBeNull();
    expect(provider.parseRetryAfter('abc')).toBeNull();
    expect(provider.parseRetryAfter('-5')).toBeNull();
  });

  it('caps absurd values at a sane maximum', () => {
    expect(provider.parseRetryAfter('99999')).toBeLessThanOrEqual(30000);
    expect(provider.parseRetryAfter('99999')).toBeGreaterThan(0);
  });
});

// ==========================================================================
// 4. callGemini — success path
// ==========================================================================
describe('callGemini — success path', () => {
  it('returns the extracted text on 200 in a single attempt (no retry, no sleep)', async () => {
    const fetchImpl = seqFetch([gemini200('Hello from Gemini')]);
    const sleep = vi.fn(noopSleep);
    const out = await call({ fetchImpl, sleep: sleep as unknown as CallOpts['sleep'] });
    expect(out).toBe('Hello from Gemini');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('targets the resolved default-model URL (no static 3.7 URL on the wire)', async () => {
    const fetchImpl = seqFetch([gemini200('ok')]);
    await call({ fetchImpl });
    const [url] = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('gemini-3.5-flash-lite:generateContent');
    expect(url).not.toContain('gemini-3.7-flash');
  });

  it('sends the API key as x-goog-api-key and JSON content type', async () => {
    const fetchImpl = seqFetch([gemini200('ok')]);
    await call({ fetchImpl });
    const [, init] = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('test-key-should-never-leak');
    expect(headers['Content-Type']).toBe('application/json');
    expect(init.method).toBe('POST');
  });
});

// ==========================================================================
// 5. callGemini — retry policy
// ==========================================================================
describe('callGemini — retry policy', () => {
  it('retries 503 and succeeds on the 3rd attempt (exactly 3 fetches)', async () => {
    const fetchImpl = seqFetch([geminiStatus(503), geminiStatus(503), gemini200('ok')]);
    const out = await call({ fetchImpl });
    expect(out).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('gives up on persistent 503 after exactly 3 attempts (no over-retry)', async () => {
    const fetchImpl = seqFetch([geminiStatus(503), geminiStatus(503), geminiStatus(503)]);
    await expect(call({ fetchImpl })).rejects.toThrowError(AIUpstreamError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('on persistent 503 the thrown code is AI_UNAVAILABLE', async () => {
    const fetchImpl = seqFetch([geminiStatus(503), geminiStatus(503), geminiStatus(503)]);
    await expect(call({ fetchImpl })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('respects Retry-After on 429 (waits the header value, then retries)', async () => {
    const fetchImpl = seqFetch([geminiStatus(429, { 'Retry-After': '2' }), gemini200('ok')]);
    const sleep = vi.fn(noopSleep);
    const out = await call({ fetchImpl, sleep: sleep as unknown as CallOpts['sleep'] });
    expect(out).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect((sleep.mock.calls[0] as number[])[0]).toBe(2000);
  });

  it('does NOT retry a 429 with no Retry-After (single fetch, no sleep)', async () => {
    const fetchImpl = seqFetch([geminiStatus(429)]);
    const sleep = vi.fn(noopSleep);
    await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does NOT retry a timeout (single fetch, AI_TIMEOUT)', async () => {
    const fetchImpl = vi.fn(async (): Promise<Response> => {
      throw new DOMException('aborted', 'AbortError');
    }) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
    await expect(call({ fetchImpl })).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a 401 (single fetch, AI_AUTH_ERROR)', async () => {
    const fetchImpl = seqFetch([geminiStatus(401)]);
    await expect(call({ fetchImpl })).rejects.toMatchObject({ code: 'AI_AUTH_ERROR' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a 400 (single fetch, AI_AUTH_ERROR)', async () => {
    const fetchImpl = seqFetch([geminiStatus(400)]);
    await expect(call({ fetchImpl })).rejects.toMatchObject({ code: 'AI_AUTH_ERROR' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a 404 (single fetch, AI_INVALID_RESPONSE)', async () => {
    const fetchImpl = seqFetch([geminiStatus(404)]);
    await expect(call({ fetchImpl })).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry an empty 200 (no candidates) — AI_INVALID_RESPONSE, single fetch', async () => {
    const fetchImpl = seqFetch([new Response(JSON.stringify({}), { status: 200 })]);
    await expect(call({ fetchImpl })).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry an invalid 200 JSON body — AI_INVALID_RESPONSE, single fetch', async () => {
    const fetchImpl = vi.fn(async (): Promise<Response> => new Response('not-json', { status: 200 })) as unknown as typeof fetch & {
      mock: { calls: unknown[][] };
    };
    await expect(call({ fetchImpl })).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry an unconfigured provider (no API key) — no fetch at all', async () => {
    delete process.env.GOOGLE_API_KEY;
    const fetchImpl = vi.fn(async (): Promise<Response> => gemini200('ok')) as unknown as typeof fetch & {
      mock: { calls: unknown[][] };
    };
    await expect(call({ fetchImpl })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ==========================================================================
// 6. callGemini — structured observability (redacted)
// ==========================================================================
describe('callGemini — observability', () => {
  it('emits structured failure metadata (status + code) then a success summary', async () => {
    const fetchImpl = seqFetch([geminiStatus(503), gemini200('ok')]);
    const log = vi.fn();
    await call({ fetchImpl, log: log as unknown as CallOpts['log'] });
    expect(log).toHaveBeenCalled();
    const metas = log.mock.calls.map((c) => c[2] as Record<string, unknown>);
    const failure = metas.find((m) => m.status === 503 && m.code === 'AI_UNAVAILABLE');
    expect(failure).toBeDefined();
    const success = metas.find((m) => m.model === 'gemini-3.5-flash-lite' && typeof m.attempts === 'number');
    expect(success).toBeDefined();
  });

  it('never logs the API key (redaction contract)', async () => {
    const fetchImpl = seqFetch([geminiStatus(503), gemini200('ok')]);
    const log = vi.fn();
    await call({ fetchImpl, log: log as unknown as CallOpts['log'] });
    const serialized = JSON.stringify(log.mock.calls);
    expect(serialized).not.toContain('test-key-should-never-leak');
  });

  it('logs the redacted upstream body on failure, not the raw body', async () => {
    const fetchImpl = seqFetch([geminiStatus(500)]);
    const log = vi.fn();
    await call({ fetchImpl, log: log as unknown as CallOpts['log'] }).catch(() => {
      /* expected to throw after 3 attempts */
    });
    const serialized = JSON.stringify(log.mock.calls);
    expect(serialized).not.toContain('test-key-should-never-leak');
  });
});

// ==========================================================================
// 7. callGemini — 429 bounded retry contract (PHASE 21 hardening)
//
// The corrected contract:
//   - 429 with no Retry-After / malformed / zero / negative / > 5s : ONE call,
//     no sleep, no retry, normalized as AI_RATE_LIMITED.
//   - 429 with a valid Retry-After in (0, 5s] : ONE retry, exactly two calls
//     maximum, sleep the header value.
//   - HTTP-date Retry-After : parsed against the injected clock; only valid
//     and <= 5s retried.
//   - A 429 retires the call budget at 2 calls — never the 503 three-attempt
//     path, from any position in the sequence.
//   - 503 preserves the 3-attempt backoff budget (existing suite).
//   - Timeout and all non-retryable statuses are unchanged (existing suite).
// ==========================================================================
describe('callGemini — 429 bounded retry contract', () => {
  function retryAfter429(after: string): Response {
    return geminiStatus(429, { 'Retry-After': after });
  }

  describe('429 without a valid Retry-After — single call, no sleep, no retry', () => {
    it('429 with no Retry-After header: one fetch, no sleep, AI_RATE_LIMITED', async () => {
      const fetchImpl = seqFetch([geminiStatus(429)]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('429 with a malformed Retry-After ("abc"): one fetch, no sleep, AI_RATE_LIMITED', async () => {
      const fetchImpl = seqFetch([retryAfter429('abc')]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('429 with a negative Retry-After ("-2.5"): one fetch, no sleep, AI_RATE_LIMITED', async () => {
      const fetchImpl = seqFetch([retryAfter429('-2.5')]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('429 with a zero Retry-After ("0"): one fetch, no sleep, AI_RATE_LIMITED', async () => {
      const fetchImpl = seqFetch([retryAfter429('0')]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('429 with a Retry-After of 6 seconds: one fetch, no sleep, no retry', async () => {
      const fetchImpl = seqFetch([retryAfter429('6')]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('429 with a Retry-After of 30 seconds: one fetch, no sleep, no retry', async () => {
      const fetchImpl = seqFetch([retryAfter429('30')]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });
  });

  describe('429 with a valid Retry-After (0, <= 5s) — exactly one retry', () => {
    it('429 with Retry-After "1": two calls, one sleep of 1000ms, no third call', async () => {
      const fetchImpl = seqFetch([retryAfter429('1'), retryAfter429('1')]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect((sleep.mock.calls[0] as number[])[0]).toBe(1000);
    });

    it('429 with Retry-After "5": two calls, bounded retry accepted at the boundary', async () => {
      const fetchImpl = seqFetch([retryAfter429('5'), retryAfter429('5')]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect((sleep.mock.calls[0] as number[])[0]).toBe(5000);
    });

    it('429 with Retry-After "0.5": two calls, one sleep of 500ms, then succeeds', async () => {
      const fetchImpl = seqFetch([retryAfter429('0.5'), gemini200('ok')]);
      const sleep = vi.fn(noopSleep);
      const out = await call({ fetchImpl, sleep });
      expect(out).toBe('ok');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect((sleep.mock.calls[0] as number[])[0]).toBe(500);
    });

    it('503 with Retry-After "1" inside a 503 sequence using the backoff budget', async () => {
      // 5xx status with a Retry-After header: the 5xx budget (3 calls) wins,
      // the header is still honoured (analogous behaviour, unchanged).
      const fetchImpl = seqFetch([geminiStatus(503, { 'Retry-After': '1' }), gemini200('ok')]);
      const sleep = vi.fn(noopSleep);
      const out = await call({ fetchImpl, sleep });
      expect(out).toBe('ok');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect((sleep.mock.calls[0] as number[])[0]).toBeGreaterThan(0);
    });
  });

  describe('429 with an HTTP-date Retry-After', () => {
    const CLOCK = () => 1_762_384_800_000;

    function futureDate(msFromNow: number): string {
      return new Date(CLOCK() + msFromNow).toUTCString();
    }

    it('HTTP-date within 5 seconds: one bounded retry (sleep 1000ms)', async () => {
      const fetchImpl = seqFetch([retryAfter429(futureDate(1000)), retryAfter429('1')]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep, clock: CLOCK })).rejects.toMatchObject({
        code: 'AI_RATE_LIMITED',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect((sleep.mock.calls[0] as number[])[0]).toBe(1000);
    });

    it('HTTP-date greater than 5 seconds: one fetch, no sleep, no retry', async () => {
      const fetchImpl = seqFetch([retryAfter429(futureDate(60_000)), retryAfter429('1')]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep, clock: CLOCK })).rejects.toMatchObject({
        code: 'AI_RATE_LIMITED',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });
  });

  describe('429 retires the call budget — never the 5xx three-attempt path', () => {
    it('first 429 (Retry-After 1) then 503: two calls, no three-attempt 503 sequence', async () => {
      const fetchImpl = seqFetch([retryAfter429('1'), geminiStatus(503)]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
    });

    it('first 429 (Retry-After 1) then 429: exactly two calls, no third', async () => {
      const fetchImpl = seqFetch([retryAfter429('1'), retryAfter429('1')]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
    });

    it('first 429 (no Retry-After) then 503: exactly one call', async () => {
      const fetchImpl = seqFetch([geminiStatus(429), geminiStatus(503)]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('503 then 429: two calls total, no third attempt', async () => {
      const fetchImpl = seqFetch([geminiStatus(503), retryAfter429('1')]);
      const sleep = vi.fn(noopSleep);
      await expect(call({ fetchImpl, sleep })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
    });
  });

  describe('the 503 retry budget is preserved', () => {
    it('two 503 then 200: three calls exactly (unchanged)', async () => {
      const fetchImpl = seqFetch([geminiStatus(503), geminiStatus(503), gemini200('ok')]);
      const out = await call({ fetchImpl });
      expect(out).toBe('ok');
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('three 503: three calls, no fourth attempt (unchanged)', async () => {
      const fetchImpl = seqFetch([geminiStatus(503), geminiStatus(503), geminiStatus(503)]);
      await expect(call({ fetchImpl })).rejects.toThrowError(AIUpstreamError);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });
  });

  describe('429 decision is logged with bounded metadata', () => {
    it('logs retryDelayMs + retryAfterPresent and never a key or prompt', async () => {
      const fetchImpl = seqFetch([retryAfter429('1'), gemini200('ok')]);
      const sleep = vi.fn(noopSleep);
      const log = vi.fn();
      await call({ fetchImpl, log: log as unknown as CallOpts['log'], sleep });
      expect(log).toHaveBeenCalled();
      const metas = log.mock.calls.map((c) => c[2] as Record<string, unknown>);
      const decision = metas.find(
        (m) => (m.retryDelayMs as number) === 1000 && m.retryAfterPresent === true
      );
      expect(decision).toBeDefined();
      const serialized = JSON.stringify(log.mock.calls);
      expect(serialized).not.toContain('test-key-should-never-leak');
      expect(serialized).not.toContain('"contents"');
      expect(serialized).not.toContain('prompt');
    });
  });
});
