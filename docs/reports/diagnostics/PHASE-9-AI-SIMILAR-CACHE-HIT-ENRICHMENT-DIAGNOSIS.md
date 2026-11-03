# Phase 9 — AI-Similar Cache-Hit Enrichment Volume — Diagnosis

**Finding ID**: PERF-001b
**Bug ID**: BUG-AI-SIMILAR-CACHE-HIT-REENRICHMENT
**Phase**: 9 — Step 1 (READ-ONLY DIAGNOSTIC)
**Prompt type**: READ-ONLY DIAGNOSTIC
**Risk level**: MEDIUM TO HIGH
**Commit policy**: COMMIT_ALLOWED: NO
**Deployment policy**: DEPLOYMENT_ALLOWED: NO
**Date**: 2026-09-25

---

## 1. Executive summary

`GET /api/movie/[id]/ai-similar` caches **pre-enrichment** AI suggestions under
`movie:{id}:ai-similar` (24-hour TTL) and re-runs the full TMDB `/search/movie`
enrichment fan-out on **every** request, including warm cache hits.

Phase 8 (PERF-001) correctly bounded the *concurrency width* of that fan-out to 4
but left its *per-request volume* untouched: a warm hit performs zero Gemini,
zero `/movie/{id}`, and zero `/similar` calls, yet still issues **up to 12**
`/search/movie` requests (bounded to 4 concurrent). The cache removes all origin
cost except the one tier that was the subject of PERF-001 — the enrichment tier.

Root cause is a **cache-boundary placement defect**: enrichment sits outside the
`redisCache.getOrSet` producer, so the cached value is the *suggestion* contract,
not the *response* contract, and nothing cached is ever reused for the most
expensive per-request step.

Smallest safe correction: **Option A** — move the pool-4 enrichment inside the
`getOrSet` producer and switch to a **route-local versioned key**
(`movie:{id}:ai-similar:v2`, or `buildCacheKey(CACHE_SCOPES.aiSimilar, …)` with a
version suffix). This preserves the Phase 8 pool-4 loop verbatim, keeps the public
response contract byte-for-byte identical, lets old `v1` entries expire naturally
under their existing 24-hour TTL, requires **no** global `CACHE_VERSION` bump, and
reduces warm-hit upstream traffic to **zero**.

Step 1 produced **no implementation**. No fix applied, no external service
contacted, no file modified. The only Step 1 artifact is this report.

---

## 2. Diagnostic status

**PASS WITH WARNINGS**

| Criterion | Status |
|---|---|
| Cache flow fully traced | PASS — §9–§11 |
| Payload and response shapes documented | PASS — §12–§13 |
| Cache-hit request amplification proven | PASS — §14, §26 |
| Cached-empty-array behavior determined | PASS — §16 |
| Negative-caching implications determined | PASS — §16, §48 |
| Old-entry compatibility assessed | PASS — §22 |
| Global vs route-local versioning assessed | PASS — §23 |
| In-process vs cross-process coalescing distinguished | PASS — §24–§25 |
| Client compatibility assessed | PASS — §28 |
| Admin/invalidation gap classified | PASS — §29–§31 |
| Hypotheses evaluated | PASS — §42–§43 |
| Root cause and impact classified | PASS — §36–§41 |
| Smallest safe fix recommended | PASS — §44–§45 |
| Exact Step 2 files and tests listed | PASS — §49–§50 |
| No implementation / no external contact / state preserved | PASS — §60–§62 |

**Warnings (non-blocking)**

1. No production metrics exist; all volumes in §26 are **static theoretical
   bounds** derived from source, plus one targeted runtime test (§34) that proves
   the repetition but not real-world traffic.
2. A separate cache-operability finding (CACHE-OPS-001) was identified and is
   deliberately **not** fixed here (§31).
3. Node 22 CI not executed locally this phase (§52); verification ran on Node 24.

---

## 3. Finding and bug identity

| Property | Value |
|---|---|
| Finding | PERF-001b |
| Bug | BUG-AI-SIMILAR-CACHE-HIT-REENRICHMENT |
| Route | `GET /api/movie/[id]/ai-similar` |
| File | `app/api/movie/[id]/ai-similar/route.ts` |
| Cache key (literal) | `` `movie:${movieId}:ai-similar` `` (route.ts:170) |
| Namespaced key | `movie-recommendation-system:{env}:v1:movie:{id}:ai-similar` |
| TTL | 86400 s (route.ts:231–233) |
| Cached shape | Pre-enrichment suggestion array |
| Symptom | Warm hits re-issue up to 12 TMDB `/search/movie` requests |

---

## 4. Relationship to PERF-001

PERF-001 (Phase 8, resolved) addressed **concurrency width**: 12 simultaneous
`/search/movie` calls per invocation → pool-4 batched loop
(`ENRICHMENT_POOL_SIZE = 4`, route.ts:36–40, 274–327).

PERF-001b is the **volume depth** counterpart: the same 12 searches repeat on
**every** request because their results are never cached. Complementary, not
overlapping:

- PERF-001: *how many* run concurrently per request → 4.
- PERF-001b: *how often* the search tier runs per request → every time, warm hit
  included.

Phase 8 explicitly left PERF-001b open (its completion report §28.1 warning 4).
Phase 8's suite even pins the defective behavior as an assertion (§33).

The Phase 8 pool-4 correction is a **prerequisite** for this fix: once enrichment
moves inside the producer, the same loop governs the origin, and the cold-miss
in-flight bound of 4 must remain intact.

---

## 5. Initial Git state

Captured before any diagnostic command (§62 reproduces the post-write state).

| Property | Value |
|---|---|
| Branch | `main` |
| HEAD | `70fe77655467f5105f5d0e9b02594ba1c62b2952` |
| Upstream | `origin/main` (ahead 2, behind 0) |
| Staged additions | 0 |
| Staged modifications | 0 |
| Staged deletions | 0 |
| Unstaged modifications | 36 — accumulated multi-phase working-tree changes |
| Unstaged deletions | 1 (`docs/ARCHITECTURE_REVIEW.md`, pre-existing) |
| Untracked files | 84 — pre-existing Phase 1–8 reports, prior-phase diagnostic reports, per-phase test files, and accumulated scratch text files (`.chunks/`, `.my_tool_sandbox/`, `as_route_*.txt`, `cqq*.txt`, `nul`, `route_dump.txt`, `failed_block.txt`, `tmp-diag-route.ts`, `lib/list-membership.ts`) |

Note: the 36/1/84 split was recorded against the tracked file index. The working tree already contained the Phase 8 pair
(`app/api/movie/[id]/ai-similar/route.ts` +
`tests/ai-similar-enrichment-concurrency.test.ts`) among its pre-existing
modifications. Both were **preserved untouched**.

---

## 6. Applicable instructions

| Instruction | Source | Applied |
|---|---|---|
| Two-step protocol; Step 1 read-only | User prompt §A | Yes — no implementation |
| No commit / no deploy | User prompt §A | Yes — §64–§65 |
| Atomic targeted edits; no placeholders | Global `AGENTS.md` | N/A — no edits in Step 1 |
| No external service contact | User prompt §C | Yes — §60 |
| Test isolation proof before execution | User prompt §C | Yes — §33 |
| Do not modify source/tests/config | User prompt §1 | Yes — §61 |
| Read Phase 8 reports fully | User prompt §0 | Yes |
| Do not repeat the Phase 8 missing-RED mistake | User prompt §0 item 9 | Yes — §34 captures the RED |

No `.cursor/rules/*.mdc` exists in the repository (verified by path search). No
project-local `AGENTS.md`; the global `AGENTS.md` was read.

---

## 7. Environment versions

| Property | Value |
|---|---|
| OS | Windows |
| Shell | `sh` (POSIX emulation) |
| Node | v24.x (used by `npx vitest`) |
| Vitest | v3.2.7 |
| Repo root | `D:\fork ai to create website\final porject\movie-recommendation-system` |
| Notes | `git --no-pager` unsupported in this shell (used `git log` without it); CI pins Node 22 (§52) |

---

