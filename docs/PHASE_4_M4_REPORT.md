# Phase 4 (M4) — Performance & Resilience: Gemini Timeouts, Public Read Caches, Read Caps, Degraded Visibility, Client N+1 Elimination

**Base:** `4a30cd8` (main) at kickoff; HEAD at commit time `a84da3e` + STEP 5 pending. **Date:** 2026-09-08. Zero visual UI changes. Zero new npm deps. No `as any`. Additive JSON only. Frozen suites (`documentation-contract`, `operational-security`) UNMODIFIED.

## 1 Context Confirmation

| File | Summary | Line ranges |
|------|---------|-------------|
| `app/api/chat/route.ts` | 15s AbortController pattern mirrored: `GEMINI_TIMEOUT_MS` (l24), `postToGemini` controller+finally (l56-99), `getGeminiResponse` 2-attempt retry (l107-130) | 1-130 |
| `app/api/ai-recommendations/route.ts` | Gemini fetch + 3x backoff now per-attempt 15s: `postRecommendationsToGemini` (l39-91), `getAIRecommendations` maxRetries 3 (l94-134), bounded reads History 200 / lists 500 (l156-161) | 39-161 |
| `app/api/movie/[id]/ai-similar/route.ts` | Same per-attempt timeout: `getAISimilarMovies` controller/timeoutId (l45-58), AbortError→AI_TIMEOUT (l101-104) | 36-123 |
| `app/api/genres/route.ts` | Full response cache `GENRES_TTL 86400` via `getOrSet(publicTMDb, genres:full)` (l8, l25-78) | 8-78 |
| `app/api/trailers/route.ts` | Per-filter cache `TRAILERS_TTL 3600` `trailers:${filter}` (l13, l73-153) | 13-153 |
| `app/api/search/route.ts` | Normalized `query.trim()`+page cache `SEARCH_TTL 300` (l7, l51-66) | 7-66 |
| `app/api/celebrities/route.ts` | Page cache `CELEBRITIES_TTL 300` (l6, l26-38) | 6-38 |
| `app/api/movie/[id]/similar/route.ts` | `SIMILAR_TTL 3600` `movie:${id}:similar` (l10, l36-48) | 10-48 |
| `app/api/actor/[id]/route.ts` | `ACTOR_TTL 1800` `actor:${id}:details` (l9, l31-41) | 9-41 |
| `app/api/genre/[id]/content/route.ts` | `GENRE_CONTENT_TTL 3600` `genre:${type}:${genreId}:${page}` (l10, l77-100) | 10-100 |
| `lib/cache.ts` | `getOrSet` stampede dedup (l313-359); `CacheClearResult {deleted,remaining,complete,degraded,reason,clearedMemory}` (l55-66); degraded clear fallback (l290-291) | 55-66, 313-359 |
| `lib/cacheManager.ts` | `getCacheStats` online/fallback-memory (l88-152); `clearAllCache` prefix-scoped (l159-163) | 88-163 |
| `app/api/admin/cache/route.ts` | Pass-through of degraded fields on POST clear (l173-186) + DELETE (l225-236) | 173-186, 225-236 |
| `components/admin/CacheManagement.tsx` | Fallback Alert unchanged (l166-181); stats `fallback-memory` badge (l125-154) | 125-181 |
| `app/api/chat-history/list/route.ts` | `.sort({updatedAt:-1}).limit(100).select({_id:1,title:1,updatedAt:1,createdAt:1})` (l20-29) | 20-29 |
| `app/api/favorites/route.ts` | GET `.sort({createdAt:-1}).limit(MAX_LIST_ITEMS=500)` (l22-26) | 11-28 |
| `app/api/watchlist/route.ts` | GET same cap (l22-26) | 11-28 |
| `contexts/FavoritesContext.tsx` | New: single GET on session mount, Set<number>, optimistic toggle+rollback+toast parity (l37-143) | 1-152 |
| `contexts/WatchlistContext.tsx` | Mirrored pattern: single GET, functional setState, toast parity (l43-143) | 43-143 |
| `components/providers.tsx` | `Session > Language > Watchlist > Favorites` (l9-22) | 1-23 |
| `components/FavoriteButton.tsx` | Refactored to `useFavoritesContext` + `isFavorite(itemId)` (l4, l15-16) | 1-39 |
| `hooks/useFavorites.ts` | DELETED (zero consumers remain; rg proof §5) | — |
| `rg "useFavorites" app components hooks` | Zero hits in `app/`, `components/` (only historical docs + deleted hook path) | — |
| `docs/ARCHITECTURE_REVIEW.md` §6-7 | Strengths: cache layer, AI boundary; Risks R1 identity hot path, R3 TMDB fan-out, R5 per-process fallback | §6-7 |
| `docs/SECURITY_AUDIT.md` W3-006 notes | M-03 quota/injection (genres/trailers fan-out), M-05 unbounded lists (pre-existing, now capped) | M-03, M-05 |

