// Phase 25 (N): single inventory of public, anonymous API surfaces.
//
// WHY THIS MODULE EXISTS
// The Edge middleware used to inline this list AND self-fetch the feature
// endpoint. Both are gone: the list lives here so middleware, tests and future
// callers cannot drift, and the module stays dependency-free so bundling it
// into the Edge runtime can never pull Mongoose/Redis/Node built-ins.
//
// CONFIG-001: /api/movie/[id]/ai-similar is a requireUser (Gemini) route under
// the public /api/movie/ prefix. It is excluded by exact shape match so no
// other movie route is over-denied.

export const PUBLIC_API_PREFIXES = [
  '/api/auth',
  '/api/features',
  '/api/movies',
  '/api/trending',
  '/api/genres',
  '/api/genre/',
  '/api/movie/',
  '/api/tv/',
  '/api/actor/',
  '/api/celebrities',
  '/api/search',
  '/api/mood-recommendations',
  '/api/trailers',
] as const

export function isSensitiveMovieLeaf(pathname: string): boolean {
  return pathname.startsWith('/api/movie/') && pathname.endsWith('/ai-similar')
}

export function isPublicApiPath(pathname: string): boolean {
  if (isSensitiveMovieLeaf(pathname)) return false
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
