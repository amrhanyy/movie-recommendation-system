# Phase 9 — AI-similar Cache-Hit Enrichment Correction — Completion Report

**Route:** `GET /api/movie/[id]/ai-similar`
**Production change:** `app/api/movie/[id]/ai-similar/route.ts` (64 insertions / 18 deletions, EOL-insensitive; 316 → 362 lines)
**Test change:** `tests/ai-similar-enrichment-concurrency.test.ts` (new, 821 lines, 16 tests)
**Report path:** `docs/reports/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-CORRECTION-COMPLETION-REPORT.md` (canonical; the prior `...WARM-HIT-ENRICHMENT-CORRECTION...` file was removed so no two conflicting Phase 9 completion reports remain)

---

## 1. Old behavior (corrected description)

The route cached the **raw Gemini suggestion list** as the cached value, then ran
TMDB enrichment *outside* the `getOrSet` producer.

The actual, corrected consequence:

- The cache returned **raw suggestions to the route** — never to the client.
- Enrichment **executed outside the producer** for every request, cold or warm.
- A **warm hit therefore repeated up to 12 TMDB `/search/movie` requests**,
  exactly like a cold miss. The producer boundary was drawn at the wrong layer.
- **The client still received the final enriched response.** No request ever
  returned suggestion-shaped values to the browser.

So the defect was **repeated upstream work**, not delivery of raw suggestions.
Two secondary defects compounded it: the popular-fallback tier also ran outside
the producer (so a fallback result was never cached and was re-fetched on every
request), and an empty final array was cached — poisoning the key for 24 h.

Confirmed against the pre-fix route at HEAD (`70fe776`):

- line 158: `const cacheKey = `movie:${movieId}:ai-similar`;` — unscoped v1 key
- line 161: `let aiSuggestions = await redisCache.getOrSet(cacheKey, ...)`
- line 187: `return aiResults;` — producer returns **raw suggestions**
- line 253: `const enhancedRecommendations = await Promise.all(...)` — enrichment
  **outside** the producer, over all suggestions unbounded

---

## 2. Implementation audit

Read-only audit of the current route and the focused-test diff. **The route
already matches the approved design on every row — no production edit was made
in this audit pass.** Only test-side corrections were applied (section 5).

| # | Dimension | Current code (line) | Verdict | Keep/Remove/Replace | Evidence |
|---|-----------|--------------------|---------|---------------------|----------|
| 1 | Route imports | `NextRequest, NextResponse`; `requireUser`; `applyRateLimitUser, RATE_LIMITS`; `redisCache`; ai-security; gemini-payload; `buildCacheKey, CACHE_SCOPES` (L1–21) | Approved | Keep | L1–21 |
| 2 | `CACHE_SCOPES` import | `import { buildCacheKey, CACHE_SCOPES } from '@/lib/cache-namespace';` (L21) | Approved | Keep | L21 |
| 3 | `buildCacheKey` import | same import (L21) | Approved | Keep | L21 |
| 4 | Exact cache-key expression | `const cacheKey = buildCacheKey(CACHE_SCOPES.aiSimilar, '<movieId>:v2>')` (L174) | Approved — exact match | Keep | L174 |
| 5 | userId/email/session in key | Absent. `.email` appears only at L153 (rate-limit argument), never in the key | Approved | Keep | L174 has no identity token |
| 6 | Global `CACHE_VERSION` change | `const CACHE_VERSION = "v1"` in `lib/cache-namespace.ts` (L21) — file diff vs HEAD is **empty** | Approved (unchanged) | Keep | `git diff HEAD -- lib/cache-namespace.ts` → empty |
| 7 | `CACHE_SCOPES` change | `aiSimilar: "public:ai-similar"` (L32) — file diff vs HEAD is **empty** | Approved (unchanged) | Keep | `git diff HEAD -- lib/cache-namespace.ts` → empty |
| 8 | Producer boundary | `getOrSet(cacheKey, async () => { ... return validRecommendations.length > 0 ? ... : undefined; }, 86400)` (L180, L347) | Approved | Keep | L180, L347 |
| 9 | Popular fallback placement | Inside the producer (L253–269) | Approved | Keep | L253 |
| 10 | Pool-4 placement | `for (let i = 0; i < aiSuggestions.length; i += ENRICHMENT_POOL_SIZE)` inside the producer (L286–287); `const ENRICHMENT_POOL_SIZE = 4` (L41) | Approved | Keep | L41, L286 |
| 11 | Empty-result handling | `return validRecommendations.length > 0 ? validRecommendations : undefined;` (L347) | Approved — `undefined` only when empty | Keep | L347 |
| 12 | Response construction | `const validRecommendations = cachedOrProducedRecommendations ?? [];` (L353); `NextResponse.json({ results: validRecommendations })` (L355) | Approved — outside `?? []`, shape unchanged | Keep | L353, L355 |
| 13 | Custom `inFlight` state | **Absent** (`grep inFlight` → only a comment at L37) | Approved | Keep (absent) | grep → comment only |
| 14 | Custom flight TTL | **Absent** | Approved | Keep (absent) | grep → none |
| 15 | Pending promise arrays | **Absent** | Approved | Keep (absent) | grep `pending` → none |
| 16 | `Promise.allSettled` | **Absent** (route uses batched `Promise.all` at L288) | Approved | Keep (absent) | grep → none |
| 17 | Authentication | `await requireUser()` (L145), early return on failure | Approved | Keep | L145 |
| 18 | Rate limiting | `applyRateLimitUser(request, authResult.user.email, RATE_LIMITS.aiSimilar)` (L151–155) | Approved | Keep | L151 |
| 19 | Validation | `if (!/^\d{1,10}$/.test(movieId)) return 400` (L163) | Approved | Keep | L163 |
| 20 | Top-level error handling | `catch { ... NextResponse.json({ error: 'Failed to generate similar movies' }, { status: 500 }) }` (L356–362) | Approved | Keep | L356–362 |

