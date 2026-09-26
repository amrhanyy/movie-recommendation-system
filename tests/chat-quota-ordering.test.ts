import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from 'vitest';
import { NextRequest } from 'next/server';

/**
 * BUG-CHAT-INVALID-INPUT-CONSUMES-QUOTA (REL-001) — Phase 7 focused suite.
 *
 * Pins the corrected POST /api/chat ordering:
 *   auth -> origin -> rate limit -> JSON parse -> schema -> ownership
 *   -> consumeQuota (exactly once) -> Gemini -> persistence
 *
 * Network isolation: a deny-by-default global fetch guard is installed before
 * any route invocation. Only the exact GEMINI_GENERATE_URL (POST) is allowed,
 * and it serves a configured response only when the test opts in. Every other
 * URL or method throws immediately, so no real provider request can occur.
 */

interface FetchedCall {
  url: string;
  method: string;
}

const mocks = vi.hoisted(() => {
  const fetchCalls: FetchedCall[] = [];
  const allowedGeminiUrls: string[] = [];
  let geminiResponseFactory: () => Response = () =>
    new Response('unconfigured', { status: 599 });

  const guardFetch = vi.fn(
    (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      const rawUrl =
        typeof input === 'object' && input !== null && 'url' in input
          ? (input as { url: string }).url
          : String(input);
      const method =
        (init && typeof init.method === 'string' && init.method) || 'GET';
      if (!allowedGeminiUrls.includes(rawUrl) || method !== 'POST') {
        throw new Error(
          `chat-quota-ordering: fetch guard denied ${method} ${rawUrl} ` +
            '(unexpected network access attempt)'
        );
      }
      fetchCalls.push({ url: rawUrl, method });
      return Promise.resolve(geminiResponseFactory());
    }
  );

  return {
    requireUser: vi.fn(),
    assertSameOriginOrReject: vi.fn(),
    applyRateLimitUser: vi.fn(),
    consumeQuota: vi.fn(),
    connectToMongoDB: vi.fn(),
    chatFindOne: vi.fn(),
    chatFindOneAndUpdate: vi.fn(),
    chatCreate: vi.fn(),
    chatLean: vi.fn(),
    trimCollection: vi.fn(),
    fetchCalls,
    allowedGeminiUrls,
    geminiResponseFactory: {
      set(factory: () => Response) {
        geminiResponseFactory = factory;
      },
      reset() {
        geminiResponseFactory = () => new Response('unconfigured', { status: 599 });
      },
    },
    guardFetch,
  };
});

const { GEMINI_GENERATE_URL: GEMINI_URL } = await import('@/lib/gemini-payload');

vi.mock('@/lib/mongodb', () => ({
  default: mocks.connectToMongoDB,
}));

vi.mock('@/lib/security/auth', () => ({
  requireUser: mocks.requireUser,
  assertSameOriginOrReject: mocks.assertSameOriginOrReject,
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitUser: mocks.applyRateLimitUser,
  RATE_LIMITS: {
    chat: { maxRequests: 10, windowMs: 60_000, prefix: 'chat' },
  },
}));

vi.mock('@/lib/security/quota', () => ({
  consumeQuota: mocks.consumeQuota,
}));

vi.mock('@/lib/models/ChatHistory', () => ({
  ChatHistory: {
    findOne: mocks.chatFindOne,
    findOneAndUpdate: mocks.chatFindOneAndUpdate,
    create: mocks.chatCreate,
  },
}));

vi.mock('@/lib/security/cardinality', () => ({
  trimCollection: mocks.trimCollection,
}));

const EMAIL = 'quota-ordering@example.com';
const OWN_CHAT_ID = '507f1f77bcf86cd799439011';
const FOREIGN_CHAT_ID = '507f1f77bcf86cd799439012';

function geminiOk(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200 }
  );
}

async function postChat(body: unknown, contentType = 'application/json'): Promise<Response> {
  const { POST } = await import('@/app/api/chat/route.ts');
  const request = new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: String(body),
  });
  return POST(request);
}

let jsonSpyCalled = false;

/**
 * Wraps request.json with a throwing recorder: proves the body parser was
 * (or was not) reached. Reaching the real parser is never required — the spy
 * throws so any route code that relies on a parse result falls into the
 * existing 400 "Invalid JSON body" branch deterministically.
 */
function spyJson(request: NextRequest): void {
  vi.spyOn(request, 'json').mockImplementation(async () => {
    jsonSpyCalled = true;
    throw new Error('spy: JSON parsing must not be required here');
  });
}

beforeAll(() => {
  globalThis.fetch = mocks.guardFetch as unknown as typeof fetch;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  jsonSpyCalled = false;
  mocks.fetchCalls.length = 0;
  mocks.allowedGeminiUrls.length = 0;
  mocks.geminiResponseFactory.reset();
  mocks.requireUser.mockReset().mockResolvedValue({
    ok: true,
    user: { id: '507f1f77bcf86cd79900', email: EMAIL, role: 'user' },
  });
  mocks.assertSameOriginOrReject.mockReset().mockReturnValue(null);
  mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
  mocks.consumeQuota.mockReset().mockResolvedValue({ allowed: true });
  mocks.chatFindOne.mockReset();
  mocks.chatFindOneAndUpdate.mockReset().mockResolvedValue({});
  mocks.chatCreate
    .mockReset()
    .mockResolvedValue({ _id: '507f1f77bcf86cd7990a' });
  mocks.chatLean.mockReset();
  mocks.chatFindOne.mockReturnValue({ lean: mocks.chatLean });
  vi.stubEnv('GOOGLE_API_KEY', 'test-placeholder-key');
  vi.resetModules();
});