## 2 Per-Step Root Cause + Fix (file:line)

### 2.0 STEP 0-A — Boot fatality reclassification (mandated, own commit `7a382b8`)

Before: `instrumentation.ts register()` threw on ANY `validateEnv` issue (`if (!result.parsed) throw`), so optional redis-shape failure (`REDIS_URL: redis configuration is contradictory or invalid`) was whole-site fatal — see `docs/DIAGNOSTIC_REDIS_BOOT_FAILURE.md` §4.

After (verbatim HEAD):
- `lib/boot-state.ts:1-19`: `export type BootRedisState = "ok" | "misconfigured"` (l9); `setBootRedisState` (l13); `getBootRedisState` (l17). Zero node: imports, zero side effects, zero lib/env imports.
- `instrumentation.ts:11-17`: `REDIS_DEGRADED_NAMES = new Set(["REDIS_URL", "REDIS_PORT"])` (l17); `register()` (l19-63): `coreErrors = result.errors.filter(!REDIS_DEGRADED)` (l33); redis-only → `setBootRedisState('misconfigured')` (l36) + ONE `health.readiness/warn` ops event `meta {redis:'misconfigured',fallback:'memory'}` (l37-43) + `console.error('[BOOT] Redis misconfigured; memory fallback active')` (l44) + RETURN (l48); any core error → log + throw exactly as today (l49-53, core wins).
- CORE-FATAL set (enumerated from `lib/env.ts validateEnv` l113-232): `MONGODB_URI` (l134, l180-182), `NEXTAUTH_SECRET` (l135, l157-164), `GOOGLE_CLIENT_ID` (l136), `GOOGLE_CLIENT_SECRET` (l137), `TMDB_API_KEY` (l138), `NEXTAUTH_URL` (l140-142, l168-176), every `NEXT_PUBLIC_*` guard name (`NEXT_PUBLIC_MONGODB_URI`, `NEXT_PUBLIC_REDIS_URL`, `NEXT_PUBLIC_REDIS_HOST`, `NEXT_PUBLIC_REDIS_PORT`, `NEXT_PUBLIC_REDIS_USERNAME`, `NEXT_PUBLIC_REDIS_PASSWORD`, `NEXT_PUBLIC_REDIS_TLS`, `NEXT_PUBLIC_NEXTAUTH_SECRET`, `NEXT_PUBLIC_NEXTAUTH_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_GOOGLE_API_KEY`, `NEXT_PUBLIC_TMDB_API_KEY` — l36-50), `TRUSTED_PROXY_CIDRS` (l200-221), `HISTORY_RETENTION_DAYS` + `CHAT_RETENTION_DAYS` (l223-232). OPTIONAL-DEGRADED: `REDIS_URL` (l186-189), `REDIS_PORT` (l190-196).
- `app/api/health/ready/route.ts:70`: `const redisComponent = getBootRedisState() === "misconfigured" ? "misconfigured" : "optional"`; redis-misconfigured ALONE does NOT downgrade overall status (200 ready when DB ok; contract refinement).
- Tests `tests/boot-fatality-classification.test.ts` (3): (i) redis-only → resolves + warn event + `misconfigured` + ready 200/ready; (ii) missing MONGODB_URI → throws; (iii) mixed → throws, no ops event. `tests/edge-import-contract.test.ts:58-60` extended with boot-state zero-`node:` assertion. Frozen suites unmodified green.

### STEP 1 — Gemini per-attempt timeouts (`9387c39`)

Root cause: recs/ai-similar Gemini POSTs had no per-attempt abort (hang = hung route until platform timeout), unlike chat's 15s pattern.

