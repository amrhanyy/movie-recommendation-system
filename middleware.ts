import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isPublicApiPath } from '@/lib/public-api-paths'

export async function middleware(request: NextRequest) {
  // Skip middleware for non-app paths
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/static') ||
    request.nextUrl.pathname.startsWith('/images') ||
    request.nextUrl.pathname.startsWith('/auth') ||
    request.nextUrl.pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // Get auth token
  const token = await getToken({ req: request })

  // Protect API routes (middleware is defense-in-depth only;
  // every API handler must also call requireSession/requireAdmin)
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Phase 25 (G): the Edge runtime no longer evaluates feature flags. Doing so
    // required an internal HTTP self-request to the feature endpoint on every
    // gated request, which doubled the request count and involved the Edge
    // isolate in a network round-trip it could not cache. Feature gating moved
    // to the Node service (lib/features.ts) and runs inside the handlers, i.e.
    // after authentication and before any provider/quota work.
    //
    // Public, anonymous API inventory lives in one Edge-safe module so it cannot
    // drift. CONFIG-001: the sensitive /api/movie/[id]/ai-similar leaf is
    // excluded there by exact shape match (no substring over-deny).
    if (!isPublicApiPath(request.nextUrl.pathname)) {
      if (!token) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        )
      }
      // Phase 25 (N): an authenticated response is per-user data. A shared CDN
      // must never store it; public cacheable routes opt in explicitly in their
      // own handler instead.
      const response = NextResponse.next()
      response.headers.set('Cache-Control', 'private, no-store')
      return response
    }
  }

  // Protect authenticated pages (middleware for navigation UX;
  // pages also have server-side guards where needed)
  if (
    request.nextUrl.pathname.startsWith('/profile') ||
    request.nextUrl.pathname.startsWith('/admin') ||
    request.nextUrl.pathname.startsWith('/favorites') ||
    request.nextUrl.pathname.startsWith('/watchlist') ||
    request.nextUrl.pathname.startsWith('/ai-assistant')
  ) {
    if (!token) {
      const url = new URL('/auth/signin', request.url)
      url.searchParams.set('callbackUrl', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

// Configure which routes middleware runs on.
// F-049 fix: include /admin, /favorites, /watchlist, /api/chat,
// /api/ai-recommendations leaf paths.
export const config = {
  matcher: [
    '/profile/:path*',
    '/admin/:path*',
    '/admin',
    '/favorites/:path*',
    '/favorites',
    '/watchlist/:path*',
    '/watchlist',
    '/ai-assistant/:path*',
    '/ai-assistant',
    '/api/auth/:path*',
    '/api/ai-recommendations/:path*',
    '/api/ai-recommendations',
    '/api/chat/:path*',
    '/api/chat',
    '/api/chat-history/:path*',
    '/api/chat-history',
    '/api/watchlist/:path*',
    '/api/watchlist',
    '/api/favorites/:path*',
    '/api/favorites',
    '/api/history/:path*',
    '/api/history',
    '/api/user/:path*',
    '/api/user',
    '/api/users/:path*',
    '/api/users',
    '/api/admin/:path*',
    // CONFIG-001: sensitive nested leaf under the public /api/movie/ prefix
    // (Gemini route; requireUser at handler). Matched so the middleware's
    // early 401 defense-in-depth reaches it; handler remains authoritative.
    '/api/movie/:id/ai-similar',
  ],
}