## 8. Files and symbols inspected

**Source**: `app/api/movie/[id]/ai-similar/route.ts` (`GET`,
`getAISimilarMovies`, `AISuggestion`, `MovieDetailItem`, `ENRICHMENT_POOL_SIZE`,
cache key L170, producer L173–233, popular fallback L235–262, enrichment loop
L264–327, filter L329–331, response L333); `lib/cache.ts` (`RedisCache`, `ns()`,
`set/get/getFromMemoryCache/getOrSet`, `inflightPromises`, `MAX_INFLIGHT_ENTRIES`,
`MAX_MEMORY_ENTRIES`); `lib/cache-namespace.ts` (`CACHE_NAMESPACE`,
`CACHE_VERSION`, `CACHE_SCOPES.aiSimilar`, `buildCacheKey`,
`normalizeKeyComponent`, `MAX_SCAN_RESULTS`); `lib/cacheManager.ts`
(`invalidateMovieCache`, `findCacheKeys`, `listKeys`, `clearAllCache`,
`getCacheStats`); `app/api/admin/cache/route.ts` (`allowedScopes`, list action);
`app/api/ai-recommendations/route.ts` (pool-4 reference,
`buildCacheKey(CACHE_SCOPES.userRecommendations, …)`, `redisCache.set(…, 3600)`);
`app/movie/[id]/page.tsx` (sole consumer, `MovieRecommendation`, `usesAI`);
`lib/security/auth.ts` (`requireUser`); `lib/security/rateLimit.ts`
(`RATE_LIMITS.aiSimilar`); `lib/ai-security.ts`; `lib/gemini-payload.ts`;
`middleware.ts` (`CONFIG-001` carve-out).

**Tests**: `tests/ai-similar-enrichment-concurrency.test.ts` (contains the
cache-hit repetition assertion at L390–432); `tests/redis-cache-security.test.ts`;
`tests/performance-m4.test.ts`; `tests/performance-phase2.test.ts`;
`tests/admin-chat-ai-security.test.ts`; `tests/middleware-security.test.ts`;
`tests/stale-identity.test.ts`; `tests/cache-key-normalization.test.ts`;
`tests/cache-personalization.test.ts`.

**Reports/config**: Phase 8 diagnosis + completion report; corrected §41 of the
Phase 1 report; `docs/PROJECT_BLUEPRINT.md`; `docs/SECURITY_AUDIT.md`;
`package.json`; `vitest.config.mts`; `.github/workflows/ci.yml`.

---

## 9. Complete route lifecycle

### 9.1 Authentication — `requireUser()` (route.ts:144)
Failure returns its 401 immediately. Verified by `tests/stale-identity.test.ts`
and the concurrency suite's "auth denial … cause zero fetches". Middleware also
enforces the route (`CONFIG-001` carve-out, `middleware.ts`).

### 9.2 Rate limiting — `applyRateLimitUser(…, RATE_LIMITS.aiSimilar)`
10 req/min/user (route.ts:150–157; `lib/security/rateLimit.ts:293`). Denial
short-circuits before any external call.

### 9.3 Movie ID validation — `/^\d{1,10}$/.test(movieId)`
Invalid → 400 before any external call (F-033).

### 9.4 Cache-key construction
Literal `` `movie:${movieId}:ai-similar` `` (route.ts:170). Does **not** use
`CACHE_SCOPES.aiSimilar` or `buildCacheKey` (§20, §31).

### 9.5 Namespace application
`getOrSet` → `RedisCache.ns(key)`: `applyNamespace` → canonical
`movie-recommendation-system:{env}:v1:` prefix, per-`:` component normalization,
`MAX_KEY_LENGTH` truncation. Final: `…:v1:movie:{id}:ai-similar`.

### 9.6 Memory-cache lookup
`getOrSet` → `get` → Redis first, then `getFromMemoryCache`. Bounded (5000),
TTL-expired, LRU-evicted.

### 9.7 Redis lookup
`safeRedisOp(redis => redis.get(nsKey))`. Redis down → memory cache (graceful;
errors throttled to once/minute).

### 9.8 In-flight lookup
`inflightPromises.get(nsKey)` — same namespaced key dedups origin execution
**within one process** (§24).

### 9.9 Producer (miss path only)
1. **Details** — `GET /movie/{id}?api_key=…&append_to_response=credits`,
   `{ next: { revalidate: 3600 } }`. Non-OK → throws.
2. **Gemini** — POST `GEMINI_GENERATE_URL` with `x-goog-api-key`, per-attempt
   `AbortController` timeout, up to 3 attempts with backoff on 429/503/5xx,
   strict Zod validation of `similar_movies`.
3. **Threshold** — `aiResults.length < 4` → throws into the `similar` fallback
   (Phase 8 CONC-FIX-9 preserved).
4. **`similar` fallback** — `GET /movie/{id}/similar`, top 12 mapped to
   `{ title, year, reasoning }`. Any failure → `return []`.

Producer returns `AISuggestion[]`.

### 9.10 Cache write
On resolve: `set(nsKey, value, 86400)` — memory first, then Redis `SET … EX 86400`.
Write failures swallowed (cache never changes caller-visible semantics).
`undefined` not written; `[]` **is** written (§16).

### 9.11 Cached payload shape

```ts
type CachedAISimilar = Array<{
  title: string;
  year?: string;      // '' when absent
  reasoning?: string;
}>;
```

No schema version, no discriminant, no enrichment metadata, no `id`,
`poster_path`, or `vote_average`.

### 9.12 Emergency popular fallback (OUTSIDE the producer)
If `aiSuggestions.length === 0` after `getOrSet` (route.ts:236):
`GET /movie/popular`, top 12 → suggestions. **Never written back to cache** —
the cached value stays whatever the producer returned (`[]`).

### 9.13 Pool-4 enrichment (OUTSIDE the producer)
route.ts:264–327. Per suggestion, batches of 4:
`GET /search/movie?api_key=…&query={title}&year={year}`. Best match =
`results[0]`; mapped to the enriched object. Non-OK / empty / thrown →
`{ ...movie, poster_path: null, id: null, vote_average: 0 }`. Per-item
`try/catch` means `Promise.all` cannot reject here.

### 9.14 Enriched response shape

```ts
type EnrichedRecommendation = {
  id: number | null;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  reasoning?: string;
};
```

### 9.15 Result filtering
`enhancedRecommendations.filter(m => m.id !== null)` (route.ts:329–331).

### 9.16 Response
`NextResponse.json({ results: validRecommendations })` — 200.

### 9.17 Top-level error behavior
Outer `catch` → 500 `{ error: 'Failed to generate similar movies' }`. Gemini
codes are absorbed by the fallback chain; only total collapse (details non-OK on
a miss) reaches the 500.

---

## 10. Cache read flow

```
GET request
  └─ requireUser ─┬─ fail → 401
  └─ rateLimit ────┬─ deny → 429
  └─ id validation ┬─ invalid → 400
  └─ getOrSet(movie:{id}:ai-similar, producer, 86400)
       ├─ get(nsKey): redis.get → JSON.parse  ── hit → return cached suggestions
       │            └ memoryCache.get → hit   → return cached suggestions
       ├─ inflightPromises.get(nsKey) ── hit → await shared origin promise
       └─ producer() → set(nsKey, value, 86400) → return value
  └─ (empty?) → emergency /movie/popular   ← NOT cached
  └─ enrichment pool-4 /search/movie       ← NOT cached
  └─ filter(id !== null) → 200 { results }
```

**Key observation**: everything after `getOrSet` is per-request and uncached.

---

## 11. Cache producer flow

| Condition | Producer returns | Cached? |
|---|---|---|
| Gemini ≥ 4 valid suggestions | `AISuggestion[]` (≤ 12) | Yes, 24 h |
| Gemini < 4 suggestions | throws → similar fallback | — |
| Similar OK, ≥ 1 result | `AISuggestion[]` (≤ 12) | Yes, 24 h |
| Similar empty or non-OK | `[]` | **Yes, 24 h** |
| Details non-OK | throws → 500 | No |
| Gemini non-retryable error | throws → similar fallback | — |