Fix: `lib/gemini-payload.ts:10` `export const GEMINI_TIMEOUT_MS = 15000`; `app/api/chat/route.ts:24` imports the shared constant (behavior-identical); `app/api/ai-recommendations/route.ts:43-44` + `app/api/movie/[id]/ai-similar/route.ts:47-48` wrap EVERY Gemini attempt in `AbortController` + `clearTimeout` in finally, passing `signal`; abort → `AIUpstreamError("AI_TIMEOUT")` → existing `httpStatusForAIError` (504) path; redacted upstream logging unchanged.

### STEP 2 — Public TMDB read caches (`9387c39`)

Root cause: 7 routes hit TMDB on every request (dead `revalidate`-only options have no effect in route handlers); quota/latency exposure per ARCH R3.

Fix: all keys via `buildCacheKey(CACHE_SCOPES.publicTMDb, …)` + `redisCache.getOrSet`: `app/api/genres/route.ts:25` (86400), `app/api/trailers/route.ts:73` (3600/filter), `app/api/search/route.ts:51` (300, trimmed query+page), `app/api/celebrities/route.ts:26` (300/page), `app/api/movie/[id]/similar/route.ts:36` (3600), `app/api/actor/[id]/route.ts:31` (1800), `app/api/genre/[id]/content/route.ts:77` (3600, type+genreId+page). No-op `revalidate` options removed where replaced.

### STEP 3 — Read caps + projections (`a84da3e`)

Root cause: unbounded reads (150 chats → 150 docs; 600 favorites → 600 docs; recs prompt from 250 histories).

Fix: `app/api/chat-history/list/route.ts:26-28` limit 100 + projection; `app/api/favorites/route.ts:24` + `app/api/watchlist/route.ts:24` `.limit(500)`; `app/api/ai-recommendations/route.ts:158-160` History 200 + Watchlist/Favorites 500 with `{title:1,type:1,_id:0}`; `watchlist/details` cap 50 unchanged.

### STEP 4 — Degraded clear visibility (`a84da3e` + pending STEP 5 delta)

Root cause: `clearScoped` redis-null path returned silent `complete:true`, hiding the memory-only fallback from operators.

Fix: `lib/cache.ts:290-291` returns `{ complete:false, degraded:true, reason:"redis-unavailable", clearedMemory }` when Redis unavailable; redis-ok path `degraded:false` (l266, l278-283). `app/api/admin/cache/route.ts:173-186` (POST clear) + `l225-236` (DELETE) pass `degraded/reason/clearedMemory/complete` through ADDITIVE-only. `CacheManagement.tsx` unchanged; existing `fallback-memory` Alert (l166-181) stays correct.

### STEP 5 — Client N+1 FavoritesContext (pending delta)

Root cause: `hooks/useFavorites.ts` (HEAD version, now staged-deleted) fetched full `/api/favorites` per card mount (`fetch('/api/favorites')` inside `useEffect [email, itemId, type]`), N GETs per page.

Fix: `contexts/FavoritesContext.tsx` (new, untracked): single GET on `[session?.user?.email]` mount (l44-80), `Set<number>` ids, `isFavorite` useCallback (l82-85), `toggleFavorite` optimistic + rollback + toast parity (l87-134, functional setState), `useMemo` value (l136-139). `components/providers.tsx:6,17-19` mounts `FavoritesProvider` inside `WatchlistProvider`. `components/FavoriteButton.tsx:4,15-16,24` + every consumer uses context (rg `useFavorites(` in `app components` = zero hits). `hooks/useFavorites.ts` deleted (staged D; zero consumers remain — no shim needed). jsdom `tests/favorites-context.test.tsx` (untracked): 5 buttons → ONE GET; POST optimistic add; forced DELETE failure → rollback.

## 3 Modified/Created Files

