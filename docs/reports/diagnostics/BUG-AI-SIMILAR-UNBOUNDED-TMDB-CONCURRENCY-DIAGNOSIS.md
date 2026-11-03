# BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY — Read-Only Diagnosis

**Phase 8, Step 1 of 2 (diagnosis only). No fix implemented.**

| Field | Value |
|---|---|
| Project | MovieMind |
| Repository | movie-recommendation-system |
| Phase | Phase 8 — AI-Similar Enrichment Concurrency Diagnosis |
| Prompt type | READ-ONLY DIAGNOSTIC |
| Finding ID | PERF-001 |
| Bug ID | BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY |
| Risk level | MEDIUM |
| Diagnostic status | **PASS WITH WARNINGS** |
| Root-cause classification | **UNBOUNDED ENRICHMENT CONCURRENCY DEFECT** |
| Reproducibility | **DETERMINISTIC STATIC** |
| Impact | **LATENCY AND FAN-OUT** |
| Production impact | **THEORETICAL** |
| Confidence | **HIGH** |
| Commit policy | COMMIT_ALLOWED: NO — honored |
| Deployment policy | DEPLOYMENT_ALLOWED: NO — honored |

---

## 1. Executive summary

`GET /api/movie/[id]/ai-similar` enriches every AI/TMDB suggestion with exactly one
TMDB `/search/movie` request, dispatched through a single unbounded
`await Promise.all(aiSuggestions.map(...))` at
`app/api/movie/[id]/ai-similar/route.ts:253`.

The fan-out is **finite but unpooled**: the suggestion count is hard-capped at 12
(Zod `aiSimilarMoviesSchema.similar_movies.max(12)`, and `.slice(0, 12)` on both TMDB
fallback paths), so the true maximum in-flight TMDB enrichment count is **12 per route
invocation**, with no pool, no per-request `AbortController`, and no client-side
timeout on those fetches.

Two reported statements required correction against current source:

1. **"Cache-hit behavior may avoid enrichment" — FALSE.** The cached value is the
   *pre-enrichment suggestion list* (`route.ts:161-221`). Enrichment sits *outside*
   the cached closure (`route.ts:253`), so a cache hit still fires up to 12 TMDB
   search requests. Cache hits avoid only the details fetch, Gemini, and the
   in-origin TMDB `similar` fallback.
2. **"Retry behavior may amplify Gemini or TMDB calls" — partially false.** Gemini
   retries (max 3 attempts) are strictly **sequential**, so they add Gemini request
   count and latency but **zero TMDB concurrency**. TMDB calls in this path have
   **no** retry wrapper at all (`lib/tmdb.ts` / `lib/fetchWithRetry.ts` are not used
   here). Retry amplification is therefore Gemini-only and does not contribute to
   the reported defect.

The defect is a real code defect, not test- or documentation-only. Per-suggestion
failure handling is already correct (all errors are caught and converted to
`id: null` partials, then filtered), and `Promise.all` cannot reject in this path —
so no fix may change those semantics.

Smallest safe correction: copy the already-established local bounded-pool shape
(`app/api/ai-recommendations/route.ts:352-401`, pool 4) into the enrichment loop.
No new dependency, no new abstraction, no behavior change other than in-flight count
and its latency consequence.

## 2. Diagnostic status

**PASS WITH WARNINGS.**

All completion criteria in §12 met. Warnings:

- W1: Production traffic, TMDB 429 rate, and latency impact are **not measured**
  (no observability backend, no provider console access, both prohibited in this
  phase). Impact remains THEORETICAL.
- W2: No existing test measures maximum in-flight TMDB calls in this route; the
  concurrency bound was established statically. Per §6, no test was created in a
  diagnostic phase.
- W3: Full `npm test` was **not** re-executed (§24, §40): isolation was proven only
  for the four files actually run, and no source file was modified.

## 3. Finding and bug identity

- **Finding:** PERF-001 — "ai-similar enrichment unbounded `Promise.all`"
  (`docs/PROJECT_BLUEPRINT.md:349`, `docs/PROJECT_BLUEPRINT.md:370-379`;
  severity Medium / confidence High / status Confirmed), restated in
  `docs/reports/PHASE-1-CURRENT-STATE-VERIFICATION-REPORT.md:494-535` as
  `VERIFIED OPEN`, priority HIGH, evidence class VERIFIED, with required next action
  "Concurrency-bound diagnostic before implementation".
- **Bug ID:** BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY.
- **Primary goal:** exact maximum concurrency, request amplification, cache behavior,
  failure behavior, and smallest safe correction for TMDB enrichment in this route.
- **Out of scope for this phase and untouched:** PERF-002 (uncached trending shards,
  genres fan-out), REL-001 (closed in Phase 7), REL-002, DATA-001, SEC-004,
  QUAL-001, OPS-001, TEST-001, cache-key namespace/admin-scope observation (§22.4).

## 4. Initial Git state

Captured before any command capable of mutating state:

```text
git rev-parse --abbrev-ref HEAD   main
git rev-parse HEAD                70fe77655467f5105f5d0e9b02594ba1c62b2952
git status --porcelain=v2 --branch
# branch.oid 70fe77655467f5105f5d0e9b02594ba1c62b2952
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -0
```

- Root: `D:/fork ai to create website/final porject/movie-recommendation-system`
- Upstream relationship: `origin/main`, **ahead 2 / behind 0**.
- **Staged additions / modifications / deletions: NONE** (`git diff --cached
  --name-status` empty at §50 capture; porcelain shows all tracked entries in
  `1 .M`/`1 .D` unstaged form).
- **Unstaged modifications (34)** — all pre-existing prior-phase/user work:
  `app/api/ai-recommendations/route.ts`, `app/api/chat-history/route.ts`,
  `app/api/chat/route.ts`, `app/api/genres/route.ts`, `app/api/trailers/route.ts`,
  `app/api/user/route.ts`, `app/genre/[id]/page.tsx`, `app/movie/[id]/page.tsx`,
  `app/trending/page.tsx`, `app/tv/[id]/page.tsx`, `components/FavoriteButton.tsx`,
  `components/ForYouSection.tsx`, `components/MoodBasedRecommendations.tsx`,
  `components/TimeBasedMovies.tsx`, `components/TopRatedMovies.tsx`,
  `components/TopRatedTVShows.tsx`, `components/TrendingSection.tsx`,
  `contexts/FavoritesContext.tsx`, `contexts/WatchlistContext.tsx`,
  `docs/PROJECT_BLUEPRINT.md`, `docs/SECURITY_AUDIT.md`, `docs/UI_UX_REVIEW.md`,
  `lib/security/auth.ts`, `lib/security/rateLimit.ts`, `middleware.ts`,
  `package.json`, `package-lock.json`, `tests/documentation-contract.test.ts`,
  `tests/m5-a11y.test.tsx`, `tests/performance-m4.test.ts`,
  `tests/phase4-watchlist-mobile.test.tsx`, `tests/ratelimit-ip-security.test.ts`,
  `tests/session-lifecycle.test.ts`, `tests/tmdb-proxy-validation.test.ts`.
- **Unstaged deletion (1):** `docs/ARCHITECTURE_REVIEW.md` — preserved, not restored.
- **Untracked (from the prior snapshot + `docs/reports/` directory entry):**
  `lib/list-membership.ts`,
  `tests/ai-recommendations-ownership-exclusion.test.ts`,
  `tests/authenticated-read-rate-limit.test.ts`,
  `tests/chat-quota-ordering.test.ts`,
  `tests/list-membership-collision.test.tsx`,
  `tests/middleware-security.test.ts`,
  plus `docs/reports/` (7 phase reports + 4 diagnostic reports).
- `app/api/movie/[id]/ai-similar/route.ts` is **clean (tracked, unmodified)** at
  baseline `70fe776` — the file under diagnosis was never touched by Phases 2-7.

## 5. Applicable instructions

- No `AGENTS.md` anywhere in the repository; no `.cursor/` directory and therefore no
  `.cursor/rules/*.mdc` (verified by filesystem enumeration of the root and a
  recursive search). Nothing to read at those paths.
- User rules applied: staff-engineer production standard (read before edit, no
  placeholders, strict typing, minimal atomic diff, honest verification reporting);
  strict JSON/tool-argument rules.
- Repository instruction sources read as authoritative:
  `docs/PROJECT_BLUEPRINT.md` (§19 finding matrix, PERF-001 §370-379, roadmap §475,
  cache/namespace §198, route inventory §216-218), `docs/SECURITY_AUDIT.md`
  (AI-route threat table §178-179, availability controls §285, cache scopes §818,
  stated limitation "no concurrency testing" §17/§103),
  `docs/reports/PHASE-1-CURRENT-STATE-VERIFICATION-REPORT.md` **corrected Section 41**
  (in full: six corrections, PASS WITH WARNINGS, dirty-file attribution rules,
  §41.3/§41.4 Git-evidence format adopted here) and its PERF-001 block,
  `docs/reports/PHASE-7-CHAT-QUOTA-ORDERING-CORRECTION-COMPLETION-REPORT.md`
  (precedent for the two-step protocol and the deny-by-default fetch-guard harness),
  `README.md`, `.github/workflows/ci.yml`, `package.json`, `vitest.config.mts`.
- Network/external-state safety rules in this prompt were treated as binding (§24).

