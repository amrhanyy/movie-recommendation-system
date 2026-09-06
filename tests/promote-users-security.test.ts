import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installGlobalFetch } from './helpers';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  requireOwner: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
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

vi.mock('@/lib/models/User', () => ({
  User: { findOne: mocks.findOne, create: mocks.create },
}));

function denied(status: number, error: string) {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error }), { status }),
  };
}

describe('POST /api/admin/promote (F-002/F-051)', () => {
  installGlobalFetch();

  beforeEach(() => {
    mocks.requireSession.mockReset();
    mocks.requireUser.mockReset();
    mocks.requireAdmin.mockReset();
    mocks.requireOwner.mockReset();
    mocks.findOne.mockReset();
    mocks.create.mockReset();
  });

  it('returns 404 for POST', async () => {
    const { POST } = await import('@/app/api/admin/promote/route.ts');
    const res = await POST();
    expect(res.status).toBe(404);
  });

  it('returns 404 for GET', async () => {
    const { GET } = await import('@/app/api/admin/promote/route.ts');
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('does not reveal an owner email and performs no DB query', async () => {
    mocks.findOne.mockResolvedValue({ role: 'owner', email: 'owner@example.com' });
    const { POST } = await import('@/app/api/admin/promote/route.ts');
    const res = await POST();
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/@/);
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
});

describe('POST /api/users (F-004)', () => {
  installGlobalFetch();

  beforeEach(() => {
    mocks.requireSession.mockReset();
    mocks.requireUser.mockReset();
    mocks.requireAdmin.mockReset();
    mocks.requireOwner.mockReset();
    mocks.create.mockReset();
  });

  it('unauthenticated caller cannot create a user', async () => {
    mocks.requireOwner.mockResolvedValue(denied(401, 'Authentication required'));
    vi.resetModules();
    const { POST } = await import('@/app/api/users/route.ts');
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('normal user is denied (403)', async () => {
    mocks.requireOwner.mockResolvedValue(denied(403, 'Forbidden: owner access required'));
    vi.resetModules();
    const { POST } = await import('@/app/api/users/route.ts');
    const res = await POST();
    expect(res.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('owner receives intentional disabled response and no create occurs', async () => {
    mocks.requireOwner.mockResolvedValue({
      ok: true,
      user: { id: 'owner-id', email: 'owner@example.com', role: 'owner' },
    });
    vi.resetModules();
    const { POST } = await import('@/app/api/users/route.ts');
    const res = await POST();
    expect(res.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});