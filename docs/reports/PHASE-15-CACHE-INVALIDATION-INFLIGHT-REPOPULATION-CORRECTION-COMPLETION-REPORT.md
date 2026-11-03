# Phase 15: Cache Invalidation / In-Flight Producer Race Correction - Completion Report

## Result

**Outcome:** `CACHE IMPLEMENTATION PASS — RELEASE GATE BLOCKED ON DEPENDENCY AUDIT DRIFT`

The in-flight producer race in `lib/cache.ts` is cured: an invalidated flight no longer
repopulates either cache tier, a partially initialized entry can no longer be observed by a
synchronous re-entrant caller, and no invalidation path leaves the original caller's Promise
pending. The focused suite proves **25 contracts** (all passing), including the pre-start
settlement tests (RED-23..RED-25) in which `delete()` / `clearScoped()` / capacity eviction land
before the producer microtask starts.

**This pass is a source-to-report reconciliation pass.** Direct inspection of the current
`lib/cache.ts` (§1.1) proves the implementation is already in its required final state: the
producer microtask contains **no early return**, the producer always runs and settles the
original promise, the write gate checks both `!entry.invalidated` and registry identity
(`ce === entry`), and `finally` is identity-safe. Because the source required no change,
`lib/cache.ts` and `tests/cache-inflight-invalidation-race.test.ts` were **not modified** in this
pass. What changed is this report: it previously carried a stale code excerpt from an older
implementation (an early return that no longer exists), stale line references, and two
mutually conflicting targeted-suite counts. All of that stale evidence is replaced below with
the current source structure, current line references, and one canonical targeted result
(8 files / 109 tests).

**This is not a clean release gate.** Audit drift is confirmed and has **increased** since the
prior report draft: the live fail-closed policy now rejects on **9 distinct production advisory
objects** (17 in the bare scope) — up from 7/15. The raw `--omit=dev` audit carries one
**Critical** (Next.js RCE, GHSA-2464-fhr4-w9xw) plus High findings in `sharp`, `source-map-js`,
and `zod`, and newly two Moderate transitive chains (`glob` via `sucrase`, `minimatch`).
`braces` is **absent from the audit inventory**, so the expired braces exception is **not** an
active blocker and was **not** extended. The gate is blocked on dependency audit drift alone.
Per section 9, an independent dependency-security diagnosis is recommended before any release.

Implementation changes remain confined to the working tree only: `lib/cache.ts` (modified,
uncommitted) and `tests/cache-inflight-invalidation-race.test.ts` (new, uncommitted). Nothing is
staged, committed, pushed, merged, or deployed.

---

## 0. Baseline

| Item | Value |
|---|---|
| Branch | `work/phase-12-cache-invalidation-diagnosis` |
| HEAD | `a89c1fb39df3139c7200fcd172357df3b247c54e` — `fix(security): restore approved braces exception expiry` |
| Staged (index) | **empty** — `git diff --cached --stat` prints nothing |
| Tracked diff | `lib/cache.ts` only: 138 insertions, 40 deletions |
| Untracked inventory | `.chunks/`, `.inbox3.txt`, `.my_tool_sandbox/`, `.phase11-prompt.txt`, `as_route_copy.txt`, `cqq.txt`, `cqq_full.txt`, `docs/reports/PHASE-15-...COMPLETION-REPORT.md`, `docs/reports/diagnostics/BUG-...DIAGNOSIS.md`, `failed_block.txt`, `nul`, `p14_evidence.json`, `route_dump.txt`, `tests/cache-inflight-invalidation-race.test.ts` |
| Remote | `origin` → `https://github.com/amrhanyy/movie-recommendation-system.git` (fetch + push) |
| `origin/main` | `bcdb83473071c3a704335861a0cd7204317298a8` (verified via `git ls-remote origin` and local remote-tracking ref) |
| Local release branch | **does not exist** (`fatal: ambiguous argument 'release'`) |
| Remote release branch | **exists** at `origin/release/phases-2-11-verified`, head `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f` (verified via `git ls-remote origin 'refs/heads/release/*'`); unchanged by this pass |
| PR #14 | `OPEN`, not merged, "Release: verified fixes from Phases 2–11", head `release/phases-2-11-verified` @ `6f0595ab4c2f` (verified via the GitHub API); uses that remote head; unchanged by this pass |

### File hashes (SHA-256, first 16 chars) — recomputed this pass

| File | Hash | Note |
|---|---|---|
| `lib/cache.ts` | `f90db789d3fe3ade` | modified vs HEAD (by the Phase 15 fix, prior passes; untouched this pass) |
| `tests/cache-inflight-invalidation-race.test.ts` | `f659a660ef32b03a` | new (untracked); untouched this pass |
| `package.json` | `8896865a3da9ad77` | unchanged |
| `package-lock.json` | `a8f5214eeb5af038` | unchanged |
| `scripts/audit-policy.mjs` | `a06a4bee439de9f1` | unchanged |
| `config/audit-exceptions.json` | `ee7a771fc1c1e6dd` | unchanged (expiry NOT extended) |
| `.github/workflows/ci.yml` | `5dd400d1c953cd99` | unchanged |
| `tests/audit-policy.test.ts` | `e634356a6c78b7e6` | unchanged |

**Confirmed:** index empty; HEAD unchanged at `a89c1fb`; no Phase 15 commit exists; no push,
merge, or deployment; no remote ref moved.

---

## 1. Implementation evidence

### 1.1 Current-source truth check (required final behavior)

`lib/cache.ts` was read in full from disk. The deferred producer microtask in `getOrSet()`
contains **no early return**. There is no construct equivalent to
`if (!currentEntry || currentEntry !== entry) { return; }` anywhere in the producer path. The
required final behavior is verified line by line against the current source:

| Required behavior | Current source evidence | Lines |
|---|---|---|
| Producer always runs for the original caller | `queueMicrotask(() => { Promise.resolve().then(() => fetchFn()) ... })` — `fetchFn()` is invoked unconditionally; nothing gates its start | 431–433 |
| Original promise always resolves or rejects | `resolve(freshData)` on the success path; `reject(err)` in `.catch`; both run regardless of invalidation state | 443, 446 |
| Invalidated or superseded entry does not write | Write gate requires `!entry.invalidated && ce === entry && freshData !== undefined` | 438 |
| Write gate checks `!entry.invalidated` | First clause of the gate | 438 |
| Write gate checks registry identity when applicable | `ce === entry`, where `ce = inflightEntries.get(namespacedKey)` | 435, 438 |
| `finally` is identity-safe | `const ce = inflightEntries.get(namespacedKey); if (ce === entry) { inflightEntries.delete(namespacedKey); }` | 449–451 |
| No invalidation path leaves the Promise pending | `delete()` sets `invalidated` and removes the registry entry, but the producer's `.then` still calls `resolve(freshData)`; `clearScoped()` and capacity eviction likewise only set the flag / remove the entry | 217–226, 284–298, 394–403 |

Because the current implementation already satisfies every requirement, **`lib/cache.ts` was not
modified in this pass**, and the stale code excerpt that previously appeared in §1.2 (an
older implementation containing the early return) is removed and replaced below with the current
structure. Likewise, the focused test file already contains RED-1..RED-25 with complete, unique
numbering (§1.6), so **`tests/cache-inflight-invalidation-race.test.ts` was not modified**.

The Phase 15 diagnosis (`docs/reports/diagnostics/BUG-CACHE-INVALIDATION-INFLIGHT-REPOPULATION-DIAGNOSIS.md`)
was reviewed for factual cross-reference accuracy: it documents the pre-fix defect and the
approved Step-2 plan, and its §46 broader-validation set is the basis of the canonical targeted
suite in §7. No correction is required.

### 1.2 Deferred-start implementation (current source structure, `lib/cache.ts`)

The current `getOrSet` proceeds in this order (no code from older implementations is quoted
anywhere in this report):

1. **In-flight join check (synchronous).** An existing flight for the same namespaced key is
   returned immediately — the joiner receives `existingEntry.promise`, which is already a real,
   valid Promise. (367–370)
2. **Complete entry Promise construction.** `resolve`/`reject` are captured from a real
   `new Promise<T>` executor. (377–382)
3. **Entry construction.** `{ promise: entryPromise, invalidated: false }` — a complete entry;
   no placeholder, no `null! as any`, no explicit-any suppression. (384–387)
4. **Entry registration.** `inflightEntries.set(namespacedKey, entry)` — the complete entry
   becomes visible before any `await`. (391)
5. **Capacity eviction.** When the registry has reached `MAX_INFLIGHT_ENTRIES` (1000), the
   oldest entry is marked `invalidated` and removed before its producer ever starts. (394–403)
6. **Async cache lookup.** `await this.get<T>(namespacedKey)`; on a hit the entry is removed
   (identity-checked) and the caller resolves from cache, returning `entryPromise` early.
   Lookup errors are swallowed (already handled inside `get`). (408–421)
7. **Deferred producer start.** `queueMicrotask(() => { Promise.resolve().then(() =>
   fetchFn()).then(write-gate + resolve).catch(reject).finally(identity-safe cleanup) })`.
   (431–454)
8. **Return.** `return entryPromise;` — the caller holds the real Promise created in step 2.
   (456)

Current producer microtask structure (verbatim from disk):

```ts
    queueMicrotask(() => {
      Promise.resolve()
        .then(() => fetchFn())
        .then((freshData: T) => {
          const ce = inflightEntries.get(namespacedKey);
          // Write only when not invalidated AND the registry still points to
          // this entry (i.e. not removed or superseded by a newer flight).
          if (!entry.invalidated && ce === entry && freshData !== undefined) {
            this.set(namespacedKey, freshData, expireInSeconds).catch(() => {
              // Cache write failures must not change caller-visible semantics
            });
          }
          resolve(freshData);
        })
        .catch((err: unknown) => {
          reject(err);
        })
        .finally(() => {
          const ce = inflightEntries.get(namespacedKey);
          if (ce === entry) {
            inflightEntries.delete(namespacedKey);
          }
        });
    });
```

**Proof of the initialization and settlement contracts:**

1. **`entry.promise` is a real, valid Promise before the entry becomes visible** — constructed
   at 377–382 and stored at 384–387, before registration at 391.
2. **The complete entry is added to `inflightEntries`** — 391, after `promise` is assigned.
3. **`fetchFn()` starts only after the complete entry has been registered** — `queueMicrotask`
   at 431 runs after the synchronous registration at 391.
4. **`fetchFn()` may return synchronously, return a Promise, throw synchronously, or reject
   asynchronously** — `Promise.resolve().then(() => fetchFn())` normalizes all four outcomes.
5. **All four outcomes settle the already-visible `entry.promise`** — `resolve` (443) / `reject`
   (446) are wired to the promise created before visibility.
6. **No `null! as any` promise placeholder and no explicit-any lint suppression remains.**
7. **A synchronous re-entrant same-key call from inside `fetchFn()` joins the already-valid
   promise** — proven by RED-17.
8. **A synchronous re-entrant `delete()` / `clearScoped()` from inside `fetchFn()` invalidates
   the correct visible entry** — proven by RED-18 / RED-19.
9. **Cleanup uses entry identity and cannot remove a newer entry** — `.finally()` checks
   `ce === entry` (449–451).
