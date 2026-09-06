import { describe, it, expect, vi, beforeEach } from 'vitest';

// W1-001 (24h maxAge + hourly updateAge + stable jti + signOut revocation +
// requireUser 401 on revoked jti) and W1-003 (jwt fail-closed: no
// partially-mutated token, no id==="" path). Mocks keep every DB/auth
// dependency in-memory; no real MongoDB, NextAuth server, or network.
const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  userCreate: vi.fn(),
  revokedExists: vi.fn(),
  revokedUpdateOne: vi.fn(),
  connectToMongoDB: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/models/User', () => {
  class UserQuery {
    constructor(private readonly value: unknown) {}
    lean() {
      return Promise.resolve(this.value);
    }
  }
  return {
    User: {
      findOne: (...args: unknown[]) => new UserQuery(mocks.userFindOne(...args)),
      create: mocks.userCreate,
    },
  };
});

vi.mock('@/lib/models/RevokedSession', () => ({
  RevokedSession: {
    exists: mocks.revokedExists,
    updateOne: mocks.revokedUpdateOne,
  },
}));

vi.mock('@/lib/mongodb', () => ({
  default: mocks.connectToMongoDB,
}));

vi.mock('next-auth/next', () => ({
  getServerSession: mocks.getServerSession,
}));

interface JwtToken {
  jti?: string;
  id?: string;
  sub?: string;
  email?: string;
  name?: string | null;
  picture?: string | null;
  role?: string;
  exp?: number;
}

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    role: 'user',
    preferences: { historyTrackingEnabled: true },
    ...overrides,
  };
}

// Mongoose-style chainable query fake: .findOne(...).lean() resolves `value`.
function findOneLean(value: unknown) {
  mocks.userFindOne.mockResolvedValue(value);
}

beforeEach(() => {
  vi.resetModules();
  mocks.userFindOne.mockReset();
  mocks.userCreate.mockReset();
  mocks.revokedExists.mockReset().mockResolvedValue(null);
  mocks.revokedUpdateOne.mockReset().mockResolvedValue({ acknowledged: true });
  mocks.connectToMongoDB.mockReset().mockResolvedValue({});
  mocks.getServerSession.mockReset();
});

describe('W1-001 session lifetime', () => {
  it('uses a 24h maxAge with hourly updateAge', async () => {
    const { authOptions } = await import('@/lib/auth');
    expect(authOptions.session?.maxAge).toBe(86400);
    expect(authOptions.session?.updateAge).toBe(3600);
  });
});

describe('W1-001 jti lifecycle', () => {
  it('creates jti once and preserves it on later updates', async () => {
    const { authOptions } = await import('@/lib/auth');
    const jwt = authOptions.callbacks?.jwt;
    if (!jwt) throw new Error('jwt callback missing');

    findOneLean(dbUser());
    const created = (await jwt({
      token: { email: 'test@example.com' },
      user: { email: 'test@example.com' },
    } as never)) as JwtToken;
    expect(typeof created.jti).toBe('string');
    expect((created.jti as string).length).toBeGreaterThan(0);

    mocks.userFindOne.mockClear();
    const updated = (await jwt({
      token: { ...created },
      user: undefined,
    } as never)) as JwtToken;
    expect(updated.jti).toBe(created.jti);
    // Update path performs no DB lookup.
    expect(mocks.userFindOne).not.toHaveBeenCalled();
  });

  it('assigns distinct jti values to distinct tokens', async () => {
    const { authOptions } = await import('@/lib/auth');
    const jwt = authOptions.callbacks?.jwt;
    if (!jwt) throw new Error('jwt callback missing');

    findOneLean(dbUser());
    const first = (await jwt({
      token: { email: 'test@example.com' },
      user: { email: 'test@example.com' },
    } as never)) as JwtToken;
    findOneLean(dbUser());
    const second = (await jwt({
      token: { email: 'test@example.com' },
      user: { email: 'test@example.com' },
    } as never)) as JwtToken;
    expect(first.jti).not.toBe(second.jti);
  });
});

