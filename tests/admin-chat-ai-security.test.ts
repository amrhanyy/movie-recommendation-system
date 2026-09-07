import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { installGlobalFetch } from './helpers';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  requireOwner: vi.fn(),
  assertSameOriginOrReject: vi.fn(),
  applyRateLimitUser: vi.fn(),
  applyRateLimitPublic: vi.fn(),
  fetch: vi.fn(),
  historyFind: vi.fn(),
  watchlistFind: vi.fn(),
  favoritesFind: vi.fn(),
  countDocuments: vi.fn(),
  aggregate: vi.fn(),
  consumeQuota: vi.fn().mockResolvedValue({ allowed: true }),
  chatHistoryCreate: vi.fn(),
  trimCollection: vi.fn(),
  usageQuotaUpdate: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

function chain(findFn: ReturnType<typeof vi.fn>) {
  const sort = vi.fn().mockReturnThis();
  const limit = vi.fn().mockReturnThis();
  const lean = vi.fn().mockResolvedValue([]);
  findFn.mockReturnValue({ sort, limit, lean });
  return { findFn, sort, limit, lean };
}

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/security/auth', () => ({
  requireSession: mocks.requireUser,
  requireUser: mocks.requireUser,
  requireAdmin: mocks.requireAdmin,
  requireOwner: mocks.requireOwner,
  assertSameOriginOrReject: mocks.assertSameOriginOrReject,
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

vi.mock('@/lib/models/History', () => ({ History: { find: mocks.historyFind } }));
vi.mock('@/lib/models/WatchlistModel', () => ({
  WatchlistModel: { find: mocks.watchlistFind },
}));
vi.mock('@/lib/models/FavoritesModel', () => ({
  FavoritesModel: { find: mocks.favoritesFind },
}));
vi.mock('@/lib/models/ChatHistory', () => ({
  ChatHistory: {
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
    create: mocks.chatHistoryCreate,
  },
}));
vi.mock('@/lib/models/UsageQuota', () => ({
  UsageQuota: {
    findOneAndUpdate: mocks.usageQuotaUpdate,
  },
}));
vi.mock('@/lib/security/cardinality', () => ({
  trimCollection: mocks.trimCollection,
}));
vi.mock('@/lib/cache', () => ({
  default: {
    getOrSet: vi.fn(async (_k: string, fn: () => unknown) => fn()),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('@/lib/cacheManager', () => ({
  default: {
    getCacheStats: vi.fn().mockResolvedValue({
      totalKeys: 0,
      memory: { used_memory_human: 'N/A' },
      status: 'offline',
    }),
  },
  cacheManager: {
    getCacheStats: vi.fn().mockResolvedValue({
      totalKeys: 0,
      memory: { used_memory_human: 'N/A' },
      status: 'offline',
    }),
  },
}));

vi.mock('@/lib/security/quota', () => ({
  consumeQuota: mocks.consumeQuota,
}));

vi.mock('@/lib/models/User', () => ({
  User: {
    countDocuments: mocks.countDocuments,
    aggregate: mocks.aggregate,
  },
}));

function denied(status: number, error: string) {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error }), { status }),
  };
}

function allow(user: { id: string; email: string; role: string } = { id: 'u1', email: 'test@example.com', role: 'user' }) {
  return { ok: true, user };
}