10. **The original caller still receives the producer result even when caching is suppressed by
    invalidation** — `resolve(freshData)` at 443 runs regardless of the write gate; RED-18,
    RED-19, RED-23, RED-24, RED-25 prove the caller settles while neither tier is repopulated.

### 1.3 Source ordering evidence (current `lib/cache.ts`)

| # | Ordering item | Current lines |
|---|---|---|
| 1 | Complete entry Promise construction | 377–382 |
| 2 | Entry construction (`{ promise, invalidated: false }`) | 384–387 |
| 3 | Entry registration (`inflightEntries.set`) | 391 |
| 4 | Cache lookup ordering | in-flight join check **first** (367–370, synchronous); async Redis→memory lookup **after** registration and capacity bound (408–421); cache hit resolves and returns early (416–417) |
| 5 | Deferred producer start (`queueMicrotask`) | 431 (fetchFn invoked at 433) |
| 6 | Write gate (`!entry.invalidated && ce === entry && freshData !== undefined`) | 435–442 |
| 7 | Resolve / reject | 443 resolve; 446 reject |
| 8 | Identity-safe `finally` | 449–451 |
| 9 | Capacity eviction (marks oldest flight invalidated, removes it) | 394–403 |

### 1.4 `delete()` registry removal

`delete()` sets `entry.invalidated = true` **and** removes the entry from `inflightEntries`
(line 225), so every invalidated flight frees its registry slot instead of leaking. The `.then`
write gate (438) already blocks the stale write, and the `.finally` identity check (449–451)
makes the removal safe. RED-22 proves it: a later `getOrSet` after `delete()` starts a fresh
producer instead of joining the dead flight.

### 1.5 Pre-start settlement evidence (RED-23, RED-24, RED-25)

All three tests are deterministic, use explicit microtask control (`await` of the invalidating
operation, then `await new Promise(r => setImmediate(r))` to flush the queue), and use no
arbitrary sleeps and no production hooks.

| Field | RED-23 | RED-24 | RED-25 |
|---|---|---|---|
| Exact test name | "delete before producer microtask starts" | "capacity eviction before producer microtask starts" | "scoped clear before producer microtask starts" |
| Operation before producer microtask | `await redisCache.delete(key)` immediately after `getOrSet()` returns, before the queued microtask executes | 999 additional synchronous `getOrSet` flights, pushing keyA past `MAX_INFLIGHT_ENTRIES = 1000` so the oldest (A) is evicted before its microtask | `await redisCache.clearScoped(CACHE_SCOPES.aiSimilar)` before the queued microtask executes |
| Producer invocation count | `startCount === 1` (producer runs exactly once) | A's producer runs once and settles (`proceedA('EVICTED')`; `resultA === 'EVICTED'`) | `startCount === 1` |
| Original caller result | `await p` resolves to `'VALUE'` | `await pA` resolves to `'EVICTED'` | `await p` resolves to `'VALUE'` |
| Memory result | `redisCache.get(key) === null` | `redisCache.get(keyA) === null` | `redisCache.get(key) === null` |
| FakeRedis result | `fake.store.has(key) === false` | `fake.store.has(keyA) === false` | `fake.store.has(key) === false` |
| Fresh-producer result | later call starts a second producer (`startCount2 === 1`), resolves `'FRESH'`, and is cached in both tiers (`get === 'FRESH'`, `fake.store.has === true`) | fresh B at keyA settles `'FRESH_B'` and survives A's finally; `get(keyA) === 'FRESH_B'`, `fake.store.has(keyA) === true`; the 999 non-evicted flights all settle (`others.length === 999`) | (shared settlement path with RED-23; no fresh-producer step asserted in this test) |
| Pass status | **PASS** | **PASS** | **PASS** |

**No Promise remains pending.** In each test the original caller's promise is `await`ed to a
settled value (`result === 'VALUE'` / `'EVICTED'`), the fresh-producer promise is likewise
`await`ed to a settled value, and every producer that will ever start has already been released
via its `proceed()`/inline value — there is no path in which `resolve` or `reject` is skipped.
At the source level this is guaranteed structurally: the producer chain has exactly two exits
(`resolve(freshData)` at 443 on success, `reject(err)` at 446 on throw/rejection), and no branch
between them returns early. Vitest reported **0 unhandled errors** for the focused run (§7).

### 1.6 Focused test count reconciliation

Direct inspection of `tests/cache-inflight-invalidation-race.test.ts`:

- Exact number of `it()` cases: **25**.
- Numbering: **RED-1 through RED-25 — complete and unique** (each ordinal appears exactly once;
  no gaps, no duplicates, no unnumbered `it()`).
- RED-23, RED-24, RED-25 are individually present (§1.5).

Command and result (Node 22.13.1):

`node node_modules/vitest/vitest.mjs run tests/cache-inflight-invalidation-race.test.ts`
→ **1 file, 25 tests passed, 0 unhandled errors, exit 0.**

**Final focused-test count: 25** (RED-1..RED-25). No other focused count appears in any active
result section of this report; the superseded counts (22, and the earlier "15 tests failed")
appear only in the marked chronology in section 11.

### 1.7 RED-16 through RED-19