Committed `9387c39` (11 files): `app/api/actor/[id]/route.ts`, `app/api/ai-recommendations/route.ts`, `app/api/celebrities/route.ts`, `app/api/chat/route.ts`, `app/api/genre/[id]/content/route.ts`, `app/api/genres/route.ts`, `app/api/movie/[id]/ai-similar/route.ts`, `app/api/movie/[id]/similar/route.ts`, `app/api/search/route.ts`, `app/api/trailers/route.ts`, `lib/gemini-payload.ts`.
Committed `a84da3e` (5 files): `app/api/chat-history/list/route.ts`, `app/api/favorites/route.ts`, `app/api/watchlist/route.ts`, `lib/cache.ts`, `tests/performance-m4.test.ts`.
Committed `7a382b8` (5 files): `app/api/health/ready/route.ts`, `instrumentation.ts`, `lib/boot-state.ts`, `tests/boot-fatality-classification.test.ts`, `tests/edge-import-contract.test.ts`.
Pending STEP 5 delta: `contexts/FavoritesContext.tsx` (new), `tests/favorites-context.test.tsx` (new), `components/FavoriteButton.tsx`, `components/providers.tsx`, `hooks/useFavorites.ts` (deleted), `app/api/admin/cache/route.ts`, `tests/performance-m4.test.ts` (History.find hardening).
This report: `docs/PHASE_4_M4_REPORT.md` (commit 3 with STEP 5).

## 4 Tests Added/Changed + Results

| Suite | Tests | Result |
|---|---|---|
| `tests/boot-fatality-classification.test.ts` (STEP 0-A) | 3 | PASS |
| `tests/performance-m4.test.ts` (M4: timeouts/caches/caps/degraded) | 10 | PASS (incl. fixed recs History.find assertion) |
| `tests/favorites-context.test.tsx` (STEP 5 jsdom) | 1 | PASS |
| `tests/edge-import-contract.test.ts` (+boot-state clause) | 4 | PASS |
| `tests/ratelimit-coverage.test.ts` + `documentation-contract` 20 + `operational-security` 29 (frozen, UNMODIFIED) | — | PASS |
| Full `npm test` (default timeout, zero exclusions) | 32 files / 319 tests | PASS exit 0 |

M4 failure diagnosis (read-only task `353531`): `performance-m4 recs prompt` expected History.find ×1 got ×2 — stale worktree run: full-file run executes the earlier timeout test first, whose module-registry reset leaves the shared `History.find` mock with residual calls; isolated `-t` run passes. Harness fix (not source): `findCalls` local capture in the recs test + assert `findCalls.length === 1` with `.limit(200)` + `.select({title:1,type:1,_id:0})`; full-file suite now 10/10.

## 5 Commands + Exit Codes + Tails

| # | Command | Exit | Tail |
|---|---|------|------|
| 1 | `npm run lint` | 0 | `96 problems (0 errors, 96 warnings)` |
| 2 | `npm run typecheck` | 0 | clean (`tsc --noEmit`) |
| 3 | `npm test` (full, default timeout) | 0 | `32 passed (32) / 319 passed (319)` |
| 4 | `npm run build` | 0 | `Compiled successfully in 83s / Generating static pages (49/49) / First Load JS shared by all 102 kB / Middleware 56.9 kB` |
| 5 | `npm audit --omit=dev --audit-level=high` | 0 | `found 0 vulnerabilities` |
| 6 | rg `revalidate` on 7 cached routes | 0 | zero hits each (dead pattern removed) |
| 7 | rg `useFavorites(` in `app` + `components` | 0 | zero hits (or shim-only; none — hook deleted) |

Build tail sections: `Compiled successfully in 83s`, `Collecting page data ...`, `Generating static pages (49/49)`, `Finalizing page optimization ...`, `Collecting build traces ...`, route table incl. `ƒ Middleware 56.9 kB`, `First Load JS shared by all 102 kB`. No `UnhandledSchemeError`.

## 6 Performance Evidence Table

