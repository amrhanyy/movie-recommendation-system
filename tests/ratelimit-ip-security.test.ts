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
