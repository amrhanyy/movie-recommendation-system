import TVDetailPage from './TVDetailPage'

// Phase 25 (L): /tv/[id] is a client-rendered shell. It reads no cookies,
// headers, session, draft mode, or search params on the server, so it is
// STATIC_CLIENT_SHELL rather than DYNAMIC_REQUIRED, and its previous dynamic
// classification was accidental: a 'use client' page cannot export route
// segment config, so it had no way to declare itself cacheable.
//
// The 900s window mirrors the /api/tv/[id] CDN policy (s-maxage=900,
// stale-while-revalidate=3600) so the shell and the data the shell fetches age
// on the same clock. The wrapper forwards params unchanged, so the client
// component keeps unwrapping it with use(params) exactly as before.
export const revalidate = 900

// Phase 25 (L): an explicit (empty) generateStaticParams is what opts a dynamic
// segment into static generation. Without it Next treats the segment as fully
// dynamic and silently ignores `revalidate`. Returning [] keeps every id on the
// `dynamicParams` (true) on-demand path: the first request per id renders and is
// then cached for 900s, exactly like the /api counterpart's s-maxage.
export function generateStaticParams() {
  return []
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <TVDetailPage params={params} />
}