| Route / path | Call #1 upstream fetches | Call #2 within TTL upstream fetches | Cap / timing proof |
|---|---|---|---|
| `GET /api/search` | 1 | 0 (same key) | TTL 300 |
| `GET /api/celebrities` | 1 | 0 | TTL 300 |
| `GET /api/genres` | 1 (+fan-out inside origin fn) | 0 | TTL 86400 |
| `GET /api/trailers?filter=` | 1 (+≤10 videos) | 0 | TTL 3600 |
| `GET /api/movie/[id]/similar` | 1 | 0 | TTL 3600 |
| `GET /api/actor/[id]` | 1 | 0 | TTL 1800 |
| `GET /api/genre/[id]/content` | 1 | 0 | TTL 3600 |
| Gemini abort (recs) | signal fired, 504 `AI_TIMEOUT` | n/a | 15s `GEMINI_TIMEOUT_MS` |
| Gemini abort (ai-similar) | signal fired, handled fallback 200/500 | n/a | 15s, no unhandled rejection |
| `chat-history/list` (150 seeded) | — | returns 100 | `.limit(100)` + projection asserted |
| `favorites GET` (600 inserted) | — | returns 500 | `.limit(500)` asserted |
| `recs` (250 histories) | `History.find` ×1, `.limit(200)`, `.select({title:1,type:1,_id:0})` | — | prompt bounded |
| `clearScoped` redis-null | `degraded:true, complete:false, reason:redis-unavailable` | — | memory count numeric |
| FavoritesContext (5 buttons) | ONE `GET /api/favorites` | POST + optimistic; failure rollback | jsdom asserted |

## 7 Out-of-Scope Proof + Neutral Docs Untouched

`git diff` scope = STEP 5 files only (`contexts/FavoritesContext.tsx`, `tests/favorites-context.test.tsx`, `components/FavoriteButton.tsx`, `components/providers.tsx`, `hooks/useFavorites.ts` deleted, `app/api/admin/cache/route.ts` additive fields, `tests/performance-m4.test.ts` harness fix) on top of committed `7a382b8/9387c39/a84da3e`. Untouched: `next.config.mjs`, `middleware.ts`, rate limits, auth, quota, CIDR, TTL indexes (none applied), destructive scripts (none run), `CacheManagement.tsx` visuals. 9 neutral untracked owner docs (`docs/DEPLOYMENT_SECURITY_CHECKLIST.md`, `docs/DIAGNOSTIC_REPORT.md`, `docs/FIX_PLAN.md`, `docs/IMPLEMENTATION_COMPLIANCE_REPORT.md`, `docs/INTERRUPTED_REMEDIATION_RECOVERY_REPORT.md`, `docs/OPERATIONS.md`, `docs/PROJECT_ARCHITECTURE.md`, `docs/REMEDIATION_STATUS.md`, `docs/SECURITY.md`) + prior diagnostics never modified/committed.

## 8 Residual Risks + Manual Checklist

- TMDB enrichment fan-out in recs (≤12 parallel searches) intentionally unchanged this phase; caches bound repeat cost, not first-hit fan-out.
- Redis still optional; multi-instance deployments multiply in-memory fallback state (ARCH R5) — one-line OPERATIONS decision outstanding.
- No physical TTL migration (ARCH R2); read-time bounds only.
- CI run id observation still PENDING-OWNER (billing-locked Actions per prior hotfix; `gh` not re-polled this phase — record at push).
- Vercel preview smoke: auth sign-in + `/api/auth/session` 200, favorites/watchlist caps, AI routes 504-on-hang, `health/ready` redis label, admin cache degraded fields, M1 signOut JWT replay → 401 (still open, unchanged).

## 9 Decision Log

| # | Decision | Rationale |
|---|---|---|
| 1 | STEP 0-A in its own commit before perf work | Boot fatality is P1 resilience, not perf; isolated rollback |
| 2 | Shared `GEMINI_TIMEOUT_MS` constant | Single source; chat refactor behavior-identical |
| 3 | `getOrSet` + `buildCacheKey(publicTMDb)` for all 7 routes | Existing canonical pattern; `ns()` stays as safety net |
| 4 | Read caps at query level (limit+select), not post-filter | Bounds Mongo + payload together; projection minimizes PII surface |
| 5 | Additive degraded fields only | JSON contract frozen; UI reads existing Alert path |
| 6 | Delete `useFavorites` (no shim) | Zero consumers remain; shim would be dead code |
| 7 | Harden recs test with local `findCalls` capture | Full-file mock bleed, not source regression; assertion now file-order independent |

## 10 Report Artifact Paths

- `docs/PHASE_4_M4_REPORT.md` (this file)
- `docs/DIAGNOSTIC_REDIS_BOOT_FAILURE.md` (STEP 0-A mandate)
- `lib/boot-state.ts`, `instrumentation.ts`, `app/api/health/ready/route.ts`
- `tests/boot-fatality-classification.test.ts`, `tests/performance-m4.test.ts`, `tests/favorites-context.test.tsx`