**Result:** all 20 rows approved; no row marked Remove or Replace. The approved
final route requirements are all satisfied:

- public/shared v2 key — `buildCacheKey(CACHE_SCOPES.aiSimilar, '<movieId>:v2>')` ✔
- no user identity in the key ✔
- no custom `inFlight` / `flightTtl` / pending tracker / `Promise.allSettled` ✔
- no `CACHE_SCOPES` or `CACHE_VERSION` modification ✔
- existing `getOrSet` producer containing popular fallback + pool-4 + final filter ✔
- `undefined` returned only when the final enriched array is empty ✔
- outside normalization to `[]` ✔
- unchanged `{ results }` response ✔

**Proof no cache helper or scope constant changed:**
`git diff HEAD -- lib/cache.ts lib/cache-namespace.ts` → **empty** (both files
unmodified; the 3 files git does report as changed under `lib/` are
`lib/security/auth.ts` and `lib/security/rateLimit.ts`, which belong to other
phases, and `middleware.ts`).

**Proof no custom in-flight system remains:** the only `inFlight` hit in the
route is the comment at L37 describing pool-4. Central stampede protection is
pre-existing in `lib/cache.ts` (`inflightPromises`, shared by every `getOrSet`
caller) and is untouched by this phase.

---

## 3. Corrected cache boundary

The producer now returns the **final enriched array**, not the suggestion list.
Everything downstream of the suggestion tier — the popular fallback and the
pool-4 TMDB enrichment — lives inside the same cached unit of work.

- **Final cached payload:** the enriched array `{id, title, release_date, poster_path, vote_average, reasoning}`, 24 h TTL. A warm hit returns this verbatim and performs **zero** upstream calls.
- **Empty-result non-cache behavior:** the producer returns `undefined` for an
  empty final array, so `getOrSet` skips the cache write entirely. The next
  request retries the producer — an empty result can never poison the key.
- **Partial-result cache behavior:** a non-empty partial array (e.g. 11 of 12
  after one search fails) is cached and returned verbatim on the warm hit. This
  is an intentional trade-off: a degraded-but-useful list is served rather than
  re-running the whole chain.
- **Popular fallback cache behavior:** the fallback runs inside the producer, so
  its non-empty result is cached like any other success.
- **Pool-4 preservation:** enrichment remains batched at 4 in-flight
  (`ENRICHMENT_POOL_SIZE`), the established pattern from the ai-recommendations
  route. Verified: max in-flight ≤ 4 with 12 suggestions.
- **Key versioning:** the v1 key `movie:<id>:ai-similar` is left untouched and
  expires naturally via its 24 h TTL — no dual-read, no migration. The `:v2`
  suffix travels in the *resource* argument so `buildCacheKey` does not
  double-namespace it.

---

## 4. Duplicate behavior clarification

Source-backed and empirically confirmed by test 8:

- AI suggestion list capped at **12** — `aiSimilarMoviesSchema` uses
  `z.array(aiSimilarMovieSchema).min(1).max(12)` (`lib/ai-security.ts` L161).
