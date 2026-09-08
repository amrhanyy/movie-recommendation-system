import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertSameOriginOrReject: vi.fn(),
  applyRateLimitUser: vi.fn(),
  applyRateLimitPublic: vi.fn(),
  countDocuments: vi.fn(),
  exists: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/security/auth', () => ({
  requireSession: mocks.requireUser,
  requireUser: mocks.requireUser,
  assertSameOriginOrReject: mocks.assertSameOriginOrReject,
  requireAdmin: vi.fn(),
  requireOwner: vi.fn(),
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
    listWrite: { maxRequests: 20, windowMs: 60_000, prefix: 'list-write' },
  },
}));

vi.mock('@/lib/models/FavoritesModel', () => ({
  FavoritesModel: {
    countDocuments: mocks.countDocuments,
    exists: mocks.exists,
    findOneAndUpdate: mocks.findOneAndUpdate,
    deleteOne: mocks.deleteOne,
  },
}));

vi.mock('@/lib/models/WatchlistModel', () => ({
  WatchlistModel: {
    countDocuments: mocks.countDocuments,
    exists: mocks.exists,
    findOneAndUpdate: mocks.findOneAndUpdate,
    deleteOne: mocks.deleteOne,
  },
}));

const sessionUser = {
  id: '507f1f77bcf86cd799439011',
  email: 'test@example.com',
  role: 'user',
};

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    itemId: 603,
    type: 'movie',
    title: 'The Matrix',
    ...overrides,
  };
}

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('M-05: favorites list rate limiting and capacity cap', () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.requireUser.mockReset();
    mocks.requireUser.mockResolvedValue({ ok: true, user: sessionUser });
    mocks.assertSameOriginOrReject.mockReset().mockReturnValue(null);
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.applyRateLimitPublic.mockReset().mockResolvedValue(null);
    mocks.countDocuments.mockReset().mockResolvedValue(0);
    mocks.exists.mockReset().mockResolvedValue(null);
    // Real mongoose-8 shape: a plain hydrated document (no raw-result wrapper).
    mocks.findOneAndUpdate.mockReset().mockResolvedValue({ _id: 'x', userId: sessionUser.email, itemId: 603, type: 'movie', title: 'The Matrix' });
    mocks.deleteOne.mockReset().mockResolvedValue({ deletedCount: 1 });
  });

  it('returns 429 when the per-user write rate limit denies the request', async () => {
    const denied = new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
    });
    mocks.applyRateLimitUser.mockResolvedValue(denied);

    const { POST } = await import('@/app/api/favorites/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/favorites', validItem()));

    expect(res.status).toBe(429);
    // Rate limit runs before any database write.
    expect(mocks.countDocuments).not.toHaveBeenCalled();
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('applies the listWrite rate limit config to POST', async () => {
    const { POST } = await import('@/app/api/favorites/route.ts');
    await POST(makePostRequest('http://localhost/api/favorites', validItem()));
    expect(mocks.applyRateLimitUser).toHaveBeenCalledTimes(1);
    const [, , config] = mocks.applyRateLimitUser.mock.calls[0];
    expect(config.maxRequests).toBe(20);
  });

  it('rejects the 501st distinct item with 400 before findOneAndUpdate (cap = 500)', async () => {
    mocks.countDocuments.mockResolvedValue(500);
    mocks.exists.mockResolvedValue(null); // item not already present

    const { POST } = await import('@/app/api/favorites/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/favorites', validItem()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('500');
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('allows re-adding an existing item when the list is at the cap (no new row)', async () => {
    mocks.countDocuments.mockResolvedValue(500);
    mocks.exists.mockResolvedValue({}); // item already present => upsert only
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'x', userId: sessionUser.email, itemId: 603, type: 'movie', title: 'The Matrix' });

    const { POST } = await import('@/app/api/favorites/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/favorites', validItem()));

    expect(res.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalled();
  });

  // (a) New item whose insert lands the count exactly at the cap (499 -> 500):
  // real mongoose-8 document-shape mock; success + no rollback delete.
  it('new item with count 499 -> 500: 200 and deleteOne NOT called (doc-shape mock)', async () => {
    mocks.countDocuments
      .mockResolvedValueOnce(499) // pre-check passes
      .mockResolvedValueOnce(500); // post-check exactly at cap
    mocks.exists.mockResolvedValue(null);
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'new-id', userId: sessionUser.email, itemId: 603, type: 'movie', title: 'The Matrix' });

    const { POST } = await import('@/app/api/favorites/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/favorites', validItem()));

    expect(res.status).toBe(200);
    expect(mocks.deleteOne).not.toHaveBeenCalled();
  });

  // (b) New item whose insert overshoots the cap (499 -> 501): the overshooting
  // insert is rolled back exactly once and the request is rejected.
  it('new item with count 499 -> 501: 400 and deleteOne({_id: new-id}) exactly once', async () => {
    mocks.countDocuments
      .mockResolvedValueOnce(499) // pre-check passes
      .mockResolvedValueOnce(501); // post-check overshoot
    mocks.exists.mockResolvedValue(null);
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'new-id', userId: sessionUser.email, itemId: 603, type: 'movie', title: 'The Matrix' });

    const { POST } = await import('@/app/api/favorites/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/favorites', validItem()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('500');
    expect(mocks.deleteOne).toHaveBeenCalledTimes(1);
    expect(mocks.deleteOne).toHaveBeenCalledWith({ _id: 'new-id' });
  });

  // (c) Re-add at the cap: exists=true short-circuits the rollback gate.
  it('re-add of existing item at cap: 200 and deleteOne never called', async () => {
    mocks.countDocuments.mockResolvedValue(500);
    mocks.exists.mockResolvedValue({});
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'existing-id', userId: sessionUser.email, itemId: 603, type: 'movie', title: 'The Matrix' });

    const { POST } = await import('@/app/api/favorites/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/favorites', validItem()));

    expect(res.status).toBe(200);
    expect(mocks.deleteOne).not.toHaveBeenCalled();
  });

  // (d) Serialization guard: with the real document-shape mock the response must
  // resolve to an object carrying the doc's itemId — makes the
  // Response.json(undefined) class regression impossible on this route.
  it('serialization guard: 200 body is the doc carrying its itemId (doc-shape mock)', async () => {
    mocks.countDocuments.mockResolvedValue(10);
    mocks.exists.mockResolvedValue(null);
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'new-id', userId: sessionUser.email, itemId: 603, type: 'movie', title: 'The Matrix' });

    const { POST } = await import('@/app/api/favorites/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/favorites', validItem()));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
    expect(body.itemId).toBe(603);
  });

  it('allows adding when below the cap', async () => {
    mocks.countDocuments.mockResolvedValue(10);
    mocks.exists.mockResolvedValue(null);
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'y', userId: sessionUser.email, itemId: 603, type: 'movie', title: 'The Matrix' });

    const { POST } = await import('@/app/api/favorites/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/favorites', validItem()));

    expect(res.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalled();
  });

  it('rolls back the overshooting insert: new item + count 499 -> 501 -> 400 and deleteOne with inserted _id', async () => {
    // Race path: pre-check passes (count measured below cap), upsert inserts,
    // post-check sees 501 -> rollback of exactly that insert.
    mocks.countDocuments
      .mockResolvedValueOnce(499) // pre-check passes
      .mockResolvedValueOnce(501); // post-check overshoot
    mocks.exists.mockResolvedValue(null);
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'new-id', userId: sessionUser.email, itemId: 603, type: 'movie', title: 'The Matrix' });

    const { POST } = await import('@/app/api/favorites/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/favorites', validItem()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('500');
    expect(mocks.deleteOne).toHaveBeenCalledWith({ _id: 'new-id' });
  });

  it('never deletes on the re-add path: exists true + count 501 -> 200 and deleteOne NOT called', async () => {
    // Re-add of an already-present item is never rolled back, even if the
    // post-count somehow reports over the cap (it cannot grow — no new row).
    mocks.countDocuments
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(501);
    mocks.exists.mockResolvedValue({});
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'existing-id', userId: sessionUser.email, itemId: 603, type: 'movie', title: 'The Matrix' });

    const { POST } = await import('@/app/api/favorites/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/favorites', validItem()));

    expect(res.status).toBe(200);
    expect(mocks.deleteOne).not.toHaveBeenCalled();
  });
});