| Test | Synchronization mechanism | Assertion | Result |
|---|---|---|---|
| **RED-16** "Synchronous fetchFn throw returns rejected promise, leaves no in-flight entry, later call starts normally" | `createProducer` body throws inline; `flushMicrotasks()` after the reject | `await expect(p).rejects.toThrow('Sync fail')`; `get(key) === null`; later call returns `'FRESH'` and caches it | **PASS** |
| **RED-17** "synchronous re-entrant same-key call inside fetchFn joins the valid flight without starting another producer" | Outer `fetchFn()` **synchronously** calls `cache.getOrSet(sameKey, innerProducer)` before returning; nested call must join the outer flight | nested is a defined Promise (never null/undefined); inner producer not invoked (`innerCalls === 0`); only outer producer ran (`outerCalls === 1`); both callers settle to `'OUTER'`; value cached once | **PASS** |
| **RED-18** "synchronous delete() inside fetchFn invalidates the visible entry, prevents both memory and Redis writes, caller still receives result" | Outer `fetchFn()` calls `cache.delete(key)` from inside itself before returning the stale sentinel | `await p` resolves to `'STALE'`; `get(key) === null`; `fake.store.has(key) === false`; later call starts a fresh producer | **PASS** |
| **RED-19** "synchronous clearScoped() inside fetchFn invalidates matching flight, preserves unrelated flight, writes no stale matching value" | Matching `fetchFn()` calls `cache.clearScoped(...)` from inside itself before returning the stale matching value | `get(keyMatch) === null`; `fake.store.has(keyMatch) === false`; `get(keyOther) === 'FRESH_B'`, `fake.store.has(keyOther) === true`; `matchCalls === 1` | **PASS** |

### 1.8 Additional defect corrected (prior passes, verified current)

Source inspection of `delete()` in a prior pass revealed it set `invalidated = true` but never
removed the entry from `inflightEntries` (registry bounded only by eviction, not deletion). The
corrected code (line 225) calls `inflightEntries.delete(namespacedKey)`. Verified current this
pass (§1.4) and proven by RED-22.

---

## 2. Scoped matcher evidence

### 2.1 Exact matcher (`lib/cache.ts`, lines 291 and 346)

```ts
if (key.startsWith(prefix) &&
    (key.length === prefix.length || prefix.endsWith(':') || key[prefix.length] === ':')) {
```

The match pattern is namespaced with `applyNamespace(match)` (not `this.ns(match)`, which
normalizes `*` → `_` and would break wildcard patterns), then extended with a trailing `*`
unless it already ends in one; `prefix` is the pattern with `*` stripped.

### 2.2 Proven behaviour (RED-20, RED-21)

| Case | Key | Prefix | Expected | Result |
|---|---|---|---|---|
| Exact | `movie:42` | `movie:42` | match | **PASS** |
| Partial segment | `movie:420` | `movie:42` | **no match** | **PASS** |
| Reverse partial | `movie:42` | `movie:420` | **no match** | **PASS** |
| Child segment | `movie:42:extra` | `movie:42` | match | **PASS** |
| Scope prefix ending in `:` | `public:ai-similar:x_v2` | `public:ai-similar:` | match | **PASS** |
| Cross-scope (prefix of another scope) | `public:ai-similar:x_v2` | `public:tmdb:` | **no match** | **PASS** |
| Cross-scope reverse | `public:tmdb:x_v2` | `public:ai-similar:` | **no match** | **PASS** |
| Scoped clear isolates scopes | `ai-similar` flight cleared, `publicTMDb` flight untouched | — | A not repopulated, B repopulated | **PASS** (RED-21) |

The `movie:42` / `movie:420` guarantee is satisfied: `startsWith('movie:42')` is true for both,
but `key[7]` is `:` for `movie:42:extra` (match) and `0` for `movie:420` (no match).

### 2.3 Wildcard handling

`applyNamespace` is used for the match pattern because it preserves `*`; `this.ns()` would
mangle it (`*` → `_`). Verified by direct probe: `applyNamespace('public:ai-similar:')` →
`movie-recommendation-system:development:v1:public:ai-similar:`.

---

## 3. Capacity eviction evidence

| Quantity | Value |
|---|---|
| Memory-cache capacity | `MAX_MEMORY_ENTRIES` (LRU, enforced in `getFromMemoryCache` / `set`) |
| In-flight-registry capacity | `MAX_INFLIGHT_ENTRIES = 1000` (insertion-order map, evicts oldest) |

Proven by RED-12, RED-13, RED-14, RED-24:

- **Active evicted flight is marked invalidated before removal** — lines 399–400 set
  `oldestEntry.invalidated = true` before `inflightEntries.delete(oldestKey)`.
- **It returns its result to the original caller** — the producer chain resolves
  `entryPromise` regardless of registry state (443); the caller holds that promise.
- **It writes to neither memory nor Redis** — the write gate at 438 fails on both
  `!entry.invalidated` and `ce === entry`. RED-13 and RED-24 assert `get(key) === null` and
  `fake.store.has(key) === false`.
- **Its finally cannot remove a newer entry** — 449–451 deletes only `if (ce === entry)`
  (identity). RED-4, RED-10, and RED-24 prove this.
- **Map remains bounded** — RED-14 starts 1000 distinct keys and asserts the registry never
  exceeds the bound.
- **Non-evicted entries retain normal coalescing and caching** — RED-15 asserts three
  concurrent same-key calls coalesce to one producer and the value is cached.

**Terminology:** the bounded structure is the **in-flight registry** (`inflightEntries`), not the
ordinary memory-cache LRU. The memory cache has its own separate LRU bound.

---

## 4. RED history correction

The claim **"15 tests initially failed" is removed.** It is not supported by command evidence.

What can be evidenced:

- The pre-fix source had the duplicate-start ordering defect (producer started before
  registration) and `clearScoped` used substring `includes()` matching. Both are visible in
  `git diff HEAD -- lib/cache.ts`.
- The earlier recovery pass produced failing runs, but the exact count of *behavioral* failures
  against compilable tests and unmodified production was not captured with a command that
  survives into this session, and the intervening edits (including test-authoring fixes) make a
  post-hoc reconstruction unreliable.
