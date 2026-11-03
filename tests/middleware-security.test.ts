import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: mocks.getToken,
}));

function requestFor(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe('CONFIG-001 middleware coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getToken.mockReset().mockResolvedValue(null);
  });

  it('matches the sensitive movie leaf but no broad catch-all', async () => {
    const { config } = await import('@/middleware');
    const matcher: string[] = Array.isArray(config.matcher)
      ? config.matcher
      : [config.matcher as string];

    // The remediated sensitive leaf is explicitly covered.
    expect(matcher).toContain('/api/movie/:id/ai-similar');

    // No root-level catch-all that would sweep in public/internal paths.
    const broadCatchAlls = [
      '/:path*',
      '/((?!_next|static|images|favicon|auth).*)',
    ];
    for (const bad of broadCatchAlls) {
      expect(matcher).not.toContain(bad);
    }

    // The remediated sensitive leaf is explicitly, surgically covered.
    expect(matcher).toContain('/api/movie/:id/ai-similar');
  });

  it('401s the sensitive leaf without a token and passes it with one', async () => {
    const { middleware } = await import('@/middleware');

    const denied = await middleware(requestFor('/api/movie/123/ai-similar'));
    expect(denied.status).toBe(401);

    mocks.getToken.mockResolvedValue({ email: 'test@example.com' });
    const allowed = await middleware(requestFor('/api/movie/123/ai-similar'));
    expect(allowed.status).toBe(200);
  });

  it('keeps the public movie detail route (not the AI leaf) accessible', async () => {
    const { middleware } = await import('@/middleware');

    // /api/movie/123 is a public catalog route: the surgical matcher entry
    // must not over-match it into the token gate.
    const response = await middleware(requestFor('/api/movie/123'));
    expect(response.status).toBe(200);
  });

  it('passes internal assets and redirects unauthenticated protected pages', async () => {
    const { middleware } = await import('@/middleware');

    for (const path of [
      '/_next/static/chunks/app.js',
      '/static/app.js',
      '/images/poster.jpg',
      '/favicon.ico',
      '/genres',
    ]) {
      const response = await middleware(requestFor(path));
      expect(response.status, path).toBe(200);
    }

    const protectedResponse = await middleware(requestFor('/admin'));
    expect(protectedResponse.status).toBe(307);
    expect(protectedResponse.headers.get('location')).toContain('/auth/signin');
  });
});
