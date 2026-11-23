/**
 * Phase 25 (N): response-level cache policy for approved public GET routes.
 *
 * Browser cache and Vercel CDN cache are deliberately separated:
 * - the browser may keep a response but must revalidate before reuse
 *   (`max-age=0, must-revalidate`), so a redeploy or data correction is
 *   picked up on the next navigation;
 * - the Vercel CDN may serve the response for the route TTL and serve stale
 *   for the SWR window while a background refresh runs.
 *
 * Only routes whose response is anonymous and identical for every visitor may
 * use these headers. Personalized or authenticated routes must send
 * `private, no-store` instead (see middleware.ts and the private route
 * handlers).
 */
export type PublicCachePolicy =
  | 'trending'
  | 'genres'
  | 'details'
  | 'similar'
  | 'celebrities'
  | 'search'
  | 'trailers'

export interface PublicCacheTiming {
  /** Seconds the Vercel CDN may serve the cached response. */
  cdnSeconds: number
  /** Seconds the Vercel CDN may serve stale content while revalidating. */
  swrSeconds: number
}

/**
 * Approved starting points from the Phase 25 mandate, narrowed to the routes
 * this repository actually serves. `similar` covers TMDB
 * similar/recommendations responses, which share the detail-page budget.
 */
export const PUBLIC_CACHE_TIMINGS: Readonly<Record<PublicCachePolicy, PublicCacheTiming>> = {
  trending: { cdnSeconds: 300, swrSeconds: 1800 },
  genres: { cdnSeconds: 3600, swrSeconds: 86400 },
  details: { cdnSeconds: 900, swrSeconds: 3600 },
  similar: { cdnSeconds: 900, swrSeconds: 3600 },
  celebrities: { cdnSeconds: 3600, swrSeconds: 86400 },
  search: { cdnSeconds: 60, swrSeconds: 300 },
  trailers: { cdnSeconds: 1800, swrSeconds: 7200 },
}

export function publicCacheHeaders(policy: PublicCachePolicy): Record<string, string> {
  const { cdnSeconds, swrSeconds } = PUBLIC_CACHE_TIMINGS[policy]
  return {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Vercel-CDN-Cache-Control': `s-maxage=${cdnSeconds}, stale-while-revalidate=${swrSeconds}`,
  }
}

/** Response headers for routes that must never be cached by browser or CDN. */
export const PRIVATE_NO_STORE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Cache-Control': 'private, no-store',
})
