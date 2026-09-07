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

import { assertSameOriginOrReject } from '@/lib/security/auth';

function reqWith(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

describe('W1-011/W3-015: central origin gate matrix', () => {
  beforeEach(() => {
    vi.stubEnv('NEXTAUTH_URL', 'https://app.example');
  });

  it('rejects 403 {Origin verification failed} when no Origin/Referer/Sec-Fetch-Site', () => {
    const res = assertSameOriginOrReject(reqWith('https://app.example/api/favorites'));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });

  it('passes when Origin equals NEXTAUTH_URL origin', () => {
    const res = assertSameOriginOrReject(
      reqWith('https://app.example/api/favorites', { origin: 'https://app.example' })
    );
    expect(res).toBeNull();
  });

  it('rejects cross-origin Origin', () => {
    const res = assertSameOriginOrReject(
      reqWith('https://app.example/api/favorites', { origin: 'https://evil.example' })
    );
    expect(res?.status).toBe(403);
  });

  it('passes via Referer origin when Origin absent', () => {
    const res = assertSameOriginOrReject(
      reqWith('https://app.example/api/favorites', {
        referer: 'https://app.example/some/page',
      })
    );
    expect(res).toBeNull();
  });

  it('rejects cross-origin Referer', () => {
    const res = assertSameOriginOrReject(
      reqWith('https://app.example/api/favorites', {
        referer: 'https://evil.example/x',
      })
    );
    expect(res?.status).toBe(403);
  });

  it('passes only on Sec-Fetch-Site exactly same-origin', () => {
    expect(
      assertSameOriginOrReject(
        reqWith('https://app.example/api/favorites', { 'sec-fetch-site': 'same-origin' })
      )
    ).toBeNull();
    expect(
      assertSameOriginOrReject(
        reqWith('https://app.example/api/favorites', { 'sec-fetch-site': 'same-site' })
      )?.status
    ).toBe(403);
    expect(
      assertSameOriginOrReject(
        reqWith('https://app.example/api/favorites', { 'sec-fetch-site': 'none' })
      )?.status
    ).toBe(403);
  });
});

describe('W1-011: 403 matrix on cookie-authed mutations (representative)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXTAUTH_URL', 'https://app.example');
  });

  it('POST /api/favorites without origin headers => 403 before rate limit', async () => {
    const authMod = await import('@/lib/security/auth');
    const authSpy = vi
      .spyOn(authMod, 'requireUser')
      .mockResolvedValue({ ok: true, user: { id: 'u', email: 'a@b.c', role: 'user' } });
    const rlMod = await import('@/lib/security/rateLimit');
    const rlSpy = vi.spyOn(rlMod, 'applyRateLimitUser').mockResolvedValue(null);
    const { POST } = await import('@/app/api/favorites/route');
    const res = await POST(
      new NextRequest('https://app.example/api/favorites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: 1, type: 'movie', title: 'X' }),
      })
    );
    expect(res.status).toBe(403);
    expect(rlSpy).not.toHaveBeenCalled();
    authSpy.mockRestore();
    rlSpy.mockRestore();
  });

  it('POST /api/favorites with matching Origin passes the gate', async () => {
    const authMod = await import('@/lib/security/auth');
    const authSpy = vi
      .spyOn(authMod, 'requireUser')
      .mockResolvedValue({ ok: true, user: { id: 'u', email: 'a@b.c', role: 'user' } });
    const rlMod = await import('@/lib/security/rateLimit');
    const rlSpy = vi.spyOn(rlMod, 'applyRateLimitUser').mockResolvedValue(null);
    const dbMod = await import('@/lib/models/FavoritesModel');
    const dbSpy = vi
      .spyOn(dbMod.FavoritesModel, 'countDocuments')
      .mockResolvedValue(0);
    const existsSpy = vi
      .spyOn(dbMod.FavoritesModel, 'exists')
      .mockResolvedValue(null);
    const upsertSpy = vi
      .spyOn(dbMod.FavoritesModel, 'findOneAndUpdate')
      .mockResolvedValue({ _id: 'x' } as never);
    const { POST } = await import('@/app/api/favorites/route');
    const res = await POST(
      new NextRequest('https://app.example/api/favorites', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://app.example',
        },
        body: JSON.stringify({ itemId: 1, type: 'movie', title: 'X' }),
      })
    );
    // Gate passed (route continues to DB layer; mocked DB may 500 but never 403-origin).
    expect(res.status).not.toBe(403);
    expect(rlSpy).toHaveBeenCalled();
    authSpy.mockRestore();
    rlSpy.mockRestore();
    dbSpy.mockRestore();
    existsSpy.mockRestore();
    upsertSpy.mockRestore();
  });
});