---

## 12. Cached payload contract (A)

| Field | Required | Source | In final response | Nullable | Validated on read |
|---|---|---|---|---|---|
| `title` | yes | Gemini / similar / popular | yes (overwritten by search) | no | **no** |
| `year` | optional | Gemini / similar / popular | no (not echoed directly) | no (`''` sentinel) | **no** |
| `reasoning` | optional | Gemini / similar / popular | yes | no | **no** |

**Read-path validation: none.** `get<T>` does `JSON.parse(redisValue) as T` and
`getFromMemoryCache` does `JSON.parse(cached.value) as T` — bare unchecked casts.
A malformed entry flows into the enrichment loop, which accesses `movie.title` /
`movie.year` (route.ts:281); an entry missing `title` throws inside the per-item
`try/catch` and degrades to an `id: null` partial — silently filtered out of the
response.

---

## 13. Enriched response contract (B = C)

| Field | Required | Source | Nullable | Consumer reliance |
|---|---|---|---|---|
| `id` | yes | TMDB `/search/movie` | yes (`null` on failure; then filtered) | high — card key, watchlist `itemId` |
| `title` | yes | TMDB `/search/movie` | no | high — card heading |
| `release_date` | optional | TMDB `/search/movie` | yes | medium — year display |
| `poster_path` | optional | TMDB `/search/movie` | yes (`null`) | high — image |
| `vote_average` | optional | TMDB `/search/movie` | yes (`0` sentinel) | medium — rating |
| `reasoning` | optional | Gemini / similar / popular (carried through) | yes | medium — "AI-Powered" rationale |

Client contract (`app/movie/[id]/page.tsx:84–92`) requires `id`, `title`,
`poster_path`, `release_date`, `vote_average`, optional `reasoning` — an exact
match to the route's enriched shape.

**Critical asymmetry**: `id`, `poster_path`, `vote_average` exist **only** in the
enriched object and are **absent** from the cached suggestion object. This is the
compatibility hazard analyzed in §22.

---

## 14. Cache-hit behavior

Warm hit → producer never runs:

| Tier | Runs on warm hit? |
|---|---|
| Gemini | **No** |
| TMDB `/movie/{id}` details | **No** |
| TMDB `/movie/{id}/similar` | **No** |
| TMDB `/movie/popular` | **No** — unless cached array is empty (§16) |
| TMDB `/search/movie` enrichment | **Yes — up to 12 requests, pool-4** |

**Warm-hit upstream volume: up to 12 `/search/movie` requests; max 4 in flight.**

Proven statically (§9.13 executes after `getOrSet`) and at runtime by
`tests/ai-similar-enrichment-concurrency.test.ts:390–432`, which asserts
`gemini`/`details`/`similar` are undefined while `search === 12` and
`maxInFlight <= 4` on the second request (§34).

---

## 15. Cache-miss behavior

| Tier | Calls |
|---|---|
| TMDB details | 1 |
| Gemini | 1 (up to 3 attempts) |
| TMDB similar | 0 unless Gemini < 4 or fails |
| TMDB popular | 0 unless suggestions empty |
| TMDB `/search/movie` | up to 12, pool-4 |

**Cold-miss total: 14 requests, max 4 in flight.**

---

## 16. Cached-empty-array behavior

When Gemini and the `similar` fallback both fail, the producer returns `[]`
(route.ts:227); `getOrSet` writes it (not `undefined`) — **cached 24 hours**.

On every subsequent hit:

1. `getOrSet` returns `[]` — zero Gemini, details, similar.
2. `aiSuggestions.length === 0` → the **emergency `/movie/popular` request runs
   every time** (route.ts:236–262).
3. Popular results (≤ 12) formatted as suggestions.
4. **Never written back** — cached value stays `[]`.
5. Full pool-4 enrichment runs on the popular titles — up to 12 more requests.

**A cached `[]` is the worst warm-hit case: 1 `/movie/popular` + up to 12
`/search/movie` ≈ 13 upstream requests, repeated every request for 24 hours, with
zero cache benefit for the work performed.**

This is an amplification of PERF-001b, not a separate bug — same root cause
(enrichment outside the producer) plus a negative-cache dimension: the cached
failure *guarantees* repeated popular + enrichment work.

---

## 17. Emergency popular behavior

| Aspect | Current |
|---|---|
| Trigger | `aiSuggestions.length === 0` after `getOrSet` |
| Placement | Outside the producer → **never cached** |
| On success | ≤ 12 suggestion-shaped objects |
| On failure | Array stays empty → `200 { results: [] }` |
| Enrichment | Same pool-4 loop |
| Write-back | None |

Under Option A, if the producer returns the enriched popular result, the popular
tier becomes part of the cached origin and stops repeating. This must be a
deliberate decision, not a side effect (§48).

---

## 18. Partial-enrichment behavior

Per-suggestion `try/catch` returns `{ ...movie, poster_path: null, id: null,
vote_average: 0 }` on any failure. The final `.filter(id !== null)` drops them:
12 suggestions with 2 failed searches → 10-item response, order preserved;
`Promise.all` cannot reject. Pinned by the concurrency suite at L323.

Under a fix that caches enriched results, partials would be **persisted for 24
hours** (§48).

---

## 19. All-enrichment-failure behavior

If every `/search/movie` fails, filtering yields `[]` and the response is
`200 { results: [] }`. **Today this is not cached** (the suggestion array was
valid; only enrichment failed). Under Option A it **would** be cached for 24 h
unless explicitly excluded — a material semantic change (§48).

---

## 20. Cache key and namespace

| Property | Value |
|---|---|
| Route literal key | `movie:${movieId}:ai-similar` |
| Namespace | `movie-recommendation-system:{environment}:v1:` |
| Final key | `…:v1:movie:{id}:ai-similar` |
| `CACHE_VERSION` | `v1` (`lib/cache-namespace.ts:21`) |
| TTL | 86400 s |
| User scoping | **None — publicly shared across users** |
| Uses `CACHE_SCOPES.aiSimilar` | **No** |
| Uses `buildCacheKey` | **No** |

The `aiSimilar` scope constant exists (`public:ai-similar`,
`lib/cache-namespace.ts:32`) but is referenced only by the admin-cache allowlist
(`app/api/admin/cache/route.ts:53`), never by this route.

---

## 21. Cache TTL

24 h (86400 s), hardcoded at the `getOrSet` call site. Applies equally to the
memory fallback and Redis. No jitter, no refresh-on-read. Must be preserved
(Step 2 requirement 13).

---

## 22. Existing-entry compatibility

### 22.1 Shape overlap

| Field | Cached suggestion (old) | Enriched (new) |
|---|---|---|
| `title` | ✔ | ✔ |
| `year` | ✔ | ✖ |
| `reasoning` | ✔ | ✔ |
| `id` / `release_date` / `poster_path` / `vote_average` | ✖ | ✔ |

### 22.2 Mistaken-identity scenarios

- **New value read by old code path**: enrichment would run on objects already
  carrying `id`/`poster_path`, discarding them and re-searching — the bug
  **silently persists** for the stale entry's 24 h lifetime. Worst real hazard.
- **Old value read by new code**: the new path would pass `year`-less objects
  into enrichment; safe at the call site (`encodeURIComponent(movie.year || '')`)
  but a behavior change.
- **Runtime validation on read: none** (§12) — unchecked `as T` casts.

### 22.3 Missing-field outcomes

| Missing | Outcome |
|---|---|
| `title` | enrichment `try/catch` → `id: null` → filtered → silently dropped |
| `year` | safe; empty year in query string |
| `id`/`poster_path`/`vote_average` on a suggestion value | enrichment proceeds normally (outputs, not inputs) |

### 22.4 Discriminant / version

**None inside the value** — no `schema`, `version`, or shape tag in either
contract. The only version signal is the global key-prefix `v1`.

### 22.5 Dual-read feasibility

Detecting old vs new via `'id' in item` is *technically* possible because the
enriched shape is a near-superset, but:

- relies on a **coincidental** field difference, not a declared contract;
- pre-filter all-failure enriched entries (`id: null` present) are shape-adjacent
  to valid ones, so detection needs `Array.isArray && every('id' in item)` —
  brittle;
- forces legacy logic into the read path indefinitely.

**Verdict: a new cache key is safer than value-shape detection.** Dual-read is
feasible-but-brittle and **not** recommended (§44 Option B).

---

## 23. Cache-version options

| # | Strategy | Pros | Cons | Verdict |
|---|---|---|---|---|
| 1 | **Global `CACHE_VERSION` bump** (`v1`→`v2`) | One line; instant clean slate | Invalidates **every** cache in every scope — self-inflicted global cold-start unrelated to this defect | ✖ **Not recommended** |
| 2 | **Route-local key suffix** (`movie:{id}:ai-similar:v2`) | Surgical; only this route rotates; old keys expire naturally ≤ 24 h; no global impact; trivial rollback | Old `v1` keys occupy memory until expiry (bounded, 24 h) | ✔ **Recommended** |
| 3 | **`buildCacheKey(CACHE_SCOPES.aiSimilar, …)`** | Aligns with the `ai-recommendations` pattern; canonical construction; better admin observability | Changes the key path (also rotates — good); resource string must still carry a version to be safe | ✔ **Recommended combined with #2** |
| 4 | **Same key + dual-shape detection** | No key churn | Brittle (§22.5); legacy read-path logic forever | ✖ Not recommended |
| 5 | **Same key + blind replacement** | Zero key work | **Highest risk**: in-flight or just-written old entries read by new code (or vice versa) during rollout; no validation; silent misbehavior up to 24 h | ✖ Rejected |

**A global version bump is not recommended** — the defect is confined to one
route's value shape; every other scope's serialized schema is unchanged.

---

## 24. In-flight coalescing

| Property | Behavior |
|---|---|
| Map key | Fully namespaced key — per-resource dedup |
| Added | On origin start (after a miss) |
| Removed | `.finally()` — after resolve **or** reject |
| Rejection | Entry removed; a later caller re-runs the origin (retryable) |
| Bound | `MAX_INFLIGHT_ENTRIES = 1000`; oldest evicted on overflow |
| Same key, one process | Coalesced — one shared origin promise |
| Different keys, one process | Independent — no cross-key blocking |
| Cross-process | **No coalescing** — each process runs its own origin |

### 24.1 Effect of moving enrichment inside the producer

Today the origin is *suggestions-only*, so in-flight coalescing never covers
enrichment: two concurrent same-key misses each run their own 12-search fan-out.

Moving enrichment inside makes the origin the **full enriched response**, so
same-key concurrent misses share **one** fan-out: 12 searches total, max 4 in
flight. A genuine additional benefit of Option A (hypothesis H9 — SUPPORTED).

---

## 25. Cross-process stampede exposure

`inflightPromises` is module-local per process; no distributed lock exists.
Under Option A, cross-process same-key duplication **remains** — N processes with
a simultaneous miss run N origin fan-outs (one each), bounded to 4 in-flight per
process. Unchanged from today; Option A does not worsen it.

No repository evidence shows cross-process duplication is a measured problem.
Per the prompt's §7 guidance, **a distributed lock is not recommended** in this
phase.

---

## 26. Request-volume calculations

All figures are **static theoretical bounds from source**, not observed metrics.

### 26.1 Current implementation

| Metric | Value |
|---|---|
| Warm-hit `/search/movie` per request | up to 12 |
| Warm-hit max in flight | 4 |
| Cold-miss total upstream per request | 14 |
| Cold-miss max in flight | 4 |
| Cached `[]` warm hit | 13 (1 popular + ≤ 12 search) |

### 26.2 Concurrency scenarios

| Scenario | Volume |
|---|---|
| 1 request (warm) | up to 12 |
| 1 request (cold) | 14 |
| 5 simultaneous, same movie, warm | 5 × 12 = **60** |
| 5 simultaneous, same movie, cold, one process | 14 + 4 × 12 = **62** |
| 10 simultaneous, same movie, warm | 10 × 12 = **120** |
| 10 simultaneous, same movie, cold, one process | 14 + 9 × 12 = **122** |
| 10 simultaneous, same movie, cold, 10 processes | 10 × 14 = **140** |

Note the inversion: today a **warm** cache can cost nearly as much as a **cold**
one, because only the cheap tiers are cached.

### 26.3 Fix options

| Metric | Option A (producer + `:v2`) | Option B (dual-read) | Option C (second cache) |
|---|---|---|---|
| Cold miss | 14 (unchanged) | 14 | 14 + 1 enriched read |
| **Warm hit** | **0** | 0 (if detection succeeds) | 0 (on the enriched key) |
| Max in flight | 4 | 4 | 4 |
| Cache writes per cold key | 1 (enriched payload) | 1 | 2 |
| Pool 4 preserved | Yes | Yes | Yes |
| Warm volume decrease | **Yes — to zero** | Yes | Yes |
| Stampede exposure | Improved in-process; unchanged cross-process | Same | Same |

### 26.4 Peak-concurrency labels

- **Peak concurrency** (single request): 4 in-flight `/search/movie`.
- **Total volume** (single warm request): up to 12 searches in 3 batches of 4.
- **Per-process**: same-key misses coalesced at the origin; enrichment not
  coalesced today.
- **Cross-process**: no coalescing; N processes → N independent origins.

---

## 27. Pool-4 preservation requirements

Any fix must preserve the Phase 8 correction verbatim:

- `ENRICHMENT_POOL_SIZE = 4` stays module-level.
- `for (let i = 0; i < n; i += 4)` + `Promise.all(batch)` shape retained.
- Per-item `try/catch` → `id: null` partial semantics retained.
- Order-preserving batch processing retained.
- **No new shared abstraction** (Phase 8 §22.5: inline copy, no helper).
- No retry wrapper, no abort signal on the search tier (pinned by the
  concurrency suite at L486).

Under Option A the loop simply moves *inside* the producer; its body is
unchanged, so cold-miss in-flight stays bounded at 4 (§50 risk R4).

---

## 28. Client compatibility

### 28.1 Consumer inventory

**One** in-repository consumer: `app/movie/[id]/page.tsx` (L159–175).

```ts
const aiSimilarResponse = await fetch(`/api/movie/${movieId}/ai-similar`)
if (aiSimilarResponse.ok) {
  const aiSimilarData = await aiSimilarResponse.json()
  if (aiSimilarData.results && aiSimilarData.results.length > 0) {
    setSimilarMovies(aiSimilarData.results)
    setUsesAI(true)
    return
  }
}
// else falls back to /api/movie/{id}/similar
```

### 28.2 Client expectations

| Expectation | Detail |
|---|---|
| Response shape | `{ results: MovieRecommendation[] }` — exact match |
| Fields used | `id`, `title`, `poster_path`, `release_date`, `vote_average`, `reasoning` (optional) |
| Ordering | Rendered in array order (`similarMovies.map`, L578) — **order-sensitive** |
| Empty state | `results.length === 0` → falls back to `/api/movie/{id}/similar` |
| Error state | non-`ok` → caught, logged, falls back |
| `usesAI` flag | set `true` only when ≥ 1 result — drives the "AI-Powered" badge (L543) |
| Caching awareness | **None** — the client caches nothing; it re-fetches on every page load |

### 28.3 Impact of changing the cached payload

The client consumes only the **final response**, never the cached value. Changing
what is cached therefore has **zero direct client impact** as long as the response
contract (§13) is preserved. The client gains a side benefit: warm hits return
faster (no 12-search fan-out), improving perceived latency.

No client changes are required, recommended, or in scope for Step 2.

---

## 29. Cache-management behavior

`lib/cacheManager.ts`:

