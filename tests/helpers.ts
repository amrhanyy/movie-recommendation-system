import { beforeEach, afterEach, vi } from 'vitest';

/**
 * Shared test helpers for API route security regression tests.
 *
 * All external dependencies (NextAuth sessions, MongoDB/Mongoose models,
 * Redis, global fetch) are mocked so no real external service is contacted.
 *
 * NOTE: helpers return vi mocks directly; call sites must `await impl(...)`.
 */

export const sessionUser = {
  id: '507f1f77bcf86cd799439011',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
};

/**
 * Async helper: replace the require* helpers in lib/security/auth with a
 * resolved authenticated user. Returns the mock fn.
 */
export async function mockRequireSession(overrides?: Partial<typeof sessionUser>) {
  const user = { ...sessionUser, ...overrides };
  const authMod = await import('@/lib/security/auth.ts');
  const authMock = vi.fn().mockResolvedValue({ ok: true, user });
  (authMod as unknown as { setMockAuth?: (fn: ReturnType<typeof vi.fn>) => void }).setMockAuth?.(authMock);
  return authMock;
}

export async function mockAuthDenied(status: number, error: string) {
  const response = new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
  const authMod = await import('@/lib/security/auth.ts');
  const denied = vi.fn().mockResolvedValue({ ok: false, response });
  (authMod as unknown as { setMockAuth?: (fn: ReturnType<typeof vi.fn>) => void }).setMockAuth?.(denied);
  return denied;
}

type RateLimitModule = {
  applyRateLimitUser: ReturnType<typeof vi.fn>;
  applyRateLimitPublic: ReturnType<typeof vi.fn>;
};

export async function mockRateLimitAllowed() {
  const rateMod = (await import('@/lib/security/rateLimit.ts')) as unknown as RateLimitModule;
  rateMod.applyRateLimitUser = vi.fn().mockResolvedValue(null);
  rateMod.applyRateLimitPublic = vi.fn().mockResolvedValue(null);
}

export async function mockRateLimitDenied() {
  const rateMod = (await import('@/lib/security/rateLimit.ts')) as unknown as RateLimitModule;
  const response = new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    { status: 429, headers: { 'Retry-After': '60' } }
  );
  rateMod.applyRateLimitUser = vi.fn().mockResolvedValue(response);
  rateMod.applyRateLimitPublic = vi.fn().mockResolvedValue(response);
}

export function mockFetch() {
  return vi.fn().mockImplementation((input: unknown) => {
    // Return a fresh Response per call so multi-read bodies do not fail
    void input;
    return Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 }));
  });
}

export function installGlobalFetch() {
  const original = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = mockFetch() as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
    vi.restoreAllMocks();
    vi.resetModules();
  });
}

export function mockMongoModel(model: Record<string, unknown>, methods: Record<string, unknown>) {
  for (const [name, impl] of Object.entries(methods)) {
    if (typeof impl === 'function') {
      (model as Record<string, unknown>)[name] = impl;
    }
  }
}

export function createJsonRequest(url: string, body: unknown, init: RequestInit = {}) {
  return new Request(url, {
    method: init.method || 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}