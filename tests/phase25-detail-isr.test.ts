import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

interface DetailRoute {
  segment: string
  view: string
  revalidate: number
  fetchSentinel: string
}

// Phase 25 (L): /movie/[id] and /tv/[id] are client-rendered shells with no
// request-specific server data. They rendered dynamically only because a
// 'use client' page cannot export route segment config, so the route had no way
// to declare itself cacheable. The server wrapper restores that ability and
// forwards params unchanged, so the shell's data loading is untouched.
const ROUTES: DetailRoute[] = [
  {
    segment: 'app/movie/[id]',
    view: 'MovieDetailPage',
    revalidate: 900,
    fetchSentinel: 'Failed to load movie details',
  },
  {
    segment: 'app/tv/[id]',
    view: 'TVDetailPage',
    revalidate: 900,
    fetchSentinel: 'Failed to load show details',
  },
]

const REQUEST_SCOPED_APIS = [
  'cookies(',
  'headers(',
  'draftMode(',
  'noStore(',
  'unstable_noStore(',
  'getServerSession(',
  'auth(',
  'searchParams',
]

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('Phase 25 L: public detail routes are prerendered shells', () => {
  for (const { segment, view, revalidate, fetchSentinel } of ROUTES) {
    describe(segment, () => {
      it('declares its revalidation window in a Server Component', () => {
        const source = read(`${segment}/page.tsx`)
        // Directive position is what makes a module a Client Component; the
        // words may legitimately appear in the wrapper's explanatory comment.
        expect(source.trimStart().startsWith("'use client'")).toBe(false)
        expect(source).toMatch(new RegExp(`export\\s+const\\s+revalidate\\s*=\\s*${revalidate}\\b`))
        expect(source).not.toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/)
      })

      it('opts the dynamic segment into static generation', () => {
        // Without a static params source Next treats a dynamic segment as
        // fully dynamic and silently ignores `revalidate`: the build prints
        // `ƒ`, nothing lands in prerender-manifest.dynamicRoutes and every
        // request renders. An explicit empty generateStaticParams is the
        // opt-in; real ids then use dynamicParams (default true), i.e. render
        // on first request and stay cached for the revalidate window.
        const source = read(`${segment}/page.tsx`)
        expect(source).toMatch(/export\s+function\s+generateStaticParams\s*\(/)
        expect(source).toMatch(/return\s*\[\s*\]/)
      })

      it('reads no request-scoped server data', () => {
        const source = read(`${segment}/page.tsx`)
        for (const api of REQUEST_SCOPED_APIS) {
          expect(source, `${segment}/page.tsx must not use ${api}`).not.toContain(api)
        }
      })

      it('forwards params to the client shell instead of reading them', () => {
        const source = read(`${segment}/page.tsx`)
        expect(source).toContain(`from './${view}'`)
        expect(source).toContain('params={params}')
        expect(source).not.toContain('notFound(')
      })

      it('keeps the client shell as the only place that unwraps params', () => {
        const shell = read(`${segment}/${view}.tsx`)
        expect(
          shell.trimStart().startsWith("'use client'"),
          `${view} must stay a client component`
        ).toBe(true)
        expect(shell).toMatch(/use\(params\)/)
        // Route segment config inside a 'use client' module is a build error,
        // so it must live only in the wrapper.
        expect(shell).not.toMatch(/export\s+const\s+revalidate/)
      })

      it('resolves an unknown id in the browser, not on the server', () => {
        // The wrapper never validates the id, so an unknown one still returns
        // the cached shell (HTTP 200). The API rejects the id and the shell
        // renders its own error state; no server-rendered 404 exists.
        const shell = read(`${segment}/${view}.tsx`)
        expect(shell).toMatch(/if\s*\(!\w+(Response|Res|Response\.ok)?\.ok\)/)
        expect(shell).toContain(fetchSentinel)
      })
    })
  }

  it('leaves the query-string dependent listing page dynamic', () => {
    // /genre/[id] reads useSearchParams (type/page), so it cannot be a static
    // shell: its HTML genuinely varies per request.
    const genre = read('app/genre/[id]/page.tsx')
    expect(genre).toMatch(/useSearchParams/)
    expect(genre).not.toMatch(/export\s+const\s+revalidate/)
  })

  it('keeps the root layout free of request-scoped data', () => {
    // Any request-scoped read here would deopt every prerendered route, so the
    // cacheable shells depend on this staying static.
    const layout = read('app/layout.tsx')
    expect(layout).toMatch(/export\s+const\s+metadata\s*:\s*Metadata/)
    for (const api of ['cookies(', 'headers(', 'getServerSession(', 'noStore(']) {
      expect(layout, `app/layout.tsx must not use ${api}`).not.toContain(api)
    }
  })
})
