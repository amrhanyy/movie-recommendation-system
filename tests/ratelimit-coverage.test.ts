import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Force the in-memory rate-limit fallback (no Redis in unit tests).
vi.mock('@/lib/redis', () => ({
  default: vi.fn().mockResolvedValue(null),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue({}),
}));

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertSameOriginOrReject: vi.fn(),
  userFindOne: vi.fn(),
  historyFind: vi.fn(),
  historyFindOneAndUpdate: vi.fn(),
  historyDeleteMany: vi.fn(),
}));

vi.mock('@/lib/security/auth', () => ({
  requireUser: mocks.requireUser,
  assertSameOriginOrReject: mocks.assertSameOriginOrReject,
}));

vi.mock('@/lib/models/User', () => ({
  User: { findOne: mocks.userFindOne },
}));

vi.mock('@/lib/models/History', () => ({
  History: {
    find: mocks.historyFind,
    findOneAndUpdate: mocks.historyFindOneAndUpdate,
    deleteMany: mocks.historyDeleteMany,
  },
}));

function chain(value: unknown) {
  const q = {
    select: () => q,
    sort: () => q,
    limit: () => q,
    lean: () => Promise.resolve(value),
  };
  return q;
}

const EMAIL = 'w3004@example.com';

function userReq(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): NextRequest {
  return new NextRequest(url, init);
}

describe('W3-004: complete limit coverage', () => {
  beforeEach(() => {
    // Fresh module registry => fresh in-memory rate-limit store per test.
    vi.resetModules();
    mocks.requireUser.mockReset();
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: 'u1', email: EMAIL, role: 'user' },
    });
    mocks.assertSameOriginOrReject.mockReset().mockReturnValue(null);
    mocks.userFindOne.mockReset().mockReturnValue(chain({ preferences: {} }));
    mocks.historyFind.mockReset().mockReturnValue(chain([]));
    mocks.historyFindOneAndUpdate.mockReset().mockResolvedValue({ _id: 'h1' });
    mocks.historyDeleteMany.mockReset().mockResolvedValue({ deletedCount: 0 });
  });

  it('121x GET /api/history denies at 121 (read 120/min user-keyed)', async () => {
    const { RATE_LIMITS } = await import('@/lib/security/rateLimit');
    const { GET } = await import('@/app/api/history/route');
    let deniedAt = -1;
    for (let i = 1; i <= 130; i++) {
      const res = await GET(userReq('http://localhost/api/history'));
      if (res.status === 429) {
        deniedAt = i;
        break;
      }
    }
    expect(deniedAt).toBe(RATE_LIMITS.read.maxRequests + 1); // 121st denied
  });

  it('21x POST /api/history denies at 21 (listWrite 20/min user-keyed)', async () => {
    const { RATE_LIMITS } = await import('@/lib/security/rateLimit');
    const { POST } = await import('@/app/api/history/route');
    const body = { itemId: 42, type: 'movie', title: 'Inception', posterPath: null };
    let deniedAt = -1;
    for (let i = 1; i <= 30; i++) {
      const res = await POST(
        userReq('http://localhost/api/history', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
      if (res.status === 429) {
        deniedAt = i;
        break;
      }
    }
    expect(deniedAt).toBe(RATE_LIMITS.listWrite.maxRequests + 1); // 21st denied
  });

  it('31x NextAuth handler same-IP denies at 31 (auth 30/min IP-keyed)', async () => {
    const { applyRateLimitPublic, RATE_LIMITS } = await import(
      '@/lib/security/rateLimit'
    );
    const reqWith = (ip: string): NextRequest =>
      new NextRequest('http://localhost/api/auth/session', {
        headers: { 'x-forwarded-for': ip },
      });
    let deniedAt = -1;
    for (let i = 1; i <= 40; i++) {
      const res = await applyRateLimitPublic(reqWith('203.0.113.9'), RATE_LIMITS.auth);
      if (res) {
        deniedAt = i;
        break;
      }
    }
    expect(deniedAt).toBe(RATE_LIMITS.auth.maxRequests + 1); // 31st denied
  });
});