## 6. Environment versions

| Tool | Version |
|---|---|
| OS | win32 10.0.19045 (Windows 10) |
| Shell | PowerShell 5.1.19041.6456 |
| Node | v24.21.0 |
| npm | 11.5.2 |
| Git | 2.50.1.windows.1 |
| Next.js (declared / resolved) | `15.5.24` / lockfile-managed; CI Node 22 |
| Vitest | `^3.2.7` (projects: `node` for `.ts`, `dom`/jsdom for `.tsx`) |

Baseline as stated by the phase brief: 41 test files / 415 tests / exit 0 / typecheck
exit 0 / lint exit 0 with 93 warnings / audit exit 0 / build exit 0. Local files
counted 42 entries in `tests/` (41 `.test.ts(x)` suites plus `tests/helpers.ts`),
consistent with the 41-file baseline.

## 7. Files and symbols inspected

Full reads:

- `app/api/movie/[id]/ai-similar/route.ts` (311 lines) — symbols `TMDB_API_KEY`,
  `BASE_URL`, `MovieDetailItem`, `getAISimilarMovies`, `maxRetries`, `backoffTime`,
  `controller`/`timeoutId`, `AIUpstreamError`, `redisCache`, `cacheKey`,
  `aiSuggestions`, `enhancedRecommendations`, `validRecommendations`, `GET`.
- `lib/cache.ts` (360 lines) — `RedisCache.ns`, `get`, `set`, `getOrSet`,
  `inflightPromises` (`lib/cache.ts:22-26`), `MAX_INFLIGHT_ENTRIES = 1000`,
  `memoryCache`, `MAX_MEMORY_ENTRIES = 5000`, `safeRedisOp`.
- `lib/cache-namespace.ts` — `CACHE_NAMESPACE`, `CACHE_SCOPES.aiSimilar`,
  `buildCacheKey`, `normalizeKeyComponent`, `applyNamespace`.
- `lib/gemini-payload.ts` — `GEMINI_TIMEOUT_MS = 15000`, `GEMINI_GENERATE_URL`,
  `getGeminiApiKey`, `SIMILAR_MOVIES_SYSTEM_INSTRUCTION`,
  `buildSimilarMoviesGeminiPayload`.
- `lib/ai-security.ts` — `aiSimilarMoviesSchema` (`.min(1).max(12)`),
  `parseAISimilarMoviesFromText`, `extractGeminiText` (`MAX_ASSISTANT_RESPONSE_LENGTH
  = 4000`), `mapAIError`, `httpStatusForAIError`, `redactSensitive`, `AIUpstreamError`.
- `lib/security/rateLimit.ts` — `RATE_LIMITS.aiSimilar`
  (`maxRequests: 10, windowMs: 60_000, prefix: "ai-similar"`, `:293`),
  `applyRateLimitUser`, `checkRateLimit`, `getClientIdentifier`.
- `lib/security/auth.ts` — `requireUser`, `requireSession`, `tryRequireUser`.
- `middleware.ts` (146 lines) — CONFIG-001 sensitive-leaf carve-out (`:57-64`),
  matcher entry `'/api/movie/:id/ai-similar'` (`:145`).
- `app/api/ai-recommendations/route.ts` (530 lines) — **bounded pool 4**
  (`:352-401`), `getAIRecommendations` retry loop, cache-hit-before-quota order.
- `app/api/watchlist/details/route.ts` — **bounded pool 8** (`DETAIL_POOL_SIZE`,
  `:20`, loop `:45-50`), `MAX_DETAIL_ITEMS = 50`.
- `app/api/genres/route.ts` — unbounded `Promise.all` over ~20 genres (`:39`).
- `app/api/trailers/route.ts` — unbounded `Promise.all` over `.slice(0, 10)` (`:105`).
- `lib/tmdb.ts`, `lib/fetchWithRetry.ts` — 8s timeout / 2 retries / `redactUrlForLog`
  (confirmed **not** used by the ai-similar route).
- `lib/redis.ts`, `lib/redis-config.ts` (`commandsQueueMaxLength: 500`,
  `disableOfflineQueue: true`), `lib/mongodb.ts`, `lib/env.ts`.
- `app/movie/[id]/page.tsx:159-179` — the only in-repo caller of the route.
- `app/api/admin/cache/route.ts:44-56` + `lib/cacheManager.ts:22-57` — scope
  allowlist and invalidation key lists.
- Tests: `tests/performance-m4.test.ts` (full), `tests/admin-chat-ai-security.test.ts`
  (ai-similar + helpers), `tests/stale-identity.test.ts`, `tests/middleware-security.test.ts`,
  `tests/redis-cache-security.test.ts` (R4-G stampede), `tests/redis-queue-calibration.test.ts`
  (pool-shape test), `tests/performance-phase2.test.ts` (faithful in-memory `getOrSet`
  mirror), `tests/ai-recommendations-ownership-exclusion.test.ts` (harness precedent
  for AI routes + fetch spies), `tests/chat-quota-ordering.test.ts` (deny-by-default
  fetch-guard precedent), `tests/helpers.ts`, `tests/documentation-contract.test.ts`.
- Config: `package.json`, `vitest.config.mts`, `.github/workflows/ci.yml`,
  `next.config.mjs`, `lib/env.ts`.

## 8. Complete route lifecycle

| # | Stage | Location | External calls before/at this point |
|---|---|---|---|
| 1 | `requireUser()` (fresh role + jti revocation + DB existence) | `route.ts:132-135` | MongoDB reads only |
| 2 | `applyRateLimitUser(request, email, RATE_LIMITS.aiSimilar)` | `route.ts:137-143` | Redis `INCR`/`P EXPIRE`/`P TTL` on `…v1:ai-similar:user:<email>` (memory fallback if Redis null) |
| 3 | `await params` | `route.ts:145` | none |
| 4 | ID validation `/^\d{1,10}$/` | `route.ts:150-156` | none |
| 5 | cache key `movie:${movieId}:ai-similar` | `route.ts:158` | none |
| 6 | `redisCache.getOrSet(key, origin, 86400)` → `get` | `route.ts:161`, `lib/cache.ts:313-335` | Redis `GET` (or memory hit) |
| 6a | **HIT** → skip 7-13, jump to 14 | `lib/cache.ts:320-325` | 0 Gemini, 0 origin TMDB |
| 7 | origin: in-flight dedup registration | `lib/cache.ts:330-355` | none |
| 8 | origin: TMDB movie details `?append_to_response=credits` | `route.ts:166-173` | **1 TMDB** (no timeout, no retry, no signal) |
| 9 | details non-OK → `throw` → `getOrSet` rejects → 500 | `route.ts:175-177` | no cache write |
| 10 | `getAISimilarMovies(movieDetails)` | `route.ts:180` → `:34-122` | ≤3 Gemini POSTs, sequential |
| 11 | `aiResults.length < 4` → throw → TMDB `similar` fallback | `route.ts:183-217` | **1 TMDB** (`:192-195`) |
| 12 | fallback failure → `return []` (cached 24 h) | `route.ts:213-216` | — |
| 13 | origin result cached via `getOrSet.then(set)` | `lib/cache.ts:335-345` | Redis `SET` EX 86400 |
| 14 | empty list → emergency `/movie/popular` (NOT cached) | `route.ts:224-250` | **1 TMDB** |
| 15 | **Enrichment: `await Promise.all(aiSuggestions.map(fetch search/movie))`** | `route.ts:253-303` | **≤12 TMDB concurrently** |
| 16 | `filter(movie.id !== null)` | `route.ts:305` | none |
| 17 | `NextResponse.json({ results })` | `route.ts:307` | none |
| 18 | top-level `catch` → `500 Failed to generate similar movies` | `route.ts:310-315` | none |

### Early-return matrix (Gemini/TMDB reachability)

| Early return | HTTP | Gemini | TMDB |
|---|---|---|---|
| `requireUser` denied | 401 / 500 | 0 | 0 |
| rate limited | 429 (+`Retry-After`) | 0 | 0 |
| invalid movie id | 400 | 0 | 0 |
| details fetch non-OK | 500 (top-level catch) | 0 | 1 (details) |
| cache hit | 200 | 0 | **≤12 (enrichment only)** |
| AI `<4` / AI error / AI timeout | 200 | 1-3 | 1 (details) + 1 (similar) + ≤12 |
| all fallbacks empty | 200 with `{results: []}` | 1-3 | 1 + 1 + 1 (popular) |
| enrichment all-fail | 200 `{results: []}` | 1-3 | 1 + 1 + ≤12 (all `id:null`) |

## 9. Authentication and middleware behavior

- Handler auth: `requireUser()` (`lib/security/auth.ts:88-151`) — session via
  `getServerSession`, `RevokedSession.exists({jti})`, fresh DB `User.findOne` role.
  401 on missing/revoked/deleted; 500 on DB error. Unchanged by any fix here.
- Middleware: `config.matcher` includes `'/api/movie/:id/ai-similar'`
  (`middleware.ts:145`) and the public `/api/movie/` carve-out explicitly excludes
  this leaf (`middleware.ts:57-64`, CONFIG-001), so an untokened request gets an
  early 401 before the handler. Verified by `tests/middleware-security.test.ts:44-52`.
- Middleware is defense-in-depth; the handler remains authoritative. No fix in this
  path may weaken either layer.

