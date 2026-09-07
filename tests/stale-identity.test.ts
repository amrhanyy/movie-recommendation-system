import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  applyRateLimitUser: vi.fn(),
  find: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/security/auth', () => ({
  requireUser: mocks.requireUser,
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitUser: mocks.applyRateLimitUser,
  RATE_LIMITS: { listWrite: {}, chat: {}, read: {}, aiRecommendations: {}, aiSimilar: {} },
}));

vi.mock('@/lib/models/FavoritesModel', () => ({
  FavoritesModel: { find: mocks.find },
}));

vi.mock('@/lib/models/User', () => ({
  User: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));

vi.mock('@/lib/models/History', () => ({
  History: { find: vi.fn() },
}));

vi.mock('@/lib/models/WatchlistModel', () => ({
  WatchlistModel: { find: vi.fn() },
}));

vi.mock('@/lib/redis', () => ({
  default: vi.fn().mockResolvedValue(null),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

function denied(status: number, error: string) {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error }), { status }),
  };
}

describe('W1-002 stale-identity: deleted-user session rejected', () => {
  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.find.mockReset();
  });

  it('POST /api/chat with stale session claims returns 401', async () => {
    // requireUser now does fresh-DB existence check: deleted user => 401.
    mocks.requireUser.mockResolvedValue(denied(401, 'Authentication required'));
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello' }),
      })
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Authentication required');
    expect(mocks.applyRateLimitUser).not.toHaveBeenCalled();
  });

  it('GET /api/favorites with stale session claims returns 401', async () => {
    mocks.requireUser.mockResolvedValue(denied(401, 'Authentication required'));
    vi.resetModules();
    const { GET } = await import('@/app/api/favorites/route.ts');
    const res = await GET(
      new NextRequest('http://localhost/api/favorites', { method: 'GET' })
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Authentication required');
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('GET /api/user with stale session claims returns 401', async () => {
    mocks.requireUser.mockResolvedValue(denied(401, 'Authentication required'));
    vi.resetModules();
    const { GET } = await import('@/app/api/user/route.ts');
    const res = await GET(
      new NextRequest('http://localhost/api/user', { method: 'GET' })
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Authentication required');
  });

  it('GET /api/ai-recommendations with stale session claims returns 401', async () => {
    mocks.requireUser.mockResolvedValue(denied(401, 'Authentication required'));
    vi.resetModules();
    const { GET } = await import('@/app/api/ai-recommendations/route.ts');
    const res = await GET(new NextRequest('http://localhost/api/ai-recommendations'));
    expect(res.status).toBe(401);
    expect(mocks.applyRateLimitUser).not.toHaveBeenCalled();
  });

  it('GET /api/movie/[id]/ai-similar with stale session claims returns 401', async () => {
    mocks.requireUser.mockResolvedValue(denied(401, 'Authentication required'));
    vi.resetModules();
    const { GET } = await import('@/app/api/movie/[id]/ai-similar/route.ts');
    const res = await GET(new NextRequest('http://localhost/'), {
      params: Promise.resolve({ id: '123' }),
    });
    expect(res.status).toBe(401);
  });
});
