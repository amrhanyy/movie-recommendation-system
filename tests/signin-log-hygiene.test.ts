import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  userCreate: vi.fn(),
  connectToMongoDB: vi.fn(),
}));

vi.mock('@/lib/models/User', () => ({
  User: { findOne: mocks.userFindOne, create: mocks.userCreate },
}));

vi.mock('@/lib/mongodb', () => ({
  default: mocks.connectToMongoDB,
}));

describe('W1-012: sign-in failure log carries no email', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.userFindOne.mockReset();
    mocks.userCreate.mockReset();
    mocks.connectToMongoDB.mockReset().mockResolvedValue({});
  });

  it('no email reaches the logger on DB failure', async () => {
    mocks.connectToMongoDB.mockRejectedValueOnce(new Error('mongo down'));
    const lines: string[] = [];
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      lines.push(a.map(String).join(' '));
    });
    try {
      const { authOptions } = await import('@/lib/auth');
      const signIn = authOptions.callbacks?.signIn;
      if (!signIn) throw new Error('signIn callback missing');
      const ok = await signIn({
        user: { email: 'victim@example.com' },
      } as never);
      expect(ok).toBe(false);
    } finally {
      errSpy.mockRestore();
    }
    const joined = lines.join('\n');
    expect(joined).not.toContain('victim@example.com');
    expect(joined).toContain('Sign-in error');
  });
});
