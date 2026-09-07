import NextAuth from "next-auth"
import type { NextRequest } from "next/server"
import { authOptions } from "@/lib/auth"
import { applyRateLimitPublic, RATE_LIMITS } from "@/lib/security/rateLimit"

const handler = NextAuth(authOptions)

// W3-004: IP-keyed 30/min budget on the NextAuth handler (credential-stuffing
// and callback-abuse bound). Rate limiting runs before NextAuth touches the
// request; a denied request short-circuits with 429 and never reaches Google.
// ARITY CONTRACT: the wrapper MUST forward (request, context) unchanged
// because next-auth dispatches on args[1]?.params
// (node_modules/next-auth/next/index.js:94-96); dropping context routes into
// NextAuthApiHandler which destructures req.query (index.js:13-16) and crashes
// on App Router requests.
type NextAuthRouteContext = { params: Promise<{ nextauth: string[] }> };

async function limited(
  request: NextRequest,
  context: NextAuthRouteContext,
  next: (req: NextRequest, ctx: NextAuthRouteContext) => Promise<Response>
): Promise<Response> {
  const limitedResponse = await applyRateLimitPublic(request, RATE_LIMITS.auth)
  if (limitedResponse) return limitedResponse
  return next(request, context)
}

export async function GET(request: NextRequest, context: NextAuthRouteContext): Promise<Response> {
  return limited(request, context, (req, ctx) => (handler as (req: NextRequest, ctx: NextAuthRouteContext) => Promise<Response>)(req, ctx))
}

export async function POST(request: NextRequest, context: NextAuthRouteContext): Promise<Response> {
  return limited(request, context, (req, ctx) => (handler as (req: NextRequest, ctx: NextAuthRouteContext) => Promise<Response>)(req, ctx))
}