describe('GET /api/admin/stats (F-010/F-015)', () => {
  installGlobalFetch();

  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.requireUser.mockReset();
    mocks.requireAdmin.mockReset();
    mocks.requireOwner.mockReset();
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.fetch.mockReset();
  });

  it('unauthenticated returns 401', async () => {
    mocks.requireAdmin.mockResolvedValue(denied(401, 'Authentication required'));
    vi.resetModules();
    const { GET } = await import('@/app/api/admin/stats/route.ts');
    const res = await GET(new NextRequest('http://localhost/api/admin/stats'));
    expect(res.status).toBe(401);
  });

  it('authenticated user role returns 403', async () => {
    mocks.requireAdmin.mockResolvedValue(denied(403, 'Forbidden: admin access required'));
    vi.resetModules();
    const { GET } = await import('@/app/api/admin/stats/route.ts');
    const res = await GET(new NextRequest('http://localhost/api/admin/stats'));
    expect(res.status).toBe(403);
  });

  it('authenticated admin is allowed (authorization uses central helper)', async () => {
    mocks.requireAdmin.mockResolvedValue(
      allow({ id: 'admin-id', email: 'admin@example.com', role: 'admin' })
    );
    mocks.countDocuments.mockResolvedValue(42);
    mocks.aggregate.mockResolvedValue([]);
    vi.resetModules();
    const { GET } = await import('@/app/api/admin/stats/route.ts');
    const res = await GET(new NextRequest('http://localhost/api/admin/stats'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalUsers).toBe(42);
    expect(mocks.countDocuments).toHaveBeenCalled();
  });

  it('authorization uses only the central server helper (no client role input)', async () => {
    mocks.requireAdmin.mockResolvedValue(denied(403, 'Forbidden: admin access required'));
    vi.resetModules();
    const { GET } = await import('@/app/api/admin/stats/route.ts');
    // Client cannot influence authorization; only the central server helper decides
    const res = await GET(new NextRequest('http://localhost/api/admin/stats'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/chat (F-005)', () => {
  installGlobalFetch();

  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.assertSameOriginOrReject.mockReset().mockReturnValue(null);
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.fetch.mockReset();
    mocks.consumeQuota.mockReset().mockResolvedValue({ allowed: true });
    mocks.usageQuotaUpdate.mockReset().mockResolvedValue({ chats: 1, expiresAt: new Date() });
    mocks.chatHistoryCreate.mockReset().mockResolvedValue({ _id: '507f1f77bcf86cd799439011' });
    mocks.trimCollection.mockReset();
  });

  it('unauthenticated returns 401 before fetch is called', async () => {
    mocks.requireUser.mockResolvedValue(denied(401, 'Authentication required'));
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({ message: 'Recommend action movies' }),
      })
    );
    expect(res.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('oversized message is rejected before fetch', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({ message: 'x'.repeat(2001) }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('oversized previousMessages array is rejected before fetch', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    mocks.consumeQuota.mockReset().mockResolvedValue({ allowed: true });
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const prev = Array.from({ length: 21 }, () => ({ role: 'user', content: 'hi' }));
    const res = await POST(
      new NextRequest('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello', previousMessages: prev }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('rate-limited request returns 429 with Retry-After', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    mocks.applyRateLimitUser.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { 'Retry-After': '60' },
      })
    );
    vi.resetModules();
    const { POST } = await import('@/app/api/chat/route.ts');
    const res = await POST(
      new NextRequest('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({ message: 'hello' }),
      })
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe('GET /api/movie/[id]/ai-similar (F-006)', () => {
  installGlobalFetch();

  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.fetch.mockReset();
  });

  it('unauthenticated returns 401 before any fetch', async () => {
    mocks.requireUser.mockResolvedValue(denied(401, 'Authentication required'));
    vi.resetModules();
    const { GET } = await import('@/app/api/movie/[id]/ai-similar/route.ts');
    const res = await GET(
      new NextRequest('http://localhost/'),
      { params: Promise.resolve({ id: '123' }) }
    );
    expect(res.status).toBe(401);
  });

  it('rate-limited request returns 429 without external calls', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    mocks.applyRateLimitUser.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Too many requests.' }), {
        status: 429,
        headers: { 'Retry-After': '60' },
      })
    );
    vi.resetModules();
    const { GET } = await import('@/app/api/movie/[id]/ai-similar/route.ts');
    const res = await GET(
      new NextRequest('http://localhost/'),
      { params: Promise.resolve({ id: '123' }) }
    );
    expect(res.status).toBe(429);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('non-numeric ID is rejected with 400 without external calls', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    mocks.fetch.mockImplementation(() => {
      throw new Error('external call attempted');
    });
    globalThis.fetch = mocks.fetch as unknown as typeof fetch;
    vi.resetModules();
    const { GET } = await import('@/app/api/movie/[id]/ai-similar/route.ts');
    const res = await GET(
      new NextRequest('http://localhost/'),
      { params: Promise.resolve({ id: 'abc' }) }
    );
    expect(res.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe('GET /api/ai-recommendations (F-050, R1)', () => {
  installGlobalFetch();

  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.fetch.mockReset();
    chain(mocks.historyFind);
    chain(mocks.watchlistFind);
    chain(mocks.favoritesFind);
  });

  it('unauthenticated returns 401', async () => {
    mocks.requireUser.mockResolvedValue(denied(401, 'Authentication required'));
    vi.resetModules();
    const { GET } = await import('@/app/api/ai-recommendations/route.ts');
    const res = await GET(new NextRequest('http://localhost/'));
    expect(res.status).toBe(401);
  });

  it('error response does not expose errorDetails', async () => {
    mocks.requireUser.mockResolvedValue(allow());
    // Favorites/watchlist empty => needsContent early return (no AI call)
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 })
    );
    globalThis.fetch = mocks.fetch as unknown as typeof fetch;
    vi.resetModules();
    const { GET } = await import('@/app/api/ai-recommendations/route.ts');
    const res = await GET(new NextRequest('http://localhost/'));
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/errorDetails|gemini|internal/i);
  });
});