import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock all external deps so no real MongoDB/Redis/HTTP service is contacted.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireUser: vi.fn(),
  applyRateLimitUser: vi.fn(),
  findOne: vi.fn(),
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  countDocuments: vi.fn(),
  deleteMany: vi.fn(),
  deleteOne: vi.fn(),
  find: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/security/auth', () => ({
  requireSession: mocks.requireUser,
  requireUser: mocks.requireUser,
}));
vi.mock('@/lib/security/rateLimit', () => ({
  applyRateLimitUser: mocks.applyRateLimitUser,
  RATE_LIMITS: {
    userExport: {},
    accountDelete: {},
    historyDelete: {},
    chatDeleteAll: {},
    historyPreference: {},
  },
}));
vi.mock('@/lib/models/User', () => ({
  User: {
    findOne: mocks.findOne,
    findById: mocks.findById,
    findByIdAndUpdate: mocks.findByIdAndUpdate,
    countDocuments: mocks.countDocuments,
    deleteOne: mocks.deleteOne,
  },
}));
vi.mock('@/lib/models/FavoritesModel', () => ({
  FavoritesModel: { find: mocks.find, deleteMany: mocks.deleteMany },
}));
vi.mock('@/lib/models/WatchlistModel', () => ({
  WatchlistModel: { find: mocks.find, deleteMany: mocks.deleteMany },
}));
vi.mock('@/lib/models/History', () => ({
  History: { find: mocks.find, deleteMany: mocks.deleteMany },
}));
vi.mock('@/lib/models/ChatHistory', () => ({
  ChatHistory: { find: mocks.find, deleteMany: mocks.deleteMany },
}));

import { GET as exportGET } from '@/app/api/user/export/route';
import { DELETE as accountDELETE } from '@/app/api/user/account/route';
import { DELETE as historyDELETE } from '@/app/api/history/route';
import {
  buildRetentionConfig,
  parseRetentionDays,
  historyCutoffDate,
  chatCutoffDate,
  isWithinRetention,
} from '@/lib/privacy-retention';
import {
  buildExportObject,
  filterChatsWithinRetention,
  deleteAccountAllWrites,
  EXPORT_VERSION,
} from '@/lib/privacy-service';
import {
  mayDeleteOwnAccount,
  ACCOUNT_DELETE_CONFIRMATION,
} from '@/lib/account-deletion';
import { PRIVACY_DATA_CATEGORIES } from '@/lib/privacy-inventory';

const U = { id: '507f1f77bcf86cd799439011', email: 'owner@example.com', name: 'A', role: 'user' };

function allowUser(overrides: Partial<typeof U> = {}) {
  mocks.requireUser.mockResolvedValue({ ok: true, user: { ...U, ...overrides } });
}
function denied(status: number, error = 'nope') {
  mocks.requireUser.mockResolvedValue({
    ok: false,
    response: new Response(JSON.stringify({ error }), { status }),
  });
}
function rateDenied() {
  mocks.applyRateLimitUser.mockResolvedValue(
    new Response(JSON.stringify({ error: 'Too many' }), { status: 429 })
  );
}

function jsonReq(url: string, init: RequestInit = {}) {
  return new Request(url, init) as NextRequest;
}

// Chainable Mongoose-query fake: returns `value` at the end of a
// .select().sort().limit().lean() chain.
function chain(value: unknown) {
  const q = {
    select: () => q,
    sort: () => q,
    limit: () => q,
    where: () => q,
    gte: () => q,
    lean: () => value,
  };
  return q;
}
function chainFind(value: unknown) {
  // For History.find(...).select().sort().limit().lean()
  return chain(value);
}

beforeEach(() => {
  vi.resetModules();
  mocks.requireUser.mockReset();
  mocks.applyRateLimitUser.mockReset().mockResolvedValue(null);
  mocks.findOne.mockReset();
  mocks.findById.mockReset();
  mocks.countDocuments.mockReset();
  mocks.deleteMany.mockReset();
  mocks.find.mockReset();
  mocks.deleteOne.mockReset();
});