- Several of the early failures were **test-authoring defects**, not production behaviour:
  (a) a `RED-22` draft that awaited a producer blocked on an un-called `proceed()` — a
  self-inflicted deadlock; (b) a `RED-22` draft that asserted a fresh producer started
  immediately after `getOrSet`, ignoring that `getOrSet` is async and the counter increments
  only after the first `await` inside it; (c) a `RED-20` draft that compared an un-namespaced
  prefix against a namespaced key, which can never match.
- The genuine behavioural failures were: duplicate producer starts on concurrent same-key
  misses, and substring matching clearing unrelated keys — plus (found in the correction pass)
  the pre-start early return that left the original caller pending, and the `delete()` registry
  leak.

**Exact historical behavioural counts are unavailable and are not manufactured.** The report
states only what the on-disk code and the current green runs prove.

---

## 5. Lint baseline audit

| | Count |
|---|---|
| Established baseline | **93 warnings** |
| Current count (re-verified this pass) | **93 warnings** (0 errors) |
| Phase 15 contribution | **0 warnings** |

Re-verified this pass: `node node_modules/eslint/bin/eslint.js .` → `✖ 93 problems (0 errors,
93 warnings)`, exit 0. `lib/cache.ts` carries five `error`-in-catch warnings — pre-existing
(present at HEAD) and untouched.

**No `null! as any` / explicit-any suppression remains.** `entry.promise` is typed `Promise<T>`
directly. There is no file-wide disable, no `ts-ignore`, and no `ts-nocheck`.

---

## 6. Audit drift diagnosis

### 6.1 Live policy (fail-closed) — Node 22.13.1 + npm 11.19.0

Command: `node scripts/audit-policy.mjs` under the Node 22.13.1 runtime of record. Note on
runtime: `scripts/audit-policy.mjs` resolves the npm CLI relative to the running Node
(`resolveNpmPath()`); the Playwright-bundled Node 22.13.1 ships **without** npm, so the script's
own resolution fails closed ("npm audit produced no output"). To run the gate under the runtime
of record, the `NPM_PATH` override (validated by the script to reject paths containing spaces)
was pointed at a read-only copy of the npm 11.19.0 CLI placed in the Hermes scratch directory
(outside the repository; removed after the checks). The result is identical to the system-Node
run (v24.21.0, npm 11.5.2): **9 / 17**.

```
Audit policy (production scope): Audit policy rejected (production scope): 9 distinct advisory objects were found across the "via" arrays; the approved exception covers exactly one.
Audit policy (bare scope): Audit policy rejected (bare scope): 17 distinct advisory objects were found across the "via" arrays; the approved exception covers exactly one.
Audit policy: 2 of 2 scope(s) rejected. This gate fails closed.
exit code 1
```

### 6.2 `npm audit --omit=dev` — 7 vulnerabilities (3 moderate, 3 high, 1 critical)

| Package | Severity | Advisory | Title | Range | Fix |
|---|---|---|---|---|---|
| `next` | **Critical** (rollup) | GHSA-2464-fhr4-w9xw | Unauthenticated RCE in Image Optimization API when SVG files are used | `>=10.0.0 <=15.5.27` | `next@15.5.28` (outside stated range) |
| `next` | **Critical** (rollup) | GHSA-4jqv-mc3x-m676 | Cache poisoning of SSG/ISR pages | `>=15.0.0 <15.5.27` | `next@15.5.28` |
| `next` | **Critical** (rollup) | GHSA-mcj8-r9mp-w47p | Cache poisoning leading to cross-user content substitution | `>=15.0.0 <15.5.27` | `next@15.5.28` |
| `next` | **Critical** (rollup) | GHSA-p3m5-59mp-jv5r | DoS in App Router using Server Actions | `>=13.0.0 <=15.5.27` | `next@15.5.28` |
| `sharp` | High | GHSA-wq5f-xc86-pv6w | Vulnerability in librsvg dependency CVE-2026-96889 | `<0.35.5` | `sharp@0.35.5` |
| `source-map-js` | High | GHSA-68fv-2mgg-jv7q | Event-loop DoS through indexed source-map section offsets | `>=1.0.0 <1.2.2` | `source-map-js@1.2.2` |
| `zod` | High | GHSA-mrhx-c7xc-m3w5 | Memory exhaustion validating oversized constrained collections | `<4.6.6` | `zod@4.6.6` (breaking) |
| `glob` | Moderate | GHSA-3g3m-2fjr-6pw4 | AbortSignal cancellation bypass allows post-timeout filesystem traversal (transitive via `sucrase`) | `>=9.0.0 <=14.0.1` | `npm audit fix` |
| `minimatch` | Moderate | GHSA-g3hv-75wg-m249 | DoS via globparts amplification (transitive) | `<11.0.1` | `npm audit fix --force` |

Installed: `next@15.5.24`, `sharp@0.35.4`, `source-map-js@1.2.1`, `zod@3.24.2`. **`braces` is
ABSENT from the audit inventory** (verified programmatically against the raw audit JSON), so the
expired braces exception (`GHSA-vfj7-8cjw-p6xm`, expiry `2026-10-17T23:59:59Z`, now past) is
**not** an active blocker and was **not** extended — `config/audit-exceptions.json` is
byte-identical to HEAD (hash `ee7a771fc1c1e6dd`).

**Drift since the prior draft:** the prior report recorded 4 production vulnerabilities (7
advisory objects) and a policy rejection of 7 production / 15 bare. The advisory database has
since added the `glob` and `minimatch` moderate chains and rolled the two Next.js cache-poisoning
advisories into the critical package rollup, giving 7 grouped vulnerabilities / 9 distinct
advisory objects. The drift is real registry drift, not a local change: `package.json` and
`package-lock.json` are byte-identical to HEAD.

### 6.3 `npm audit` (bare) — 24 vulnerabilities (19 moderate, 4 high, 1 critical)

17 distinct advisory objects (the 9 production advisories from §6.2 plus the dev-scope set):

