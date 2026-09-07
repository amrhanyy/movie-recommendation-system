import NextAuth from "next-auth"
import type { NextRequest } from "next/server"
import { authOptions } from "@/lib/auth"
import { applyRateLimitPublic, RATE_LIMITS } from "@/lib/security/rateLimit"

const handler = NextAuth(authOptions)

// W3-004: IP-keyed 30/min budget on the NextAuth handler (credential-stuffing
// and callback-abuse bound). Rate limiting runs before NextAuth touches the
// request; a denied request short-circuits with 429 and never reaches Google.
async function limited(request: NextRequest, next: (req: NextRequest) => Promise<Response>): Promise<Response> {
  const limitedResponse = await applyRateLimitPublic(request, RATE_LIMITS.auth)
  if (limitedResponse) return limitedResponse
  return next(request)
}

export async function GET(request: NextRequest): Promise<Response> {
  return limited(request, (req) => (handler as (req: NextRequest) => Promise<Response>)(req))
}

export async function POST(request: NextRequest): Promise<Response> {
  return limited(request, (req) => (handler as (req: NextRequest) => Promise<Response>)(req))
}