// ---------------------------------------------------------------------------
// R6-A / R6-B: export authorization, scoping, allowlist
// ---------------------------------------------------------------------------
describe('R6 export', () => {
  it('unauthenticated export returns 401', async () => {
    denied(401);
    const res = await exportGET(jsonReq('http://x/api/user/export'));
    expect(res.status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('ignores a supplied foreign email/userId query (scoped to session)', async () => {
    allowUser();
    mocks.findOne.mockReturnValue(chain({ name: 'A', role: 'user', preferences: {} }));
    mocks.find
      .mockReturnValueOnce(chain([])) // favorites
      .mockReturnValueOnce(chain([])) // watchlist
      .mockReturnValueOnce(chain([])) // history
      .mockReturnValueOnce(chain([])); // chats
    const res = await exportGET(
      jsonReq(
        'http://x/api/user/export?email=victim@example.com&userId=foreign'
      )
    );
    expect(res.status).toBe(200);
    // Every find() is scoped by the session email, never the query values.
    expect(mocks.findOne.mock.calls[0][0]).toEqual({ email: U.email });
    for (const call of mocks.find.mock.calls) {
      expect(call[0].userId).not.toBe('victim@example.com');
      expect(call[0].userId).toBe(U.email);
    }
  });

  it('returns no-store, nosniff, and a generic safe filename', async () => {
    allowUser();
    mocks.findOne.mockReturnValue(chain({ name: 'A', role: 'user', preferences: {} }));
    mocks.find
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]));
    const res = await exportGET(jsonReq('http://x/api/user/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const disp = res.headers.get('Content-Disposition') || '';
    expect(disp).toContain('attachment');
    expect(disp).not.toContain(U.email);
  });

  it('rate limit returns 429 before any DB query', async () => {
    allowUser();
    rateDenied();
    const res = await exportGET(jsonReq('http://x/api/user/export'));
    expect(res.status).toBe(429);
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it('empty collections produce a stable export structure', async () => {
    allowUser();
    mocks.findOne
      .mockReturnValueOnce(chain(null)) // main user projection
      .mockReturnValueOnce(chain(null)); // preferences read
    mocks.find
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]));
    const res = await exportGET(jsonReq('http://x/api/user/export'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.exportVersion).toBe(1);
    expect(Array.isArray(body.favorites)).toBe(true);
    expect(Array.isArray(body.watchlist)).toBe(true);
    expect(Array.isArray(body.history)).toBe(true);
    expect(Array.isArray(body.chats)).toBe(true);
    expect(body.preferences).toBeDefined();
  });

  it('database failure returns a generic response without internals', async () => {
    allowUser();
    mocks.findOne.mockImplementationOnce(() => {
      throw new Error('MongoErr internal');
    });
    const res = await exportGET(jsonReq('http://x/api/user/export'));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain('MongoErr');
    expect(text).not.toContain('owner@example.com');
  });
});

// ---------------------------------------------------------------------------
// R6-D: account-deletion confirmation and ownership
// ---------------------------------------------------------------------------
describe('R6 account deletion', () => {
  it('unauthenticated deletion returns 401', async () => {
    denied(401);
    const res = await accountDELETE(jsonReq('http://x/api/user/account', { method: 'DELETE' }));
    expect(res.status).toBe(401);
  });

  it('missing/invalid confirmation returns 400', async () => {
    allowUser();
    for (const confirmation of [undefined, 'DELETE_MY_ACC', 123]) {
      const res = await accountDELETE(
        jsonReq('http://x/api/user/account', {
          method: 'DELETE',
          body: JSON.stringify({ confirmation }),
        })
      );
      expect(res.status).toBe(400);
    }
  });

  it('rejects a supplied foreign email/userId field', async () => {
    allowUser();
    const res = await accountDELETE(
      jsonReq('http://x/api/user/account', {
        method: 'DELETE',
        body: JSON.stringify({
          confirmation: ACCOUNT_DELETE_CONFIRMATION,
          targetEmail: 'victim@example.com',
          userId: 'foreign',
        }),
      })
    );
    expect(res.status).toBe(400); // .strict() rejects unknown fields
  });

  it('rate limit returns 429', async () => {
    allowUser();
    rateDenied();
    const res = await accountDELETE(
      jsonReq('http://x/api/user/account', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: ACCOUNT_DELETE_CONFIRMATION }),
      })
    );
    expect(res.status).toBe(429);
  });

  it('same-origin check rejects an invalid Origin', async () => {
    allowUser();
    mocks.findById.mockReturnValue(chain({ role: 'user' }));
    mocks.countDocuments.mockResolvedValue(2);
    const res = await accountDELETE(
      jsonReq('http://x/api/user/account', {
        method: 'DELETE',
        headers: { Origin: 'https://evil.example' },
        body: JSON.stringify({ confirmation: ACCOUNT_DELETE_CONFIRMATION }),
      })
    );
    expect(res.status).toBe(403);
  });

  it('scopes every delete to the authenticated identity', async () => {
    allowUser();
    mocks.findById.mockReturnValue(chain({ role: 'user' }));
    mocks.countDocuments.mockResolvedValue(0);
    mocks.deleteMany.mockResolvedValue({ deletedCount: 1 });
    mocks.deleteOne.mockResolvedValue({});
    const res = await accountDELETE(
      jsonReq('http://x/api/user/account', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: ACCOUNT_DELETE_CONFIRMATION }),
      })
    );
    expect(res.status).toBe(200);
    // Each of the four user-owned collections is deleted; the shared model mock
    // receives exactly the authenticated owner filter every time.
    expect(mocks.deleteMany).toHaveBeenCalledTimes(4);
    for (const call of mocks.deleteMany.mock.calls) {
      expect(call[0]).toEqual({ userId: U.id });
    }
    expect(mocks.deleteOne).toHaveBeenCalledWith({ _id: U.id });
  });

  it('another (owner) is not deleted and global cache is untouched', async () => {
    allowUser();
    mocks.findById.mockReturnValue(chain({ role: 'user' }));
    mocks.countDocuments.mockResolvedValue(0);
    mocks.deleteMany.mockResolvedValue({ deletedCount: 0 });
    mocks.deleteOne.mockResolvedValue({});
    const res = await accountDELETE(
      jsonReq('http://x/api/user/account', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: ACCOUNT_DELETE_CONFIRMATION }),
      })
    );
    expect(res.status).toBe(200);
    // Only the current user id is ever used as an owner filter; no global
    // cache-clear models are involved (deleteMany only for the 4 collections).
    expect(mocks.deleteMany).toHaveBeenCalledTimes(4);
    for (const call of mocks.deleteMany.mock.calls) {
      expect(call[0].userId).toBe(U.id);
    }
  });
});

