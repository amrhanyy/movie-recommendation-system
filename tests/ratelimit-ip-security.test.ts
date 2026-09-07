import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Force the in-memory rate-limit fallback (no Redis in unit tests).
vi.mock('@/lib/redis', () => ({
  default: vi.fn().mockResolvedValue(null),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

import {
  RATE_LIMITS,
} from '@/lib/security/rateLimit';
import { redactUrlForLog } from '@/lib/fetchWithRetry';

// A tiny budget so the loop below stays fast.
const TINY = { maxRequests: 5, windowMs: 60_000, prefix: 'm01' };

function reqWith(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/search?query=x', {
    headers,
  });
}

describe('M-01: X-Forwarded-For rate-limit spoofing', () => {
  beforeEach(() => {
    // Each test gets a fresh module registry => fresh in-memory store.
    vi.resetModules();
  });

  it('W3-001: one IP x many UAs shares ONE search bucket (429 at 31, not N*30)', async () => {
    const { applyRateLimitPublic: apply } = await import(
      '@/lib/security/rateLimit'
    );
    // One IP rotating 5 distinct UAs must still exhaust the 30/min search
    // budget once: the bucket key is ip-only, so UA rotation mints nothing.
    let deniedAt = -1;
    for (let i = 1; i <= 60; i++) {
      const res = await apply(
        reqWith({
          'x-forwarded-for': '203.0.113.7',
          'user-agent': `TestAgent/${i % 5}`,
        }),
        RATE_LIMITS.search
      );
      if (res) {
        deniedAt = i;
        break;
      }
    }
    expect(deniedAt).toBe(RATE_LIMITS.search.maxRequests + 1); // 31st denied
  });

  it('W3-002: spoofed X-Real-IP with untrusted peer is ignored (keyed by real peer)', async () => {
    const { applyRateLimitPublic: apply } = await import(
      '@/lib/security/rateLimit'
    );
    const BUDGET = { maxRequests: 2, windowMs: 60_000, prefix: 'w3002' };
    // Pre-fill a bucket keyed by the spoofed IP alone: if X-Real-IP were
    // honored without a trusted peer, the next request would land in that
    // exhausted bucket and be denied.
    expect(
      await apply(reqWith({ 'x-forwarded-for': '9.9.9.9' }), BUDGET)
    ).toBeNull();
    expect(
      await apply(reqWith({ 'x-forwarded-for': '9.9.9.9' }), BUDGET)
    ).toBeNull();
    expect(
      await apply(reqWith({ 'x-forwarded-for': '9.9.9.9' }), BUDGET)
    ).not.toBeNull();
    // Same spoofed X-Real-IP but a different real peer (no trusted proxies
    // configured => peer untrusted => X-Real-IP ignored) gets a fresh budget.
    expect(
      await apply(
        reqWith({
          'x-forwarded-for': '198.51.100.23',
          'x-real-ip': '9.9.9.9',
        }),
        BUDGET
      )
    ).toBeNull();
  });

  it('W3-003: BlockList CIDR — /32 self-match, /25 boundary, IPv6 member/non-member, /0 rejected', async () => {
    const { parseTrustedProxyCidrList, ipInCidrList } = await import('@/lib/security/proxy-cidr');
    const envFor = (cidrs: string): NodeJS.ProcessEnv =>
      ({ NODE_ENV: 'test', TRUSTED_PROXY_CIDRS: cidrs }) as unknown as NodeJS.ProcessEnv;
    // /32 self-match
    expect(
      ipInCidrList('10.0.0.1', parseTrustedProxyCidrList(envFor('10.0.0.1/32')))
    ).toBe(true);
    expect(
      ipInCidrList('10.0.0.2', parseTrustedProxyCidrList(envFor('10.0.0.1/32')))
    ).toBe(false);
    // /25 boundary: 10.0.0.0/25 covers .0-.127, not .128
    const slash25 = parseTrustedProxyCidrList(envFor('10.0.0.0/25'));
    expect(ipInCidrList('10.0.0.127', slash25)).toBe(true);
    expect(ipInCidrList('10.0.0.128', slash25)).toBe(false);
    // IPv6 native: 2600:1900::/32 member vs non-member
    const v6 = parseTrustedProxyCidrList(envFor('2600:1900::/32'));
    expect(v6.length).toBeGreaterThan(0);
    expect(ipInCidrList('2600:1900::1', v6)).toBe(true);
    expect(ipInCidrList('2600:1901::1', v6)).toBe(false);
  });

  it('W3-003: validateEnv hard-rejects /0 and ::/0 universal allowlists', async () => {
    const { validateEnv } = await import('@/lib/env');
    const base = {
      NODE_ENV: 'test',
      TRUSTED_PROXY_CIDRS: '0.0.0.0/0',
    } as unknown as NodeJS.ProcessEnv;
    const r4 = validateEnv(base);
    expect(r4.errors.some((e) => e.name === 'TRUSTED_PROXY_CIDRS')).toBe(true);
    const r6 = validateEnv({
      NODE_ENV: 'test',
      TRUSTED_PROXY_CIDRS: '::/0',
    } as unknown as NodeJS.ProcessEnv);
    expect(r6.errors.some((e) => e.name === 'TRUSTED_PROXY_CIDRS')).toBe(true);
  });

  it('rotating the LEFT XFF hop does not mint fresh budgets (rightmost governs)', async () => {
    const { applyRateLimitPublic: apply } = await import(
      '@/lib/security/rateLimit'
    );
    // Attacker rotates the first (client-controlled) hop 1..50 but keeps the
    // same rightmost (proxy-appended) hop 10.0.0.1. The budget is tied to the
    // rightmost hop, so the 6th request must be denied even though every
    // request looks "different" to a first-hop keying scheme.
    let deniedAt = -1;
    for (let i = 1; i <= 50; i++) {
      const res = await apply(
        reqWith({ 'x-forwarded-for': `1.2.3.${i}, 10.0.0.1` }),
        TINY
      );
      if (res) {
        deniedAt = i;
        break;
      }
    }
    expect(deniedAt).toBe(TINY.maxRequests + 1); // 6th denied
  });

  it('a genuinely different rightmost IP gets its own budget', async () => {
    const { applyRateLimitPublic: apply } = await import(
      '@/lib/security/rateLimit'
    );
    // Exhaust the 10.0.0.1 budget.
    for (let i = 0; i < TINY.maxRequests; i++) {
      expect(
        await apply(reqWith({ 'x-forwarded-for': `9.9.9.1, 10.0.0.1` }), TINY)
      ).toBeNull();
    }
    // 10.0.0.1 is now blocked...
    expect(
      await apply(reqWith({ 'x-forwarded-for': `9.9.9.2, 10.0.0.1` }), TINY)
    ).not.toBeNull();
    // ...but a distinct rightmost (10.0.0.2) still has a full budget.
    expect(
      await apply(reqWith({ 'x-forwarded-for': `9.9.9.3, 10.0.0.2` }), TINY)
    ).toBeNull();
  });

  it('an invalid/attacker-chosen rightmost falls back to a UA fingerprint', async () => {
    const { applyRateLimitPublic: apply } = await import(
      '@/lib/security/rateLimit'
    );
    // Garbage in the rightmost position must not be treated as a real IP.
    // Same UA => same fingerprint bucket across differing garbage values.
    const ua = 'Mozilla/5.0 (TestAgent)';
    let denied = false;
    for (let i = 0; i < TINY.maxRequests + 1; i++) {
      const res = await apply(
        reqWith({
          'x-forwarded-for': `not-a-real-ip-${i}`,
          'user-agent': ua,
        }),
        TINY
      );
      if (res) denied = true;
    }
    expect(denied).toBe(true);
  });

  it('exposes the tmdbProxy config (M-03 uses it)', () => {
    expect(RATE_LIMITS.tmdbProxy).toBeDefined();
    expect(RATE_LIMITS.tmdbProxyStrict).toBeDefined();
    // /genres + /trailers are the expensive fan-out routes: stricter.
    expect(RATE_LIMITS.tmdbProxyStrict.maxRequests).toBeLessThan(
      RATE_LIMITS.tmdbProxy.maxRequests
    );
  });
});

describe('M-02: log URL redaction', () => {
  it('drops the query string (and api_key) from logged URLs', () => {
    const safe = redactUrlForLog(
      'https://api.themoviedb.org/3/movie/123?api_key=SECRETKEY&language=en-US'
    );
    expect(safe).not.toContain('SECRETKEY');
    expect(safe).not.toContain('api_key');
    expect(safe).toBe('https://api.themoviedb.org/3/movie/123');
  });

  it('redacts arbitrary secret-bearing query params', () => {
    expect(redactUrlForLog('https://x.test/a?token=abc&k=v')).toBe(
      'https://x.test/a'
    );
  });

  it('does not echo a malformed URL', () => {
    expect(redactUrlForLog('::not a url::')).toBe('[invalid-url]');
  });
});