| Package | Severity | Advisory | Title |
|---|---|---|---|
| `@vitest/mocker` | Moderate | GHSA-qxg6-89mg-rqv8 | Code injection via unauthenticated manual mock registration (`>=2.1.0-beta.7 <4.1.12`) |
| `@vitest/mocker` | Moderate | GHSA-xp26-3454-mjgp | Windows backslash traversal bypasses the redirect allowlist fix (`>=4.1.11 <4.1.12`) |
| `vite` | High | GHSA-698v-4r3x-3vcv | launch-editor: `escapeCmdArgs()` omits % escaping on Windows |
| `vite` | High | GHSA-r825-w8mm-5pxw | launch-editor: Editor CLI flag misinterpretation causing arbitrary command execution |
| `vite` | High | GHSA-587h-7wmj-h5pm | launch-editor: `fs.existsSync()` existence check can be bypassed on Windows |
| `vite` | High | GHSA-9jrq-w75r-8gcw | Cross-origin script execution through Vite custom middleware |
| `vite` | High | GHSA-rq7h-c2jc-7f22 | Files outside `server.fs.allow` could be served when project paths differ |
| `vite` | High | GHSA-vfpm-58rq-9qcg | First 4 bytes of files outside the `server.fs` setting is exposed |
| (plus) | | | the 9 production advisories from §6.2 |

Installed: `vitest@4.1.11`, `vite@8.3.1` (via `vitest`), `@vitest/mocker@4.1.11`.

### 6.4 Drift conclusion

- The 93-warning lint baseline is restored and attributable; Phase 15 contributes nothing.
- The audit is **not** merely an expired exception. There is one **Critical production** finding
  (Next.js RCE, GHSA-2464-fhr4-w9xw) plus High findings in `next`, `sharp`, `source-map-js`,
  `zod` and `vite`, and the two new Moderate transitive chains.
- `package.json` and `package-lock.json` are byte-identical to HEAD (hashes above), so these
  findings are **pre-existing in the committed tree**, not introduced by Phase 15.
- Per section 9, the final status uses the audit-drift variant, and an independent
  dependency-security diagnosis is recommended. **No dependency was changed, no exception was
  extended or broadened.**

---

## 7. Validation (Node 22.13.1)

Runtime of record: Node `22.13.1`
(`C:/Users/amrko/AppData/Local/ms-playwright-go/1.50.1/node.exe`, verified with `--version`).
Repo binaries were invoked directly through that executable
(`node node_modules/vitest/vitest.mjs`, `node node_modules/typescript/bin/tsc`,
`node node_modules/eslint/bin/eslint.js`, `node node_modules/next/dist/bin/next`), so every row
below ran under Node 22.13.1. Durations are the tool-reported durations; wall times noted where
relevant.

| # | Command | Duration | Exit | Files | Tests | Warnings | Notes |
|---|---|---|---|---|---|---|---|
| 1 | `node node_modules/vitest/vitest.mjs run tests/cache-inflight-invalidation-race.test.ts` | 1.29s (wall 4.0s) | **0** | 1 | **25** | 0 | focused suite (RED-1..RED-25), 0 unhandled errors |
| 2 | `node node_modules/vitest/vitest.mjs run tests/cache-inflight-invalidation-race.test.ts tests/ai-similar-cache-invalidation.test.ts tests/redis-cache-security.test.ts tests/cache-key-normalization.test.ts tests/performance-phase2.test.ts tests/admin-chat-ai-security.test.ts tests/ai-similar-enrichment-concurrency.test.ts tests/strict-validation.test.ts` | 12.01s (wall 14.3s) | **0** | **8** | **109** | 0 | canonical targeted suite (file list below), 0 unhandled errors |
| 3 | `node node_modules/typescript/bin/tsc --noEmit` | 13.2s | **0** | — | — | 0 | no errors |
| 4 | `node node_modules/eslint/bin/eslint.js .` | 28.9s | **0** | — | — | **93** | baseline; Phase 15 = 0 |
| 5 | `node node_modules/vitest/vitest.mjs run` | 122.49s (wall 2m5s) | **0** | 45 | **499** | 0 | full suite, 0 unhandled errors |
| 6 | `node node_modules/vitest/vitest.mjs run --coverage` | 131.96s | **0** | 45 | **499** | 0 | Statements 58.76% (1257/2139), Branches 49.53% (636/1284), Functions 69.19% (164/237), Lines 60.06% (1202/2001) — identical to baseline |
| 7 | `node scripts/audit-policy.mjs` (Node 22.13.1 + npm 11.19.0 via scratch `NPM_PATH` copy) | — | **1** | — | — | — | REJECTED: 9 distinct advisory objects (production), 17 (bare); fails closed |
| 8 | `node <npm-cli.js> audit --omit=dev` (Node 22.13.1 + npm 11.19.0) | — | **1** | — | — | — | 7 vulnerabilities (3 moderate, 3 high, 1 critical) |
| 9 | `node <npm-cli.js> audit` (Node 22.13.1 + npm 11.19.0) | — | **1** | — | — | — | 24 vulnerabilities (19 moderate, 4 high, 1 critical) |
| 10 | `node node_modules/vitest/vitest.mjs run tests/audit-policy.test.ts` | 2.88s | **0** | 1 | **32** | 0 | policy tests pass |
| 11 | CI-placeholder production build: `NEXTAUTH_URL=https://ci-placeholder.invalid NEXTAUTH_SECRET=<32+ char placeholder> MONGODB_URI=mongodb://ci-placeholder.invalid/ci node node_modules/next/dist/bin/next build` | wall 2m59.6s | **0** | — | — | — | all routes compile; static + dynamic rendering succeeds |

**Canonical targeted suite (exact file list, chosen before running):**