| Function | Behavior |
|---|---|
| `invalidateMovieCache(id)` | Deletes `movie:{id}:details`, `movie:{id}:recommendations`, `movie:{id}:similar`. **Not** `:ai-similar`. |
| `invalidateTVCache(id)` | TV equivalents. |
| `invalidateHomeCache()` | Home keys. |
| `clearAllCache()` | `clearScoped(CACHE_NAMESPACE + '*')` — prefix-scoped, never FLUSHDB |
| `findCacheKeys(pattern)` | Bounded SCAN; rejects raw globs from callers |
| `listKeys(scope, limit)` | Bounded; scope must be in the admin allowlist |

### 29.1 Existing invalidation gap

**`movie:{id}:ai-similar` is never invalidated by any function.** It only ever
expires by TTL (24 h). This is true today and is unchanged by PERF-001b — but it
becomes **more consequential** under Option A, because the cached payload would
then include enrichment data (posters, ratings) that can go stale.

### 29.2 Admin observability

`admin-cache` can list `public:ai-similar` scope keys (allowlist L53), so a
scope-based key would be visible in the admin tool. The current route's literal
`movie:{id}:ai-similar` key lands outside that scope and is **not** listed by the
`public:ai-similar` filter — a pre-existing observability gap that Option 3
(§23) would close.

---

## 30. Admin-cache route behavior

`app/api/admin/cache/route.ts`: `requireAdmin` at handler level; GET is read-only
(stats/metadata listing); destructive actions use POST/DELETE; same-origin check
on cookie-authenticated mutations; strict Zod bodies; bounded SCAN only;
prefix-scoped clear (never FLUSHDB/FLUSHALL). The `list` action validates `scope`
against an internal allowlist including `public:ai-similar`.

No changes required or recommended for Step 2.

---

## 31. Cache invalidation gap analysis

| Key | Invalidated by | TTL expiry |
|---|---|---|
| `movie:{id}:ai-similar` | **Nothing** | 24 h |
| `movie:{id}:details` | `invalidateMovieCache` | — |
| `movie:{id}:recommendations` | `invalidateMovieCache` | — |
| `movie:{id}:similar` | `invalidateMovieCache` | — |

**CACHE-OPS-001 (identified, deliberately not fixed here)**: the ai-similar key
is missing from `invalidateMovieCache`, so favoriting/watchlisting/other movie
mutations never refresh AI suggestions. This is a **pre-existing, independent**
operability gap. It is **not** PERF-001b and is **out of scope** for this phase —
fixing it would violate the minimal-diff principle and expand the change surface
beyond the requested diagnosis. Flagged for a future phase.

Option A interacts with this gap: after moving enrichment inside the producer, a
stale entry would also carry stale poster/rating data for up to 24 h. This does
**not** create the gap (it exists today for titles) but widens its blast radius
slightly. Documented as Step 2 risk R8 (§50); the recommended mitigation is to
keep the 24 h TTL (short enough to bound staleness) rather than to add
invalidation in this phase.

---

## 32. Scope boundary

**In scope**: `app/api/movie/[id]/ai-similar/route.ts` (cache key + producer
boundary), `tests/ai-similar-enrichment-concurrency.test.ts` (assertion updates +
new cases), this report.

**Out of scope**: CACHE-OPS-001 (§31); any change to `lib/cache.ts`,
`lib/cache-namespace.ts` (including `CACHE_VERSION`), `lib/cacheManager.ts`,
`app/api/admin/cache/route.ts`, `middleware.ts`, `app/movie/[id]/page.tsx`, other
routes, and anything outside the ai-similar lifecycle.

---

## 33. Test isolation evidence (READ prerequisite)

`tests/ai-similar-enrichment-concurrency.test.ts`:

| Property | Evidence |
|---|---|
| Network access | **Deny-by-default `globalThis.fetch` guard** (`guardFetch`, L82–133) — installed in `beforeEach` (L234). Only exact `GEMINI_GENERATE_URL` POST and exact TMDB base paths GET are allowed; **everything else throws immediately**, with no fall-through to the real fetch. |
| MongoDB | mocked — `vi.mock('@/lib/mongodb', …)` (L135) |
| Auth | mocked — `requireUser` resolves an allowed session (L137–139, L227–230) |
| Rate limiting | mocked — `applyRateLimitUser` resolves `null` (no denial) (L141–146, L231) |
| Redis | mocked — `vi.mock('@/lib/redis')` returns null client (L148); `vi.mock('@/lib/cache')` supplies an in-memory `getOrSet` (L150–178) |
| Environment | `vi.stubEnv('GOOGLE_API_KEY', 'test-placeholder-key')`, `vi.stubEnv('TMDB_API_KEY', 'test-tmdb-key')` (L232–233); **no `dotenv` import** |
| Filesystem | no `fs` import or usage |
| Import of real services | none — `@/lib/mongodb`, `@/lib/security/auth`, `@/lib/security/rateLimit`, `@/lib/redis`, `@/lib/cache` all mocked; only `@/lib/gemini-payload` is real-imported for `GEMINI_GENERATE_URL` (a constant) |
| Module isolation | `vi.resetModules()` per test (L217) |
| Env cleanup | `vi.unstubAllEnvs()` in `afterAll` (L238) |

**Conclusion: zero external contact is possible.** Every reachable fetch is
intercepted; every persistence/auth boundary is mocked. The API keys are
non-functional placeholders. This satisfies the READ-ONLY proof requirement, so
executing the suite in Step 1 violated no constraint.

Other referenced suites (`stale-identity`, `admin-chat-ai-security`,
`performance-m4`, `performance-phase2`, `middleware-security`) apply the same
mock boundary: MongoDB/auth/rate-limit/cache mocked, `globalThis.fetch` replaced,
no `dotenv`. `performance-m4.test.ts` sets `process.env.TMDB_API_KEY` directly
(L196) — also a placeholder.

---

## 34. Runtime pre-fix RED captured

Executed in Step 1 (isolation proven first, §33):

```
npx vitest run tests/ai-similar-enrichment-concurrency.test.ts
```

**Result: 8/8 PASS.**

The decisive case — *"cache hit: zero Gemini/details/similar, enrichment searches
still run"* (L390–432) — is the **runtime RED for PERF-001b**. Its second request
asserts the defective behavior directly:

```ts
// hit skips Gemini + details + similar entirely
expect(state.categories.get('gemini')).toBeUndefined();
expect(state.categories.get('details')).toBeUndefined();
expect(state.categories.get('similar')).toBeUndefined();
// ...but enrichment still fans out per request (PERF-001b territory)
expect(state.categories.get('search')).toBe(12);
expect(body.results).toHaveLength(12);
expect(state.maxInFlight).toBeLessThanOrEqual(4);
```

So the pre-fix behavior is **empirically captured, not merely inferred** —
correcting the Phase 8 evidence mistake (its report §17.1 admitted the runtime RED
was not captured). Here the RED exists as a committed assertion that a warm hit
re-issues all 12 searches. Step 2 must **flip** this assertion to
`toBeUndefined()` (i.e. zero searches on a hit) once enrichment moves inside the
producer.

Full suite output: `✓ node tests/ai-similar-enrichment-concurrency.test.ts (8
tests) 356ms`, with per-case confirmation of order preservation, partial-enrichment
survival, duplicate-title behavior, zero-fetch auth/rate-limit/invalid-id paths,
deny-by-default guard, and no abort signal on the search tier.

---

## 35. Other gates executed

None. Per the read-only constraint, no lint, typecheck, build, or full-suite run
was executed. The only command run was the single isolated focused suite (§34),
after proving its isolation (§33).

---

## 36. Root-cause statement

**The cache boundary is placed at the wrong layer of the producer pipeline.**

`redisCache.getOrSet` wraps only the *suggestion-generation* stage (details →
Gemini → `similar` fallback). The enrichment stage — the most expensive
per-request step and the exact subject of PERF-001 — executes **after** the
`getOrSet` call, so its results are never stored and must be recomputed on every
request, warm or cold.

The cache stores contract **A** (suggestions) while the API returns contract
**B/C** (enriched recommendations). Nothing cached is ever reused for the step
that dominates upstream volume.

**Contributing factor**: the cache key carries no version or shape discriminant,
so a payload change under the same key would create a mixed-shape population
during rollout (§22.2) — hence the versioned-key requirement in the recommended
fix.