## 10. Validation and rate-limit behavior

- Route param: `/^\d{1,10}$/` before any external call (`route.ts:150`). No query/body
  input; no Zod body schema needed.
- Rate limit: per-user bucket `…v1:ai-similar:user:<email>`, **10 requests / 60 s**
  (`lib/security/rateLimit.ts:293`), Redis `INCR`+`P EXPIRE` with bounded in-memory
  fallback.
- **No daily quota** on this route (unlike `/api/ai-recommendations`'s
  `consumeQuota(recs, 20)`). Cost control is therefore per-minute only.
- The rate limit bounds *route invocations*, not *internal fan-out*. 10 invocations
 /min/user are fully sufficient to issue 120 TMDB searches/min/user. This is the
  central control gap (H10 REJECTED, §33).
- TMDB API key is read once at module load (`route.ts:22`) and interpolated into
  **query strings** for all four TMDB calls (`:167`, `:193`, `:230`, `:262`). These
  are raw `fetch` calls, so they bypass `redactUrlForLog` discipline in
  `lib/fetchWithRetry.ts:14-24`; any error text containing the URL can carry the key
  into logs. In this route the `!searchResponse.ok` branch discards the body and the
  catch logs a fixed string (`route.ts:295-299`), so no key-bearing URL is currently
  logged from the enrichment path. Recorded as an observation, not a fix.

## 11. Cache behavior

- **Implementation:** `RedisCache` singleton via relative import
  `import redisCache from '../../../../../lib/cache'` (`route.ts:7`). Note the
  specifier is inconsistent with the `@/lib/cache` alias used by every other route;
  Vitest resolves both to the same module id, so mockability is unaffected.
- **Key:** literal `movie:${movieId}:ai-similar` (`route.ts:158`), then namespaced +
  per-component normalized by `RedisCache.ns()` →
  `movie-recommendation-system:{production|development}:v1:movie:<id>:ai-similar`.
  `movieId` is digits-only (≤10 chars), so no key injection or escape is possible.
  `CACHE_SCOPES.aiSimilar` (`public:ai-similar`) exists in
  `lib/cache-namespace.ts:32` but **this route never uses it** (see §22.4).
- **Identity:** key contains no email, role, or per-user component. Results are
  effectively **public and shared across all users** for a given movie id.
- **TTL:** 86400 s (24 h) (`route.ts:220`). Redis `SET … EX` plus an always-written
  in-process memory entry (`lib/cache.ts:146-163`).
- **Hit:** origin skipped → details fetch, Gemini, and `similar` fallback all skipped.
  **Enrichment is NOT skipped** (it lives outside the closure). Net per hit: up to 12
  TMDB search requests, 0 Gemini.
- **Miss:** full path — 1 details + ≤3 Gemini + optional 1 `similar`, then ≤12
  searches.
- **Payload cached:** the *un-enriched* suggestion array
  `{title, year?, reasoning?}[]`. Enriched objects (`id`, `poster_path`,
  `vote_average`) are **never cached**.
- **Empty/partial caching:** `getOrSet` writes whenever
  `freshData !== undefined` (`lib/cache.ts:336-341`). `[]` returned by
  `route.ts:215` **is cached for 24 h**. So a movie whose AI and `similar` paths both
  fail permanently pins `[]` and makes every later request execute: cache hit →
  empty → emergency `/movie/popular` (1 call) → 12 enrichment searches. That steady
  state is the worst recurring cost, and it is invisible to "cache hit" reasoning.
- **Failures:** a rejected origin (details non-OK, or an `AIUpstreamError` escaping
  both inner catches — not reachable because the inner `catch` at `:188` is
  unconditional) is not cached and releases the in-flight slot
  (`lib/cache.ts:346-349`), so retries are possible.
- **Coalescing / stampede:** in-process `inflightPromises` map
  (`lib/cache.ts:22-26`, `:330-334`) makes concurrent same-key misses share one
  origin. Proven by `tests/redis-cache-security.test.ts:261-275`
  ("ten concurrent same-key misses call origin once"). The map is LRU-evicted at
  `MAX_INFLIGHT_ENTRIES = 1000`, so coalescing degrades under very high distinct-key
  load. Coalescing is **per Node process**; serverless/multi-instance deployments
  have no cross-instance coalescing.
- **Effect on the concurrency risk:** coalescing bounds *origin* (Gemini + details)
  duplication per instance. It does **not** bound enrichment, because enrichment is
  per-invocation, not per-origin. Cache behavior therefore *changes the shape* of the
  risk (hit-path fan-out persists) rather than reducing it.

## 12. Gemini behavior

- Endpoint/model: `GEMINI_GENERATE_URL` built from
  `DEFAULT_GEMINI_MODEL = 'gemini-3.7-flash'` (`lib/gemini-payload.ts:9-20`); key
  transported via `x-goog-api-key` header, never in a URL (`route.ts:53`).
- Payload: `buildSimilarMoviesGeminiPayload` — title(200)/year/genres(12)/
  overview(500)/director(120)/cast(5×120) bounded fields, labeled
  `UNTRUSTED_TMDB_MOVIE_DATA`, `maxOutputTokens: 1500`, four
  `BLOCK_MEDIUM_AND_ABOVE` safety settings.
- Timeout: per-attempt `AbortController` + `setTimeout(..., GEMINI_TIMEOUT_MS=15000)`
  (`route.ts:46-48`), cleared on completion (`:59`) and again in `catch` (`:101`).
  `AbortError` maps to `AI_TIMEOUT` and is thrown immediately without retry
  (`route.ts:105-107`).
- Retry policy: `maxRetries = 3`, `backoffTime` 1000 → ×2. Retries on HTTP
  503/429/≥500 (`:70-76`) and on `AI_UNAVAILABLE` (`:108-113`). Attempts are
  **strictly sequential** — at most one Gemini request in flight per route
  invocation. Worst case ≈ 3 × 15 s + 3 s backoff ≈ 48 s.
- Gap (observation): `clearTimeout` at `:59` runs *before* the body is read, so a
  server that sends headers then stalls the body stream hangs unbounded.
- Parsing: `response.json()` guarded → `AI_INVALID_RESPONSE` on parse failure;
  `extractGeminiText` (Zod-passthrough shape, first candidate part, trimmed, ≤4000
  chars); `parseAISimilarMoviesFromText` = optional fenced JSON → `JSON.parse` →
  `aiSimilarMoviesSchema.safeParse`. No silent repair.
- Error mapping: `mapAIError` + `httpStatusForAIError` exist, but this route never
  surfaces an AI error code to the client: every Gemini failure is swallowed by the
  unconditional `catch` at `route.ts:188` and converted into the TMDB `similar`
  fallback. (Contrast: `ai-recommendations` returns 504/429/503 with `code`.)

## 13. Suggestion count and parser limits

| Source | Bound | Location |
|---|---|---|
| AI (Gemini) | `z.array(aiSimilarMovieSchema).min(1).max(12)`, `.strict()` object, title ≤200, `year` `^\d{4}$`, reasoning ≤300 | `lib/ai-security.ts:152-163` |
| Prompt instruction | "Include at most 12 similar movies" | `lib/gemini-payload.ts:78` |
| TMDB `similar` fallback | `.slice(0, 12)` | `route.ts:205` |
| Emergency `popular` fallback | `.slice(0, 12)` | `route.ts:238` |

**Maximum accepted suggestions = 12, enforced on every path that can produce a
non-empty list.** A `min(1)` schema violation (0 items) fails validation →
`AI_INVALID_RESPONSE` → fallback. No truncation happens after enrichment, so the
response can carry all 12 enriched items.

## 14. TMDB enrichment flow

For each suggestion (`route.ts:253-303`):

1. `GET ${BASE_URL}/search/movie?api_key=…&query=<title>&year=<year>` with
   `{ next: { revalidate: 3600 } }` (`:261-264`). `title` is
   `encodeURIComponent`-escaped; `year` falls back to `''`.
2. Non-OK → return `{...movie, poster_path: null, id: null, vote_average: 0}`
   (`:266-273`). Body not read, no throw.
3. OK → `searchData.results[0]` (`:276`) — a body without a `results` array throws a
   `TypeError` **inside the `try`**, which is caught at `:295`.
4. Match → `{id, title, release_date, poster_path, vote_average, reasoning}`
   (`:278-286`).
5. No match → same `id: null` shape as (2).
6. Any throw → `console.error('TMDB search failed')` + `id: null` shape (`:295-303`).
7. `filter(movie.id !== null)` (`:305`) drops unresolved items.

Requests per suggestion: **exactly 1** (no detail follow-up, no per-item second call).

## 15. Current concurrency primitive

`await Promise.all(arrayOfAsyncMappers)` — `route.ts:253`. Not a pool, not a
sequential loop, not `Promise.allSettled`. `Array.prototype.map` starts every
async mapper on the current turn, so all N requests are dispatched before the first
response arrives.

## 16. Maximum in-flight request count

**Per route invocation: min(12, suggestions) → hard maximum 12 concurrent TMDB
`/search/movie` requests.**

Additional TMDB requests that can overlap the enrichment window: none (details and
`similar` are awaited earlier inside the origin; `popular` is awaited before `:253`).
The 3 route-level TMDB calls (details, `similar`, `popular`) are each serial, so the
peak TMDB concurrency for one invocation is exactly 12.