describe('REL-001: malformed JSON never consumes chat quota', () => {
  it('malformed JSON body returns 400 and does not consume quota', async () => {
    const res = await postChat('not json at all');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.fetchCalls).toEqual([]);
    expect(mocks.chatCreate).not.toHaveBeenCalled();
    expect(mocks.chatFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('empty body returns 400 and does not consume quota', async () => {
    const res = await postChat('');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.fetchCalls).toEqual([]);
    expect(mocks.chatCreate).not.toHaveBeenCalled();
  });

  it('body parsing is still reached on the accepted path (400 contract source)', async () => {
    const { POST } = await import('@/app/api/chat/route.ts');
    const request = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    });
    spyJson(request);

    const res = await POST(request);

    expect(res.status).toBe(400);
    expect(jsonSpyCalled).toBe(true);
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
  });
});

describe('REL-001: schema-invalid input never consumes chat quota', () => {
  it.each([
    ['empty message', { message: '' }],
    ['overlong message', { message: 'x'.repeat(2001) }],
    ['unknown key', { message: 'hello', response: 'injected' }],
    ['invalid chatId shape', { message: 'hello', chatId: 'not-an-id' }],
    ['excessive previousMessages', {
      message: 'hello',
      previousMessages: Array.from({ length: 21 }, (_, i) => ({ role: 'user', content: `m${i}` })),
    }],
  ])('schema-invalid body (%s) returns 400 and does not consume quota', async (_label, payload) => {
    const res = await postChat(JSON.stringify(payload));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid input' });
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.fetchCalls).toEqual([]);
    expect(mocks.chatCreate).not.toHaveBeenCalled();
    expect(mocks.chatFindOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('REL-001: auth, origin, and rate-limit gates stay first', () => {
  it('authentication denial does not call origin, rate limit, quota, Gemini, or persistence', async () => {
    mocks.requireUser.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
      }),
    });

    const res = await postChat(JSON.stringify({ message: 'hello' }));

    expect(res.status).toBe(401);
    expect(mocks.assertSameOriginOrReject).not.toHaveBeenCalled();
    expect(mocks.applyRateLimitUser).not.toHaveBeenCalled();
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.fetchCalls).toEqual([]);
    expect(mocks.chatCreate).not.toHaveBeenCalled();
    expect(mocks.chatFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('origin denial does not call rate limit, quota, Gemini, or persistence', async () => {
    mocks.assertSameOriginOrReject.mockReturnValue(
      new Response(JSON.stringify({ error: 'Origin verification failed' }), {
        status: 403,
      })
    );

    const res = await postChat(JSON.stringify({ message: 'hello' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Origin verification failed' });
    expect(mocks.applyRateLimitUser).not.toHaveBeenCalled();
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.fetchCalls).toEqual([]);
    expect(mocks.chatCreate).not.toHaveBeenCalled();
  });

  it('rate-limit denial does not consume quota or parse the body', async () => {
    mocks.applyRateLimitUser.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { 'Retry-After': '30' },
      })
    );
    const { POST } = await import('@/app/api/chat/route.ts');
    const request = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    });
    spyJson(request);

    const res = await POST(request);

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(jsonSpyCalled).toBe(false);
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.fetchCalls).toEqual([]);
    expect(mocks.chatCreate).not.toHaveBeenCalled();
  });
});

