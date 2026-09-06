import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  validateEnv,
  isCoreConfigReady,
  MIN_SECRET_LENGTH,
} from '@/lib/env';
import {
  logOperationalEvent,
  buildOperationalEvent,
  safeCorrelationId,
  sanitizeMeta,
} from '@/lib/operational-log';
import { GET as liveGET } from '@/app/api/health/live/route';

// Controllable mock of the env readiness check used by the ready route.
// Default delegates to the real implementation so env validation tests keep
// real behavior; health tests override the return value per case with
// mockReturnValueOnce.
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    isCoreConfigReady: vi.fn((env?: NodeJS.ProcessEnv) =>
      actual.isCoreConfigReady(env)
    ),
  };
});

// Controllable mongoose mock for the shallow readiness DB probe. Tests drive
// the connection state via well-known globalThis flags so each case can assert
// the exact ready/degraded/unavailable behavior.
vi.mock('mongoose', () => ({
  default: {
    connection: {
      get readyState() {
        return (globalThis as Record<symbol, number>)[MOCK_READY_STATE] ?? 1;
      },
      db: {
        admin: () => ({
          ping: async () => {
            if ((globalThis as Record<symbol, boolean>)[MOCK_PING_FAIL]) {
              throw new Error('ping failed');
            }
            return { ok: 1 };
          },
        }),
      },
    },
  },
}));

const MOCK_READY_STATE = Symbol('mongoose.readyState');
const MOCK_PING_FAIL = Symbol('mongoose.pingFail');

import { GET as readyGET } from '@/app/api/health/ready/route';
import { isCoreConfigReady as readyEnvCheck } from '@/lib/env';

function baseEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    NEXTAUTH_URL: 'https://localhost.invalid',
    NEXTAUTH_SECRET: 'a-32-character-test-secret-placeholder!!',
    GOOGLE_CLIENT_ID: 'test-placeholder',
    GOOGLE_CLIENT_SECRET: 'test-placeholder',
    MONGODB_URI: 'mongodb://localhost.invalid/test',
    TMDB_API_KEY: 'test-placeholder',
    GOOGLE_API_KEY: 'test-placeholder',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

