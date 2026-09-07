import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  assertSameOriginOrReject: vi.fn(),
  applyRateLimitUser: vi.fn(),
  countDocuments: vi.fn(),
  exists: vi.fn(),
  favFindOneAndUpdate: vi.fn(),
  userFindById: vi.fn(),
  userFindByIdAndUpdate: vi.fn(),
  cacheClearAll: vi.fn(),
  cacheInvalidateMovie: vi.fn(),
  cacheInvalidateTV: vi.fn(),
  cacheInvalidateHome: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/security/auth', () => ({
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  assertSameOriginOrReject: mocks.assertSameOriginOrReject,
  wouldRemoveLastOwner: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitUser: mocks.applyRateLimitUser,
  RATE_LIMITS: {
    listWrite: { maxRequests: 20, windowMs: 60_000, prefix: 'list-write' },
    adminMutation: { maxRequests: 30, windowMs: 60_000, prefix: 'admin' },
    cacheAdmin: { maxRequests: 10, windowMs: 60_000, prefix: 'cache-admin' },
  },
}));

vi.mock('@/lib/models/FavoritesModel', () => ({
  FavoritesModel: {
    countDocuments: mocks.countDocuments,
    exists: mocks.exists,
    findOneAndUpdate: mocks.favFindOneAndUpdate,
  },
}));

vi.mock('@/lib/models/User', () => ({
  User: {
    findById: mocks.userFindById,
    findByIdAndUpdate: mocks.userFindByIdAndUpdate,
  },
}));

vi.mock('@/lib/cacheManager', () => ({
  default: {
    clearAllCache: mocks.cacheClearAll,
    invalidateMovieCache: mocks.cacheInvalidateMovie,
    invalidateTVCache: mocks.cacheInvalidateTV,
    invalidateHomeCache: mocks.cacheInvalidateHome,
  },
}));

const USER = { id: '507f1f77bcf86cd799439011', email: 't@example.com', role: 'user' };
const ADMIN = { id: '507f1f77bcf86cd799439012', email: 'a@example.com', role: 'admin' };

function postReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('W3-008/W3-009/W2-001: strict validation rejects with 400', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireUser.mockReset().mockResolvedValue({ ok: true, user: USER });
    mocks.requireAdmin.mockReset().mockResolvedValue({ ok: true, user: ADMIN });
    mocks.assertSameOriginOrReject.mockReset().mockReturnValue(null);
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.countDocuments.mockReset().mockResolvedValue(0);
    mocks.exists.mockReset().mockResolvedValue(null);
    mocks.favFindOneAndUpdate.mockReset().mockResolvedValue({ _id: 'x' });
    mocks.userFindById.mockReset().mockResolvedValue({ role: 'user' });
    mocks.userFindByIdAndUpdate.mockReset().mockResolvedValue({ _id: 'x' });
    mocks.cacheClearAll.mockReset().mockResolvedValue({ deleted: 0, remaining: false });
  });

  it('POST /api/favorites type:person is 400 (was 500)', async () => {
    const { POST } = await import('@/app/api/favorites/route');
    const res = await POST(
      postReq('http://localhost/api/favorites', { itemId: 1, type: 'person', title: 'X' })
    );
    expect(res.status).toBe(400);
    expect(mocks.favFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("PUT /api/admin/users userId:'x' is 400 (was 500 CastError oracle)", async () => {
    const { PUT } = await import('@/app/api/admin/users/route');
    const res = await PUT(
      postReq('http://localhost/api/admin/users', { userId: 'x', updates: { role: 'admin' } })
    );
    expect(res.status).toBe(400);
    expect(mocks.userFindById).not.toHaveBeenCalled();
  });

  it('POST /api/admin/cache unknown key is 400 (strict schemas)', async () => {
    const { POST } = await import('@/app/api/admin/cache/route');
    const res = await POST(
      postReq('http://localhost/api/admin/cache', {
        action: 'clear',
        unknownField: 'x',
      })
    );
    expect(res.status).toBe(400);
  });
});
