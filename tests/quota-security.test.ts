import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertSameOriginOrReject: vi.fn(),
  applyRateLimitUser: vi.fn(),
  consumeQuota: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue({}),
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

const sessionUser = {
  id: '507f1f77bcf86cd799439011',
  email: 'test@example.com',
  role: 'user',
};

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('W3-006a: chat daily quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockReset().mockResolvedValue({ ok: true, user: sessionUser });
    mocks.assertSameOriginOrReject.mockReset().mockReturnValue(null);
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.consumeQuota.mockReset();
  });

  it('returns 429 when daily chat quota exceeded', async () => {
    mocks.consumeQuota.mockResolvedValue({ allowed: false, retryAfterSeconds: 3600 });

    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/chat', { message: 'hello' }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Daily chat limit reached');
    expect(body.retryAfterSeconds).toBe(3600);
  });

  it('calls consumeQuota with correct parameters', async () => {
    mocks.consumeQuota.mockResolvedValue({ allowed: true });

    const { POST } = await import('@/app/api/chat/route.ts');
    await POST(makePostRequest('http://localhost/api/chat', { message: 'hello' }));

    expect(mocks.consumeQuota).toHaveBeenCalledWith('test@example.com', 'chats', 50);
  });
});
