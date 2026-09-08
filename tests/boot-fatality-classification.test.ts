import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * STEP 0-A: boot fatality classification.
 * (i) redis-only failure => register() RESOLVES + warn ops event + boot-state misconfigured.
 * (ii) missing MONGODB_URI => still throws. (iii) mixed => throws (core wins).
 */

vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    runtimeEnv: vi.fn(),
    isCoreConfigReady: vi.fn(() => true),
  };
});

vi.mock('@/lib/operational-log', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/operational-log')>();
  return {
    ...actual,
    logOperationalEvent: vi.fn(),
  };
});

vi.mock('mongoose', () => ({
  default: {
    connection: {
      get readyState() {
        return 1;
      },
      db: { admin: () => ({ ping: async () => ({ ok: 1 }) }) },
    },
  },
}));

const { runtimeEnv } = await import('@/lib/env');
const ops = await import('@/lib/operational-log');

function prodBoot() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
}

describe('boot fatality classification', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    const { setBootRedisState } = await import('@/lib/boot-state');
    setBootRedisState('ok');
  });

  it('(i) redis-only failure resolves with warn event + misconfigured state', async () => {
    prodBoot();
    vi.mocked(runtimeEnv).mockReturnValue({
      parsed: null,
      errors: [{ name: 'REDIS_URL', issue: 'redis configuration is contradictory or invalid' }],
    });
    const { register } = await import('@/instrumentation');
    await expect(register()).resolves.toBeUndefined();
    const { getBootRedisState } = await import('@/lib/boot-state');
    expect(getBootRedisState()).toBe('misconfigured');
    const logged = vi.mocked(ops.logOperationalEvent).mock.calls.map((c) => c[0]);
    expect(logged.length).toBe(1);
    expect(logged[0].event).toBe('health.readiness');
    expect(logged[0].status).toBe('warn');
    expect(logged[0].meta).toMatchObject({ redis: 'misconfigured', fallback: 'memory' });

    // ready reports redis misconfigured without downgrading overall status.
    const { GET } = await import('@/app/api/health/ready/route');
    const res = await GET(new NextRequest('http://localhost/api/health/ready'));
    const body = await res.json();
    expect(body.components.redis).toBe('misconfigured');
    expect(res.status).toBe(200);
    expect(body.status).toBe('ready');
  });

  it('(ii) missing MONGODB_URI still throws', async () => {
    prodBoot();
    vi.mocked(runtimeEnv).mockReturnValue({
      parsed: null,
      errors: [{ name: 'MONGODB_URI', issue: 'required database variable is missing or empty' }],
    });
    const { register } = await import('@/instrumentation');
    await expect(register()).rejects.toThrow('Boot environment validation failed');
  });

  it('(iii) redis error + missing MONGODB_URI throws (core wins)', async () => {
    prodBoot();
    vi.mocked(runtimeEnv).mockReturnValue({
      parsed: null,
      errors: [
        { name: 'REDIS_URL', issue: 'redis configuration is contradictory or invalid' },
        { name: 'MONGODB_URI', issue: 'required database variable is missing or empty' },
      ],
    });
    const { register } = await import('@/instrumentation');
    await expect(register()).rejects.toThrow('Boot environment validation failed');
    expect(vi.mocked(ops.logOperationalEvent)).not.toHaveBeenCalled();
  });
});
