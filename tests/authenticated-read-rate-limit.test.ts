import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  applyRateLimitUser: vi.fn(),
  connectToMongoDB: vi.fn(),
  userFindOne: vi.fn(),
  chatFindOne: vi.fn(),
  READ: { maxRequests: 120, windowMs: 60_000, prefix: 'read' },
}));

vi.mock('@/lib/security/auth', () => ({
  requireUser: mocks.requireUser,
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitUser: mocks.applyRateLimitUser,
  RATE_LIMITS: { read: mocks.READ },
}));

vi.mock('@/lib/mongodb', () => ({
  default: mocks.connectToMongoDB,
}));

vi.mock('@/lib/models/User', () => ({
  User: { findOne: mocks.userFindOne },
}));

vi.mock('@/lib/models/ChatHistory', () => ({
  ChatHistory: { findOne: mocks.chatFindOne },
}));

const EMAIL = 'read-budget@example.com';
const USER = {
  _id: '507f1f77bcf86cd799439011',
  email: EMAIL,
  name: 'Read Budget User',
  image: null,
};

function allowedAuth() {
  return {
    ok: true as const,
    user: { id: USER._id, email: EMAIL, role: 'user' as const },
  };
}

function deniedAuth() {
  return {
    ok: false as const,
    response: NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    ),
  };
}

function deniedRateLimit() {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: { 'Retry-After': '60' },
    }
  );
}

function userReadChain() {
  mocks.userFindOne.mockReturnValue({
    lean: vi.fn().mockResolvedValue(USER),
  });
}

function chatReadChain() {
  mocks.chatFindOne.mockReturnValue({
    sort: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'chat-1',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      }),
    }),
  });
}

describe('API-001 authenticated read budgets', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireUser.mockReset();
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.connectToMongoDB.mockReset().mockResolvedValue({});
    mocks.userFindOne.mockReset();
    mocks.chatFindOne.mockReset();
  });

  it('rejects /api/user before rate limiting or the primary query', async () => {
    mocks.requireUser.mockResolvedValue(deniedAuth());
    const { GET } = await import('@/app/api/user/route.ts');
    const request = new NextRequest('http://localhost/api/user');
    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(mocks.applyRateLimitUser).not.toHaveBeenCalled();
    expect(mocks.userFindOne).not.toHaveBeenCalled();
  });

  it('returns the established 429 for /api/user before the primary query', async () => {
    mocks.requireUser.mockResolvedValue(allowedAuth());
    mocks.applyRateLimitUser.mockResolvedValue(deniedRateLimit());
    const { GET } = await import('@/app/api/user/route.ts');
    const request = new NextRequest('http://localhost/api/user');
    const response = await GET(request);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mocks.userFindOne).not.toHaveBeenCalled();
  });

  it('preserves the /api/user contract after an allowed read budget', async () => {
    mocks.requireUser.mockResolvedValue(allowedAuth());
    userReadChain();
    const { GET } = await import('@/app/api/user/route.ts');
    const request = new NextRequest('http://localhost/api/user');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ email: EMAIL });
    expect(mocks.applyRateLimitUser).toHaveBeenCalledWith(
      request,
      EMAIL,
      mocks.READ
    );
    expect(mocks.userFindOne).toHaveBeenCalled();
  });

  it('rejects /api/chat-history before rate limiting or the primary query', async () => {
    mocks.requireUser.mockResolvedValue(deniedAuth());
    const { GET } = await import('@/app/api/chat-history/route.ts');
    const response = await GET(new NextRequest('http://localhost/api/chat-history'));

    expect(response.status).toBe(401);
    expect(mocks.applyRateLimitUser).not.toHaveBeenCalled();
    expect(mocks.chatFindOne).not.toHaveBeenCalled();
  });

  it('returns the established 429 for /api/chat-history before the primary query', async () => {
    mocks.requireUser.mockResolvedValue(allowedAuth());
    mocks.applyRateLimitUser.mockResolvedValue(deniedRateLimit());
    const { GET } = await import('@/app/api/chat-history/route.ts');
    const request = new NextRequest('http://localhost/api/chat-history');
    const response = await GET(request);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mocks.chatFindOne).not.toHaveBeenCalled();
  });

  it('preserves the /api/chat-history contract after an allowed read budget', async () => {
    mocks.requireUser.mockResolvedValue(allowedAuth());
    chatReadChain();
    const { GET } = await import('@/app/api/chat-history/route.ts');
    const request = new NextRequest('http://localhost/api/chat-history');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      chatId: 'chat-1',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(mocks.applyRateLimitUser).toHaveBeenCalledWith(request, EMAIL, mocks.READ);
    expect(mocks.chatFindOne).toHaveBeenCalled();
  });
});