describe('REL-001: ownership is verified before quota when chatId exists', () => {
  it('foreign chatId returns 403 without quota, Gemini, or history writes', async () => {
    mocks.chatLean.mockResolvedValue(null);

    const res = await postChat(
      JSON.stringify({ message: 'hello', chatId: FOREIGN_CHAT_ID })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Chat not found' });
    expect(mocks.chatFindOne).toHaveBeenCalledWith({
      _id: FOREIGN_CHAT_ID,
      userId: EMAIL,
    });
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.fetchCalls).toEqual([]);
    expect(mocks.chatCreate).not.toHaveBeenCalled();
    expect(mocks.chatFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('nonexistent chatId returns 403 without quota, Gemini, or history writes', async () => {
    mocks.chatLean.mockResolvedValue(null);

    const res = await postChat(
      JSON.stringify({ message: 'hello', chatId: '507f1f77bcf86cd7994390ff' })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Chat not found' });
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.fetchCalls).toEqual([]);
    expect(mocks.chatCreate).not.toHaveBeenCalled();
    expect(mocks.chatFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('quota-exhausted user probing a foreign chatId receives 403 (ownership precedes quota)', async () => {
    mocks.consumeQuota.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 3600,
    });
    mocks.chatLean.mockResolvedValue(null);

    const res = await postChat(
      JSON.stringify({ message: 'hello', chatId: FOREIGN_CHAT_ID })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Chat not found' });
    expect(mocks.consumeQuota).not.toHaveBeenCalled();
    expect(mocks.fetchCalls).toEqual([]);
  });
});

describe('REL-001: accepted requests consume quota exactly once, before Gemini', () => {
  it('valid owned chat consumes quota exactly once and preserves the response contract', async () => {
    mocks.chatLean.mockResolvedValue({
      messages: [{ role: 'user', content: 'earlier' }],
    });
    mocks.allowedGeminiUrls.push(GEMINI_URL);
    mocks.geminiResponseFactory.set(() => geminiOk('Owned reply'));

    const res = await postChat(
      JSON.stringify({ message: 'hello', chatId: OWN_CHAT_ID })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      response: 'Owned reply',
      chatId: OWN_CHAT_ID,
      status: 'success',
    });
    expect(mocks.consumeQuota).toHaveBeenCalledTimes(1);
    expect(mocks.consumeQuota).toHaveBeenCalledWith(EMAIL, 'chats', 50);
    expect(mocks.fetchCalls).toEqual([{ url: GEMINI_URL, method: 'POST' }]);
    expect(mocks.chatFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.chatFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: OWN_CHAT_ID, userId: EMAIL },
      expect.any(Object),
      { new: true }
    );

    const quotaOrder = mocks.consumeQuota.mock.invocationCallOrder[0];
    const rlOrder = mocks.applyRateLimitUser.mock.invocationCallOrder[0];
    const fetchOrder = mocks.guardFetch.mock.invocationCallOrder[0];
    expect(quotaOrder).toBeGreaterThan(rlOrder);
    expect(quotaOrder).toBeLessThan(fetchOrder);
  });

  it('valid new chat consumes quota exactly once and persists via create', async () => {
    mocks.allowedGeminiUrls.push(GEMINI_URL);
    mocks.geminiResponseFactory.set(() => geminiOk('Created reply'));

    const res = await postChat(JSON.stringify({ message: 'hello' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      response: 'Created reply',
      chatId: '507f1f77bcf86cd7990a',
      status: 'success',
    });
    expect(mocks.consumeQuota).toHaveBeenCalledTimes(1);
    expect(mocks.consumeQuota).toHaveBeenCalledWith(EMAIL, 'chats', 50);
    expect(mocks.chatCreate).toHaveBeenCalledTimes(1);
    expect(mocks.chatCreate.mock.calls[0][0]).toMatchObject({ userId: EMAIL });
    expect(mocks.fetchCalls).toHaveLength(1);

    const quotaOrder = mocks.consumeQuota.mock.invocationCallOrder[0];
    const fetchOrder = mocks.guardFetch.mock.invocationCallOrder[0];
    expect(quotaOrder).toBeLessThan(fetchOrder);
  });
});

describe('REL-001: quota denial and AI-failure contracts are unchanged', () => {
  it('quota denial returns the existing 429 body and prevents Gemini', async () => {
    mocks.consumeQuota.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 3600,
    });

    const res = await postChat(JSON.stringify({ message: 'hello' }));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: 'Daily chat limit reached',
      retryAfterSeconds: 3600,
    });
    expect(mocks.consumeQuota).toHaveBeenCalledTimes(1);
    expect(mocks.fetchCalls).toEqual([]);
    expect(mocks.chatCreate).not.toHaveBeenCalled();
    expect(mocks.chatFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('AI failure keeps the current error mapping and consumes quota once', async () => {
    mocks.allowedGeminiUrls.push(GEMINI_URL);
    mocks.geminiResponseFactory.set(() =>
      new Response(JSON.stringify({ error: { message: 'upstream boom' } }), {
        status: 500,
      })
    );

    const res = await postChat(JSON.stringify({ message: 'hello' }));

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; code?: string };
    expect(body.error).toBe('Failed to process chat request');
    expect(body.code).toBe('AI_UNAVAILABLE');
    expect(mocks.consumeQuota).toHaveBeenCalledTimes(1);
    expect(mocks.fetchCalls).toHaveLength(2); // one retry on AI_UNAVAILABLE
    expect(mocks.chatCreate).not.toHaveBeenCalled();
    expect(mocks.chatFindOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('REL-001: deny-by-default fetch harness self-test', () => {
  it('guard is installed before route invocation', () => {
    expect(globalThis.fetch).toBe(mocks.guardFetch as unknown as typeof fetch);
  });

  it('an unrelated URL or method throws immediately (no fallback to real fetch)', () => {
    expect(() =>
      mocks.guardFetch('https://example.com/unrelated', { method: 'POST' })
    ).toThrow(/chat-quota-ordering: fetch guard denied/);
    expect(() => mocks.guardFetch(GEMINI_URL, { method: 'GET' })).toThrow(
      /chat-quota-ordering: fetch guard denied/
    );
    expect(() =>
      mocks.guardFetch('https://example.com/unrelated')
    ).toThrow(/chat-quota-ordering: fetch guard denied/);
    expect(mocks.fetchCalls).toEqual([]);
  });
});