- Similar fallback capped at **12** — `.slice(0, 12)` (route L233).
- Popular fallback capped at **12** — `.slice(0, 12)` (route L262).
- **Every suggestion-producing path is therefore capped at 12.**
- Duplicate-title suggestions are **searched separately** — there is no title
  deduplication anywhere in the route.
- The route **returns duplicate results** when both searches resolve: its only
  post-enrichment filter drops items with a null TMDB id; it never collapses
  identical titles.
- Under the fixture, **4 suggestions with 2 duplicate titles produce 4 searches
  and 4 results.**

**Recorded as a separate follow-up candidate, not PERF-001b scope.** The
follow-up cost is limited to redundant TMDB searches and duplicate UI rows for
repeated titles — search volume is already bounded at 12 by the caps above, so
this is not an unbounded-fan-out problem.

---

## 5. Network guard audit and correction

**Bounded correction applied (test-only; no production change).**

Two guards violated the required fail-loudly policy and were fixed:

1. **Default `fetchGuard`** returned `new Response('guard-blocked', { status: 200 })`
   — a synthetic **200 OK** for a blocked request. Replaced with a throw.
2. **Network-deny guard** returned a **404 Response** for denied requests.
   Replaced with a throw.

The corrected guard policy: allow only exact approved categories, **throw** for
every other request, never return a generic `404`/`200` `Response`, and never
fall through to real `fetch`. A `404`-for-denied guard is indistinguishable from
a legitimate TMDB 404 and would let an unapproved request masquerade as a normal
response.

The network-deny test now proves three rejection cases, each asserted in
isolation so one passing case cannot mask a failure of another:

1. **Unknown host rejects** — `allowlist(() => false)`; the route's first call
   (TMDB details) is refused and the route returns 500. Asserts
   `res.status === 500` and that the guard fired.
2. **Wrong Gemini method rejects** — a `GET` to the trusted Gemini host is
   refused even though the host is trusted. Exercised **directly against the
   guard** (not through `GET()`), because the route always sends POST to
   `GEMINI_GENERATE_URL` and a wrong-method Gemini call cannot originate from
   the route.
3. **Unknown TMDB path rejects** — `GET /discover/movie` is refused. Exercised
   directly against the guard, since the route only constructs its own known
   endpoints.

Denial assertions were **not** weakened to call-shape-only assertions: they
assert `.rejects.toThrow(/^DENIED:/)`, the recorded method, and the recorded URL
path, in addition to `res.status === 500` for the route-integrated case.

**Note on the direct-guard cases:** cases 2 and 3 call the guard function
directly rather than routing through `GET()`. This is deliberate and correct —
the route cannot generate those request shapes (it always POSTs to the approved
Gemini URL and only builds its own TMDB endpoints), so a direct call is the only
way to prove the guard's own rejection logic for those categories. The
route-integrated case (1) still proves end-to-end enforcement.

---

## 6. Canonical RED status

> **Canonical future-contract runtime RED was not captured before production
> editing.**

Evidence:

- The pre-fix route at HEAD (`70fe776`) has **no** test asserting warm-hit
  search volume. `git grep -l "ai-similar" HEAD -- tests/` matches only unrelated
  files (`admin-chat-ai-security`, `performance-m4`, `stale-identity`), and
  `git grep -ln "toBe(12)" HEAD -- tests/` returns **nothing**.
- The route was edited at **19:14:30**, the test file did not exist until
  **22:03:59**. The test therefore post-dates the first production edit.
- No behavioral RED run of the future-contract test against the pre-fix route
  exists in this session's tool history.

Per instruction: the canonical future-contract runtime RED was not captured
before production editing. The pre-fix behavior is nevertheless pinned by the
HEAD route source itself, which provably ran enrichment outside the producer
(line 253 `Promise.all` after line 187's `return aiResults` inside
`getOrSet`) — meaning a warm hit necessarily re-ran the 12 searches. The current
GREEN test asserts zero. No RED was manufactured for this report, and no
test-authoring failure or debug exception has been classified as behavioral RED.

The pre-fix source-level evidence is recorded above in section 1 as the basis
for the "up to 12 repeated searches" claim.

---

## 7. Mandatory validation

All commands run in `movie-recommendation-system`, Node **v26.7.0** local.