---

## 37. Defect classification

| Axis | Classification |
|---|---|
| Category | Performance / cache-boundary |
| Type | Logic defect — incorrect placement of a cache boundary |
| Severity | Medium |
| Blast radius | Single route + single focused test file |
| Introduced in | Pre-existing; predates Phase 8. Phase 8 bounded its width without addressing its depth. |
| Introduced by | Original ai-similar implementation |
| Present since | Original implementation of the route |
| Reproducible | Yes — deterministically, via the focused suite (§34) |
| Fix complexity | Low |
| Rollback | Trivial — revert the key suffix and/or the producer move |
| Data loss | None |
| Security impact | None (no auth, PII, or key-handling change) |
| Privacy impact | None |

---

## 38. User impact

| User-visible effect | Detail |
|---|---|
| Latency on warm views | A warm page load still waits for up to 12 sequential-batch TMDB searches (3 batches × 4) before rendering "SIMILAR MOVIES". The cache provides **no** latency benefit for the dominant step. |
| Rate-limit friction | The AI-similar route is capped at 10 req/min/user. Because hits are cheap to *us* but not to TMDB, the limit throttles legitimate browsing while the underlying cost is wasted re-work. |
| Consistency | Enrichment results differ between visits (TMDB search ranking drift), so the same cached suggestions can render with different posters/ratings across page loads — a subtle inconsistency that disappears once enrichment is cached. |
| Failure modes | A cached `[]` (§16) repeats the popular + enrichment chain on every request for 24 h — worst case for both latency and upstream load. |

No functional correctness impact: the response contract is unchanged.

---

## 39. Business impact

Amplification under burst traffic to a popular movie: 10 concurrent warm views of
the same title issue up to **120** TMDB `/search/movie` requests (§26.2), where
the cache should make it ~0. This converts a cache hit — which should be the
cheapest path — into the dominant upstream cost driver, exactly the inverse of
the cache's purpose. Upstream quota spend on TMDB scales with page views rather
than with distinct movies.

---

## 40. Maintenance impact

| Aspect | Impact |
|---|---|
| Test brittleness | The Phase 8 suite currently **asserts the defective behavior** (L390–432). It must be updated in Step 2 or it will fail against the fix — correct, but it means the suite pins behavior rather than intent. |
| Comprehension | Two contracts (A vs B/C) plus an uncached post-producer stage make the route's data flow non-obvious; the report's §10 diagram is needed to reason about it. |
| Key hygiene | The route bypasses `buildCacheKey`/`CACHE_SCOPES` (§20), so its keys are invisible to the admin `public:ai-similar` listing — an observability gap that the fix can close for free. |
| Invalidation gap | CACHE-OPS-001 (§31) is unaddressed and becomes slightly more consequential under the fix. |

---

## 41. Impact summary

| Dimension | Impact | Change required |
|---|---|---|
| API contract | **None** — response shape, ordering, filtering, status codes all preserved | None |
| Client | **None** — consumes only the final response | None |
| Cache layer (`lib/cache.ts`) | **None** — `getOrSet` semantics reused as-is | None |
| Cache namespace | **None** — no `CACHE_VERSION` bump (route-local suffix instead) | None |
| Admin/invalidation | **None** — gap pre-existing, out of scope | None (future CACHE-OPS-001) |
| Route | Cache key + producer boundary only | 1 file |
| Tests | Flip one assertion, add coverage for the new origin path | 1 file |
| Performance | Warm-hit upstream volume 12 → **0**; cold miss unchanged at 14, in-flight bound 4 preserved | — |

---

## 42. Hypotheses evaluated

| ID | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| H1 | Enrichment runs on every request, cache hit included | **SUPPORTED** | route.ts:264–327 is after `getOrSet`; runtime proof §34 |
| H2 | The cached payload is the pre-enrichment suggestion array | **SUPPORTED** | Producer returns `AISuggestion[]`; route.ts:173–233 |
| H3 | Warm-hit Gemini/details/similar calls are all zero | **SUPPORTED** | §34 assertions `toBeUndefined()` |
| H4 | Warm-hit search count equals the suggestion count (≤ 12) | **SUPPORTED** | §34 `search === 12` |
| H5 | In-flight bound of 4 holds on warm hits | **SUPPORTED** | §34 `maxInFlight <= 4` |
| H6 | A cached empty array triggers repeated popular + enrichment | **SUPPORTED** | route.ts:236–262 + 264–327; `[]` is written (§16) |
| H7 | `getOrSet`'s in-flight dedup does not cover enrichment today | **SUPPORTED** | Producer is suggestions-only (§24.1) |
| H8 | The cached payload has no version/discriminant | **SUPPORTED** | §12, §22.4 |
| H9 | Moving enrichment inside the producer also improves same-key concurrent misses | **SUPPORTED** | §24.1 |
| H10 | Pool-4 is preserved under the fix | **SUPPORTED** | Loop body unchanged; §27 |
| H11 | A global `CACHE_VERSION` bump is required | **REFUTED** | Defect is route-local; §23 option 1 |
| H12 | Cross-process stampede is a live problem needing a distributed lock | **REFUTED** | No evidence; §25 — not recommended |
| H13 | Dual-read shape detection is a safe alternative to a new key | **REFUTED** | §22.5 — brittle, no declared contract |
| H14 | The client requires changes | **REFUTED** | §28.3 — zero client impact |
| H15 | Existing entries would be misread after a payload change under the same key | **SUPPORTED** | §22.2 — highest rollout risk, hence versioned key |

---

## 43. Hypotheses not evaluated

| Hypothesis | Why deferred |
|---|---|
| Real-world traffic distribution across movie IDs | Requires production access/telemetry — out of scope for a read-only diagnostic |
| Observed p95 latency improvement after the fix | Requires deployment and metrics — Step 2+ |
| TMDB `/search/movie` quota headroom | Requires TMDB account/quota data — external, not contacted |
| Frequency of the cached-`[]` path in production | Requires error/telemetry data not present in the repository |
| Node 22 CI behavior | CI not executed this phase (§52) |

---

## 44. Recommended fix options

### Option A — **RECOMMENDED**: enrichment inside the producer + route-local versioned key

1. Move the **entire enrichment stage** (pool-4 loop + `id !== null` filter)
   **inside** the `getOrSet` producer, so the origin returns the final
   `validRecommendations` array.
2. Handle the emergency popular fallback **inside the producer** as the last
   resort of the origin (so its results are also cached once, not re-fetched per
   request).
3. Change the cache key to a route-local versioned form:
   `` `movie:${movieId}:ai-similar:v2` ``, or preferably
   `buildCacheKey(CACHE_SCOPES.aiSimilar, `${movieId}:v2`)` to align with the
   established `ai-recommendations` pattern and make the keys admin-visible.
4. Preserve: the 24 h TTL, the pool-4 loop body verbatim, per-item `try/catch`,
   order preservation, the `< 4` threshold, the response contract (§13), and the
   401/429/400 short-circuits.

**Why recommended**: smallest diff that fixes the root cause; warm-hit volume
12 → 0; cold-miss behavior and in-flight bound unchanged; zero client/API change;
old `v1` entries expire naturally within 24 h with **no** global cache impact;
trivial rollback (revert the key suffix). It also gains in-process same-key
coalescing of enrichment (H9) as a side benefit.

**Known trade-offs** (Step 2 must decide deliberately, §48): a cached all-failure
result (`results: []`) would now persist 24 h unless the producer excludes empty
final results from the write — recommended, to avoid negative-caching a total
enrichment failure (contrast with today, where `[]`-from-enrichment-failure is
never cached, while `[]`-from-producer-failure *is*).

### Option B — Same key + runtime dual-read detection

Keep the key, branch on `'id' in item` to decide whether to enrich. **Not
recommended**: brittle detection, no declared contract, legacy read-path logic
forever (§22.5).

### Option C — Second cache for the enriched payload

Keep the suggestion cache and add a second `getOrSet` for the enriched result.
Fixes the volume but doubles cache writes, adds a stale-on-stale dependency
between two keys, and complicates invalidation. **Not recommended** — strictly
worse than Option A for the same benefit.

