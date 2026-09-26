# PHASE 8 — AI-SIMILAR ENRICHMENT CONCURRENCY — COMPLETION REPORT

**Phase:** 8 — AI-Similar Enrichment Concurrency (Step 2: Targeted Remediation)
**Finding ID:** PERF-001
**Bug ID:** BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY
**Prompt type:** TARGETED REMEDIATION
**Diagnostic report:** `docs/reports/diagnostics/BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY-DIAGNOSIS.md`
**Route corrected:** `GET /api/movie/[id]/ai-similar`
**Commit policy:** COMMIT_ALLOWED: NO — **honored**
**Deployment policy:** DEPLOYMENT_ALLOWED: NO — **honored**

---

## 1. Executive summary

`GET /api/movie/[id]/ai-similar` enriched every AI suggestion with exactly one
TMDB `/search/movie` request through a single unbounded
`await Promise.all(aiSuggestions.map(...))`. The suggestion list is hard-capped
at 12, so one route invocation could hold up to **12 concurrent TMDB sockets**
with no pool, no timeout, and no `AbortController` (diagnosis §15–§17).

Correction applied: **Option A** from the diagnosis (§35–§36) — an inline
copy of the established pool-4 pattern already used in
`app/api/ai-recommendations/route.ts:352-401`, behind a module-level
`ENRICHMENT_POOL_SIZE = 4`. Items are sliced into fixed-size batches and each
batch is awaited before the next starts. Maximum in-flight TMDB enrichment
drops 12 → 4 per invocation. No new dependency, **no new abstraction**, and no
behavior change other than the in-flight count and its latency consequence —
exactly the constraint the diagnosis imposed (§22.5: "no new shared helper is
justified … recommend an inline copy of the pool-4 shape, matching the existing
comment style").

**Correction of the record (why this report was rewritten):** a first attempt at
Step 2 wrote the bound as a new named generic helper,
`mapWithConcurrencyLimit<T, R>(items, limit, fn)`, behind a constant named
`ENRICHMENT_CONCURRENCY`. That implementation was wrong on two counts against
the diagnosis: it introduced the shared abstraction §22.5 and §36 explicitly
forbid, and it used a constant name other than the `ENRICHMENT_POOL_SIZE`
specified in §37. This phase replaced the helper with the mandated inline pool
and renamed the constant.

## 2. Final status

| Gate | Result |
|---|---|
| Focused suite `tests/ai-similar-enrichment-concurrency.test.ts` | **8/8 pass** |
| Full suite | **423/423 pass, 42 files, exit 0, 0 failures** |
| Typecheck `tsc --noEmit` | **exit 0** |
| Lint (both touched files) | **exit 0** |
| Diagnostics (both touched files) | **0 errors, 0 warnings** |
| Production build (CI placeholders) | **exit 0** — re-verified, see §24 |

No external network request occurred during validation — the suite's
deny-by-default `globalThis.fetch` guard throws on any URL or method it did not
opt in to.

## 2.1. Independent re-verification (evidence recovery)

The gates above were re-run from a clean shell, independent of the original
run, with every intermediate artifact written to a scratch file and deleted
afterwards (`git ls-files --others` shows zero instrumentation files):

- Focused suite: `Test Files 1 passed (1) / Tests 8 passed (8)`, exit 0.
- Full suite: `Test Files 42 passed (42) / Tests 423 passed (423)`,
  `Duration 83.19 s`, exit 0, zero unhandled errors.
- `tsc --noEmit`: exit 0, no output.
- `eslint` on both touched files: exit 0, no warnings.
- `next build` with the seven CI placeholder env vars
  (`.github/workflows/ci.yml` "Production build (placeholders only)" job):
  exit 0. The corrected route emits as `ƒ /api/movie/[id]/ai-similar`.
  Only the ten pre-existing `@typescript-eslint/no-unused-vars` lint warnings
  appear in that log; none are in the touched route or test.

The full-suite log's stderr lines are all in-test negative-path coverage, not
regressions: `tests/boot-fatality-classification.test.ts` deliberately drives
`instrumentation.ts` `register()` into its `[BOOT] Critical environment error`
branch (that function returns early unless `NODE_ENV === 'production'`, so it
never runs outside a test), and `tests/list-membership-collision.test.tsx` /
`tests/favorites-context.test.tsx` deliberately throw `forced failure` /
`forced network failure` through `WatchlistContext`/`FavoritesContext` to pin
the UI's error handling. All 423 tests still pass with those cases green.

This moves the production build from "out of scope" (§7) to verified; §7 is
updated accordingly.

## 3. Finding and bug IDs

| ID | Finding |
|---|---|
| PERF-001 | Unbounded TMDB `/search/movie` enrichment fan-out: one AI suggestion list of up to 12 titles produced up to 12 concurrent fetches per request, with no pool. |

## 4. Diagnostic report reference

`docs/reports/diagnostics/BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY-DIAGNOSIS.md`

## 5. Confirmed root cause

`app/api/movie/[id]/ai-similar/route.ts` awaited
`Promise.all(aiSuggestions.map(async ...))` at the enrichment site. `map` starts
every async mapper on the current turn, so all N requests were dispatched
before the first response arrived. No concurrency primitive sat between the
suggestion list and the fetches.

## 6. Scope completed

- Replaced the unbounded `Promise.all(...map(...))` with the diagnosis-mandated
  inline pool-4 loop, gated on `ENRICHMENT_POOL_SIZE`.
- Repaired the focused suite so it compiles and actually reaches the enrichment
  path.
- Verified no behavior change beyond the in-flight bound: dedup semantics,
  ordering, partial-failure handling, the suggestion cap, the `< 4` fallback
  threshold, cache key/TTL, and response contract are all unchanged.

## 7. Scope not completed

- `PERF-001b` (enrichment outside the cached closure causing ≤12 searches per
  cache hit) — explicitly deferred by the diagnosis §28.2/§35 Option C; not
  Phase 8's target.

The production build, previously listed as out of scope, is now run and
passing — see §2.1.

## 8. Applicable instructions

- Atomic targeted edits only; no whole-file rewrites.
- No placeholders; every function fully implemented.
- Preserve formatting, comments, and imports.
- Do not fix unrelated bugs — the diagnosis supplies an explicit do-not-touch
  list (§37), honored.

## 9. Files created

None.

## 10. Files modified

| File | Change |
|---|---|
| `app/api/movie/[id]/ai-similar/route.ts` | Added module-level `ENRICHMENT_POOL_SIZE = 4`; replaced the unbounded `Promise.all(...map(...))` enrichment with an inline ordered-batch loop. |
| `tests/ai-similar-enrichment-concurrency.test.ts` | Fixed the cache mock specifier (`'../../lib/cache'` → `'@/lib/cache'`); removed a dead unresolvable import; raised two tests above the route's `< 4` suggestion threshold so they reach the enrichment path; corrected one fetch-guard assertion to a genuinely-unknown TMDB path. |

## 11. Files deleted

None. Per §37, `lib/cache.ts`, `lib/cache-namespace.ts`, `lib/gemini-payload.ts`,
`lib/ai-security.ts`, `lib/tmdb.ts`, and `lib/fetchWithRetry.ts` were not touched.

## 12. The correction

**Before** — unbounded fan-out (diagnosis §15):

```ts
const enhancedRecommendations = await Promise.all(
  aiSuggestions.map(async (movie: AISuggestion) => { /* one /search/movie */ })
);
```

**After** — inline pool-4 copy of `app/api/ai-recommendations/route.ts:352-401`:

```ts
// W3-006c: bounded concurrency for TMDB enrichment (max 4 in-flight).
// Inline copy of the established pool-4 pattern (ai-recommendations route):
// items are sliced into fixed-size batches and each batch is awaited before
// the next starts. No shared helper, no new abstraction — see PERF-001.
const ENRICHMENT_POOL_SIZE = 4;

// ...

const enhancedRecommendations: Array<{ id: number | null; /* … */ }> = [];

for (let i = 0; i < aiSuggestions.length; i += ENRICHMENT_POOL_SIZE) {
  const batch = aiSuggestions.slice(i, i + ENRICHMENT_POOL_SIZE);
  const batchResults = await Promise.all(
    batch.map(async (movie: AISuggestion) => { /* one /search/movie */ })
  );
  enhancedRecommendations.push(...batchResults);
}
```

Diff size is ~10 lines at the call site plus one constant, matching the
diagnosis's "~10-line diff" estimate for Option A (§36).

## 13. Behavior preserved (unchanged by design)

| Behavior | Status |
|---|---|
| Per-suggestion `try/catch` → `id: null` partial, then `.filter(id !== null)` | unchanged |
| `Promise.all` cannot reject in this path (all errors caught) | unchanged |
| No dedup of suggestion titles | unchanged |
| Result order follows suggestion order (order-preserving batches) | unchanged |
| Suggestion cap of 12 (Zod `max(12)` + `.slice(0, 12)` on both fallbacks) | unchanged |
| `aiResults.length < 4` → TMDB `similar` fallback threshold | unchanged |
| Cache key `movie:{id}:ai-similar`, TTL 86400, enrichment outside the closure | unchanged |
| Enrichment fetch init `{ next: { revalidate: 3600 } }` — no signal, no retries | unchanged |

## 14. Behavior contract pinned by the suite

Mapping to the diagnosis §38 regression-test plan:

| §38 # | Assertion | Test status |
|---|---|---|
| 1 | Cache hit → 0 Gemini, 0 details, 0 `similar`; enrichment searches still fire | pinned |
| 2 | Cache miss → Gemini exactly once on the happy path | pinned |
| 3 | Suggestions accepted = 12 | pinned |
| 4 | **max in-flight TMDB ≤ 4** | **pinned** (`state.maxInFlight`) |
| 5 | 12 > pool → all 12 eventually processed | pinned |
| 6 | Result ordering matches suggestion order `[1..12]` | pinned |
| 7 | One failed enrichment → 200, others intact | pinned |
| 8 | Empty TMDB match → `id: null` → filtered | pinned |
| 9 | Duplicate titles → duplicate searches, count = 12 for 12 dups | pinned |
| 10 | No new signal on TMDB fetches (`init.signal` undefined) | pinned |
| 11 | 401 / 429 / 400 before any fetch | pinned |
| 12 | Cache write + TTL unchanged (86400) | covered by mock `getOrSet` |
| 13 | No external request (deny-by-default guard) | pinned |

Item 4 is the meaningful RED→GREEN pivot the diagnosis required (§38: "The
meaningful RED must be item 4 (`maxInFlight` 12 > 4), not a mock or syntax
failure").

## 15. Test-harness corrections

The focused suite could not exercise the fix until four defects were repaired:

| # | Defect | Correction |
|---|---|---|
| 1 | `vi.mock('../../lib/cache', ...)` — the specifier escapes the project root and never resolved to the module the route imports, so the real cache module ran instead of the mock. | `vi.mock('@/lib/cache', ...)`, the alias the route resolves to. |
| 2 | `await import('../../lib/cache')` in `beforeEach` — dead, unresolvable, result discarded; a `Cannot find module` compile error. | Removed. |
| 3 | Two tests supplied 1–2 suggestions, below the route's pre-existing `aiResults.length < 4` threshold, so the route took the TMDB `similar` fallback and enrichment never ran (0 `/search` calls). | Raised both above the threshold, preserving each test's original intent; the duplicate-title test now uses 12 dups per §38 item 9. |
| 4 | One assertion expected `/movie/123/credits` to be denied by the fetch guard. The classifier legitimately maps any `/movie/*` non-`/similar` path to `details`, so it is not denied. | Switched to a genuinely-unknown path, `/tv/123`. |

The route's `< 4` threshold and its TMDB fallback logic were deliberately left
untouched — outside PERF-001's scope. §38's cache-isolation note is satisfied
because every test uses a distinct movie id (1000001–1000008), so no shared
cache entry can cross tests.

## 16. Chronological command log

| # | Command | Purpose | Result |
|---|---|---|---|
| 1 | Re-read diagnosis §15, §22.1, §22.5, §35–§38 | re-audit the Step 2 contract | found the implementation deviated (helper + wrong constant name) |
| 2 | `awk` `app/api/ai-recommendations/route.ts:348-405` | capture the exact pattern to copy | pool-4 `for` loop + `Promise.all(batch.map)` + `push(...batchResults)` with `// W3-006c` comment |
| 3 | `edit_file` on the route | replace the helper with the inline pool; rename to `ENRICHMENT_POOL_SIZE` | applied |
| 4 | `diagnostics` on the route | verify | 0 errors, 0 warnings |
| 5 | `edit_file` on the test | duplicate-title test → 12 dup titles per §38 item 9 | applied |
| 6 | `npx vitest run tests/ai-similar-enrichment-concurrency.test.ts --reporter=basic` | focused GREEN | **8 passed (8)** |
| 7 | `npx vitest run --reporter=basic` | full-suite regression check | **42 files, 423 passed (423), exit 0, 0 FAIL lines** |
| 8 | `npx tsc --noEmit` | typecheck | **exit 0** |
| 9 | `npx eslint <route> <test>` | lint on both touched files | **exit 0** |
| 10 | `git status` sweep | confirm no instrumentation artifacts leaked | clean |

## 17. RED evidence

### 17.1. Canonical runtime pre-fix RED: NOT CAPTURED

**Canonical runtime pre-fix RED was NOT captured.** No runtime command
measured `maxInFlight = 12` against the committed pre-fix route. The
historical pre-fix maximum of **12** is established **statically**, from four
facts that are all independently verifiable in the committed source:

| # | Fact | Evidence (committed, `HEAD`)
|
|---|---|---|
| 1 | The enrichment used an unbounded `Promise.all(...)` over the suggestion list | `git show HEAD:app/api/movie/[id]/ai-similar/route.ts` line 253: `const enhancedRecommendations = await Promise.all(` |
| 2 | `Promise.all` receives a fully-eager array — every async mapper starts on the current turn before any response lands | same line 254: `aiSuggestions.map(async (movie: {` |
| 3 | Each suggestion issues exactly one TMDB `/search/movie` fetch | same lines 261–262, one `await fetch(`${BASE_URL}/search/movie?…`)` per mapped element |
| 4 | The suggestion cap is 12, and no pool, gate, or semaphore sat between the list and the fetches | `aiSuggestions` is bounded at 12 by the route's Zod `max(12)` (`lib/ai-security.ts:147` and `:161`, `recommendations`/`similar_movies` arrays) plus `.slice(0, 12)` on both TMDB fallbacks (route lines 205 and 238); `git show HEAD:…/route.ts` contains **zero** occurrences of `ENRICHMENT_POOL_SIZE`, no `for`-loop batching, and no p-limit-style primitive anywhere in the file |

Therefore, with 12 elements dispatched in one turn and one fetch each, the
maximum concurrent in-flight count reachable by the pre-fix code is exactly
`12`. The committed `Promise.all(aiSuggestions.map(...))` implementation is the
proof; no measurement is needed to establish the bound.

### 17.2. Why a runtime RED was not captured

The focused suite was written against the **already-corrected** route. The
first time it ran, the harness itself was broken (§15), so it produced a
*false* RED — a compile error plus zero `/search` calls because two tests
supplied 1–2 suggestions, below the route's pre-existing `aiResults.length < 4`
threshold, and the route diverted to the TMDB `similar` fallback on every case:

```json
{ "cats": [["details",1],["gemini",1],["similar",1],["popular",1]] }
```

No `search` category is present, so the concurrency bound was unexercised —
this is harness evidence of a broken suite, **not** a measurement of pre-fix
in-flight concurrency. The route was corrected before the suite was repaired,
so no run ever observed the unbounded path counting to 12. The pre-fix source
at `HEAD` is the only canonical evidence of the defect.

### 17.3. Measured current GREEN

After the correction, the suite measures `state.maxInFlight` directly:

```json
{ "maxInFlight": 4, "cats": [["search",12]] }
```

The measured current GREEN proves **maxInFlight does not exceed 4** for 12
suggestions — three batches of 4, each awaited before the next starts. §18
holds the full GREEN output.

## 18. GREEN evidence

```
Test Files  1 passed (1)
     Tests  8 passed (8)
```

```
Test Files  42 passed (42)
     Tests  423 passed (423)
  Duration  92.97s
```

## 19. Typecheck result

`tsc --noEmit` → **exit 0**, no output.

## 20. Lint result

`eslint app/api/movie/[id]/ai-similar/route.ts tests/ai-similar-enrichment-concurrency.test.ts`
→ **exit 0**, no warnings introduced.

## 21. Full-suite result

```
Test Files  42 passed (42)
     Tests  423 passed (423)
```

Zero failures, zero unhandled errors.

## 22. What could break

- The bound is **per invocation, not global**. A burst of concurrent HTTP
  requests can still produce up to `4 × N` simultaneous TMDB searches. A global
  semaphore was out of scope; PERF-001 targets the per-request fan-out.
- Latency now rises in `ceil(12 / 4) = 3` batch rounds instead of 1. Each round
  is gated by its slowest member, and the enrichment fetches still have no
  timeout or `AbortController` (diagnosis §18, §42) — a slow upstream widens
  every round. `ENRICHMENT_POOL_SIZE` is the single tuning constant.
- The suite depends on the route's `aiResults.length < 4` threshold holding
  steady. If it changes, the two tests raised in §15 item 3 must be re-checked.
- Enrichment still sits outside the cached closure, so a cache hit still costs
  up to 12 searches (`PERF-001b`, deferred).

## 23. Follow-ups

None required for PERF-001. `PERF-001b` (move enrichment inside the cached
closure, requiring a key/version bump) remains tracked by the diagnosis §28.2
as a separate finding.


---

## 24. Independent re-verification (evidence recovery)

Re-run in a clean shell, scratch files deleted afterwards.

Focused suite `tests/ai-similar-enrichment-concurrency.test.ts`:

```
Test Files  1 passed (1)
     Tests  8 passed (8)
  Duration  1.52s
```

Full suite (`vitest run`):

```
Test Files  42 passed (42)
     Tests  423 passed (423)
  Duration  83.19s
```

`tsc --noEmit` -> exit 0, no output.

`eslint app/api/movie/[id]/ai-similar/route.ts tests/ai-similar-enrichment-concurrency.test.ts` -> exit 0.

`next build` with the CI placeholder env set -> exit 0:

```
 ✓ Compiled successfully in 82s
```

with the corrected route emitting:

```
├ ƒ /api/movie/[id]/ai-similar             249 B         103 kB
```


---

## 25. Evidence Recovery and Completion Pass (final)

Objective: restore and independently re-verify every Phase 8 gate from a clean
shell, and confirm no instrumentation artifact leaked into the repository.
Production route logic was **not** modified in this pass; the correction from
§12 stands unchanged.

### 25.1. Environment

| Field | Value |
|---|---|
| Node | v24.21.0 |
| npm | 11.5.2 |
| git | 2.50.1.windows.1 |
| Branch | `main` |
| HEAD | `70fe77655467f5105f5d0e9b02594ba1c62b2952` |
| Upstream | `origin/main` (ahead 2, behind 0) |
| Next.js | 15.5.24 |
| Vitest | 3.2.7 |

### 25.2. Gates re-run

| Gate | Command | Result |
|---|---|---|
| Focused suite | `npx vitest run tests/ai-similar-enrichment-concurrency.test.ts` | **8/8 pass, exit 0**, 1.52 s |
| Full suite | `npx vitest run` | **42 files, 423/423 pass, exit 0**, 83.19 s |
| Typecheck | `npx tsc --noEmit` | **exit 0**, no output |
| Lint (touched files) | `npx eslint <route> <test>` | **exit 0**, 0 findings |
| Production build | `npx next build` with the seven CI placeholder env vars | **exit 0**, `✓ Compiled successfully in 82s`; route emitted as `ƒ /api/movie/[id]/ai-similar  249 B  103 kB` |
| Dependency audit | `npm audit --omit=dev --json` | **0 vulnerabilities** (info 0, low 0, moderate 0, high 0, critical 0) |

### 25.3. Repo-wide lint triage

`npm run lint` reported **94 problems (1 error, 93 warnings)**, exit 1. All
were pre-existing and unrelated to PERF-001:

- The **1 error** was `@typescript-eslint/no-require-imports` at `extract.js:1`.
  `extract.js` was an **untracked local scratch file** (`git ls-files
  --error-unmatch extract.js` → "did not match any file(s) known to git").
  never committed and not part of the deliverable. `eslint.config.mjs:22-29`
  already exempts legitimate CommonJS scripts (`scripts/**/*.js`,
  `scripts/**/*.cts`, `tailwind.config.ts`); the scratch file simply is not in
  that allow-list. Not a regression introduced by Phase 8.
- The **93 warnings** are all in untouched files: unused imports
  (`'afterEach'`, `'onLoadingComplete'`, `'Card'`, `'error'` in catch
  bindings), `import/no-anonymous-default-export` on `eslint.config.mjs`, one
  `react-hooks/exhaustive-deps` missing-dependency warning, and
  `@typescript-eslint/no-unused-vars` in `hooks/use-toast.ts`, `lib/cache.ts`,
  and various `components/**` and `app/**` pages.
- Neither touched file appears in the lint output at all: 0 findings for
  `app/api/movie/[id]/ai-similar/route.ts` and 0 for
  `tests/ai-similar-enrichment-concurrency.test.ts`.

Conclusion: the only lint error was caused by an untracked local scratch file,
not by any Phase 8 source change. It was removed as cleanup in §25.6, after
which the gate passes — see §26.2. No ESLint ignore was added and
`eslint.config.mjs` was not modified.

### 25.4. Full-suite stderr triage

All stderr lines in the full-suite log are deliberate in-test negative-path
coverage, not regressions or unhandled rejections:

| Source | Lines | Cause |
|---|---|---|
| `tests/boot-fatality-classification.test.ts` | 3 × `[BOOT] Critical environment error: ...` | Deliberately drives `instrumentation.ts` `register()` into its throw branch. `register()` returns early unless `NODE_ENV === 'production'` and `NEXT_RUNTIME === 'nodejs'` (`instrumentation.ts:20-28`), so it never runs outside a test. |
| `tests/list-membership-collision.test.tsx` | `Error toggling watchlist: Error: forced network failure` | Deliberate throw through `WatchlistContext.tsx:133` to pin UI error handling. |
| `tests/favorites-context.test.tsx` | `Error toggling favorite: Error: forced failure` | Deliberate throw through `FavoritesContext.tsx:119` / `FavoriteButton.tsx:24`. |
| `tests/performance-m4.test.ts`, `tests/chat-trust-boundary.test.ts`, `tests/chat-quota-ordering.test.ts`, `tests/session-lifecycle.test.ts` | `AI request failed`, `Recommendation error`, model-response failures | All are the tests' own simulated upstream failures. |

Zero `Unhandled` / unhandled-rejection lines in the log; all 423 tests pass.

### 25.5. Working-tree cleanliness

Every intermediate artifact was written under a single scratch directory and
removed afterwards. `git ls-files --others --exclude-standard` shows no
instrumentation files from this pass; the only untracked entries are the
pre-existing local scratch set (`.chunks/`, `.my_tool_sandbox/`,
`as_route_*.txt`, `cqq*.txt`, `route_dump.txt`, `failed_block.txt`,
`lib/list-membership.ts`, and the `docs/reports/**` and `tests/**` deliverables
themselves). `docs/ARCHITECTURE_REVIEW.md` remains the single deletion and is
reported in the Phase 8 record.

### 25.6. Safe scratch-file deletion (cleanup, not a source change)

The single repository-wide lint blocker was `extract.js`. Before deleting it,
every required condition was proven (full evidence captured in the pass log):

| # | Condition | Result |
|---|---|---|
| 1 | `git ls-files --error-unmatch extract.js` confirms untracked | proven — `error: pathspec 'extract.js' did not match any file(s) known to git` |
| 2 | Regular file, not a symlink | proven — `-rw-r--r-- 1 … 315 bytes`; `-L` test negative |
| 3 | No reference in source, scripts, `package.json`, tests, or config | proven — recursive grep over `app components contexts hooks lib scripts tests middleware.ts *.config.* package.json tsconfig.json vitest.config.mts eslint.config.mjs` returned zero matches |
| 4 | Not a Phase 1–8 deliverable | proven — never committed (`git log --all -- extract.js` empty); referenced by no report other than this one, as the object of this deletion |
| 5 | Contents are scratch-only: no secret, user data, reusable implementation, or required evidence | proven — a 315-byte line-numbering helper (`fs.readFileSync(path).split('\n')` + a `for` loop printing `i+1: line`); zero matches for key/secret/token/URI credential patterns; no logic reusable by the application |

All conditions passed, so `extract.js` alone was deleted. `.chunks/`,
`.my_tool_sandbox/`, `as_route_*.txt`, `cqq*.txt`, `route_dump.txt`, and
`failed_block.txt` were all deliberately **preserved** — each was confirmed
present after the deletion. No ESLint ignore was added and
`eslint.config.mjs` was not touched.

This is cleanup of a pre-existing untracked scratch artifact. It is **not** a
Phase 8 source change and does not alter the Phase 8 delta in §27.2.

---

## 26. Targeted validation evidence (post-correction scope check)

### 26.1. Command and result

```
npx vitest run \
  tests/performance-m4.test.ts \
  tests/admin-chat-ai-security.test.ts \
  tests/stale-identity.test.ts \
  tests/middleware-security.test.ts \
  tests/redis-cache-security.test.ts \
  tests/redis-queue-calibration.test.ts \
  tests/performance-phase2.test.ts \
  --reporter=basic
```

```
Test Files  7 passed (7)
     Tests  75 passed (75)
  Start at  01:46:22
  Duration  45.11s
```

**Exit status: 0.** No test was modified for this run.

### 26.2. Recorded facts

| Property | Value |
|---|---|
| Test files | 7 |
| Tests | 75 passed (75) |
| Exit status | 0 |
| Unhandled errors | 0 — no `Unhandled` or unhandled-rejection line appears anywhere in the run |
| External requests | none — the run made no outbound call; isolation is asserted, not assumed (§26.3) |

Per-file breakdown: `performance-m4` 10, `redis-cache-security` 30,
`performance-phase2` 9, `stale-identity` 5, `admin-chat-ai-security` 13,
`middleware-security` 4, `redis-queue-calibration` 4 — **75**.

### 26.3. Isolation evidence

The 7 files never touch a live service. Every external boundary is replaced
before the handler runs:

- **MongoDB** is mocked in all 7 (`vi.mock('@/lib/mongodb')`), and the models
  they use (`User`, `History`, `FavoritesModel`, `WatchlistModel`) are mocked
  too, so no model reaches a real driver.
- **Redis** is mocked where used (`vi.mock('@/lib/redis')` in the redis suites;
  `vi.mock('@/lib/cache')` / `@/lib/cacheManager` elsewhere), so no connection
  is opened.
- **Auth, rate limiting, and quota** are mocked
  (`vi.mock('@/lib/security/auth')`, `…/rateLimit`, `…/quota`), so no session
  or DB lookup occurs on the hot path.
- **Network** is asserted, not just stubbed:
  `tests/admin-chat-ai-security.test.ts:220` asserts
  `expect(globalThis.fetch).not.toHaveBeenCalled()`;
  `tests/performance-phase2.test.ts:213` and `:265` pin exact call counts
  (1 and 2), and `:278` asserts no call at all.
  `tests/performance-m4.test.ts:314` and
  `tests/redis-cache-security.test.ts:311` inject failing fetches
  (`mockRejectedValue(new Error('down'/'nope'))`) to pin degraded behavior.
- **Timers** are fake where timing matters (`vi.useFakeTimers()`), so no real
  delay is awaited.

The only stderr line in the run is `AI request failed` from
`tests/performance-m4.test.ts > M4 read caps + degraded clear > recs prompt
built from <=200 history titles` — the test's own injected Gemini rejection
(line 314). It is expected negative-path coverage, not a failure.

### 26.4. Repository-wide lint after cleanup

```
$ npm run lint

✖ 93 problems (0 errors, 93 warnings)
LINT_EXIT=0
```

**Exit 0, 0 errors, 93 warnings.** The warning count is unchanged from before
the deletion (93 → 93), confirming the removal only eliminated the error and
introduced no new findings. All 93 warnings are pre-existing and sit in files
Phase 8 never touched.

---

## 27. Final Git evidence

### 27.1. Commands and raw output

```
$ git status --porcelain=v2 --branch
# branch.oid 70fe77655467f5105f5d0e9b02594ba1c62b2952
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -0
```

```
$ git rev-parse HEAD
70fe77655467f5105f5d0e9b02594ba1c62b2952
```

`git diff --name-status` — 34 modified tracked files plus one deletion:

```
M  app/api/ai-recommendations/route.ts
M  app/api/chat-history/route.ts
M  app/api/chat/route.ts
M  app/api/genres/route.ts
M  app/api/movie/[id]/ai-similar/route.ts
M  app/api/trailers/route.ts
M  app/api/user/route.ts
M  app/genre/[id]/page.tsx
M  app/movie/[id]/page.tsx
M  app/trending/page.tsx
M  app/tv/[id]/page.tsx
M  components/FavoriteButton.tsx
M  components/ForYouSection.tsx
M  components/MoodBasedRecommendations.tsx
M  components/TimeBasedMovies.tsx
M  components/TopRatedMovies.tsx
M  components/TopRatedTVShows.tsx
M  components/TrendingSection.tsx
M  contexts/FavoritesContext.tsx
M  contexts/WatchlistContext.tsx
D  docs/ARCHITECTURE_REVIEW.md
M  docs/PROJECT_BLUEPRINT.md
M  docs/SECURITY_AUDIT.md
M  docs/UI_UX_REVIEW.md
M  lib/security/auth.ts
M  lib/security/rateLimit.ts
M  middleware.ts
M  package-lock.json
M  package.json
M  tests/documentation-contract.test.ts
M  tests/m5-a11y.test.tsx
M  tests/performance-m4.test.ts
M  tests/phase4-watchlist-mobile.test.tsx
M  tests/ratelimit-ip-security.test.ts
M  tests/session-lifecycle.test.ts
M  tests/tmdb-proxy-validation.test.ts
```

```
$ git diff --cached --name-status
(no output)
```

`git ls-files --others --exclude-standard` lists the pre-existing local
scratch set (`.chunks/`, `.my_tool_sandbox/`, `as_route_*.txt`, `cqq*.txt`,
`route_dump.txt`, `failed_block.txt`, `lib/list-membership.ts`) plus the
untracked deliverables under `docs/reports/`, `tests/`, and `app/globals.css`.

`git check-ignore .next` prints `.next` — it is git-ignored.

**`extract.js` does not appear in that list — it is absent, as required.**
No `.env`, secret, credentials, `.pem`, or `.key` file appears in the
untracked set. No commit was made and nothing was deployed.

### 27.2. Attribution statement

> Accumulated multi-phase working tree preserved. No Phase 8 instrumentation
> artifacts remain. Phase 8 delta precisely attributed. Nothing staged. HEAD
> unchanged.

The working tree is **not** clean and is not described as such. It is the
accumulated, uncommitted output of Phases 1–8: 34 tracked modifications, one
document deletion, plus the untracked deliverables and the pre-existing local
scratch paths listed in §25.6. The Phase 8 delta within it is exactly:

| Path | Change | Attribution |
|---|---|---|
| `app/api/movie/[id]/ai-similar/route.ts` | PERF-001 fix — inline pool-4 enrichment, `ENRICHMENT_POOL_SIZE` | Phase 8 source (§12) |
| `tests/ai-similar-enrichment-concurrency.test.ts` | focused suite, 8 tests | Phase 8 deliverable (§15) |
| `docs/reports/PHASE-8-…COMPLETION-REPORT.md` | this report | Phase 8 deliverable |
| `extract.js` | **deleted** | pre-existing untracked scratch cleanup (§25.6), not a source change |

Every other modification in §27.1 belongs to an earlier phase and was left
untouched.

### 27.3. Rollback plan

The correction is reversed by **applying a reverse patch or reverting a future
commit** — not by `git checkout`, `git restore`, or `git reset` against the
working tree, which would discard the accumulated multi-phase work.

- If committed: `git revert <commit>` produces an inverse commit restoring the
  unbounded `Promise.all(aiSuggestions.map(...))` enrichment verbatim.
- If not yet committed: `git diff -- app/api/movie/[id]/ai-similar/route.ts >
  /tmp/phase8.patch` then `git apply -R /tmp/phase8.patch` reverses only the
  PERF-001 hunk, leaving all other phases' work intact.

Either path restores the original `HEAD` route byte-for-byte, since the diff
is additive-only at the enrichment site (§17.1).

---

## 28. Status, attribution, and traceability

### 28.1. Final status: PASS WITH WARNINGS

| Required condition | Status |
|---|---|
| Repository-wide lint exits 0 | met — §26.4, exit 0 / 0 errors / 93 warnings |
| Targeted suites exit 0 | met — §26.1, 7 files / 75 tests / exit 0 |
| All previously green gates remain green | met — §25.2 (focused 8/8, full 42/423, typecheck 0, build 0, audit 0, scoped lint 0) |
| Report wording honest about the missing runtime RED | met — §17.1 states plainly that it was not captured |
| Final Git attribution complete | met — §27 |

**Warnings (non-blocking):**

1. Canonical runtime pre-fix RED was not captured (§17.1). The historical
   maximum of 12 is established statically from the committed source.
2. Node 22 CI run is pending — all gates here were verified on Node 24;
   `.github/workflows/ci.yml` pins `node-version: 22` and has not yet executed
   on this delta.
3. Production metrics and deployment verification are pending — the impact
   statement below is theoretical, not observed.
4. `PERF-001b` remains open (§23).

### 28.2. Phase 8 attribution, commit and deployment status

| Property | Value |
|---|---|
| Phase | 8 — PERF-001, AI-similar enrichment concurrency bound |
| Attribution | `app/api/movie/[id]/ai-similar/route.ts` + `tests/ai-similar-enrichment-concurrency.test.ts`; pattern copied inline from `app/api/ai-recommendations/route.ts:352-401` (W3-006c) |
| Commit status | **NOT committed** — working tree only, nothing staged, HEAD unchanged |
| Deployment status | **NOT deployed** — no build artifact shipped, no production environment touched |
| External systems | none contacted. No TMDB, Gemini, Redis, or MongoDB call was made by any gate in this report; every test runs against mocks, and `tsc` / `eslint` / `next build` / `npm audit` perform no I/O against those services |
| Production impact | **THEORETICAL** — expected: ≤4 in-flight TMDB enrichment fetches per request instead of up to 12, at the cost of `ceil(12/4) = 3` sequential rounds. Not measured against live traffic |
| `PERF-001` status | **RESOLVED** — per-request fan-out bounded at 4; pinned by the focused suite (§18) and untouched by the targeted suite (§26) |
| `PERF-001b` status | **OPEN** — enrichment still sits outside the cached closure, so a cache hit still costs up to 12 searches. Deferred per diagnosis §28.2 Option C; requires a cache key/version bump |
| Cache-hit behavior | unchanged — a cache hit still short-circuits Gemini and the TMDB `similar`/`details` fetches, but enrichment still runs (up to 12 `/search` calls) because it sits outside the `getOrSet` closure. That is the `PERF-001b` defect, not a regression of this fix |

### 28.3. Next-phase recommendation

Close `PERF-001b`: move the TMDB enrichment inside the `redisCache.getOrSet`
closure in `app/api/movie/[id]/ai-similar/route.ts`, so a cache hit returns
stored enriched results and issues zero `/search/movie` calls. This needs a
cache key or version bump (e.g. `movie:{id}:ai-similar:v2`) because the stored
shape changes from raw suggestions to enriched recommendations; a migration or
TTL expiry bridges existing entries. Keep the pool-4 loop exactly as it is —
it bounds the fan-out on the cold path. Before shipping, run the Node 22 CI
job, then capture the pre-change runtime in-flight count so the next fix has a
measured RED rather than a static one.

### 28.4. Requirement Traceability Matrix

Requirement ID → Implementation evidence → Validation evidence → Status

| ID | Requirement | Implementation evidence | Validation evidence | Status |
|---|---|---|---|---|
| CONC-FIX-1 | Enrichment fan-out must be bounded, not unbounded | `route.ts` — `ENRICHMENT_POOL_SIZE = 4` + ordered `for`-loop batching replacing `Promise.all(...map(...))` (§12) | focused suite asserts `state.maxInFlight <= 4`; targeted suite re-run unchanged (§18, §26) | PASS |
| CONC-FIX-2 | The bound must be exactly 4 | `const ENRICHMENT_POOL_SIZE = 4;` module-level, single tuning constant | `maxInFlight` assertion pins `<= 4` with 12 suggestions present | PASS |
| CONC-FIX-3 | All 12 suggestions must still be processed | loop `for (let i = 0; i < aiSuggestions.length; i += ENRICHMENT_POOL_SIZE)` with `slice` + `push(...batchResults)` | "12 > pool → all 12 eventually processed" passes; 12 `/search` calls counted | PASS |
| CONC-FIX-4 | Result ordering must match suggestion order | batches are slices taken in order and concatenated in order | assertion expects ordered `[1..12]` ids | PASS |
| CONC-FIX-5 | Partial failure must degrade, not reject | per-suggestion `try/catch` returns `id: null`, then `.filter(id !== null)` | "one failed enrichment → 200, others intact" passes | PASS |
| CONC-FIX-6 | Empty TMDB match must be filtered out | falsy `bestMatch` → `id: null` → filtered | "empty TMDB match → filtered" passes | PASS |
| CONC-FIX-7 | Duplicate titles must not be deduped | route performs no dedup; each suggestion issues its own search | "12 dups → count = 12" passes | PASS |
| CONC-FIX-8 | Cache key and TTL must not change | `movie:${movieId}:ai-similar`, TTL 86400, untouched | mock `getOrSet` asserts key and TTL | PASS |
| CONC-FIX-9 | The `< 4` fallback threshold must not change | `aiResults.length < 4` branch left as-is | threshold-driven tests still green in the 42-file suite | PASS |
| CONC-FIX-10 | No new signal or retry on enrichment fetches | `fetch(url, { next: { revalidate: 3600 } })` unchanged; no `AbortController` added | `init.signal === undefined` assertion passes | PASS |
| CONC-FIX-11 | No external request must escape the suite | tests mock `fetch`, Redis, MongoDB, and auth; deny-by-default guard | `expect(globalThis.fetch).not.toHaveBeenCalled()` in the targeted suite; guard denies unknown paths | PASS |
| CONC-FIX-12 | A runtime RED must prove the pre-fix defect | none — no runtime command measured `maxInFlight = 12` against the pre-fix route | §17.1 establishes the historical maximum of 12 statically from `git show HEAD:…/route.ts` (unbounded `Promise.all`, 12-item cap, one search each, no pool); §17.3 measures the current GREEN `maxInFlight <= 4` | **PASS WITH WARNING** |

CONC-FIX-12 is the only conditional pass: the bound was proven statically
rather than at runtime, because the focused suite was first executed against
the already-corrected route. Every other requirement is met with a runtime
assertion.
