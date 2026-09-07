# HOTFIX (AUTH-CTX) — Forward App Router Context to NextAuth (P1 Production Restore)

**Base:** `b71f24d` (main). **Date:** 2026-09-08. **Mandate:** diagnostic `docs/DIAGNOSTIC_PROD_AUTH_FAILURE.md` ACCEPTED. Zero public JSON changes, zero UI changes, zero new deps, no `as any`, frozen suites unmodified.

## 1 Context Confirmation

| File | Verbatim lines at commit time |
|------|-------------------------------|
| `app/api/auth/[...nextauth]/route.ts:1–33` (BEFORE) | l1 `import NextAuth from "next-auth"`; l6 `const handler = NextAuth(authOptions)`; l11 `async function limited(request: NextRequest, next: (req: NextRequest) => Promise<Response>)`; l14 `return next(request)`; l17 `export async function GET(request: NextRequest)`; l18 `return limited(request, (req) => (handler as (req: NextRequest) => Promise<Response>)(req))`; l21–22 POST identical req-only |
| `node_modules/next-auth/next/index.js:11–16` | `async function NextAuthApiHandler(req, res, options) {` … `const { nextauth, ...query } = req.query;` — crash site |
| `node_modules/next-auth/next/index.js:47–54` | `async function NextAuthRouteHandler(req, context, options) {` … `const nextauth = (await context.params)?.nextauth;` — params awaited (Next 15 Promise) |
| `node_modules/next-auth/next/index.js:84–98` (dispatcher, re-confirmed) | `function NextAuth(...args) { if (args.length === 1) { return async (req, res) => { if (res?.params) { return await NextAuthRouteHandler(req, res, args[0]); } return await NextAuthApiHandler(req, res, args[0]); }; } if (args[1]?.params) { return NextAuthRouteHandler(...args); } return NextAuthApiHandler(...args); }` — condition `args[1]?.params` (l94) confirmed |
| `tests/ratelimit-coverage.test.ts:106–123` | W3-004 test calls `applyRateLimitPublic(reqWith('203.0.113.9'), RATE_LIMITS.auth)` in a 40-loop, denies at 31 — limiter only, never imports the route |
| `lib/security/rateLimit.ts:359–362` | `export async function applyRateLimitPublic(request: NextRequest, config: RateLimitConfig): Promise<NextResponse \| null>` |
| `lib/security/rateLimit.ts:313` | `auth: { maxRequests: 30, windowMs: 60_000, prefix: "auth" }, // 30/min` |

## 2 Root-cause recap

Verbatim diagnostic quotes: "Root cause (`app/api/auth/[...nextauth]/route.ts:11–22`): `limited()` + exported `GET`/`POST` drop the App Router `context` argument and invoke the curried NextAuth handler req-only (`handler(req)`)." / "The single-arg curried handler (`next/index.js:85–93`) then takes the `NextAuthApiHandler` path (`res?.params` false), which destructures `req.query` (`next/index.js:13–16`) — undefined on an App-Router `NextRequest` — producing the exact production `TypeError`." / "Correct path requires the two-arg shape `handler(request, context)` so the dispatcher (`next/index.js:94–96`, `if (args[1]?.params) return NextAuthRouteHandler(...args)`) reaches `NextAuthRouteHandler`, which reads the catch-all via `await context.params` (`next/index.js:54`)."

## 3 Fix with file:line (before/after verbatim)

`app/api/auth/[...nextauth]/route.ts` AFTER (HEAD at commit time, full file 33 lines):

```ts
import NextAuth from "next-auth"
import type { NextRequest } from "next/server"
import { authOptions } from "@/lib/auth"
import { applyRateLimitPublic, RATE_LIMITS } from "@/lib/security/rateLimit"

const handler = NextAuth(authOptions)

// W3-004: ... (line 7-10 unchanged limiter comment)
// ARITY CONTRACT: the wrapper MUST forward (request, context) unchanged (l11-15)
// because next-auth dispatches on args[1]?.params
// (node_modules/next-auth/next/index.js:94-96); dropping context routes into
// NextAuthApiHandler which destructures req.query (index.js:13-16) and crashes
// on App Router requests.
type NextAuthRouteContext = { params: Promise<{ nextauth: string[] }> }; // l16

async function limited( // l18-26
  request: NextRequest,
  context: NextAuthRouteContext,
  next: (req: NextRequest, ctx: NextAuthRouteContext) => Promise<Response>
): Promise<Response> {
  const limitedResponse = await applyRateLimitPublic(request, RATE_LIMITS.auth)
  if (limitedResponse) return limitedResponse
  return next(request, context)
}

export async function GET(request: NextRequest, context: NextAuthRouteContext): Promise<Response> { // l28
  return limited(request, context, (req, ctx) => (handler as (req: NextRequest, ctx: NextAuthRouteContext) => Promise<Response>)(req, ctx)) // l29
}

export async function POST(request: NextRequest, context: NextAuthRouteContext): Promise<Response> { // l32
  return limited(request, context, (req, ctx) => (handler as (req: NextRequest, ctx: NextAuthRouteContext) => Promise<Response>)(req, ctx)) // l33
}
```

Delta: +context param on `limited`/`GET`/`POST`; `next(request, context)`; inner `(req, ctx)` forwarded BOTH args in order; limiter-first unchanged. No other behavior change.

## 4 Tests added + results