Per process: no semaphore exists anywhere between concurrent invocations
(`lib/`, `app/` contain no pool/semaphore/queue helper — verified by search for
`Semaphore|pool|concurrency|worker` and by the `lib/` file inventory).

## 17. Request-amplification calculations

All figures are **theoretical upper bounds** derived statically. No production
traffic assumption is made or implied.

Per route invocation:

| Path | Gemini | TMDB | Max TMDB in flight |
|---|---|---|---|
| Cache hit, non-empty | 0 | ≤12 | **12** |
| Cache hit, cached `[]` | 0 | 1 (popular) + ≤12 | **12** |
| Cold miss, AI success (≥4) | ≤3 | 1 (details) + ≤12 | **12** |
| Cold miss, AI fail → `similar` | ≤3 | 1 + 1 + ≤12 | **12** |
| Cold miss, everything fail | ≤3 | 1 + 1 + 1 | 1 |

Fan-out across simultaneous route invocations (each independent; no shared limiter,
no semaphore, cross-process no coalescing):

| Simultaneous invocations | TMDB requests total | Max TMDB in flight | After pool 4 | After pool 4 (batches) |
|---|---|---|---|---|
| 1 | ≤12 (≤14 incl. details+similar) | **12** | 4 | 3 |
| 5 | ≤60 (≤70) | **60** | 20 | 3 |
| 10 | ≤120 (≤140) | **120** | 40 | 3 |

Per-user sustained bound (rate limit 10/min/user, all cache-hit):
**10 × 12 = 120 TMDB search requests per minute per user**, i.e. 2 searches/second
steady-state per authenticated user. After pool 4 the same user volume still yields
120 searches/min (throughput is rate-limit-bounded), but only ≤40 in flight.

Multi-user: buckets are per-email with no global TMDB budget, so M distinct
authenticated users scale the bound linearly: **M × 120 searches/min**. That is an
abuse-capacity observation, not a traffic claim.

`next: { revalidate: 3600 }` on these `fetch` calls is Next.js data-cache metadata,
not a concurrency limiter: distinct titles produce distinct URLs, so it provides no
in-request dedup, and it is not reliably active in a route handler that is itself
dynamic. It must not be counted as a mitigation.

## 18. Retry and timeout behavior

| Call site | Timeout | Abort signal | Retries |
|---|---|---|---|
| Gemini POST (`:50`) | 15 000 ms | yes | ≤3 attempts, sequential, backoff 1 s/2 s |
| TMDB details (`:166`) | none | no | none |
| TMDB `similar` (`:192`) | none | no | none |
| TMDB `popular` (`:229`) | none | no | none |
| TMDB `search/movie` (`:261`) | none | no | none |

- `lib/fetchWithRetry.ts` (10 s default / 3 attempts) and `lib/tmdb.ts`
  (8 s timeout / 2 retries / `retryDelay` 1 s) exist and are used by other routes;
  **this route imports neither.** Adding a `fetchWithRetry`-style timeout would be a
  separate change (see §35 Option C note).
- Concurrency conclusion: retries cannot raise TMDB in-flight count (H4 REJECTED).
  They do raise Gemini request count (×3) and worst-case origin latency (~48 s).

## 19. Failure and partial-success behavior

- `Promise.all` at `:253` **cannot reject**: every branch inside the mapper returns an
  object (non-OK → `id: null`; throw → `id: null`). `searchResponse.json()` on a
  non-JSON body throws `SyntaxError` inside the `try` → caught.
- Therefore partial success survives individual failures, and one failure never
  discards the other 11 results (H5 REJECTED, H6 CONFIRMED).
- Aggregate failure semantics: TMDB enrichment failure never yields 5xx; it yields a
  200 with fewer (or zero) results. The only 500 sources are the top-level `catch`
  (`:310`) — e.g. details non-OK, Redis-layer surprise, or a JSON-shape surprise at
  `similarData.results.slice(...)` / `popularData.results.slice(...)`.
- Any fix must preserve: (a) no rejection propagation, (b) `id: null` → filtered,
  (c) 200-with-partials, (d) the fixed log strings (no error objects logged, M-04
  policy).

## 20. Deduplication and ordering behavior

- **Deduplication: none, before or after enrichment** (`route.ts` contains no
  `Set`/`Map`/`normalizeTitle` logic). Duplicate AI titles (a real Gemini behavior,
  e.g. the same franchise repeated) produce duplicate identical upstream searches.
  H7 REJECTED.
- **Ordering:** `Promise.all` preserves the input-order of results;
  `validRecommendations` therefore keeps suggestion order, with unmatched entries
  removed by the `id !== null` filter. Ordering is stable today and must stay stable
  — the caller renders `aiSimilarData.results` directly
  (`app/movie/[id]/page.tsx:161-168`) with no client-side sort.
- Chunked-batch pooling preserves both properties, which is why the existing local
  pattern is safe here.

## 21. Concurrent cache-miss behavior

- Same instance, same key: coalesced by `inflightPromises` → one details + one Gemini
  sequence shared by all concurrent misses (`lib/cache.ts:330-334`; proven by
  `tests/redis-cache-security.test.ts:261-275`).
- Same instance, different keys: independent origins, each ≤3 Gemini + 1 TMDB details;
  enrichment of each still fans out ≤12 independently.
- Different instances (serverless scale-out / multiple replicas): **no coalescing at
  all** — each instance repeats the full origin and the full 12-way enrichment. Cold
  start after a deploy or after a 24 h TTL expiry is the realistic trigger.
- Because enrichment is outside the cached closure, the 12-way fan-out is **not** a
  stampede at all: it is the *steady-state per-request* cost. Stampede exposure
  (origin duplication across processes) is a strictly smaller, separately-classified
  concern (§28.2).

## 22. Nearby bounded-concurrency patterns

### 22.1 `app/api/ai-recommendations/route.ts:352-401` — POOL 4 (closest match)

- Helper/shape: inline `const concurrentLimit = 4;` + index-stepping `for` loop +
  `Promise.all(batch.map(...))` + `push(...batchResults)`.
- Worker size: **4**.
- Error behavior: per-suggestion `try/catch` → `return null` on failure; post-loop
  `.filter(Boolean)` + `Map` dedupe by TMDB id.
- Result ordering: preserved (sequential batches, ordered push).
- Partial success: yes.
- Timeout: raw `fetch`, no signal, no timeout (same gap as ai-similar).
- Reusable without abstraction: **yes — identical shape**: `≤12` Zod-capped
  suggestions, one TMDB search per item, per-item failure → partial, filter, ordered
  response. This is the template.
- Copying introduces duplication: yes, ~4 lines of loop scaffolding around the
  existing mapper body.
- Shared helper exists: **no**.

### 22.2 `app/api/watchlist/details/route.ts:20,45-50` — POOL 8

- Named module const `DETAIL_POOL_SIZE = 8` with a `REDIS-CAL` rationale comment
  (caps per-invocation Redis pressure: GET + SET per item).
- Input also capped by `MAX_DETAIL_ITEMS = 50`.
- Error behavior: `resolveItem` try/catch → returns base item. Ordering preserved.
- Timeout: delegates to `lib/tmdb.ts` → 8 s / 2 retries via `fetchWithRetry`, and
  caches per item via `getOrSet`.
- Reusable: yes as a *shape*; the number 8 was chosen for a Redis-queue reason and a
  50-item input, neither of which applies here.

### 22.3 Unbounded counter-examples (current, not proposed)

- `app/api/genres/route.ts:39` — `Promise.all` over ~20 genre discover calls,
  public IP bucket 10/min + 24 h cache.
- `app/api/trailers/route.ts:105` — `Promise.all` over `.slice(0, 10)` video calls,
  10/min + 1 h cache.
  Both rely solely on rate limit + cache; neither is in Phase 8 scope.

### 22.4 Adjacent observation (not the defect, not to be fixed here)

`CACHE_SCOPES.aiSimilar = "public:ai-similar"` is declared
(`lib/cache-namespace.ts:32`) and is in the admin scope allowlist
(`app/api/admin/cache/route.ts:53`), but the ai-similar route builds its key without
`buildCacheKey`, so its entries live at `…v1:movie:<id>:ai-similar` and are
**never matched** by an admin `public:ai-similar*` listing. `lib/cacheManager.ts:22-33`
`invalidateMovieCache` clears `movie:{id}:{details,recommendations,similar}` but not
`movie:{id}:ai-similar`. This is a cache-observability/invalidation gap, distinct
from PERF-001; recorded as an unresolved question and future finding candidate only.

### 22.5 Abstraction justification

Verified consumers of an inline chunked pool: **2** (`ai-recommendations`,
`watchlist/details`). Adding a third copy keeps the count at 3 copies of a 4-line
loop, each with different bodies and different pool rationales. Per §5, no new shared
helper is justified. Recommend an inline copy of the pool-4 shape, matching the
existing comment style (`// W3-006c: bounded concurrency … (max 4 in-flight)`).

## 23. Existing test coverage

