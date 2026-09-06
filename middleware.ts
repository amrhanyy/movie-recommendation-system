import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Feature routes that need feature-flag checks
const FEATURE_ROUTES = {
  aiAssistant: ['/ai-assistant', '/api/ai-recommendations'],
}

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

  // Check if AI Assistant feature is enabled when accessing its routes
  if (FEATURE_ROUTES.aiAssistant.some(route => request.nextUrl.pathname.startsWith(route))) {
    try {
      // Fetch feature configuration
      const featureResponse = await fetch(`${request.nextUrl.origin}/api/features`)

      if (!featureResponse.ok) {
        throw new Error('Failed to fetch features')
      }

      const featureData = await featureResponse.json()

      // If AI Assistant is disabled, redirect to homepage
      if (!featureData.features?.aiAssistant) {
        return NextResponse.redirect(new URL('/', request.url))
      }
    } catch {
      // F-039 fix: fail closed (deny access) instead of fail open
      // If we cannot verify the feature is enabled, deny access
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Feature unavailable' },
          { status: 503 }
        )
      }
      return NextResponse.redirect(new URL('/feature-unavailable', request.url))
    }
  }

  // Protect API routes (middleware is defense-in-depth only;
  // every API handler must also call requireSession/requireAdmin)
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Except for public APIs
    if (
      !request.nextUrl.pathname.startsWith('/api/auth') &&
      !request.nextUrl.pathname.startsWith('/api/features') &&
      !request.nextUrl.pathname.startsWith('/api/movies') &&
      !request.nextUrl.pathname.startsWith('/api/trending') &&
      !request.nextUrl.pathname.startsWith('/api/genres') &&
      !request.nextUrl.pathname.startsWith('/api/genre/') &&
      !request.nextUrl.pathname.startsWith('/api/movie/') &&
      !request.nextUrl.pathname.startsWith('/api/tv/') &&
      !request.nextUrl.pathname.startsWith('/api/actor/') &&
      !request.nextUrl.pathname.startsWith('/api/celebrities') &&
      !request.nextUrl.pathname.startsWith('/api/search') &&
      !request.nextUrl.pathname.startsWith('/api/mood-recommendations') &&
      !request.nextUrl.pathname.startsWith('/api/trailers')
    ) {
      if (!token) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        )
      }
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
  ],
}