`tests/auth-route-context.test.ts` (new, 4 tests): `vi.mock('next-auth')` default returns `mocks.inner` (captures ctor args separately); `vi.mock('@/lib/security/rateLimit')` delegates to `mocks.limit`; `vi.mock('@/lib/auth')` stubs `authOptions`.
- (a) GET + POST with `(new NextRequest('http://localhost/api/auth/session'), { params: Promise.resolve({ nextauth: ['session'] }) })` → spy receives TWO args, `params` resolves `{ nextauth: ['session'] }`. PASS.
- (b) Forced 429 from `applyRateLimitPublic` → route returns 429, inner spy NOT called. PASS.
- (c) Arity tripwire `GET.length === 2`, `POST.length === 2`. PASS.
- (d) Real-handler smoke: ATTEMPTED via temp `tests/__smoke-tmp.test.ts` invoking the REAL route (imports real `next-auth` + `authOptions`); outcome: import chain throws `Please define the MONGODB_URI environment variable inside .env.local` before any handler runs (offline infeasible — `lib/auth.ts` transitively requires env at import). Temp file DELETED after probe. Documented as SKIP with rationale — no pass fabricated. The mocked (a)–(c) suite is the committed regression net.

Results: targeted 4-file run 56/56 PASS; full node project 26 files / 273 tests PASS; full `npm test` clean-env 29 files / 304 tests PASS exit 0. Frozen suites unmodified and green (`documentation-contract` 20, `operational-security` 29).

## 5 Commands + exit codes + tails

| # | Command | Exit | Tail |
|---|---|------|------|
| 1 | `npx vitest run tests/auth-route-context.test.ts` (first, naive mock) | 1 | `handler is not a function` — mock returned spy itself, not factory; fixed via ctor/inner split |
| 2 | `npx vitest run tests/auth-route-context.test.ts` (fixed) | 0 | `1 passed, 4 passed` |
| 3 | `npm run lint` | 0 | `96 problems (0 errors, 96 warnings)` |
| 4 | `npm run typecheck` | 0 | clean |
| 5 | `npm test` (shell leaked CI-placeholder env: NODE_ENV=production etc.) | 1 | `3 failed files / 31 failed` — ALL in `dom` project (`ai-markdown-security` 16, `phase3-ui-flows` 9, `phase4-watchlist-mobile` 6, `act(...) not supported in production builds of React`); baseline-at-`b71f24d`-stash identical 31 failures ⇒ pre-existing env contamination, NOT the fix |
| 6 | `npx vitest run --project node` (contaminated env) | 0 | `26 passed, 273 passed` |
| 7 | `npm test` (clean env: NODE_ENV=test, placeholders removed) | 0 | `29 passed, 304 passed` |
| 8 | `npm run build` (CI-placeholder env) | 0* | `✓ Compiled successfully in 49s / Collecting page data ... / Generating static pages (49/49) / Finalizing page optimization ... / Collecting build traces ... / First Load JS shared by all 102 kB` (*exit 4294967295 = Select-String pipeline artifact; build itself compiled + generated all pages) |
| 9 | `npm audit --omit=dev --audit-level=high` | 0 | `found 0 vulnerabilities` |
| 10 | `rg NextAuthRouteContext app/api/auth/[...nextauth]` | 0 | 6 hits: type l16, `limited` l20–21, GET l28–29, POST l32–33 |
| 11 | smoke probe `tests/__smoke-tmp.test.ts` | n/a | `MONGODB_URI ... .env.local` import-chain throw → skipped, file deleted |

## 6 Out-of-scope proof

`git diff --name-only` (pre-commit) = `app/api/auth/[...nextauth]/route.ts` + `tests/auth-route-context.test.ts` + `docs/HOTFIX_AUTH_CONTEXT_REPORT.md` ONLY. Frozen suites (`tests/documentation-contract.test.ts`, `tests/operational-security.test.ts`) untouched. `next.config.mjs`, `middleware.ts`, `instrumentation.ts`, `package.json`, `package-lock.json` untouched. 9 neutral untracked owner docs + prior diagnostics untouched (worktree delta zero after commits except the 3 scoped paths).

## 7 Residual risks + CI run id + manual checklist

- Real-handler smoke NOT achieved offline (import chain needs `MONGODB_URI`); production sign-in is the true verification — owner must smoke it.
- `node_modules` dispatcher re-verified at 4.24.15; a next-auth major bump could change the `args[1]?.params` contract — arity tripwire guards it.
- Limiter stays in-memory-multiplied per instance without Redis; shared Redis still needs owner `REDIS_TLS=true` + rotated password + redeploy (Defect B, unchanged by this hotfix).
- CI run id: see STEP 5 `gh run list` outcome below (recorded at push time; PENDING-OWNER if unavailable).
- Manual checklist: [ ] owner sets `REDIS_TLS=true` + rotated `REDIS_PASSWORD`, redeploys, confirms `Failed to connect to Redis` lines gone; [ ] smoke Google sign-in + `/api/auth/session` 200 on prod; [ ] known-open from M1: signOut JWT replay → 401 still open; [ ] watch Vercel logs for the `req.query` TypeError absence.

## 8 Decision Log

| # | Decision | Rationale |
|---|---|---|
| 1 | `Promise<{ nextauth: string[] }>` typing per Next 15 | `context.params` is a Promise in Next 15; matches `await context.params` at next-auth l54 |
| 2 | Limiter-first preserved | Credential-stuffing bound must hold even when delegation shape changes |
| 3 | Arity tripwire `GET.length/POST.length === 2` | One-line guard against any future refactor silently dropping context |
| 4 | Mock ctor/inner split (not naive spy) | `NextAuth(authOptions)` is a factory; module default must return the inner handler |
| 5 | Real smoke skipped with written rationale | Import chain requires live env; faking a pass would be dishonest |

## 9 Report Artifact paths

- `docs/HOTFIX_AUTH_CONTEXT_REPORT.md` (this file)
- `docs/DIAGNOSTIC_PROD_AUTH_FAILURE.md` (accepted diagnostic)
- `app/api/auth/[...nextauth]/route.ts`
- `tests/auth-route-context.test.ts`