| Test | ai-similar touchpoint | Measures max in-flight? |
|---|---|---|
| `tests/admin-chat-ai-security.test.ts:277-330` | 401, 429 (asserts `fetch` not called), 400 (asserts `fetch` not called) | **No** |
| `tests/stale-identity.test.ts:108-117` | 401 before any fetch | **No** |
| `tests/middleware-security.test.ts:23-62` | matcher coverage + 401/200 | **No** |
| `tests/performance-m4.test.ts:147-189` | **Reaches the enrichment path** (Gemini hang → `AI_TIMEOUT` → details + `similar` fallback); asserts `geminiCalls > 0`, `status ∈ [200,500]`, `body` truthy | **No** — no in-flight counter, no search-count assertion |
| `tests/redis-cache-security.test.ts:261-309` | `getOrSet` in-flight dedup, rejection release | Not route-level |
| `tests/redis-queue-calibration.test.ts:66-93` | Proves the *loop shape* caps in-flight at 8 — mirrors the shape, not the route | Not route-level |
| `tests/ai-recommendations-ownership-exclusion.test.ts` | Sibling route; fetch spy keyed by URL, no in-flight counter | No |
| `tests/chat-quota-ordering.test.ts` | Phase 7 harness: deny-by-default `guardFetch` + call recorder | Reusable harness pattern |

**Gap:** no test anywhere asserts a maximum in-flight TMDB count for the ai-similar
route, nor that enrichment repeats on a cache hit, nor the search-call count.

## 24. Test network-isolation assessment

Executed files, each fully read **before** execution:

1. `tests/middleware-security.test.ts` — `next-auth/jwt` `getToken` mocked; no `fetch`
   call site in the middleware path used by these cases. Isolation: no external
   reachability.
2. `tests/stale-identity.test.ts` — `@/lib/mongodb`, `@/lib/security/auth`,
   `@/lib/security/rateLimit`, all models, and `@/lib/redis` (resolves `null`)
   mocked. Every ai-similar/chat case exits at the auth gate before any `fetch`.
   Isolation: unreachable-code proof + `@/lib/redis` null (no Redis client is ever
   constructed, so `buildRedisConfig` cannot open a socket).
3. `tests/admin-chat-ai-security.test.ts` — `installGlobalFetch()` replaces
   `globalThis.fetch` with `mockFetch()` for **every** URL and restores the original
   in `afterEach`. The three ai-similar cases additionally assert
   `expect(mocks.fetch).not.toHaveBeenCalled()`. Mongo/auth/rateLimit/quota/cache/
   cacheManager/models all mocked. Isolation: unconditional interception, no
   pass-through branch.
4. `tests/performance-m4.test.ts` — the ai-similar case uses
   `vi.stubGlobal('fetch', vi.fn().mockImplementation(...))` whose implementation
   returns a `Response` on **all** branches (`generativelanguage` → hanging promise;
   `/movie/603?` → details JSON; everything else → `{results: []}` JSON). There is no
   fall-through to the real global. `@/lib/redis` → `null` (memory fallback),
   `@/lib/mongodb` mocked, auth/rateLimit/quota mocked, `GOOGLE_API_KEY` stubbed to a
   literal placeholder and never used against a real host because fetch is replaced.
   Isolation: PROVEN.
5. `tests/redis-cache-security.test.ts`, `tests/redis-queue-calibration.test.ts`,
   `tests/performance-phase2.test.ts` — in-memory Redis fake / pure config functions /
   `@/lib/tmdb` mocked; `performance-phase2` additionally stubs `fetch`.
   Isolation: PROVEN.

Additional isolation facts:

- Vitest loads no `.env` or `.env.local`: no `setupFiles`/`globalSetup`/`env` block in
  `vitest.config.mts`; `dotenv` is imported only by `scripts/setupDatabase.cts`
  (never executed). Placeholder env in CI exists only in the `build` job.
- Neither `.env` nor `.env.local` was opened, printed, parsed, hashed, or compared.
  No environment value was printed at any point.
- Redis client creation is the only socket-creation risk; every executed file either
  mocks `@/lib/redis` or exercises only the pure `buildRedisConfig`.