### Option D — Status quo + accept repeated enrichment

Document the behavior and take no action. **Rejected**: it forfeits the latency
and upstream-cost win, leaves the worst-case cached-`[]` path (§16) in place, and
leaves PERF-001b permanently open.

---

## 45. Recommended fix

**Option A.** Rationale:

- Fixes the root cause (cache-boundary placement), not a symptom.
- Smallest reasonable diff: one route file + one test file.
- Zero API, client, cache-layer, namespace, admin, or middleware change.
- No global cache invalidation; no downtime; natural rollover.
- Preserves every Phase 8 guarantee (pool-4, order, partials, threshold).
- Trivial rollback.

Recommended sub-decisions for Step 2:

- Use `buildCacheKey(CACHE_SCOPES.aiSimilar, `${movieId}:v2`)` — aligns with the
  established pattern and closes the admin-observability gap (§29.2).
- Do **not** write empty final results (`results: []` from all-enrichment-failure)
  to the cache, to avoid negative-caching a transient total failure for 24 h.
  The existing `undefined`-skip in `getOrSet` already provides the mechanism if
  the producer returns `undefined` in that case — but note the producer must
  still return a displayable value on the *request*, so the write-skip must be
  applied to the cached copy only. Simplest: keep returning `[]` to the caller
  but make the producer signal "do not cache" for that case. If that adds
  complexity, the acceptable fallback is to cache `[]` as today (behavior
  preserved, no regression) and treat negative-caching as a known, documented
  trade-off.
- Keep the popular fallback **inside** the producer so it is cached once.

---

## 46. Request to fix

**Yes** — Option A is requested for Step 2.

| Property | Value |
|---|---|
| Target file | `app/api/movie/[id]/ai-similar/route.ts` |
| Change type | Cache-boundary relocation + cache-key versioning |
| Expected diff size | Small — move existing code, change one key literal |
| Risk level | MEDIUM TO HIGH (public API route; must preserve contract and pool-4) |
| Tests to update | `tests/ai-similar-enrichment-concurrency.test.ts` |

---

## 47. Fix complexity

| Item | Effort |
|---|---|
| Move enrichment + popular fallback into the producer | Low — mechanical relocation; the pool-4 loop body is unchanged |
| Versioned/scope-based key | Trivial — one literal |
| Keep the 401/429/400 short-circuits outside the producer | Already correct; must not move auth/rate-limit into the cached path |
| Test updates | Low — flip one assertion, add hit-path and empty-path cases |
| No new dependency, abstraction, or helper | Explicitly required (Phase 8 §22.5) |

---

## 48. Fix consequences to consider before implementing

1. **Negative caching of enrichment failure.** Today an all-search-failure result
   is not cached. Under Option A it would be, for 24 h. Decide explicitly (§45).
2. **Partial enrichment becomes durable.** A partial result (some `id: null`
   filtered) is cached for 24 h; transient TMDB search failures become
   persistent. Acceptable (the response is still valid), but must be a conscious
   decision.
3. **Cached popular results.** Moving the popular fallback inside the producer
   caches it — good for volume, but it means the emergency path is also cached
   for 24 h. Acceptable; it is strictly better than re-fetching every request.
4. **Auth/rate-limit must stay outside the producer.** They already are. Do not
   relocate them into `getOrSet`, or an auth failure would be cached.
5. **In-process coalescing widens.** A single origin now covers enrichment, so a
   slow origin blocks *more* work per key. Mitigated by the existing
   `GEMINI_TIMEOUT_MS` + 3-attempt bound and by `MAX_INFLIGHT_ENTRIES`.
6. **Memory-cache entry size grows** (enriched payload is larger). Bounded by
   `MAX_MEMORY_ENTRIES = 5000` and 24 h TTL — negligible.
7. **TTL semantics unchanged** (86400 s) — no freshness regression versus today.
8. **Rollout window.** During the ≤ 24 h rollover, both `v1` and `v2` keys exist.
   `v1` entries are read by **old** code only, so there is no cross-contamination
   as long as the deploy is atomic per instance. A/B or canary deploys are safe.
9. **Rollback.** Revert the key suffix (`:v2` removed) and/or the producer move.
   Old `v2` keys expire naturally in ≤ 24 h.
10. **CACHE-OPS-001 stays open** (§31). Not fixed by Option A; slightly more
    consequential after it. Documented for a future phase.

---

## 49. Step 2 exact files

| File | Required change |
|---|---|
| `app/api/movie/[id]/ai-similar/route.ts` | Move the pool-4 enrichment loop and the `id !== null` filter inside the `getOrSet` producer; move the emergency popular fallback inside the producer as the origin's last resort; change the key to `buildCacheKey(CACHE_SCOPES.aiSimilar, `${movieId}:v2`)` (or the `:v2` literal equivalent); preserve TTL 86400, the pool-4 loop body verbatim, per-item `try/catch`, order preservation, the `< 4` threshold, the 401/429/400 short-circuits, and the exact `{ results }` response contract. |
| `tests/ai-similar-enrichment-concurrency.test.ts` | Flip the cache-hit assertion at L390–432 from `search === 12` to **zero** searches on a hit; keep `gemini`/`details`/`similar` undefined; keep `maxInFlight <= 4` on cold misses; keep order/partial/duplicate cases green; add a case for the empty-suggestion cached path; update the suite header comment (L11–28) to reflect that enrichment is now part of the cached origin. |

No other files should be touched. Specifically **not**: `lib/cache.ts`,
`lib/cache-namespace.ts`, `lib/cacheManager.ts`, `app/api/admin/cache/route.ts`,
`middleware.ts`, `app/movie/[id]/page.tsx`, or `vitest.config.mts`.

---

## 50. Step 2 risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Cached payload shape mismatch across the rollout window | Low (with versioned key) | High | The `:v2` key makes it structurally impossible; do **not** reuse the old key |
| R2 | Breaking the public `{ results }` contract | Low | High | Diff-only change to the producer interior; response construction unchanged; add a contract assertion |
| R3 | Cold-miss in-flight bound exceeding 4 | Low | Medium | Pool-4 loop body moves verbatim; existing L242 case already asserts `maxInFlight <= 4` |
| R4 | Pool-4 regression via well-meaning refactor | Medium (if "improved") | Medium | No new abstraction/helper; copy the loop as-is (Phase 8 §22.5) |
| R5 | Auth/rate-limit accidentally moved inside the producer | Low | Critical | Keep `requireUser`/`applyRateLimitUser`/ID validation before `getOrSet`; existing L434 case pins zero-fetch denials |
| R6 | Negative-caching a total enrichment failure for 24 h | Medium | Medium | Exclude empty final results from the write, or accept and document (§45, §48-1) |
| R7 | Test suite still asserting the old defective behavior | Certain (if untouched) | Blocks the fix | Flip the L390–432 assertion in the same change |
| R8 | CACHE-OPS-001 blast radius widens slightly | Low | Low | Keep 24 h TTL as the staleness bound; fix invalidation in a later phase |
| R9 | Node 22 vs Node 24 divergence | Low | Low | Run the full gate matrix in Step 2, including CI (§52) |

---

## 51. Step 2 acceptance criteria

1. Warm cache hit performs **zero** `/search/movie`, zero Gemini, zero details,
   zero similar, zero popular — asserted in the focused suite.
2. Cold miss performs exactly 1 details + 1 Gemini + up to 12 searches, with
   `maxInFlight <= 4` — unchanged from today.
3. Result order follows suggestion order on both cold and warm paths.
4. One failed + one empty enrichment preserves the other results in order.
5. Duplicate titles still produce duplicate searches on the cold path.
6. The response contract (`{ results: EnrichedRecommendation[] }`) is byte-for-byte
   identical to the pre-fix contract.
7. Auth denial / rate-limit denial / invalid ID cause zero external fetches.
8. The deny-by-default fetch guard still rejects unknown hosts, wrong methods, and
   unknown TMDB paths.