| # | Gate | Command | Exit | Result |
|---|------|---------|------|--------|
| 1 | Focused suite | `npx vitest run tests/ai-similar-enrichment-concurrency.test.ts --reporter=basic` | 0 | 1 file / **16 tests pass**, 0 unhandled |
| 2 | Targeted suites | `npx vitest run tests/ai-similar-enrichment-concurrency.test.ts tests/redis-cache-security.test.ts tests/performance-phase2.test.ts tests/performance-m4.test.ts tests/admin-chat-ai-security.test.ts tests/middleware-security.test.ts tests/stale-identity.test.ts --reporter=basic` | 0 | **7 files / 87 tests pass**, 0 unhandled |
| 3 | Typecheck | `npm run typecheck` (`tsc --noEmit`) | 0 | **0 errors** |
| 4 | Repository lint | `npm run lint` (`eslint .`) | 0 | **0 errors**, 93 warnings |
| 5 | Actual full suite | `npm test` (`vitest run`) | 0 | **42 files / 431 tests pass**, 0 unhandled |
| 6 | Dependency audit (CI policy) | `npm audit --audit-level=high --omit=dev` (exact CI `security`-job command, `.github/workflows/ci.yml` line 92) | 0 | **0 production vulnerabilities** — PASS |
| 7 | CI-placeholder build | `npm run build` with the CI workflow's placeholders | 0 | **Compiled successfully**; route present |

**Lint detail:** **93 warnings, 0 errors** — exactly the pre-existing Phase 8
baseline. The focused test contributes **zero** warnings (verified per-file:
`npx eslint tests/ai-similar-enrichment-concurrency.test.ts` → 0 messages).
Per-file breakdown of the 93: the largest clusters are `app/ai-assistant/page.tsx`
(10), `app/watchlist/page.tsx` (9), `components/admin/CacheManagement.tsx` (7),
`app/page.tsx` (6), `lib/cache.ts` (5); the only warnings inside `tests/` are
9 spread across **other** prior-phase files (`privacy-account-security`,
`user-security`, `promote-users-security`, `performance-phase2`, `m6-consistency`,
`admin-chat-ai-security`). No warning traces to this phase's test file.

**Why 93, not the earlier 98:** the earlier figure counted five warnings that
existed only in this pass's now-deleted dead code — two uncalled mock-chain
helpers (`installGeminiAllow`, `installTmdbAllow`), the unused `NextResponse`
import, an unused `cacheModule` binding, and an unused `before` capture in the
ordering test. Removing that dead code returned the total to the Phase 8
baseline. This is **not** a change to unrelated files.

**Audit detail (mandatory production gate — PASS):** `npm audit --audit-level=high
--omit=dev` — the exact command the CI `security` job runs
(`.github/workflows/ci.yml` line 92) — exits **0** with **0 production
vulnerabilities**, as reproduced in the Phase 10 read-only diagnosis
(`docs/reports/diagnostics/BUG-PRODUCTION-DEPENDENCY-AUDIT-HIGH-DIAGNOSIS.md`,
sections 6–7: `npm audit --omit=dev --json` exit 0, zero production
vulnerabilities across 406 production packages).

**Stricter full-tree observation (NOT the mandatory gate — OPEN
DEV-DEPENDENCY MAINTENANCE FOLLOW-UP):** bare `npm audit --json` exits **1**
with **4 development-tree vulnerabilities (3 moderate, 1 high)** — vitest
3.2.7, `@vitest/coverage-v8` 3.2.7, `@vitest/mocker` 3.2.7
(GHSA-82fw-gwwq-j7x9), and `js-yaml` 4.3.1 via `eslint → @eslint/eslintrc`
(GHSA-2883-xcg3-v3hh, `maxTotalMergeKeys does not limit CPU use for empty
merge sources`). These are **pre-existing, development-only** findings, not
introduced by this pass — `package.json` and `package-lock.json` were last
modified 09-10 (mtimes verified), well before this pass, and no dependency,
environment, build-config, or production source changed here. They are real
but do not block the repository's documented production audit gate; they
remain open for optional Phase 10 remediation (preferred plan: vitest +
coverage-v8 → `^4.1.11`, `overrides` js-yaml → 4.3.2; see the Phase 10
diagnosis, section 14).

**Correction history:** the earlier report row claiming "found 0
vulnerabilities" for the bare audit was wrong; the bare audit was never clean
on this tree. The classification error corrected in this pass was treating the
bare-audit result as the mandatory gate. Under the CI policy the gate is green.

**Build detail:** run with the exact placeholder names and formats from
`.github/workflows/ci.yml`:

```
NODE_ENV=production
NEXTAUTH_URL=https://ci-placeholder.invalid
NEXTAUTH_SECRET=ci-placeholder-secret-at-least-32-characters-long
GOOGLE_CLIENT_ID=ci-placeholder
GOOGLE_CLIENT_SECRET=ci-placeholder
MONGODB_URI=mongodb://ci-placeholder.invalid/ci
TMDB_API_KEY=ci-placeholder
GOOGLE_API_KEY=ci-placeholder
```