- Files **not** executed: the remaining 37 suites. Their isolation was not audited in
  this phase, so they were deliberately not run (§1 rule 7: "Do not execute a test if
  isolation cannot be proven without modification"). No source file was modified, so
  the recorded baseline (41 files / 415 tests / exit 0 / 0 unhandled) remains valid
  evidence for broader validation.

## 25. Safe reproduction / static proof

- No existing test measures the maximum in-flight TMDB count. Per §6, none was
  created.
- Static proof (deterministic, no runtime needed):
  1. `aiSuggestions.length ≤ 12` on every producer path (§13).
  2. `route.ts:253` dispatches `aiSuggestions.map(asyncFn)` and passes the resulting
     array directly to `Promise.all`, with no intervening chunking, semaphore,
     queue, or `await` inside the map body before the `fetch` at `:261`.
  3. Therefore all N (≤12) `fetch` calls are issued before any of them resolves:
     **max in-flight = N, upper bound 12.**
  4. No other in-flight TMDB call exists in that window (§16).
- Corroborating runtime evidence already present in the tree: the sibling route's
  pool-4 comment and the `REDIS-CAL` test that proves the *absence* of that loop
  shape is what makes in-flight equal input length.

### Exact RED concurrency test specified for Step 2 (do not write it here)

`tests/ai-similar-enrichment-concurrency.test.ts` (node project):

- Mocks: `@/lib/redis` → `null` (memory fallback, real `getOrSet` semantics
  including in-flight dedup), `@/lib/mongodb`, `@/lib/security/auth`
  (`requireUser` → allowed), `@/lib/security/rateLimit`
  (`applyRateLimitUser` → `null`, real-shaped `aiSimilar` config).
- Deny-by-default `guardFetch` (pattern from `tests/chat-quota-ordering.test.ts:38-79`)
  allowing only: `generativelanguage.googleapis.com` POST, and
  `https://api.themoviedb.org/3/…` GET. Everything else throws.
- `search/movie` handler: increment `inFlight`, record `maxInFlight`, `await sleep(20)`,
  decrement, return `{results:[{id:<n>,title,release_date,poster_path,vote_average}]}`.
- Gemini returns valid JSON with **12** distinct titles (schema-legal, `max(12)`);
  details returns a minimal movie object.
- `beforeEach` must `vi.resetModules()` **and** clear the shared memory-cache module
  state (fresh import of `@/lib/cache`, or a distinct numeric movie id per test) so a
  prior test's cached entry cannot mask the origin path.
- Assertions (the meaningful RED must fail on the counter, not on mocks/syntax):
  - `expect(maxInFlight).toBeLessThanOrEqual(POOL_SIZE)` ← today 12 > 4 → **RED**.
  - `expect(searchCalls).toBe(12)` (count unchanged by the fix).
  - `expect(resultIds).toEqual([1..12])` in suggestion order (ordering preserved).
  - Gemini call count equals the current retry policy on the happy path (1).
  - Details + `similar` call counts unchanged.

## 26. Earliest incorrect state

`app/api/movie/[id]/ai-similar/route.ts:253` —
`await Promise.all(aiSuggestions.map(async (movie) => { … fetch(search/movie) … }))`.

Two coupled decisions land at this exact line: (a) no bound on how many of those
mappers run concurrently, and (b) placement *outside* the `getOrSet` closure at
`:161`, which makes the fan-out per-request rather than per-cache-miss. (a) is
PERF-001. (b) is the amplification multiplier and is classified separately (§28.2).

## 27. Root-cause analysis

The route was written cache-aside for the *expensive* AI step and, correctly, nothing
else. When enrichment was added after the cache boundary, it inherited per-request
execution. Because `Array.prototype.map` + `Promise.all` is the shortest way to
express "look up all of these", and because the suggestion list is small (≤12), no
bound was ever introduced. The sibling AI route received exactly that bound later
("W3-006c"), and `watchlist/details` received one under "REDIS-CAL", so the fix
pattern is established repo practice — this route simply never adopted it.

Contributing (not causal): the only cost control on the route is a 10/min per-user
rate limit with no daily quota and no global TMDB budget, so nothing upstream
constrains the per-request fan-out. The absence of any timeout/AbortController on the
four raw TMDB calls (`:166`, `:192`, `:229`, `:261`) — unlike `lib/tmdb.ts` — widens
the window each of the 12 sockets can hold, which turns a concurrency bound into a
connection-pool concern under a slow upstream.

## 28. Root-cause classification

**28.1 Primary (exactly one):** `UNBOUNDED ENRICHMENT CONCURRENCY DEFECT`.

**28.2 Secondary factors, classified separately and explicitly not merged:**

- `UPSTREAM REQUEST AMPLIFICATION DEFECT` — **SECONDARY, OPEN**: enrichment outside
  the cached closure makes ≤12 searches the per-request steady-state cost (§11, §17).
  Recommendation: track as its own finding (proposed ID `PERF-001b`) rather than
  bundling it into the Step 2 fix, because fixing it changes the cached payload schema.
- `RETRY-AMPLIFICATION DEFECT` — **NOT APPLICABLE**: TMDB calls have zero retries;
  Gemini retries are sequential (§18).
- `CACHE-STAMPEDE DEFECT` — **MITIGATED IN-PROCESS** (`inflightPromises`,
  `lib/cache.ts:22-26`, `:330-334`); residual exposure is cross-process only
  (multi-instance/serverless, distinct-key load against the 1000-entry cap). Not the
  primary defect and not Phase 8's fix target.

## 29. Reproducibility

`DETERMINISTIC STATIC`. The bound follows from language semantics plus a hard
schema cap; no timing, no runtime flakiness, no live service needed. Not yet
demonstrated by a targeted test (none exists and none may be authored in Step 1) —
Step 2 §38 supplies that test.

## 30. Impact

`LATENCY AND FAN-OUT`.

- Fan-out: ≤12 concurrent TMDB searches per invocation, ≤120/min/user
  (rate-limit-bounded), ×M users per process (§17). TMDB applies per-IP/per-key
  throttling; 429s from the shared server egress IP degrade this route *and* the
  ~20 other TMDB proxy routes that share the same key.
- Latency: wall time for 12 searches is that of the slowest; each has **no** client
  timeout, so a stalled upstream holds the route invocation (and its HTTP socket)
  open indefinitely. Pooling 4 changes best-case wall time from ~1×T to ~3×T.
- Partial-failure loss: **none** — already handled (§19).
- Cache-miss amplification: real, but the amplification is *hit* amplification
  (per-request), not miss amplification (§11, §21).

## 31. Production-impact classification

`THEORETICAL`. No production metrics exist in the repository (no observability
backend, no error-monitoring integration — OPS-001 in `docs/PROJECT_BLUEPRINT.md:357`,
`docs/SECURITY_AUDIT.md:17` records "no concurrency testing"). TMDB 429 counts, p95
latency, and connection saturation are unmeasured. Do not treat §17 as observed
traffic.

## 32. Confidence

`HIGH` for the code-level conclusions (exact line, exact primitive, exact bound,
exact failure semantics, exact reusable local pattern — all read from current source,
and the ai-similar route is clean at `70fe776` so no uncommitted edit can invalidate
them). `LOW`/`UNKNOWN` for production magnitude.

## 33. Hypothesis matrix

| H | Statement | Supporting evidence | Contradicting evidence | Status |
|---|---|---|---|---|
| H1 | All accepted suggestions enriched concurrently | `route.ts:253` `Promise.all(map(...))`, no pool/await barrier; nothing between `:253` and `:261` limits dispatch | — | **CONFIRMED** |
| H2 | Schema/parser already limits fan-out to a small safe number | `.max(12)` `lib/ai-security.ts:160`; `.slice(0,12)` `:205`, `:238` | 12 is finite but not "small safe"; sibling routes deemed 4 and 8 worth pooling | **REJECTED** (bounds, does not mitigate) |
| H3 | Each suggestion creates exactly one TMDB request | one `fetch(search/movie)` per mapper (`:261`); no second call in the mapper | — | **CONFIRMED** |
| H4 | Retries amplify TMDB concurrency | Gemini `maxRetries = 3` (`:42`) | Gemini attempts sequential (`:46-119`); TMDB calls have no retry path and the route never uses `fetchWithRetry`/`lib/tmdb.ts` | **REJECTED** (Gemini-count-only) |
| H5 | One TMDB rejection fails all enrichment | `Promise.all` rejects on any rejection | mapper catches everything (`:266-273`, `:295-303`); no un-caught await inside | **REJECTED** |
| H6 | Per-suggestion failures become partial results | `id: null` returns + `filter(id !== null)` (`:305`) | — | **CONFIRMED** |
| H7 | Dedup before enrichment bounds duplicate-title requests | — | no dedup exists anywhere in the route | **REJECTED** |
| H8 | Cache hits completely avoid Gemini and TMDB work | hit skips origin (`lib/cache.ts:320-325`) → 0 Gemini, 0 details, 0 `similar` | enrichment at `:253` is outside the closure → ≤12 searches on every hit | **REJECTED** (partially true at best) |
| H9 | Concurrent cache misses independently repeat the full fan-out | cross-process: no shared coalescing; in-process: coalesced, but enrichment is per-invocation regardless | `inflightPromises` dedup (`:330-334`), proven by `tests/redis-cache-security.test.ts:261-275` | **SUPPORTED** |
| H10 | Rate limit sufficiently controls internal fan-out | 10/min/user caps invocation count | per-request fan-out is 12 regardless → 120 searches/min/user, no global TMDB budget, no daily quota | **REJECTED** |
| H11 | Nearby bounded worker pattern directly reusable | `app/api/ai-recommendations/route.ts:352-401`: same array source, same 1-fetch-per-item body, ordered push, per-item try/catch | it enriches `search/multi`, this uses `search/movie` — irrelevant to the loop shape | **CONFIRMED** |
| H12 | Defect is test-only or documentation-only | docs already describe it (`:349`, `:370-379`, Phase 1 `:494-535`) | route source at `:253` contains the defect; route clean at `70fe776` | **REJECTED** |

## 34. Rejected hypotheses (and why they matter)

- **H4 rejected** removes "retry amplification" from the fix scope: no retry-policy
  change is needed or wanted, and Step 2 must not touch `maxRetries`/`backoffTime`.
- **H5 rejected** means Step 2 must not "improve" this by switching to
  `Promise.allSettled` — the current `Promise.all` never rejects, and replacing it
  would change the response for no benefit.
- **H7 rejected** means duplicate-title dedup is a *behavior change*, not a
  pre-existing control; Step 2 must preserve duplicate-title → duplicate-search
  behavior (§38 item 9) unless a separate finding adopts dedup.
- **H8 rejected** is the most consequential correction to the brief's premise: any
  fix that only pools the loop leaves every cache hit still issuing 12 searches. It
  reduces the peak, not the volume. The volume fix is `PERF-001b` (§28.2).
- **H10 rejected** is the reason a pool is required at all: rate limiting cannot
  substitute for it.

## 35. Fix options (no implementation)

### Option A — inline pool 4, copying the established local pattern (PREFERRED)

- Files: `app/api/movie/[id]/ai-similar/route.ts` only (+1 new test file).
- Change: replace `await Promise.all(aiSuggestions.map(mapper))` with
  `ENRICHMENT_POOL_SIZE`-stepped batches accumulating ordered
  `batchResults` via `push(...)`, reusing the existing mapper body verbatim
  (same `try`/`catch`, same `id: null` partials, same `next: { revalidate: 3600 }`).
- Proposed max concurrency **4**, evidence: the sibling AI route already uses
  exactly 4 for the same problem shape — one TMDB search per ≤12 Zod-capped AI
  suggestions (`app/api/ai-recommendations/route.ts:352-353`, "W3-006c"). Reusing the
  established number avoids inventing a new one and keeps two AI enrichment routes
  consistent; 8 (watchlist) was calibrated for a 50-item Redis-pressure case and
  does not apply.
- Suggestion count: unchanged (still ≤12 enriched, still ≤12 requests).
- Ordering: unchanged (batch-sequential push preserves it).
- Partial-failure: unchanged (`id: null` per item, filter unchanged).
- Timeout/retry: unchanged (still none on TMDB; Gemini untouched).
- Cache: unchanged (still caches suggestions, 86400 s, still re-enriches per request).
- Rate limit/auth/quota: unchanged.
- Tests required: §38 items 1-13, primarily item 4 (`maxInFlight ≤ 4`).
- Risk: LOW. Worst-case wall time for 12 suggestions rises from ~1×T to ~3×T; with a
  healthy TMDB (~100-300 ms) that is tens of milliseconds, and the route is already
  dominated by a possible ~48 s Gemini origin.
- Rollback: revert one hunk in one file.

### Option B — Option A + enrichment cap to 8 items

- Also `aiSuggestions.slice(0, ENRICHMENT_POOL_SIZE * 2)` before batching (mirrors
  `MAX_DETAIL_ITEMS` in `watchlist/details`).
- Reduces per-request TMDB volume 12→8 and keeps 2 batches.
- **Rejected as preferred:** it changes the user-visible result count and the
  documented response contract (`app/movie/[id]/page.tsx` renders all results);
  §9 says avoid changing suggestion count unless necessary.

### Option C — Option A + move enrichment inside the cached closure

- Caches enriched items, eliminating the 12-searches-per-hit steady state.
- Cheapest volume fix, but changes the cached payload schema: old
  `movie:{id}:ai-similar` entries would deserialize as suggestion-shaped objects
  missing `id`/`poster_path`. Requires a key/version change or a `CACHE_VERSION`
  bump (`lib/cache-namespace.ts:21`), which invalidates all v1 keys, plus new tests
  for the `[]`-pinned-24 h case.
- Also would benefit from a timeout/AbortController on the enrichment fetches, which
  is a further independent change.
- **Deferred**, tracked as `PERF-001b` (§28.2) — not Step 2.

## 36. Preferred fix

**Option A.** Pool size 4, inline, copied from
`app/api/ai-recommendations/route.ts:352-401`, one file, ~10-line diff, no new
dependency, no new abstraction, no behavior change other than maximum in-flight
TMDB count and its latency consequence.

## 37. Exact Step 2 files

- Modify: `app/api/movie/[id]/ai-similar/route.ts` (loop at `:252-303`; module-level
  `ENRICHMENT_POOL_SIZE` constant near `:22-23`).
- Create: `tests/ai-similar-enrichment-concurrency.test.ts` (node project,
  `tests/**/*.test.ts`).
- Do not touch: `lib/cache.ts`, `lib/cache-namespace.ts`, `lib/gemini-payload.ts`,
  `lib/ai-security.ts`, `lib/security/rateLimit.ts`, `lib/security/auth.ts`,
  `middleware.ts`, `tests/performance-m4.test.ts`, `tests/admin-chat-ai-security.test.ts`,
  `tests/stale-identity.test.ts`, `tests/middleware-security.test.ts`, `package.json`,
  `package-lock.json`, `vitest.config.mts`, CI, any document other than the Phase 8
  completion report.

## 38. Regression-test plan (Step 2 must prove)

| # | Assertion | Current expected value | RED source |
|---|---|---|---|
| 1 | Cache hit → 0 Gemini, 0 details, 0 `similar` | true today; enrichment searches still fire | pin, do not "fix" here |
| 2 | Cache miss → Gemini exactly once on happy path | 1 | guard counter |
| 3 | Suggestions accepted = 12 | 12 | count |
| 4 | **max in-flight TMDB ≤ POOL_SIZE (4)** | **12 today → RED** | in-flight counter |
| 5 | 12 > pool → all eventually processed | 12 total searches | count + results length |
| 6 | Result ordering matches suggestion order | `[1..12]` | array equality |
| 7 | One failed enrichment → same aggregate semantics (200, others intact) | true | mixed responses |
| 8 | Empty TMDB match (`results: []`) → `id: null` → filtered out | true | shape |
| 9 | Duplicate titles → duplicate searches (no dedup invented) | true | count = 12 for 12 dups |
| 10 | Timeout/abort behavior unchanged (no new signal on TMDB) | `init.signal` undefined | inspect recorded init |
| 11 | 401 before any fetch; 429 before any fetch; 400 before any fetch | true | existing 3 tests re-run |
| 12 | Cache write + TTL unchanged (`getOrSet(key, _, 86400)`) | 86400 | spy on cache |
| 13 | No external request (deny-by-default guard) | guard never throws | guard |

The meaningful RED must be item 4 (`maxInFlight` 12 > 4), not a mock or syntax
failure. Per §6, a cache-hit-path test must explicitly reset the module-level memory
cache (or use a distinct movie id) so a shared `movie-recommendation-system:
development:v1:movie:<id>:ai-similar` entry from another test cannot mask behavior.

## 39. Targeted validation (executed in this diagnostic)

All commands run from the repository root. Each file was read in full first (§24).

| Command | Exit | Files/tests | Unhandled errors | Isolation | Detects the defect? | File changes |
|---|---|---|---|---|---|---|
| `npx vitest run tests/middleware-security.test.ts tests/stale-identity.test.ts tests/admin-chat-ai-security.test.ts --reporter=basic` | **0** | 3 / 22 | 0 | proven (§24.1-3) | No — all early-exit paths | none |
| `npx vitest run tests/performance-m4.test.ts --reporter=basic` | **0** | 1 / 10 | 0 | proven (§24.4) | No — reaches enrichment but counts nothing; ai-similar case 16 247 ms (15 s Gemini abort by design) | none |
| `npx vitest run tests/redis-queue-calibration.test.ts tests/redis-cache-security.test.ts tests/performance-phase2.test.ts --reporter=basic` | **0** | 3 / 43 | 0 | proven (§24.5) | No — proves the pool *shape* caps in-flight and that same-key misses coalesce once | none |

Totals executed in this phase: **7 files, 75 tests, all passing, exit 0, zero
unhandled errors.**

## 40. Broader validation

**NOT EXECUTED** for the remaining 34 suites: their network isolation was not audited
in this phase and executing them would violate §1 rule 7. Because **zero** source,
test, config, dependency, or environment file was modified, the recorded baseline
(41 files / 415 tests / exit 0; typecheck exit 0; lint exit 0 with 93 warnings; audit
exit 0; build exit 0) remains valid, and CI (`.github/workflows/ci.yml`, Node 22,
`npm test`, `npm run test:coverage`) is the authoritative broader gate. Step 2 must
re-run `npm run typecheck && npm test` after its edit.

## 41. Security implications

- No auth, authorization, origin-gate, session, revocation, or rate-limit behavior is
  in scope; all must remain byte-identical.
- Pooling *reduces* abuse capacity (fewer simultaneous upstream sockets per
  invocation) and cannot increase it. It must not be paired with any relaxation of
  `RATE_LIMITS.aiSimilar`.
- Cache entries are user-independent by design (public AI-similar list per movie).
  A pool does not change cache identity, so no cross-user leak is introduced.
- Prompt-injection posture of the Gemini step is unchanged (§12).
- The `api_key` in query strings (§10) is pre-existing; this diagnosis records it and
  does not fold it into PERF-001.

## 42. Performance and availability implications

- Improvement: TMDB peak in-flight per process drops 12 → 4 per invocation
  (60 → 20 at 5 concurrent, 120 → 40 at 10), reducing 429 and connection-pool
  exposure shared with ~20 other TMDB routes on one API key.
- Cost: enrichment wall time for 12 items becomes ~3 sequential batches. Acceptable
  because the route's latency is already dominated by the Gemini origin (≤~48 s).
- Residual, unaddressed by Option A: no client-side timeout or `AbortController` on
  the four TMDB calls (H-observation, §18); per-request enrichment on cache hits
  (§28.2 `PERF-001b`); cross-process miss duplication (§21).
- No Redis command-queue impact: enrichment performs zero Redis operations, and the
  500-command `commandsQueueMaxLength` calibration
  (`lib/redis-config.ts:75`) applies only to the origin's `getOrSet` GET/SET.

## 43. Cache compatibility

Option A changes no key, no scope, no namespace, no TTL, no payload shape, and no
`getOrSet` call site. Existing v1 entries remain valid and readable; no bump and no
migration. `PERF-001b` would require a version/key decision and is explicitly not
part of this fix.

## 44. Race and concurrency implications

- The mapper body is async but mutates no shared state; batching introduces no new
  interleaving. `enhancedRecommendations` ordering is guaranteed by ordered
  `push(...batchResults)`.
- `inflightPromises` dedup semantics are untouched.
- No lock, semaphore, or module-level mutable counter is introduced, so there is no
  cross-request state and no per-instance/global coupling (an intentional global
  semaphore would change multi-tenant fairness and is not proposed).
- Partial-failure independence is preserved: a batch failure still cannot reject the
  loop (§19).

## 45. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Latency regression perceived on cold AI path | Low | Gemini dominates; 3 batches of fast searches; measure in Step 2 |
| Fix misread as also fixing hit-path volume | Medium | §28.2 / §34 document `PERF-001b` as separate |
| New test passes vacuously (mock cache masks fan-out) | Medium | §38 cache-reset requirement + explicit call-count assertions |
| Accidental behavior drift (dedup, cap, `allSettled`) | Low | §34/§38 pin current behavior |
| `git`-dirty tree damaged by staging | Low | COMMIT_ALLOWED: NO honored; §50 re-verification |

## 46. Unresolved questions

1. Real production TMDB request rate, 429 count, and p95 latency for this route
   (no metrics; provider consoles out of scope) → why §31 stays THEORETICAL.
2. Whether deployments run multiple Node instances (and how many), which sets the
   true cross-process fan-out multiplier. Deploy target is undocumented (OPS-001).
3. Whether Next.js `fetch` revalidation dedup is active in the production runtime for
   these calls (§17) — treated as a non-mitigation.
4. Frequency with which Gemini returns <4 suggestions (drives the 24 h `[]`-pinned
   worst case in §11). Unmeasurable without live traffic.
5. Actual duplicate-title rate in Gemini `similar_movies` output (H7).
6. Whether `public:ai-similar` admin scope listing is expected by operators to show
   these keys (§22.4) — needs an operator answer before any key change.
7. Whether any client other than `app/movie/[id]/page.tsx` calls this route (none
   found in repo; external callers unknown).

## 47. Command log

All read-only (inspection, source reads, existing tests). No writes other than this
report.

```text
$ $PSVersionTable.PSVersion.ToString(); node -v; npm -v; git --version
5.1.19041.6456 / v24.21.0 / 11.5.2 / 2.50.1.windows.1

$ git rev-parse --abbrev-ref HEAD; git rev-parse HEAD
main
70fe77655467f5105f5d0e9b02594ba1c62b2952

$ git status --porcelain=v2 --branch            # initial + final (§4, §50)
$ git log --oneline -8
$ git ls-files | Select-Object -First 200
$ git diff --name-status                        # 35 M + 1 D, all pre-existing
$ git diff --cached --name-status               # empty
$ git ls-files --others --exclude-standard

# source reads (Read tool): route.ts, lib/cache.ts, lib/cache-namespace.ts,
# lib/gemini-payload.ts, lib/ai-security.ts, lib/security/rateLimit.ts,
# lib/security/auth.ts, middleware.ts, lib/tmdb.ts, lib/fetchWithRetry.ts,
# lib/redis.ts, lib/redis-config.ts, lib/mongodb.ts, lib/env.ts,
# ai-recommendations, watchlist/details, genres, trailers, movie/[id]/page.tsx,
# admin/cache, package.json, vitest.config.mts, .github/workflows/ci.yml,
# 7 report files + 3 diagnostics + PHASE-1 §41

$ rg -n "limitConcurrent|withConcurrency|pool|worker|Semaphore|bounded|mapWithConcurrency" -i
$ rg -n "Promise\.(all|allSettled)|ENRICH|BATCH|batch|chunk|POOL_SIZE|MAX_CONCURRENT|concurrency" app lib components
$ rg -n "ai-similar" tests middleware.ts docs/SECURITY_AUDIT.md
$ rg -n "CACHE_SCOPES.aiSimilar|ai-similar" app lib
$ rg -n "in-flight|inflight|maxConcurrent|concurrent|Promise.all" tests
$ rg -l "fetch" tests        # 18 files
$ rg -n "MONGODB_URI|REDIS_URL|TMDB_API_KEY|GOOGLE_API_KEY" vitest.config.mts next.config.mjs eslint.config.mjs .github/workflows/ci.yml
$ rg -n "setupFiles|globalSetup|env" vitest.config.mts      # no matches
$ rg -n "dotenv" --glob '*.ts' --glob '*.tsx' --glob '*.mjs' --glob '*.cts' --glob 'tests/*' .
$ Get-ChildItem -Force | … ; Get-ChildItem -Recurse -Filter 'AGENTS.md' -Depth 2   # none
$ Get-ChildItem -Recurse -Force .cursor                                          # none
$ Get-ChildItem docs/reports -Recurse -File
$ (Get-ChildItem tests -File).Count                                              # 42

$ npx vitest run tests/middleware-security.test.ts tests/stale-identity.test.ts tests/admin-chat-ai-security.test.ts --reporter=basic   # exit 0
$ npx vitest run tests/performance-m4.test.ts --reporter=basic                                                                  # exit 0
$ npx vitest run tests/redis-queue-calibration.test.ts tests/redis-cache-security.test.ts tests/performance-phase2.test.ts --reporter=basic  # exit 0
```

`grep` was never used for text search where `rg` applied; no `sed`/`cat`-redirect file
creation; no `head`/`tail` truncation used to hide output.

## 48. External-network confirmation

**No external request was initiated by this diagnostic.** Confirmed by construction:

- Gemini, TMDB, OAuth: only reachable through `fetch`, which is replaced by a mock or
  a stub in every executed test file, with no fall-through to the real global (§24).
- MongoDB: `@/lib/mongodb` (or `@/lib/mongodb.ts`) mocked in every executed file that
  imports a model; `connectToMongoDB` never invoked for real.
- Redis: `@/lib/redis` mocked to `null` or to an in-memory fake in every executed
  file, so `createClient`/`connect` were never reached; no real Redis was accessed.
- Auth/rate-limit/quota: mocked where reachable.
- `.env` and `.env.local` were not opened, printed, parsed, or compared; no
  environment value was printed. Placeholder strings observed are those already
  committed in `ci.yml` and in test sources.
- No browser, no provider console, no CI trigger, no package install, no registry
  write. Nothing to record under the failure protocol (no destination host, no
  request category).

## 49. Files created, modified, or deleted

- Created: `docs/reports/diagnostics/BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY-DIAGNOSIS.md`
  (this file).
- Modified: none.
- Deleted: none.
- Temporary logs: none created (test output was streamed only; no redirection to
  files). `coverage/`, `.next/`, `dist/`, `logs/` were not written by this phase.
- No route, test, fixture, helper, config, dependency, lockfile, CI, or environment
  file was touched. No concurrency pool, cache change, limit change, retry change,
  or timeout change was implemented. PERF-002 and every other finding were left
  untouched.

## 50. Final Git state

Verification commands were re-run after this report was written; the captured output
is summarized here and matches the initial capture in §4 exactly, plus this report's
own untracked path.

```text
git status --porcelain=v2 --branch
# branch.oid 70fe77655467f5105f5d0e9b02594ba1c62b2952
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -0
```

- 34 tracked unstaged modifications + 1 unstaged deletion
  (`docs/ARCHITECTURE_REVIEW.md`) — **byte-identical set to §4**; no tracked file's
  blob hash changed during this phase.
- `git diff --cached --name-status` → **empty** (nothing staged).
- `git diff --name-status` → same 35 paths (34 M + 1 D) as §4 (CRLF normalization
  notices emitted as `warning:` lines only; content untouched).
- `git ls-files --others --exclude-standard` → the 4 prior phase reports
  (`PHASE-2`…`PHASE-7`), `PHASE-1` report, 4 prior diagnostics,
  `lib/list-membership.ts`, and 5 untracked tests — all preserved — **plus this
  Phase 8 diagnostic report**.
- Attribution: the only change attributable to Phase 8 is
  `docs/reports/diagnostics/BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY-DIAGNOSIS.md`
  (untracked, never staged).
- No secret, token, email, or user data appears in this report beyond committed
  test fixtures and variable *names*.

## 51. Commit and deployment status

- Commit created: **NO** (COMMIT_ALLOWED: NO honored; no `git add`/`commit`/`push`).
- Deployment executed: **NO** (DEPLOYMENT_ALLOWED: NO honored).
- Branch created: **NO**. No worktree, no stash, no checkout, no reset, no clean.
- No destructive Git or filesystem operation was used at any point.

## 52. Requirement Traceability Matrix

`Requirement ID → Diagnostic evidence → Validation evidence → Status`

- `CONC-DIAG-1 → §8 18-stage lifecycle table + early-return matrix, §9 (auth/middleware), §10 (validation/rate limit), §12 (Gemini), §14 (enrichment), route reads of every line 22-315 → existing early-exit tests re-run (401/429/400), `tests/performance-m4.test.ts` (route reaches enrichment), `tests/middleware-security.test.ts` (matcher) → PASS`
- `CONC-DIAG-2 → §13 (12 enforced on all three producers: Zod max(12), two slice(0,12)), §14 (exactly 1 search per suggestion), §17 (per-path and per-N-invocation tables, 120/min/user bound) → no executable counter exists; static enumeration of `:205`, `:238`, `lib/ai-security.ts:160`, `route.ts:261` → PASS`
- `CONC-DIAG-3 → §15 (primitive = `Promise.all(map)`), §16 (max in-flight = min(12,N), no shared semaphore anywhere in app/lib), §25 static proof → `tests/redis-queue-calibration.test.ts:66-93` proves the batched shape caps in-flight, i.e. that the missing shape is the cause → PASS WITH WARNING (warning: no route-level runtime measurement; no test may be authored in Step 1)`
- `CONC-DIAG-4 → §18 (per-call-site timeout/retry table), §19 (Promise.all cannot reject; partials preserved), §12 (sequential Gemini retries), §20 (ordering + no dedup) → `tests/performance-m4.test.ts` abort/timeout case, §39 executed results (0 unhandled) → PASS`
- `CONC-DIAG-5 → §11 (key, namespace, TTL 86400, payload = pre-enrichment list, `[]` cached 24 h, hit still fans out 12, no negative-result cache), §21 (in-process coalescing, cross-process none), §28.2 (stampede classified separately from primary defect) → `tests/redis-cache-security.test.ts:261-309` (dedup, release-on-reject), `tests/performance-phase2.test.ts:74-98` (faithful getOrSet mirror) → PASS`
- `CONC-DIAG-6 → §22.1-22.5 (pool 4 in `ai-recommendations:352-401`, pool 8 + `MAX_DETAIL_ITEMS` in `watchlist/details:20,45-50`, unbounded counter-examples `genres:39`/`trailers:105`, shared-helper search, 2-consumer abstraction justification) → both pool files' existing regression suites green in this run/CI baseline → PASS`
- `CONC-DIAG-7 → §23 (coverage gap table), §24 (per-file isolation proof, no `.env` loading), §25 (static proof + exact RED test spec + memory-cache masking caveat) → 7 files / 75 tests executed, all exit 0, zero unhandled errors, §39 table → PASS WITH WARNING (warning: full 41-file suite not re-executed because isolation of the other 34 files was not audited; no source changed, so the baseline stands)`
- `CONC-DIAG-8 → §33 (12 hypotheses with supporting/contradicting evidence), §34 (rejections and their consequences), §26 (earliest incorrect state), §27 (root cause), §28 (classification: UNBOUNDED ENRICHMENT CONCURRENCY DEFECT primary; amplification and stampede classified separately; retry N/A), §29-§32 → static derivation from current committed source at `70fe776` (route file clean) → PASS`
- `CONC-DIAG-9 → §35 (Options A/B/C with files, pool rationale, ordering, partials, timeouts, cache, rate-limit, tests, risk, rollback), §36 (preferred: Option A, pool 4 copied from the local pattern, no new abstraction/dependency), §37 (exact Step 2 files + do-not-touch list), §38 (13 assertions + true RED cause) → design-only, nothing implemented, per §49 → PASS`
- `CONC-DIAG-10 → §4 vs §50 (identical tracked set, empty staged set), §49 (only the report created), §48 (no external request, no env reads, no Mongo/Redis access), §51 (no commit/deploy/branch), no temporary logs → post-write Git inspections (§50) + §39 exit statuses → PASS`

Allowed statuses used: `PASS`, `PASS WITH WARNING`, `NOT EXECUTED` (§40), `NOT
APPLICABLE` (§28.2 retry amplification). No requirement is `FAIL` or `BLOCKED`.

---

**Final status: PASS WITH WARNINGS.** Perf-001 diagnosis complete; the route is
unfixed and Step 2 is unblocked with a one-file, ~10-line preferred fix.