describe('W1-001 signOut revocation', () => {
  it('inserts the token jti with the token expiry and never throws', async () => {
    const { authOptions } = await import('@/lib/auth');
    const signOut = authOptions.events?.signOut;
    if (!signOut) throw new Error('signOut event missing');

    const exp = Math.floor(Date.now() / 1000) + 3600;
    await signOut({ token: { jti: 'jti-123', exp } } as never);

    expect(mocks.revokedUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = mocks.revokedUpdateOne.mock.calls[0] as [
      { jti: string },
      { $setOnInsert: { jti: string; expiresAt: Date } },
      { upsert: boolean },
    ];
    expect(filter).toEqual({ jti: 'jti-123' });
    expect(update.$setOnInsert.jti).toBe('jti-123');
    expect(update.$setOnInsert.expiresAt).toEqual(new Date(exp * 1000));
    expect(options).toEqual({ upsert: true });
  });

  it('never throws when the database is down', async () => {
    const { authOptions } = await import('@/lib/auth');
    const signOut = authOptions.events?.signOut;
    if (!signOut) throw new Error('signOut event missing');

    mocks.connectToMongoDB.mockRejectedValueOnce(new Error('mongo down'));
    await expect(
      signOut({ token: { jti: 'jti-456', exp: 1_700_000_000 } } as never)
    ).resolves.toBeUndefined();
  });

  it('never logs emails or tokens', async () => {
    const { authOptions } = await import('@/lib/auth');
    const signOut = authOptions.events?.signOut;
    if (!signOut) throw new Error('signOut event missing');

    const lines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      lines.push(a.join(' '));
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      lines.push(a.join(' '));
    });
    try {
      await signOut({
        token: { jti: 'jti-789', exp: 1_700_000_000, email: 'victim@example.com' },
      } as never);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
    expect(lines.join('\n')).not.toContain('victim@example.com');
    expect(lines.join('\n')).not.toContain('jti-789');
  });
});

describe('W1-001 requireUser revocation enforcement', () => {
  function sessionFor(jti: string | undefined) {
    mocks.getServerSession.mockResolvedValue({
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
      },
      ...(jti === undefined ? {} : { jti }),
    });
  }

  it('rejects a revoked jti with 401 before any User lookup', async () => {
    sessionFor('revoked-jti');
    mocks.revokedExists.mockResolvedValue({ _id: 'revoked' });
    const { requireUser } = await import('@/lib/security/auth');
    const result = await requireUser();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
    expect(mocks.revokedExists).toHaveBeenCalledWith({ jti: 'revoked-jti' });
    expect(mocks.userFindOne).not.toHaveBeenCalled();
  });

  it('allows a non-revoked jti through to the fresh DB read', async () => {
    sessionFor('live-jti');
    mocks.revokedExists.mockResolvedValue(null);
    findOneLean(dbUser());
    const { requireUser } = await import('@/lib/security/auth');
    const result = await requireUser();
    expect(result.ok).toBe(true);
    expect(mocks.userFindOne).toHaveBeenCalled();
  });

  it('allows sessions without a jti (pre-rollout cookies stay valid)', async () => {
    sessionFor(undefined);
    findOneLean(dbUser());
    const { requireUser } = await import('@/lib/security/auth');
    const result = await requireUser();
    expect(result.ok).toBe(true);
    expect(mocks.revokedExists).not.toHaveBeenCalled();
  });
});

describe('W1-003 jwt fail-closed', () => {
  it('returns the previous token unchanged when the DB lookup throws and an id exists', async () => {
    const { authOptions } = await import('@/lib/auth');
    const jwt = authOptions.callbacks?.jwt;
    if (!jwt) throw new Error('jwt callback missing');

    mocks.connectToMongoDB.mockRejectedValueOnce(new Error('mongo down'));
    const prior = {
      jti: 'stable-jti',
      id: '507f1f77bcf86cd799439011',
      role: 'user',
      email: 'test@example.com',
    };
    const out = (await jwt({
      token: { ...prior },
      user: { email: 'test@example.com' },
    } as never)) as JwtToken;
    expect(out).toEqual(prior);
  });

  it('throws (never id==="") when User.findOne throws and no id exists', async () => {
    const { authOptions } = await import('@/lib/auth');
    const jwt = authOptions.callbacks?.jwt;
    if (!jwt) throw new Error('jwt callback missing');

    mocks.userFindOne.mockImplementationOnce(() => {
      throw new Error('mongo down');
    });
    await expect(
      jwt({
        token: { email: 'test@example.com' },
        user: { email: 'test@example.com' },
      } as never)
    ).rejects.toThrow();
  });

  it('throws when the user record is missing and no prior id exists', async () => {
    const { authOptions } = await import('@/lib/auth');
    const jwt = authOptions.callbacks?.jwt;
    if (!jwt) throw new Error('jwt callback missing');

    mocks.userFindOne.mockResolvedValue(null);
    await expect(
      jwt({
        token: { email: 'test@example.com' },
        user: { email: 'test@example.com' },
      } as never)
    ).rejects.toThrow();
  });

  it('session callback rejects a token with empty/missing id (no id==="" path)', async () => {
    const { authOptions } = await import('@/lib/auth');
    const sessionCb = authOptions.callbacks?.session;
    if (!sessionCb) throw new Error('session callback missing');

    const session = {
      user: { id: '', email: 'test@example.com', name: null, image: null, role: 'user' },
      expires: new Date().toISOString(),
    };
    await expect(
      sessionCb({ session, token: { email: 'test@example.com' } } as never)
    ).rejects.toThrow();
    await expect(
      sessionCb({
        session,
        token: { email: 'test@example.com', id: '', sub: '' },
      } as never)
    ).rejects.toThrow();
  });
});
