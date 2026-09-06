import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { installGlobalFetch } from './helpers';

// Mock state shared across tests via vi.hoisted (hoisting-safe)
const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  requireOwner: vi.fn(),
  applyRateLimitUser: vi.fn(),
  applyRateLimitPublic: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/security/auth', () => ({
  requireSession: mocks.requireSession,
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  requireOwner: mocks.requireOwner,
  hasElevatedRole: (role: string) => role === 'admin' || role === 'owner',
  assertResourceOwner: (a: string, b: string) => a === b,
  wouldRemoveLastOwner: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitUser: mocks.applyRateLimitUser,
  applyRateLimitPublic: mocks.applyRateLimitPublic,
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: {
    chat: {},
    aiRecommendations: {},
    aiSimilar: {},
    search: {},
    tmdbProxy: {},
    mood: {},
    auth: {},
    adminMutation: {},
    profileUpdate: {},
    chatHistoryWrite: {},
    cacheAdmin: {},
  },
}));

vi.mock('@/lib/models/User', () => ({
  User: {
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
    findById: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

const sessionUser = {
  id: '507f1f77bcf86cd799439011',
  email: 'test@example.com',
  role: 'user',
};

function allowed(user = sessionUser) {
  return { ok: true, user };
}

function denied(status: number, error: string) {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error }), { status }),
  };
}

async function importUserRoute() {
  vi.resetModules();
  const mod = await import('@/app/api/user/route.ts');
  return mod;
}

describe('PUT /api/user (F-001)', () => {
  installGlobalFetch();

  beforeEach(() => {
    mocks.requireSession.mockReset();
    mocks.requireUser.mockReset();
    mocks.requireAdmin.mockReset();
    mocks.requireOwner.mockReset();
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.applyRateLimitPublic.mockReset().mockResolvedValue(null);
    mocks.findOne.mockReset();
    mocks.findOneAndUpdate.mockReset();
  });

  it('returns 401 for unauthenticated request', async () => {
    mocks.requireSession.mockResolvedValue(denied(401, 'Authentication required'));
    const { PUT } = await importUserRoute();
    const res = await PUT(
      new NextRequest('http://localhost/api/user', {
        method: 'PUT',
        body: JSON.stringify({ preferences: { favorite_genres: ['Drama'] } }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('rejects body containing role', async () => {
    mocks.requireSession.mockResolvedValue(allowed());
    const { PUT } = await importUserRoute();
    const res = await PUT(
      new NextRequest('http://localhost/api/user', {
        method: 'PUT',
        body: JSON.stringify({ role: 'owner' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects body containing email', async () => {
    mocks.requireSession.mockResolvedValue(allowed());
    const { PUT } = await importUserRoute();
    const res = await PUT(
      new NextRequest('http://localhost/api/user', {
        method: 'PUT',
        body: JSON.stringify({ email: 'hacker@evil.com' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects body containing _id', async () => {
    mocks.requireSession.mockResolvedValue(allowed());
    const { PUT } = await importUserRoute();
    const res = await PUT(
      new NextRequest('http://localhost/api/user', {
        method: 'PUT',
        body: JSON.stringify({ _id: '507f1f77bcf86cd799439011' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects unknown fields', async () => {
    mocks.requireSession.mockResolvedValue(allowed());
    const { PUT } = await importUserRoute();
    const res = await PUT(
      new NextRequest('http://localhost/api/user', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Hacker' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects $ operator fields', async () => {
    mocks.requireSession.mockResolvedValue(allowed());
    const { PUT } = await importUserRoute();
    const res = await PUT(
      new NextRequest('http://localhost/api/user', {
        method: 'PUT',
        body: JSON.stringify({ $set: { role: 'owner' } }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects dotted keys', async () => {
    mocks.requireSession.mockResolvedValue(allowed());
    const { PUT } = await importUserRoute();
    const res = await PUT(
      new NextRequest('http://localhost/api/user', {
        method: 'PUT',
        body: JSON.stringify({ 'preferences.role': 'owner' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects prototype-pollution payloads', async () => {
    mocks.requireSession.mockResolvedValue(allowed());
    const { PUT } = await importUserRoute();
    const res = await PUT(
      new NextRequest('http://localhost/api/user', {
        method: 'PUT',
        body: JSON.stringify({ __proto__: { role: 'owner' } }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('approved preferences update succeeds and does not pass raw body or upsert', async () => {
    mocks.requireSession.mockResolvedValue(allowed());
    mocks.findOneAndUpdate.mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        preferences: { favorite_genres: ['Drama'] },
      }),
    }));
    const { PUT } = await importUserRoute();
    const res = await PUT(
      new NextRequest('http://localhost/api/user', {
        method: 'PUT',
        body: JSON.stringify({ preferences: { favorite_genres: ['Drama'] } }),
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = mocks.findOneAndUpdate.mock.calls[0];
    expect(Object.keys(update.$set)).toEqual(['preferences.favorite_genres']);
    expect(opts.upsert).toBe(false);
    expect(filter.email).toBe('test@example.com');
  });

  it('scopes update to the authenticated session identity', async () => {
    mocks.requireSession.mockResolvedValue(allowed({ ...sessionUser, email: 'other@example.com' }));
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'id', email: 'other@example.com' });
    const { PUT } = await importUserRoute();
    await PUT(
      new NextRequest('http://localhost/api/user', {
        method: 'PUT',
        body: JSON.stringify({ preferences: { selected_moods: ['happy'] } }),
      })
    );
    const [filter] = mocks.findOneAndUpdate.mock.calls[0];
    expect(filter.email).toBe('other@example.com');
  });
});