Route confirmed in the build output:
`ƒ /api/movie/[id]/ai-similar  249 B  103 kB`. Build produced no errors and no
route warnings (only the same pre-existing unused-import warnings).

**Network-isolation evidence:** test 12 (network-deny guard) confirms the route
performs no real network I/O. All `fetch` traffic routes through the test's
`vi.fn()` guard; the guard allows only exact approved categories and throws for
everything else. Tests 9–11 (auth denial, rate-limit denial, invalid movie id)
each assert **zero fetch calls and zero cache-producer invocations**, proving
those paths short-circuit before any upstream I/O. Test 1 also asserts a warm
hit makes **0** fetch calls.

---

## 8. Failures and bounded corrections

Corrections applied in this audit pass — **all test-only or artifact cleanup;
no production code changed:**

1. **Network-deny guard returned a 404 Response for denied requests** →
   restored to fail loudly (throw). *(Required by section D.)*
2. **Default `fetchGuard` returned a synthetic 200 OK** for blocked requests →
   restored to throw. *(Same policy; the 200 would have hidden every denial.)*
3. **Test-name mismatch** — the duplicate-title test was named "cold miss still
   performs duplicate-title searches" while asserting 4→4 (no dedup). Renamed to
   "cold miss searches each suggestion (duplicates not deduplicated); warm hit
   performs none".
4. **116 `no-explicit-any` sites** in the new test file → initially resolved with
   a file-scoped `eslint-disable` plus a documented rationale (the harness swaps
   `globalThis.fetch` / `GET` / `redisCache` with `vi.fn()` stubs whose shapes
   are only known at runtime). **Superseded in the follow-up pass:** the
   file-wide disable was removed and all 116 sites typed properly —
   `typeof globalThis.fetch` for fetch doubles, `ReturnType<typeof vi.fn>` for
   bare mocks, and explicit `CacheDouble` / `GETRouteHandle` interfaces for the
   cache singleton and the route handle. **Zero `any`s and zero scoped disables
   remain**; the file is now 821 lines and reports 0 lint messages.
5. **4 `tsc` errors** — `Property 'mock' does not exist` on `globalThis.fetch` →
   resolved with typed accessors (`ReturnType`-style structural casts and a
   `fetchCallCount()` helper) rather than `any`, so assertion logic stays
   type-checked.
6. **3 `prefer-const` lint errors** → `requireUserMock`,
   `applyRateLimitUserMock`, `cacheStore` changed `let` → `const`.
7. **`tmp-diag-route.ts`** (repo root) — a stale 14:46 route copy with 195
   differing lines, unreferenced, breaking `tsc` (`TS2307`) → **removed**.
8. **`docs/.diag-routecopy.ts`** — another unreferenced route copy, breaking
   `tsc` → **removed**.
9. **`tests/__debug-ai-similar.test.ts`** — a leftover debug stub containing a
   single test that asserted `expect(true).toBe(true)` (asserted nothing) →
   **removed**. Full suite therefore reports 42 files, not 43; the count is
   **431 tests** as of this pass (13 base + 3 cache-boundary cases added here).
10. **Report path** — moved to the canonical
    `...CACHE-HIT-ENRICHMENT-CORRECTION-COMPLETION-REPORT.md`; the prior
    `...WARM-HIT-ENRICHMENT-CORRECTION...` file was deleted.
11. **Inaccurate old-behavior description** — the prior report claimed warm hits
    "served suggestions missing `id`, `poster_path`..." to the client. That is
    wrong: the client always received the enriched response. Rewritten in
    section 1.

Also corrected from the prior report: the route diff is **64/18**
EOL-insensitive (the earlier "151/105" counted CRLF churn), and the full suite
is **42 files / 431 tests** (earlier "43 / 429" included the debug stub; this
pass adds 3 cache-boundary tests to the 13 base focused tests).

---

## 9. Final Git evidence

```
$ git status --porcelain=v2 --branch
# branch.oid 70fe77655467f5105f5d0e9b02594ba1c62b2952
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -0

$ git rev-parse HEAD
70fe77655467f5105f5d0e9b02594ba1c62b2952

$ git diff --cached --name-status
(empty — nothing staged)

$ git diff --name-status   # 36 modified tracked files, accumulated across phases

$ git ls-files --others --exclude-standard   # untracked, incl. this phase's 2 files

$ git diff --ignore-cr-at-eol -w --stat -- app/api/movie/[id]/ai-similar/route.ts
 app/api/movie/[id]/ai-similar/route.ts | 82 ++++++++++++++++++++++++++--------
 1 file changed, 64 insertions(+), 18 deletions(-)

$ git check-ignore -v .next
.gitignore:7:/.next/	.next      (exit 0 — ignored)
```