1. `tests/cache-inflight-invalidation-race.test.ts` — Phase 15 race suite
2. `tests/ai-similar-cache-invalidation.test.ts` — Phase 12 invalidation suite
3. `tests/redis-cache-security.test.ts`
4. `tests/cache-key-normalization.test.ts`
5. `tests/performance-phase2.test.ts`
6. `tests/admin-chat-ai-security.test.ts`
7. `tests/ai-similar-enrichment-concurrency.test.ts` — AI-similar concurrency suite
8. `tests/strict-validation.test.ts` — part of the approved cache/security set per the Phase 15
   diagnosis §46 ("Admin/cache-security suites")

**Result: 8 files / 109 tests, exit 0, 0 unhandled errors.** This is the only targeted result
recorded in an active section of this report.

**External-isolation confirmation:** every targeted suite mocks its external boundaries —
`@/lib/redis` and/or `@/lib/mongodb` via `vi.mock` in all 8 files, and
`ai-similar-enrichment-concurrency` additionally re-binds `globalThis.fetch` to an in-process
mock behind a denying fetch guard. All request objects are in-process `NextRequest`
constructors (`http://localhost/...`); the only remote-looking strings are fixture data (e.g. a
Google user-image URL inside a session fixture). No test performs real network I/O, and no test
touches the live Redis/MongoDB services.

Coverage was re-run this pass (no source or test file changed, so retention was also permitted;
fresh evidence was collected anyway) and is identical to the recorded baseline. `lib/cache.ts`
remains outside `coverage.include` — observation only, per the prior W-3 note.

---

## 8. Report corrections applied (this reconciliation pass)

- **Current-source truth check recorded:** the producer early return is **absent** from the
  current `lib/cache.ts`; therefore `lib/cache.ts` was **not modified** this pass.
- **Stale code excerpt replaced:** the §1.2 excerpt from the older implementation (containing
  `if (!currentEntry || currentEntry !== entry) { return; }`) is removed and replaced with the
  current microtask structure (§1.2) and current line references (§1.3).
- **Line references updated** throughout: promise 377–382, entry 384–387, registration 391,
  capacity eviction 394–403, cache lookup 408–421, microtask 431, write gate 438, resolve 443,
  reject 446, finally 449–451, return 456; `delete()` registry removal 225; scoped matcher 291
  and 346.
- **Final focused count:** single value **25** (RED-1..RED-25); the "22" chain and the "15
  initially failed" claim appear only in the chronology (section 11).
- **Targeted suite:** one canonical command, one file list, one result — **8 files / 109 tests,
  exit 0**. The earlier conflicting counts (6 files / 74 tests; 7 files / 103 tests) appear only
  in the chronology (section 11).
- **RED-23 / RED-24 / RED-25** individually recorded with full settlement evidence (§1.5),
  including proof that no Promise remains pending.
- **Local-vs-remote release branch wording corrected:** no local release branch exists; the
  remote release branch exists at `origin/release/phases-2-11-verified` (head `6f0595ab`);
  PR #14 uses that remote head (verified `OPEN`, not merged); no remote ref moved.
- **Final Phase 15 attribution:** modified source `lib/cache.ts`; new focused test
  `tests/cache-inflight-invalidation-race.test.ts`; diagnosis report
  `docs/reports/diagnostics/BUG-CACHE-INVALIDATION-INFLIGHT-REPOPULATION-DIAGNOSIS.md`;
  completion report (this file). Reviewed the diagnosis for factual cross-reference accuracy —
  no correction required.
- **Final Git inventory:** recomputed hashes for all 8 controlled files; `lib/cache.ts`
  `f90db789d3fe3ade` and the test file `f659a660ef32b03a` replace stale values; the six
  dependency/CI/audit files are byte-identical to HEAD.
- **Audit drift updated to current registry state:** live policy 9/17 (was 7/15); raw
  production 7 vulnerabilities including the new `glob`/`minimatch` moderate chains; raw bare 24
  vulnerabilities / 17 distinct advisories; braces still absent; expired braces exception not
  extended.
- **Live-policy runtime mechanism documented** (Node 22.13.1 + npm 11.19.0 via a read-only
  scratch `NPM_PATH` copy, because the script's own npm resolution cannot find npm next to the
  Playwright-bundled Node 22 runtime and fails closed).
- **Exact Phase 12 expression preserved:**
  `buildCacheKey(CACHE_SCOPES.aiSimilar, \`${id}:v2\`)` — verified at `lib/cacheManager.ts:33`.
- **Report filename spelling** `PHASE-15-CACHE-INVALIDATION-INFLIGHT-REPOPULATION-CORRECTION-COMPLETION-REPORT.md`.

---

## 9. Final status

**`CACHE IMPLEMENTATION PASS — RELEASE GATE BLOCKED ON DEPENDENCY AUDIT DRIFT`**

Rationale — every condition for this status is met:

- No pending-Promise path remains (structurally: the producer chain has exactly two exits,
  `resolve` at 443 / `reject` at 446, with no early return; proven by RED-23/24/25).
- All **25** focused tests pass.
- The canonical targeted suite passes (8 files / 109 tests, exit 0).
- Typecheck (0), lint (0 errors / 93 baseline warnings), full suite (45 files / 499 tests),
  coverage (58.76 / 49.53 / 69.19 / 60.06, identical to baseline), and the CI-placeholder
  production build (exit 0) all pass.
- Current source and this report agree (verified line-by-line in §1.1–§1.3).
- The live audit blocker is accurately inventoried (§6): fail-closed rejection on 9 production
  / 17 bare distinct advisory objects, including one Critical Next.js RCE.