// ---------------------------------------------------------------------------
// R7-A: typed environment validation
// ---------------------------------------------------------------------------
describe('R7 environment validation', () => {
  it('accepts a valid test configuration', () => {
    const r = validateEnv(baseEnv());
    expect(r.errors).toEqual([]);
    expect(r.parsed).not.toBeNull();
  });

  it('rejects missing production-required variables without leaking values', () => {
    const env = baseEnv({ NODE_ENV: 'production', MONGODB_URI: '', TMDB_API_KEY: '' });
    const r = validateEnv(env);
    expect(r.parsed).toBeNull();
    expect(r.errors.some((e) => e.name === 'MONGODB_URI')).toBe(true);
    expect(r.errors.some((e) => e.name === 'TMDB_API_KEY')).toBe(true);
    // No value/host surfaced.
    const serialized = JSON.stringify(r.errors);
    expect(serialized).not.toContain('mongodb');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('placeholder');
  });

  it('requires HTTPS for NEXTAUTH_URL in production', () => {
    const http = validateEnv(baseEnv({ NODE_ENV: 'production', NEXTAUTH_URL: 'http://insecure.example' }));
    expect(http.parsed).toBeNull();
    expect(http.errors.some((e) => e.name === 'NEXTAUTH_URL')).toBe(true);
  });

  it('requires NEXTAUTH_URL in production', () => {
    const missing = validateEnv(baseEnv({ NODE_ENV: 'production', NEXTAUTH_URL: '' }));
    expect(missing.parsed).toBeNull();
    expect(missing.errors.some((e) => e.name === 'NEXTAUTH_URL')).toBe(true);
  });

  it('enforces a minimum NEXTAUTH_SECRET length in production', () => {
    const weak = validateEnv(baseEnv({ NODE_ENV: 'production', NEXTAUTH_SECRET: 'short' }));
    expect(weak.parsed).toBeNull();
    expect(weak.errors.some((e) => e.name === 'NEXTAUTH_SECRET')).toBe(true);
    expect(MIN_SECRET_LENGTH).toBeGreaterThanOrEqual(32);
  });

  it('accepts explicit placeholders in test mode', () => {
    const r = validateEnv({ NODE_ENV: 'test', NEXTAUTH_SECRET: 'test-placeholder' });
    expect(r.errors).toEqual([]);
  });

  it('treats optional Redis absence as valid', () => {
    const env = baseEnv({ REDIS_URL: '', REDIS_HOST: '', REDIS_PORT: '' });
    expect(validateEnv(env).errors).toEqual([]);
  });

  it('rejects contradictory Redis configuration (redis:// + TLS true)', () => {
    const env = baseEnv({ REDIS_URL: 'redis://redis.invalid', REDIS_TLS: 'true' });
    const r = validateEnv(env);
    expect(r.parsed).toBeNull();
    expect(r.errors.some((e) => e.issue.includes('redis'))).toBe(true);
  });

  it('rejects a NEXT_PUBLIC secret variable', () => {
    const env = baseEnv({ NEXT_PUBLIC_MONGODB_URI: 'mongodb://leak' });
    const r = validateEnv(env);
    expect(r.errors.some((e) => e.name === 'NEXT_PUBLIC_MONGODB_URI')).toBe(true);
  });

  it('rejects an invalid MONGODB_URI scheme', () => {
    const env = baseEnv({ MONGODB_URI: 'https://not-mongo.example/x' });
    const r = validateEnv(env);
    expect(r.errors.some((e) => e.name === 'MONGODB_URI')).toBe(true);
  });

  it('rejects a REDIS_PORT out of bounds', () => {
    const env = baseEnv({ REDIS_HOST: 'redis.invalid', REDIS_PORT: '99999' });
    const r = validateEnv(env);
    expect(r.errors.some((e) => e.name === 'REDIS_PORT')).toBe(true);
  });

  it('isCoreConfigReady reflects validity', () => {
    expect(isCoreConfigReady(baseEnv())).toBe(true);
    expect(isCoreConfigReady(baseEnv({ NODE_ENV: 'production', NEXTAUTH_URL: '' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R7-D: liveness and readiness
// ---------------------------------------------------------------------------
describe('R7 health endpoints', () => {
  it('liveness returns 200, no-store, and no internal detail', async () => {
    const res = await liveGET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('movie-recommendation-system');
    const text = JSON.stringify(body);
    // no secrets, env, hosts, versions, commit hashes, uptime, headers
    expect(text).not.toContain('secret');
    expect(text).not.toContain('editor');
    expect(text).not.toContain('process.env');
    expect(res.headers.get('x-vercel-') || '').toBe('');
  });

  it('ready returns 200 with valid core config and generic components', async () => {
    vi.mocked(readyEnvCheck).mockReturnValue(true);
    (globalThis as Record<symbol, number>)[MOCK_READY_STATE] = 1;
    (globalThis as Record<symbol, boolean>)[MOCK_PING_FAIL] = false;
    const req = new Request('http://x/api/health/ready') as unknown as import('next/server').NextRequest;
    const res = await readyGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ready');
    expect(body.components).toEqual({ config: 'ready', database: 'ready', redis: 'optional' });
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(JSON.stringify(body)).not.toContain('mongoose');
    expect(JSON.stringify(body)).not.toContain('connection');
  });

  it('ready returns 503 degraded when the database ping fails', async () => {
    vi.mocked(readyEnvCheck).mockReturnValue(true);
    (globalThis as Record<symbol, number>)[MOCK_READY_STATE] = 1;
    (globalThis as Record<symbol, boolean>)[MOCK_PING_FAIL] = true;
    const res = await readyGET(
      new Request('http://x/api/health/ready') as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.components.database).toBe('disconnected');
    expect(body.components.config).toBe('ready');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    // No internal error/leakage.
    const text = JSON.stringify(body);
    expect(text).not.toContain('ping failed');
    expect(text).not.toContain('mongodb');
    expect(text).not.toContain('timeout');
  });

  it('ready returns 503 degraded when mongoose is not connected (readyState != 1)', async () => {
    vi.mocked(readyEnvCheck).mockReturnValue(true);
    (globalThis as Record<symbol, number>)[MOCK_READY_STATE] = 0;
    (globalThis as Record<symbol, boolean>)[MOCK_PING_FAIL] = false;
    const res = await readyGET(
      new Request('http://x/api/health/ready') as unknown as import('next/server').NextRequest
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.components.database).toBe('disconnected');
  });

  it('ready returns 503 when required configuration is invalid', async () => {
    vi.mocked(readyEnvCheck).mockReturnValue(false);
    const res = await readyGET(new Request('http://x/api/health/ready') as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('unavailable');
    expect(body.components.config).toBe('unavailable');
    expect(JSON.stringify(body)).not.toContain('mongodb');
    expect(JSON.stringify(body)).not.toContain('env');
  });

  it('never calls Gemini/TMDB via health endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await liveGET();
    await readyGET(
      new Request('http://x/api/health/ready') as unknown as import('next/server').NextRequest
    );
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// R5 helper used by ready test above: restore spy
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.restoreAllMocks();
  // Default delegation: real validation semantics (validateEnv is the real
  // implementation re-exported by the vi.mock factory above). Individual
  // health tests override with mockReturnValue.
  vi.mocked(readyEnvCheck).mockReset();
  vi.mocked(readyEnvCheck).mockImplementation((env?: NodeJS.ProcessEnv) => {
    const source = env ?? { ...process.env, NODE_ENV: 'test' };
    return validateEnv(source).errors.length === 0;
  });
  // Default mongoose readiness state: connected, ping succeeds.
  (globalThis as Record<symbol, number>)[MOCK_READY_STATE] = 1;
  (globalThis as Record<symbol, boolean>)[MOCK_PING_FAIL] = false;
});

// ---------------------------------------------------------------------------
// R7-E: operational logging redaction
// ---------------------------------------------------------------------------
describe('R7 operational logging', () => {
  it('sanitizes blocked keys and sensitive values', () => {
    const meta = sanitizeMeta({
      email: 'victim@example.com',
      chat: 'hello',
      title: 'Inception',
      token: 'abc',
      apiKey: 'x',
      connectionString: 'mongodb://x',
      allowed: 'ok',
      code: 200,
    });
    expect(meta.email).toBeUndefined();
    expect(meta.chat).toBeUndefined();
    expect(meta.title).toBeUndefined();
    expect(meta.token).toBeUndefined();
    expect(meta.apiKey).toBeUndefined();
    expect(meta.connectionString).toBeUndefined();
    expect(meta.allowed).toBe('ok');
    expect(meta.code).toBe(200);
  });

  it('sanitizes values that look like connection URIs', () => {
    const meta = sanitizeMeta({ url: 'rediss://user:pass@host' });
    expect(meta.url).toBeUndefined();
  });

  it('rejects non-scenario correlation ids', () => {
    expect(safeCorrelationId('abc123')).toBe('abc123');
    expect(safeCorrelationId('victim@example.com')).toBeUndefined();
    expect(safeCorrelationId('a very long value with spaces and pii')).toBeUndefined();
    expect(safeCorrelationId(123)).toBeUndefined();
  });

  it('logs no PII and no raw body', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      lines.push(a.join(' '));
    });
    logOperationalEvent(
      buildOperationalEvent({
        event: 'health.readiness',
        status: 'ok',
        correlationId: 'corr-1',
        meta: { email: 'victim@example.com', bytes: 5 },
      })
    );
    spy.mockRestore();
    const joined = lines.join('\n');
    expect(joined).not.toContain('victim@example.com');
    expect(joined).toContain('corr-1');
    expect(joined).toContain('bytes');
  });
});

// ---------------------------------------------------------------------------
// R7-B: CI workflow static contract
// ---------------------------------------------------------------------------
describe('R7 CI workflow contract', () => {
  const ci = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

  it('uses npm ci (frozen lockfile), not npm install', () => {
    expect(ci).toContain('npm ci');
    expect(ci).not.toMatch(/npm install/);
  });

  it('contains all core quality gates', () => {
    for (const gate of ['run: npm run lint', 'run: npm run typecheck', 'run: npm test', 'run: npm run test:coverage', 'run: npm run build']) {
      expect(ci).toContain(gate);
    }
  });

  it('does not reference live external service URLs or destructive scripts', () => {
    expect(ci).not.toContain('setupDatabase');
    expect(ci).not.toContain('testRedisConnection');
    expect(ci).not.toContain('owner-provisioning');
    expect(ci).not.toContain('gemini');
    expect(ci).not.toContain('api.themoviedb.org');
  });

  it('uses read-only workflow permissions', () => {
    expect(ci).toContain('permissions:');
    expect(ci).toContain('contents: read');
  });

  it('does not set any build-bypass variable and uses non-production placeholders', () => {
    expect(ci).not.toContain('ignoreBuildErrors');
    expect(ci).toContain('ci-placeholder');
    expect(ci).toContain('NODE_ENV: production');
  });

  it('does not contain a real secret pattern', () => {
    expect(ci).not.toMatch(/secret:.{16,}/);
    expect(ci).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    expect(ci).not.toContain('REPLACE_WITH_32_PLUS_CHARACTERS');
  });

  it('runs on pull_request and push to main', () => {
    expect(ci).toContain('pull_request');
    expect(ci).toContain('branches: [main]');
  });
});