Confirmed:

- **Accumulated multi-phase working tree preserved** — 36 modified tracked files
  and the untracked report/test files from prior phases are all intact.
- **Phase 9 delta precisely attributed:**
  - `M  app/api/movie/[id]/ai-similar/route.ts` — 64/18 EOL-insensitive
  - `?? tests/ai-similar-enrichment-concurrency.test.ts` — new, 16 tests
  - `?? docs/reports/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-CORRECTION-COMPLETION-REPORT.md`
  - `?? docs/reports/diagnostics/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-DIAGNOSIS.md`
    (pre-existing diagnostics report, untouched)
- **Nothing staged** — `git diff --cached --name-status` is empty.
- **HEAD unchanged** — `70fe77655467f5105f5d0e9b02594ba1c62b2952`, uncommitted.
- **No temporary debug or instrumentation files from this phase** — the three
  removed (`tmp-diag-route.ts`, `docs/.diag-routecopy.ts`,
  `tests/__debug-ai-similar.test.ts`) are gone; `.next/` and `coverage/` are
  gitignored build outputs. Pre-existing scratch files from earlier sessions
  (`.chunks/`, `.my_tool_sandbox/`, `as_route_copy.txt`, `cqq.txt`,
  `route_dump.txt`, `failed_block.txt`, `nul`, `lib/list-membership.ts`, and
  four other phase test files) were **left untouched** — they predate this
  phase and cleaning them up is out of scope for this audit.
- **No env or secret files** — the only tracked `.env*` is `.env.example`; no
  untracked env/secret/credential files exist.
- **No commit, no deployment.**

The working tree is **not clean** — it carries accumulated multi-phase changes.
That is intentional and preserved.

---

## 10. PERF / CACHE / follow-up status

| Item | Status |
|------|--------|
| **PERF-001** — pool-4 bounded enrichment (max 4 in-flight TMDB searches) | **Complete.** `ENRICHMENT_POOL_SIZE = 4`, batched `for` loop at L286. Verified by test 3 (max in-flight ≤ 4 with 12 suggestions). |
| **PERF-001b** — warm hit performs zero upstream calls | **Complete.** Fallback + enrichment moved inside the `getOrSet` producer; the cached value is the final enriched array. Verified by tests 1, 2, 8 (0 fetch calls on warm hit, incl. Gemini/details/similar/popular). |
| **CACHE-OPS-001** — AI-similar key absent from `invalidateMovieCache` | **OPEN** — **no invalidation fix was implemented.** The route performs zero `invalidate`/`purge`/`delete` calls (verified: `grep -nE 'invalidate\|purge\|delete\|\.del\(' app/api/movie/\[id\]/ai-similar/route.ts` → empty), and `lib/cache.ts` exposes no invalidate/purge API at all. `lib/cache-namespace.ts` defines `CACHE_SCOPES.aiSimilar = "public:ai-similar"` but no mutation path ever deletes it. Side effect only: the route-local v2 key *may* improve admin scope visibility, since it no longer shares a key namespace with details/recommendations/similar. It does **not** close CACHE-OPS-001. No cache-ops procedure, forced purge, or expiry monitoring was added; staleness is bounded only by the 24 h TTL. Diagnosis §31 classifies this as a pre-existing, independent operability gap, out of scope for PERF-001b. Do not read this row as complete. |
| **Duplicate-title follow-up** | **OPEN, separate candidate — explicitly NOT PERF-001b scope.** All three suggestion paths capped at 12; duplicate titles are searched separately and returned as duplicate rows. Impact: redundant TMDB searches + duplicate UI rows only; fan-out stays bounded at 12. Decide whether to deduplicate by title (would change the fixture-locked 4→4 behavior). |

---

## 11. CACHE-FIX-1 … CACHE-FIX-12 traceability matrix

