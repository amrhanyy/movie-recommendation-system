import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * AUTH-CTX: App Router context must reach the NextAuth handler.
 *
 * Regression for the P1 production 500:
 * `TypeError: Cannot destructure property 'nextauth' of 'a.query' as it is undefined`
 * The M2 wrapper called handler(req) req-only, so next-auth took the
 * NextAuthApiHandler path (req.query destructure) instead of the
 * NextAuthRouteHandler path (args[1]?.params, await context.params).
 */

const mocks = vi.hoisted(() => ({
  inner: vi.fn(),
  ctor: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('next-auth', () => ({
  default: (...args: unknown[]) => {
    mocks.ctor(...args);
    return mocks.inner;
  },
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitPublic: (...args: unknown[]) => mocks.limit(...args),
  RATE_LIMITS: { auth: { maxRequests: 30, windowMs: 60_000, prefix: 'auth' } },
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

function ctxFor(action: string = 'session') {
  return { params: Promise.resolve({ nextauth: [action] }) };
}

describe('auth route forwards App Router context to NextAuth', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.ctor.mockClear();
    mocks.inner.mockReset().mockImplementation(async () => new Response('ok', { status: 200 }));
    mocks.limit.mockReset().mockResolvedValue(null);
  });

  it('GET passes BOTH (request, context) to the inner handler', async () => {
    const { GET } = await import('@/app/api/auth/[...nextauth]/route');
    const req = new NextRequest('http://localhost/api/auth/session');
    const ctx = ctxFor('session');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(mocks.inner).toHaveBeenCalledTimes(1);
    expect(mocks.inner.mock.calls[0].length).toBe(2);
    expect(mocks.inner.mock.calls[0][0]).toBe(req);
    expect(mocks.inner.mock.calls[0][1]).toBe(ctx);
    await expect(mocks.inner.mock.calls[0][1].params).resolves.toEqual({ nextauth: ['session'] });
  });

  it('POST passes BOTH (request, context) to the inner handler', async () => {
    const { POST } = await import('@/app/api/auth/[...nextauth]/route');
    const req = new NextRequest('http://localhost/api/auth/session', { method: 'POST' });
    const ctx = ctxFor('session');
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    expect(mocks.inner).toHaveBeenCalledTimes(1);
    expect(mocks.inner.mock.calls[0].length).toBe(2);
    await expect(mocks.inner.mock.calls[0][1].params).resolves.toEqual({ nextauth: ['session'] });
  });

  it('limit-first short-circuit: 429 never reaches the handler', async () => {
    const denied = new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
    mocks.limit.mockResolvedValueOnce(denied);
    const { GET } = await import('@/app/api/auth/[...nextauth]/route');
    const res = await GET(new NextRequest('http://localhost/api/auth/session'), ctxFor());
    expect(res.status).toBe(429);
    expect(mocks.inner).not.toHaveBeenCalled();
  });

  it('arity tripwire: GET/POST accept (request, context)', async () => {
    const mod = await import('@/app/api/auth/[...nextauth]/route');
    expect(mod.GET.length).toBe(2);
    expect(mod.POST.length).toBe(2);
  });
});