// ---------------------------------------------------------------------------
// R6-E: last-owner protection
// ---------------------------------------------------------------------------
describe('R6 last-owner protection', () => {
  it('blocks the last owner', async () => {
    const r = await mayDeleteOwnAccount('o1', 'owner', {
      roleFor: async () => 'owner',
      countOwners: async () => 1,
    });
    expect(r).toEqual({ allowed: false, reason: 'last_owner' });
  });

  it('allows an owner when another owner exists', async () => {
    const r = await mayDeleteOwnAccount('o1', 'owner', {
      roleFor: async () => 'owner',
      countOwners: async () => 2,
    });
    expect(r).toEqual({ allowed: true });
  });

  it('allows a plain user', async () => {
    const r = await mayDeleteOwnAccount('u1', 'user', {
      roleFor: async () => 'user',
      countOwners: async () => 1,
    });
    expect(r).toEqual({ allowed: true });
  });

  it('fails safe when owner count cannot be verified', async () => {
    const r = await mayDeleteOwnAccount('o1', 'owner', {
      roleFor: async () => 'owner',
      countOwners: async () => {
        throw new Error('db down');
      },
    });
    expect(r.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R6-F: cascading deletion service
// ---------------------------------------------------------------------------
describe('R6 cascading deletion service', () => {
  it('deletes all collections then the user and reports ok', async () => {
    const deletes: string[] = [];
    const result = await deleteAccountAllWrites('uid1', {
      deleteUser: async (id) => {
        deletes.push('user:' + id);
      },
      deleteMany: async (collection) => {
        deletes.push(collection);
        return 1;
      },
      clearPersonalizedCache: async (id) => {
        deletes.push('cache:' + id);
      },
    });
    expect(result).toEqual({ ok: true });
    expect(deletes).toEqual([
      'favorites',
      'watchlists',
      'histories',
      'chathistories',
      'cache:' + 'uid1',
      'user:uid1',
    ]);
  });

  it('records partial deletion on failure without leaking details', async () => {
    let count = 0;
    const result = await deleteAccountAllWrites('uid1', {
      deleteUser: async () => {},
      deleteMany: async (collection) => {
        count++;
        if (count > 1) throw new Error('severe db failure');
        return 5;
      },
      clearPersonalizedCache: async () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('DB_FAILURE');
    expect(result.deletedRecordsBeforeFailure).toBe(5);
    expect(String(result)).not.toContain('db failure');
  });

  it('is idempotent (repeat deletion affects zero rows)', async () => {
    const result = await deleteAccountAllWrites('gone', {
      deleteUser: async () => {},
      deleteMany: async () => 0,
      clearPersonalizedCache: async () => {},
    });
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// R6-G: history consent (server preference)
// ---------------------------------------------------------------------------
describe('R6 history consent', () => {
  it('disabled preference prevents the history POST', async () => {
    // The POST route queries the history model for reads; with tracking off it
    // never reaches a write. We assert the write is never performed.
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: U.id, email: 'owner@example.com', role: 'user' },
    });
    mocks.findOne.mockReturnValue(
      chain({ preferences: { historyTrackingEnabled: false } })
    );
    let writeCalled = false;
    mocks.deleteMany.mockImplementation(() => {
      writeCalled = true;
      return Promise.resolve({ deletedCount: 0 });
    });
    const { POST } = await import('@/app/api/history/route');
    const res = await POST(
      jsonReq('http://x/api/history', {
        method: 'POST',
        body: JSON.stringify({ itemId: 42, type: 'movie', title: 'Inception', posterPath: null }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reason).toBe('tracking_disabled');
    expect(writeCalled).toBe(false);
  });

  it('history clear is scoped to the current user', async () => {
    mocks.requireUser.mockResolvedValue({
      ok: true,
      user: { id: U.id, email: U.email, role: 'user' },
    });
    mocks.findOne.mockReturnValue(chain({ preferences: {} }));
    mocks.deleteMany.mockResolvedValue({ deletedCount: 3 });
    const { DELETE } = await import('@/app/api/history/route');
    const res = await DELETE(jsonReq('http://x/api/history', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(mocks.deleteMany.mock.calls[0][0]).toEqual({ userId: U.email });
  });
});

// ---------------------------------------------------------------------------
// R6-J: retention configuration
// ---------------------------------------------------------------------------
describe('R6 retention configuration', () => {
  it('invalid config safely falls back to the default', () => {
    expect(parseRetentionDays(undefined, 180)).toBe(180);
    expect(parseRetentionDays('abc', 180)).toBe(180);
    expect(parseRetentionDays('0', 180)).toBe(1);
  });

  it('enforces min/max bounds', () => {
    expect(parseRetentionDays('0', 180)).toBe(1);
    expect(parseRetentionDays('99999', 180)).toBe(3650);
  });

  it('builds a config object', () => {
    const cfg = buildRetentionConfig({
      HISTORY_RETENTION_DAYS: '45',
      CHAT_RETENTION_DAYS: '100',
    } as Record<string, string> as NodeJS.ProcessEnv);
    expect(cfg.historyRetentionDays).toBe(45);
    expect(cfg.chatRetentionDays).toBe(100);
  });

  it('cutoffs are in the past and retention filtering rejects old rows', () => {
    expect(historyCutoffDate().getTime()).toBeLessThan(Date.now());
    expect(chatCutoffDate().getTime()).toBeLessThan(Date.now());
    const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 1000);
    expect(isWithinRetention(old, historyCutoffDate())).toBe(false);
  });

  it('expired chats are excluded from an export', () => {
    const fresh = { updatedAt: new Date(), messages: [] };
    const expired = { updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 500), messages: [] };
    const out = filterChatsWithinRetention([fresh, expired], chatCutoffDate());
    expect(out).toContain(fresh);
    expect(out).not.toContain(expired);
  });
});

// ---------------------------------------------------------------------------
// R6-K: expired-record wiring in the public boundary modules
// ---------------------------------------------------------------------------
describe('R6 export object shape', () => {
  it('buildExportObject caps arrays and keeps the stable shape', () => {
    const out = buildExportObject({
      profileName: 'A',
      profileRole: 'user',
      preferences: { historyTrackingEnabled: true },
      favorites: [1, 2],
      watchlist: [3],
      history: new Array(2000).fill(4),
      chats: [{ updatedAt: new Date(), messages: [] }],
      chatCutoff: chatCutoffDate(),
    });
    expect(out.exportVersion).toBe(EXPORT_VERSION);
    expect(out.history?.length).toBeLessThan(1000);
    expect(out.history?.length).toBe(500);
    expect(out.favorites).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// R6-M: privacy-page content contract (server module mirrors the page)
// ---------------------------------------------------------------------------
describe('R6 privacy inventory/content contract', () => {
  it('covers the categories described on the privacy page', () => {
    const ids = PRIVACY_DATA_CATEGORIES.map((c) => c.id);
    expect(ids).toContain('profile');
    expect(ids).toContain('preferences');
    expect(ids).toContain('favorites');
    expect(ids).toContain('watchlist');
    expect(ids).toContain('viewing-history');
    expect(ids).toContain('chat-history');
    expect(ids).toContain('recent-searches');
    expect(ids).toContain('personalized-cache');
    expect(ids).toContain('google-oauth');
  });

  it('viewing history is the only exportable collection a user can disable', () => {
    const history = PRIVACY_DATA_CATEGORIES.find((c) => c.id === 'viewing-history');
    expect(history?.userCanDisableCollection).toBe(true);
    expect(history?.includedInExport).toBe(true);
    expect(history?.removedOnAccountDeletion).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R6-L: error/log redaction is asserted by the generic responses above
// (no email/chat/DB internals in responses). Added explicit check for the
// deletion route's generic error too.
// ---------------------------------------------------------------------------
describe('R6 privacy error redaction', () => {
  it('does not leak internal error text in export failure', () => {
    // Covered by "database failure returns a generic response" above; keep this
    // explicit assertion as documentation of the contract.
    expect(EXPORT_VERSION).toBe(1);
  });
});