The `CACHE-FIX-1` … `CACHE-FIX-12` identifiers are **not defined anywhere in
this repository** — `grep -rn "CACHE-FIX" docs/` returns only the `CACHE-FIX-2`
comment at route L170. The authoritative definitions come from the **approved
Phase 9 Step 2 prompt**, which is the source of record for this pass (per the
governing review: "Do not search the repository to decide whether these IDs
exist. The approved prompt is the source of record."). The matrix below uses
those definitions verbatim.

Status vocabulary: PASS / PASS WITH WARNING / FAIL / BLOCKED / NOT EXECUTED /
NOT APPLICABLE.

| ID | Requirement (from Step 2 prompt) | Implementation evidence | Validation evidence | Status |
|----|-----------------------------------|--------------------------|---------------------|--------|
| CACHE-FIX-1 | Move final enrichment into the cache producer | Route L180–333: details fetch → Gemini → similar/popular fallback → pool-4 enrichment → null-id filter all execute **inside** the `getOrSet` producer; the cached value is the final enriched array | Tests 2, 6, 7, 8 (warm hit returns cached finals with 0 fetches; partial enrichment cached verbatim) | PASS |
| CACHE-FIX-2 | Use a route-local v2 scoped cache key | Route L174: `buildCacheKey(CACHE_SCOPES.aiSimilar, '<movieId>:v2>')` — v2 suffix excludes stale v1 payloads; `CACHE_SCOPES.aiSimilar = "public:ai-similar"` | Test 3: asserts the exact v2 key is recorded and no v1 key is read | PASS |
| CACHE-FIX-3 | Preserve the Phase 8 pool-4 bound | Route L286: `ENRICHMENT_POOL_SIZE = 4`, batched `for` loop; unchanged from Phase 8 baseline | Test 3: max in-flight ≤ 4 with 12 suggestions | PASS |
| CACHE-FIX-4 | Eliminate warm-hit Gemini and TMDB work | Cached value is the final array, so a warm hit returns before any producer body runs | Test 1 (canonical): 12 cold `/search/movie` → 0 on warm hit; test 8 extends to Gemini/details/similar/popular | PASS |
| CACHE-FIX-5 | Preserve total cold-path suggestion and search counts | Enrichment logic untouched; counts only change if suggestions change | Test 5: 12 suggestions → 12 searches on cold miss, 0 on warm | PASS |
| CACHE-FIX-6 | Preserve ordering, duplicates, and partial-success behavior | Route filters only null-id items; no ordering or dedup change | Tests 4 (ordering), 9 (duplicates: 4 suggestions → 4 searches → 4 results), 7 (partial enrichment cached verbatim) | PASS |
| CACHE-FIX-7 | Do not cache an empty final result | Producer returns `undefined` for empty finals so `getOrSet` skips the write | Test 6: empty final not cached, second request retries producer | PASS |
| CACHE-FIX-8 | Preserve the public response, auth, validation, and rate-limit contracts | `NextResponse.json({ results })` shape unchanged; auth/rate-limit/validation guards unchanged and run before the cache lookup | Tests 10–12 (401/429/400 denials, 0 fetches); response shape asserted across all warm-hit tests | PASS |
| CACHE-FIX-9 | Prevent real external network access | Module-level `globalThis.fetch` deny-by-default guard; every allowlist is deny-by-default (14 `throw DENIED` sites; zero Response-returning fall-throughs) | Test 15 (network-deny: unknown host, wrong Gemini method, and unknown TMDB path all rejected) | PASS |
| CACHE-FIX-10 | Pass focused, targeted, typecheck, lint, full-suite, audit, and build gates | See section 7 | Focused 16/16 PASS; targeted 7 files / 87 tests PASS; typecheck 0 PASS; lint 93 warnings / 0 errors PASS; full suite 42 files / 431 tests PASS; build exit 0 PASS; **production audit (`npm audit --audit-level=high --omit=dev`, exact CI command) exits 0 with 0 production vulnerabilities — PASS** | PASS — all 7 gates PASS. Stricter bare-audit observation (4 dev-tree findings: 3 moderate, 1 high) recorded separately in section 7 as OPEN DEV-DEPENDENCY MAINTENANCE FOLLOW-UP; not the mandatory gate. Classification corrected per the Phase 10 diagnosis; see warning 7 |
| CACHE-FIX-11 | Preserve prior changes and accurate Git attribution | Phase 8 pool-4 preserved; route is the only production file changed; 64+/18− EOL-insensitive | Section 9: HEAD unchanged, nothing staged, no commit | PASS |
| CACHE-FIX-12 | Make no commit or deployment and produce complete evidence | No commit, no push, no deploy | Section 12: HEAD `70fe776…` unchanged; `git diff --cached` empty | PASS |

**Residual open items** (not CACHE-FIX defects): CACHE-OPS-001 remains OPEN
(section 10), and the duplicate-title follow-up is a separate candidate outside
PERF-001b scope. Both are tracked as warnings, not as matrix failures.

---

## 12. Commit and deployment status

- **Commit:** NONE. `HEAD` is `70fe77655467f5105f5d0e9b02594ba1c62b2952`,
  unchanged from session start. Branch `main` is ahead 2 / behind 0 of
  `origin/main` — those two commits predate this session.
- **Staged:** NOTHING. `git diff --cached --name-status` is empty.
- **Deployed:** NO. No deploy, release, or push occurred.
- **Next phase:** NOT started.

---

## 13. Final status — PASS WITH WARNINGS

Every acceptance condition in section J is met:

- Implementation audit proves the route matches the approved design — **yes** (section 2, 20/20 rows)
- Cache key is public/shared v2 — **yes** (`buildCacheKey(CACHE_SCOPES.aiSimilar, '<movieId>:v2>')`, L174)
- No custom in-flight machinery remains — **yes** (no `inFlight` state, `flightTtl`, pending tracker, or `Promise.allSettled`; central dedup pre-existing in `lib/cache.ts`)
- Guard fails loudly — **yes** (throws; the 404 and the synthetic 200 were both removed; 3 rejection cases proven)
- Warm hit performs zero upstream calls — **yes** (tests 1, 2, 8)
- Empty final results are not cached — **yes** (`undefined` at L347; test 5)
- Non-empty partials are cached — **yes** (test 6, 11 of 12 cached and returned verbatim)
- Pool-4 remains effective — **yes** (`ENRICHMENT_POOL_SIZE = 4`; test 3, max in-flight ≤ 4)
- Focused suite passes — **yes** (16/16)
- Targeted suite passes — **yes** (7 files / 87 tests)
- Typecheck passes — **yes** (0 errors, exit 0)
- Repository lint passes — **yes** (0 errors, exit 0; 93 pre-existing warnings)
- Actual full suite passes — **yes** (42 files / 431 tests, exit 0)
- Build passes — **yes** (compiled successfully with CI placeholders; route in output)
- Production dependency audit gate passes — **yes** (exact CI command
  `npm audit --audit-level=high --omit=dev` exits 0, 0 production
  vulnerabilities; Phase 10 diagnosis sections 6–7; see section 7)
- Git attribution complete — **yes** (section 9)

**Audit-gate classification correction (this pass):** the prior revision marked
the audit "Not met" on the basis of bare `npm audit` (exit 1, 4 dev-tree
findings). Per the CI policy (`.github/workflows/ci.yml` line 92) the
mandatory gate is the `--omit=dev` command, which is green. The 4 dev-tree
findings (3 moderate, 1 high — vitest 3.2.7 chain + js-yaml 4.3.1) are real
but are **not** the production gate; they are warning 7 below. PERF-001 and
PERF-001b remain resolved; no production vulnerability is reported by the CI
audit policy.

**Warnings (7):**

1. **Node 22 CI pending** — all validation ran on local Node **v26.7.0**; the CI
   workflow pins `node-version: 22`. Results are unverified on Node 22.
2. **Production metrics pending** — warm-hit upstream-call reduction, cache-hit
   ratio, and v1-key drain are unmeasured in production.
3. **Deployment verification pending** — nothing has been deployed; runtime
   behavior in the real environment is unverified.
4. **CACHE-OPS-001 open** — the AI-similar key is absent from
   `invalidateMovieCache`; no invalidation fix, cache-ops procedure, forced
   purge, or monitoring was added. Staleness is bounded only by the 24 h TTL.
   See section 10.
5. **Duplicate-title follow-up open** — no title deduplication; duplicate TMDB
   searches and duplicate UI rows for repeated titles. Separate candidate, not
   PERF-001b.
6. **Canonical runtime RED not captured** — the canonical cold-then-warm evidence
   is synthetic harness output, not a live production observation.
7. **Dev-dependency maintenance follow-up open** — 4 development-tree
   vulnerabilities (3 moderate, 1 high: vitest 3.2.7 chain + `js-yaml` 4.3.1
   via GHSA-2883-xcg3-v3hh) surface under the stricter bare `npm audit` only.
   Real findings, but **not** the mandatory production gate (which is green).
   Optional Phase 10 remediation preferred plan: vitest + coverage-v8 →
   `^4.1.11`, `overrides` js-yaml → 4.3.2.

**Not done, by instruction:** no commit, no stage, no deployment, no next phase.

---

## Reproduce

```
npx vitest run tests/ai-similar-enrichment-concurrency.test.ts --reporter=basic
npm run typecheck
npm run lint
npm test
npm audit
```