describe('list-write route source contract (mongoose-8 shape)', () => {
  it('favorites + watchlist routes contain no raw-result wrapper option or keys', () => {
    const favorites = readFileSync(resolve(process.cwd(), 'app/api/favorites/route.ts'), 'utf8');
    const watchlist = readFileSync(resolve(process.cwd(), 'app/api/watchlist/route.ts'), 'utf8');
    // `includeRawResult` (mongoose<=6 name, silently ignored by 8.x) and
    // `lastErrorObject` (raw-result wrapper key) must be gone from both routes.
    expect(favorites).not.toContain('includeRawResult');
    expect(favorites).not.toContain('lastErrorObject');
    expect(watchlist).not.toContain('includeRawResult');
    expect(watchlist).not.toContain('lastErrorObject');
  });
});

describe('M-05: watchlist list capacity cap', () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.requireUser.mockReset();
    mocks.requireUser.mockResolvedValue({ ok: true, user: sessionUser });
    mocks.assertSameOriginOrReject.mockReset().mockReturnValue(null);
    mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
    mocks.countDocuments.mockReset().mockResolvedValue(500);
    mocks.exists.mockReset().mockResolvedValue(null);
    // Real mongoose-8 shape: a plain hydrated document (no raw-result wrapper).
    mocks.findOneAndUpdate.mockReset().mockResolvedValue({ _id: 'x', userId: sessionUser.email, itemId: 603, type: 'movie', title: 'The Matrix' });
    mocks.deleteOne.mockReset().mockResolvedValue({ deletedCount: 1 });
  });

  it('rejects the 501st distinct watchlist item with 400 before findOneAndUpdate', async () => {
    const { POST } = await import('@/app/api/watchlist/route.ts');
    const res = await POST(makePostRequest('http://localhost/api/watchlist', validItem()));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('500');
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('applies the listWrite rate limit config to watchlist POST', async () => {
    mocks.countDocuments.mockResolvedValue(0);
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'y', userId: sessionUser.email, itemId: 603, type: 'movie', title: 'The Matrix' });

    const { POST } = await import('@/app/api/watchlist/route.ts');
    await POST(makePostRequest('http://localhost/api/watchlist', validItem()));

    expect(mocks.applyRateLimitUser).toHaveBeenCalledTimes(1);
    const [, , config] = mocks.applyRateLimitUser.mock.calls[0];
    expect(config.maxRequests).toBe(20);
  });
});
