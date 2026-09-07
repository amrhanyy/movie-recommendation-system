import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  runtimeEnv: vi.fn(),
}));

const { runtimeEnv } = await import('@/lib/env');

describe('W1-013: Boot-time environment enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module to re-import instrumentation
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('does not enforce in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    const { register } = await import('@/instrumentation');
    
    // Should not throw in development
    await expect(register()).resolves.toBeUndefined();
  });

  it('does not enforce during build', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_RUNTIME', 'edge');

    const { register } = await import('@/instrumentation');
    
    // Should not throw during build (edge runtime)
    await expect(register()).resolves.toBeUndefined();
  });

  it('throws in production with invalid env', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    vi.mocked(runtimeEnv).mockReturnValue({
      parsed: null,
      errors: [
        { name: 'MONGODB_URI', issue: 'required database variable is missing' },
        { name: 'NEXTAUTH_SECRET', issue: 'required auth-secret variable is missing' },
      ],
    });

    const { register } = await import('@/instrumentation');
    
    await expect(register()).rejects.toThrow('Boot environment validation failed');
  });

  it('succeeds in test mode', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    vi.mocked(runtimeEnv).mockReturnValue({
      parsed: {
        NODE_ENV: 'test',
        HISTORY_RETENTION_DAYS: 180,
        CHAT_RETENTION_DAYS: 365,
        REDIS_TLS: false,
      },
      errors: [],
    });

    const { register } = await import('@/instrumentation');
    
    // Should not throw in test mode
    await expect(register()).resolves.toBeUndefined();
  });
});
