import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Feature routes that need to be protected
const FEATURE_ROUTES = {
  'aiAssistant': ['/ai-assistant', '/api/ai-recommendations'],
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
    } catch (error) {
      console.error('Error checking feature status:', error)
      // If there's an error, we'll allow access (fail open)
    }
  }
  
  // Protect API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Except for public APIs
    if (
      !request.nextUrl.pathname.startsWith('/api/auth') &&
      !request.nextUrl.pathname.startsWith('/api/features') &&
      !request.nextUrl.pathname.startsWith('/api/movies')
    ) {
      if (!token) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        )
      }
    }
  }

  // Protect profile pages
  if (request.nextUrl.pathname.startsWith('/profile')) {
    if (!token) {
      const url = new URL('/auth/signin', request.url)
      url.searchParams.set('callbackUrl', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

// Configure which routes to protect
export const config = {
  matcher: [
    '/profile/:path*',
    '/api/auth/:path*',
    '/ai-assistant/:path*',
    '/ai-assistant',
    '/api/ai-recommendations/:path*',
    '/api/chat/:path*',
    '/api/chat-history/:path*',
    '/api/watchlist/:path*',
    '/api/watchlist',
  ],
}