9. Enrichment requests carry no retry wrapper and no abort signal.
10. The 24 h TTL is preserved.
11. The cache key is versioned and no `v1` entry is ever read by new code.
12. No new dependency, abstraction, or shared helper is introduced.
13. Zero changes outside the two listed files.
14. Isolation of every executed test is proven before execution (§33 standard).
15. No external service is contacted by any verification.

---

## 52. Step 2 execution requirements

- **Test isolation must be proven before execution** (§33) for any suite run.
- **No external service may be contacted** during verification. Only mocked
  suites may run.
- Execute, in order: the focused suite → the ai/cache/security suites named in §8
  → full `vitest run` → `npm run typecheck` → `npm run lint` → `npm run build`.
- **Node 22 CI must be executed** (it pins `node-version: 22`; local runs used
  Node 24). This is a carried-forward Phase 8 warning.
- Report all gate results honestly, including failures.
- Commit and deploy only after all gates pass and only if explicitly authorized
  — Step 1's policy is COMMIT_ALLOWED: NO / DEPLOYMENT_ALLOWED: NO.

---

## 53. Current cache state (pre-fix)

- No Redis instance is available in this environment (`getRedisClient` resolves
  to a mocked/null client in every suite; the fallback is the bounded in-memory
  cache).
- No cache reads or writes were performed in Step 1.
- No keys were inspected, created, or deleted.
- No cache entries exist that were created by this phase.

---

## 54. External service state

| Service | Contacted? | Basis |
|---|---|---|
| TMDB | **NO** | All suites mock `globalThis.fetch` with deny-by-default guards; no real key used (placeholder only) |
| Gemini | **NO** | Same; `GEMINI_GENERATE_URL` POST is intercepted by the mock |
| Redis | **NO** | `@/lib/redis` mocked to null in the executed suite |
| MongoDB | **NO** | `@/lib/mongodb` mocked in the executed suite |
| GitHub/CI | **NO** | No `gh` or workflow invocation |
| npm registry | **NO** | No installs; `npx vitest` used the already-installed local binary |
| Any other host | **NO** | No unmocked fetch was possible in the executed suite |

---

## 55. Evidence references

| Claim | Evidence |
|---|---|
| Cache key literal | route.ts:170 |
| TTL 86400 | route.ts:231–233 |
| Producer is suggestions-only | route.ts:173–233 |
| Enrichment after `getOrSet` | route.ts:264–327 |
| Pool-4 loop | route.ts:274–327, `ENRICHMENT_POOL_SIZE` L40 |
| `< 4` threshold | route.ts:195–197 |
| Popular fallback outside producer | route.ts:235–262 |
| `[]` is cached | `getOrSet` writes non-`undefined` values — `lib/cache.ts:336–344` |
| No read-path validation | `lib/cache.ts:177`, `lib/cache.ts:200` (bare `JSON.parse … as T`) |
| In-flight dedup semantics | `lib/cache.ts:331–358` |
| Runtime RED | `tests/ai-similar-enrichment-concurrency.test.ts:390–432`, executed §34 |
| Zero-fetch denials | same suite L434–484 |
| No abort signal on search tier | same suite L486–513 |
| Client contract | `app/movie/[id]/page.tsx:84–92`, L159–175 |
| Scope constant unused by route | `lib/cache-namespace.ts:32` vs route.ts:170 |
| Invalidation gap | `lib/cacheManager.ts:22–34` (no `:ai-similar` key) |

---

## 56. Missing evidence

| Item | Why missing |
|---|---|
| Production traffic/volume metrics | No production or telemetry access |
| Observed latency before/after | Requires deployment |
| TMDB quota consumption data | Requires TMDB account data |
| Frequency of the cached-`[]` path in prod | Requires error telemetry |
| Node 22 gate results | CI not executed this phase |
| Cross-process duplication measurements | Requires multi-instance production observability |

---

## 57. Assumptions

1. The repository's committed source is the authoritative implementation.
2. The Phase 8 completion report's claims about the pool-4 pattern's provenance
   and constraints are accurate.
3. Vitest project configuration (`vitest.config.mts`) is unchanged from Phase 8's
   verified state.
4. The single in-repository consumer is the only consumer of the endpoint.
5. Node 24 local results are representative for Node 22 CI modulo the carried
   warning.

---

## 58. Pre-fix behavior summary

| Tier | Cold miss | Warm hit | Cached `[]` hit |
|---|---|---|---|
| Gemini | 1 | 0 | 0 |
| `/movie/{id}` details | 1 | 0 | 0 |
| `/movie/{id}/similar` | 0–1 | 0 | 0 |
| `/movie/popular` | 0 | 0 | **1 every request** |
| `/search/movie` | ≤ 12 | **≤ 12 every request** | **≤ 12 every request** |
| Max in flight | 4 | 4 | 4 |
| Total | 14 | up to 12 | up to 13 |

---

## 59. Post-write repository state

| Property | Value |
|---|---|
| Branch | `main` |
| HEAD | `70fe77655467f5105f5d0e9b02594ba1c62b2952` |
| Upstream | `origin/main` (ahead 2, behind 0) |
| Staged additions / modifications / deletions | 0 / 0 / 0 |
| Unstaged modifications | many — identical set to §5, plus this new report file |
| Unstaged deletions | 1 (`docs/ARCHITECTURE_REVIEW.md`, pre-existing) |
| Untracked files | 85 = 84 pre-existing + this new report |

A scratch directory (`.my_tool_sandbox/p9/`) created during Step 1 evidence
gathering was removed; its remaining file is deleted at the end of this phase
(§63).

---

## 60. No external service contacted

Confirmed: no TMDB, Gemini, Redis, MongoDB, GitHub, or npm-registry call was made
by any Step 1 activity. The only command executed (`npx vitest run` on one isolated
file) is structurally incapable of external contact (§33).

---

## 61. No implementation performed

No source, test, configuration, or documentation file was modified, created, or
deleted **as a fix**. The only artifacts produced in Step 1 are:

1. This diagnosis report (new file).
2. A temporary scratch directory used while reading large files, which is removed
   in §63.

No edits to `app/api/movie/[id]/ai-similar/route.ts` or any other source file.

---

## 62. Repository state preserved

Git HEAD, branch, upstream, staged state, and the full pre-existing working-tree
modification set are **identical** to §5. Verified by re-checking status after
the diagnostic commands; only the addition of this report and the (since removed)
scratch directory differ. No pre-existing change was reverted, overwritten, or
altered.

---

## 63. Cleanup performed

The temporary scratch directory `.my_tool_sandbox/p9/` and its contents
(`route_num.txt`, `route_nl.txt`) — created solely to work around large-file read
elision while gathering evidence — have been deleted. No other cleanup was
required or performed.

---

## 64. Commit status

**NOT committed.**

No `git add`, `git commit`, `git push`, or `git tag` was executed. Nothing is
staged. The working tree contains this report as an unstaged, untracked-pending
new file alongside the pre-existing multi-phase modifications.

---

## 65. Deployment status

**NOT deployed.**

No build artifact was produced or shipped. No production, staging, or preview
environment was touched. No external system was contacted (§60). No rollout or
migration was initiated.

---

## 66. Final status

**PASS WITH WARNINGS**

Step 1 is complete: the cache flow, payload contracts, cache-hit amplification,
cached-empty-array and negative-caching behavior, entry compatibility, versioning
options, coalescing boundaries, client compatibility, and the invalidation gap
are all determined and evidenced. The runtime pre-fix RED — missing in Phase 8 —
is captured here (§34). The root cause is isolated to a single cache-boundary
defect in one route, and the smallest safe correction (Option A) is fully
specified with risks, acceptance criteria, and exact file scope.

**Warnings carried into Step 2**: volumes are theoretical bounds pending production
metrics; CACHE-OPS-001 is identified but intentionally unfixed; Node 22 CI must be
run.

**Next step: Step 2 — implementation of Option A in
`app/api/movie/[id]/ai-similar/route.ts` with the corresponding focused-suite
updates, only after explicit authorization, with test isolation proven before any
execution and no external service contact.**