The release gate is blocked solely by dependency audit drift. Because a Critical production
dependency finding exists, an **independent dependency-security diagnosis** is recommended
before any release. The expired braces exception is **not** an active blocker (`braces` absent
from the inventory) and was **not** extended.

---

## 10. Change control

| Check | State |
|---|---|
| Only approved Phase 15 files changed | ✅ working tree: `lib/cache.ts` (modified, uncommitted), `tests/cache-inflight-invalidation-race.test.ts` (new, uncommitted); this pass edited only this report |
| `package.json` unchanged | ✅ hash `8896865a3da9ad77` |
| `package-lock.json` unchanged | ✅ hash `a8f5214eeb5af038` |
| Audit-policy files unchanged | ✅ `scripts/audit-policy.mjs` (`a06a4bee439de9f1`), `tests/audit-policy.test.ts` (`e634356a6c78b7e6`), `config/audit-exceptions.json` (`ee7a771fc1c1e6dd`, expiry NOT extended) |
| CI unchanged | ✅ `.github/workflows/ci.yml` (`5dd400d1c953cd99`) |
| Index empty | ✅ `git diff --cached --stat` empty |
| HEAD unchanged | ✅ `a89c1fb39df3139c7200fcd172357df3b247c54e` |
| No commit | ✅ |
| No push | ✅ |
| No merge | ✅ |
| No deployment | ✅ |
| Local release branch | does not exist |
| Remote release branch | ✅ exists at `origin/release/phases-2-11-verified` (`6f0595ab`), unchanged |
| PR #14 unchanged | ✅ `OPEN`, not merged, head `release/phases-2-11-verified` @ `6f0595ab` |

---

## 11. Chronology of superseded counts (historical only)

The values in this section are **historical records of earlier drafts and failed attempts**.
They are deliberately retained as a chronology and are superseded by the active sections above;
they must not be read as current results.

- An earlier draft of this report recorded a focused count of **22**; the suite was extended
  with RED-23/24/25 to 25, and an even earlier "15 tests initially failed" claim was withdrawn
  as unsupported (section 4).
- An earlier targeted run used 6 files / 74 tests (a different file set that included
  `tests/cache-personalization.test.ts` and `tests/redis-queue-calibration.test.ts`), and a
  later summary recorded 7 files / 103 tests. Neither matches the approved Phase 15 set from the
  diagnosis (§46); both are superseded by the single canonical run in §7 (8 files / 109 tests).
- An earlier draft recorded the live audit policy rejection as 7 production / 15 bare advisory
  objects and the raw production audit as 4 vulnerabilities; registry drift has since raised
  these to 9 / 17 and 7 (§6).
- An earlier draft recorded `lib/cache.ts` hash `9a752b40c1b69cad` and test hash
  `1405b8d4cadab734` and a tracked diff of 117 insertions / 26 deletions; the current values are
  `f90db789d3fe3ade`, `f659a660ef32b03a`, and 138 / 40 (§0).
- An earlier draft claimed the live audit policy ran on Node 22.13.1; under the
  Playwright-bundled Node 22 that is only possible with the `NPM_PATH` mechanism documented in
  §6.1 (the script otherwise fails closed with "npm audit produced no output").

---

## Final summary

- **Early return in producer microtask:** **absent** (verified by full read of current
  `lib/cache.ts`); no source modification was needed or made this pass.
- **Current producer-settlement behavior:** the producer always runs and settles the original
  promise — `resolve(freshData)` on success (line 443), `reject(err)` on throw/rejection (line
  446); writes are gated on `!entry.invalidated && ce === entry && freshData !== undefined`
  (438); `finally` removes the registry entry only when it still points at this entry (449–451).
- **Final focused count:** **25** (RED-1..RED-25), all pass.
- **RED-23 (delete before producer microtask):** **PASS** — producer runs once, caller settles
  to `'VALUE'`, neither tier written, later call starts a fresh producer.
- **RED-24 (capacity eviction before producer microtask):** **PASS** — evicted flight runs and
  settles to `'EVICTED'`, writes to neither tier, its finally cannot remove a newer entry,
  non-evicted flights settle normally.
- **RED-25 (scoped clear before producer microtask):** **PASS** — producer runs once, caller
  settles to `'VALUE'`, neither tier written.
- **Canonical targeted command and count:** 8 files (Phase 15 race, Phase 12 invalidation,
  redis-cache-security, cache-key-normalization, performance-phase2, admin-chat-ai-security,
  AI-similar concurrency, strict-validation) / **109 tests**, exit 0, 0 unhandled errors.
- **Typecheck:** 0 errors (Node 22.13.1).
- **Lint:** 0 errors / 93 warnings (all pre-existing; Phase 15 contribution 0).
- **Full suite:** 45 files / 499 tests, exit 0 (Node 22.13.1).
- **Coverage:** 58.76 / 49.53 / 69.19 / 60.06 — identical to baseline (re-run this pass).
- **Build:** CI-placeholder production build exit 0, all routes compile (Node 22.13.1).
- **Audit blocker:** dependency audit drift — live fail-closed policy REJECTED on 9 production
  / 17 bare distinct advisory objects; raw production audit 7 vulnerabilities (3 moderate,
  3 high, 1 critical, incl. Next.js RCE GHSA-2464-fhr4-w9xw); raw bare audit 24
  vulnerabilities. `braces` absent from the inventory; expired braces exception not extended.
- **Git state:** branch `work/phase-12-cache-invalidation-diagnosis`, HEAD `a89c1fb` unchanged,
  index empty, tracked diff `lib/cache.ts` only (138/40), focus test untracked; remote `origin`
  present, `origin/main` = `bcdb834`, no local release branch, remote
  `origin/release/phases-2-11-verified` = `6f0595ab` unchanged, PR #14 OPEN unchanged; no
  commit, no push, no merge, no deployment.
