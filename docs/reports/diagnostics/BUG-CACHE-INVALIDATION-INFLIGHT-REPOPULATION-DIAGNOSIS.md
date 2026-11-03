# Phase 15 — Cache Invalidation / In-Flight Producer Race Diagnosis
## BUG-CACHE-INVALIDATION-INFLIGHT-REPOPULATION (Provisional Finding CACHE-RACE-001)

> **STEP 1 — READ-ONLY DIAGNOSIS.** No fix was implemented. No production source,
> tests, packages, lockfiles, configuration, CI, audit-policy files, or the audit
> exception were modified. Nothing was staged, committed, pushed, merged, or
> deployed. No real Redis, database, Gemini, TMDB, or production admin endpoint
> was contacted. The only Phase 15 repository artifact is this report.

---

## 1. Executive summary

The defect **exists in the current implementation**, is **deterministically
reproduced** below, and is **generic**: it affects **every** `RedisCache.getOrSet`
producer in the application (19 production call sites across 19 route files), on
**both storage tiers** (in-process memory and shared Redis), for **any** deletion
path — `redisCache.delete`, `invalidateMovieCache` / `invalidateTVCache` /
`invalidateHomeCache`, `invalidateCacheKey`, and the namespace-wide
`clearAllCache`/`clearScoped`/`clearMemoryPrefix` clears.

**Mechanism.** `lib/cache.ts:336–348` — when a cache miss enters `getOrSet`, the
producer's resolution handler writes the result with an **unconditional**
`this.set(namespacedKey, freshData, ttl)`. `delete(key)` (`lib/cache.ts:206–215`)
removes the memory entry and issues a Redis `DEL`, but it has **no mechanism to
observe, gate, cancel, or wait for** a producer that is already running for that
key: the module-level `inflightPromises` registry is **not touched by `delete`**,
and no generation token, tombstone, or write guard exists. Consequently a producer
that started before invalidation and finishes after it writes its pre-invalidation
result **back into both tiers after the invalidation completed**, resurrecting the
stale entry until TTL expiry (3600 s default, 86400 s for AI-similar).

**Reproduction.** A deterministic harness driving transpiled copies of the *exact*
production `lib/cache.ts` + `lib/cache-namespace.ts` logic (only the `./redis`
import rewired to a controlled fake), synchronized with deferred promises and
microtask flushes — no sleeps — reproduced the race in **22/22 checks across 8
scenarios**: memory-only repopulation (S1), two-tier (memory + FakeRedis)
repopulation (S2), request B joining the stale in-flight producer and receiving
its output (S3), rejection-after-invalidation causing no repopulation (S4), plus
isolation/normal-behavior controls (S5–S8). This is the same residual risk
recorded as **R6** in the Phase 12 diagnosis (§13/§40) and Phase 12 report (§44),
which was then classified `DETERMINISTIC STATIC`; Phase 15 upgrades it to
`DETERMINISTIC TARGETED TEST`.

**Request B.** A request arriving after invalidation but before producer A
resolves **joins producer A's in-flight promise** (the registry entry survives
`delete`), receives A's stale output, and triggers **no** fresh producer.

**Cross-process.** The in-flight registry and any process-local token are
process-local; the Redis tier is shared. A second instance's producer can
repopulate the shared Redis key after a first instance's invalidation. A
process-local mechanism fixes only the same-process race; cross-process
correctness requires a shared mechanism (Redis-side conditional write, pub/sub
invalidation) — classified here as a **separate larger finding**, not silently
included in a small Step 2 fix.

**Preferred correction.** A per-key, process-local **mutable invalidation token**
in `lib/cache.ts` alone: `getOrSet` registers an entry `{ promise, invalidated }`
for the fully namespaced key before producer execution; `delete` finds the
current entry, sets `entry.invalidated = true`, removes that exact entry from
the registry, then performs the existing memory and Redis deletion. The old
producer's `.then` writes **only while its own entry remains non-invalidated**.
Its `.finally` removes the registry entry **only if** the registry still points
to the same entry object (`if (inflightEntries.get(key) === entry) { ... }`),
so a superseded producer never removes a newer producer's entry. Request B after
invalidation finds no entry and starts a fresh producer with a new entry.
`clearScoped`, `clearMemoryPrefix`, and full clear invalidate and remove
matching in-flight entries directly, keyed by fully namespaced key — not only
the current memory-cache inventory. No separate generation map, no clock or
timestamp, no unbounded metadata map, no public API change. Cross-process
producers remain a separately documented residual risk.

**Security impact.** LOW. No authorization, session, or rate-limit state flows
through `getOrSet` (rate limiting uses its own atomic INCR path). All `getOrSet`
values are public TMDb-derived content and AI-similar recommendations; the
`user:recommendations` scope is written via direct `get`/`set` (not `getOrSet`)
and has no targeted invalidation. The defect is a stale-data-resurrection /
admin-invalidation-window issue, not a privilege boundary violation.

**Step 2 readiness: READY.**

---

## 2. Diagnostic status

**PASS** — every completion criterion of prompt §18 was met: lifecycle
reconstructed, registry documented, timeline established, both tiers determined,
request-B behavior determined, cross-process limits classified, cancellation
assessed, six-plus options compared, memory-growth assessed, security impact
assessed, existing tests inventoried, deterministic safe reproduction executed
(22/22), RED plan defined, preferred fix selected, exact Step 2 files listed,
validation plan defined, repository and external state preserved, no
commit/push/merge/deployment.

---

## 3. Finding identity

| Field | Value |
|---|---|
| Provisional finding ID | CACHE-RACE-001 |
| Bug ID | BUG-CACHE-INVALIDATION-INFLIGHT-REPOPULATION |
| Phase | 15 (Step 1 — read-only diagnosis) |
| Prompt type | READ-ONLY CONCURRENCY AND CACHE-CORRECTNESS DIAGNOSTIC |
| Risk level | MEDIUM TO HIGH (per prompt) |
| Primary files | `lib/cache.ts` (defect site), `lib/cacheManager.ts` (deletion entry points) |
| Commit policy | COMMIT_ALLOWED: **NO** — honored |
| Staging / push / merge / deployment | **NO** — honored |
| External cache mutation | **NOT ALLOWED** — none performed |
| GitHub Actions | not required, not used (account-level billing lock; unchanged) |

---

## 4. Relationship to CACHE-OPS-001

Phase 12 (CACHE-OPS-001) closed the *key-coverage* gap: it added
`buildCacheKey(CACHE_SCOPES.aiSimilar, \`${id}:v2\`)` to `invalidateMovieCache`
so the AI-similar v2 key is deleted together with `movie:{id}:{details,recommendations,similar}`.
Phase 12 Step 1 explicitly flagged the *in-flight repopulation* race as
**separate residual risk R6** ("In-flight producer repopulation after deletion
(`getOrSet` dedup; no generation guard) — LOW — OPEN, pre-existing for all keys;
not introduced/worsened/resolved here"), and hypothesis H14 of that diagnosis was
recorded **UNRESOLVED** with "Not exercised by any test; no generational guard
exists".

Phase 15 is the formal, dedicated diagnosis of that residual risk: it (a) confirms
the race exists in the current implementation, (b) upgrades reproducibility from
`DETERMINISTIC STATIC` (source-structure argument only) to
`DETERMINISTIC TARGETED TEST` (executed reproduction, 22/22), (c) extends the
scope analysis from the AI-similar key to the full 19-call-site inventory and all
deletion paths, and (d) selects the correction pattern and exact Step 2 scope.
Phase 12's correction remains correct and necessary — without it the key is never
deleted at all; the present race is an independent defect in the delete-vs-write
ordering inside `lib/cache.ts`.

---

## 5. Initial environment

| Item | Value |
|---|---|
| Operating system | Windows 10 (MSYS_NT-10.0-19045, x86_64) |
| Shell | bash (git-bash / MSYS — POSIX syntax) |
| Node version | v24.21.0 (shell default) |
| npm version | 11.5.2 |
| Git version | 2.50.1.windows.1 |
| Tooling note | The hermes-managed git binary was locked (exit 126, AV/owner lock); the system Git for Windows (`<system-git>/git.exe`) was used instead. No repository state depends on which git binary was used. |
| Cache scratch root | `<external-scratch>/p15-repro` (outside the repository) |

Production runtime of record (from prior phases): Node 22.13.1; CI pins Node 22.
This Step 1 phase performed no build/test execution inside the repository, so the
shell's default Node is recorded as observed; Node version is immaterial to a
read-only diagnosis.

---

## 6. Initial Git state

| Item | Value |
|---|---|
| Branch | `work/phase-12-cache-invalidation-diagnosis` |
| Exact HEAD | `a89c1fb39df3139c7200fcd172357df3b247c54e` (matches expected `a89c1fb`) |
| Recent commits | `a89c1fb` (restore approved braces exception expiry) ← `141635a2f3825f6c6ddf0e2d4a64907c75e0cfd9` (invalidate ai cache and gate unpatched brace risk) ← `6f0595a` ← `92284cf` ← `1e3605a` |
| Upstream | no upstream configured for this local branch (local-only work branch); `origin` = `https://github.com/amrhanyy/movie-recommendation-system.git` |
| `git status --porcelain=v2 --branch` | clean branch header; untracked paths only (below) |
| `git diff --cached --name-status` | **empty** (index empty) |
| `git diff --name-status` | **empty** (tracked working tree identical to HEAD) |
| Untracked paths | known scratch only — never committed: `.chunks/` (25 files), `.my_tool_sandbox/` (20 files), `.inbox3.txt`, `.phase11-prompt.txt`, `as_route_copy.txt`, `cqq.txt`, `cqq_full.txt`, `failed_block.txt`, `nul`, `p14_evidence.json`, `route_dump.txt` |
| Phase 15 artifacts before this report | **none** |
| Remote refs | `origin/main`, `origin/release/phases-2-11-verified`, PR #14 — **untouched** (no fetch/push/branch operations performed) |

Baseline hashes (recorded before any diagnostic action):

| File | SHA-256 |
|---|---|
| `lib/cache.ts` | `6491ab38c6331fb96d4c2c47d70b28428af379680d4e27a2a4c92a9fb888c412` |
| `lib/cacheManager.ts` | `ef8a9d3a386af451834a9b370b67333da5efe9242519f538b6cf81b6ced3493d` |
| `lib/cache-namespace.ts` | `d7e150e02c44c9001b67c3b2a09ac9c7d1ed182772a0c359c82573dea336fa70` |
| `tests/ai-similar-cache-invalidation.test.ts` | `e56be0ebe6b3ce3b9191315bbb11dcbe7d92ec260f483b56bb368811955e44c2` |
| `package.json` | `8896865a3da9ad773780f45e94b19e379ec00baf285c20b2e25f9cb9166c2468` |
| `package-lock.json` | `a8f5214eeb5af038be95c9621e761826bae6447939a1b2bba3bb8184c208c87f` |
| `config/audit-exceptions.json` | `ee7a771fc1c1e6dd80e3cb4a0c0c9378ed6b50411c4d34a130e21f28161544d3` |
| `scripts/audit-policy.mjs` | `a06a4bee439de9f1bd289d7f226863c16b897372e8ea06ee98c5ca1ae36b4bf2` |

Exception expiry from the committed record (`config/audit-exceptions.json`,
`BRACES-EXC-2026-10-03-GHSA-vfj7-8cjw-p6xm`): **2026-10-17T23:59:59Z**. Phase 15
did not alter, extend, or re-evaluate this exception (prompt forbids it); the
value is recorded verbatim. Note for Step 2 planning: as of the diagnosis date
(2026-10-29) that date is in the past — the audit-policy gate's standing is an
owner decision outside this phase's read-only scope.

---

## 7. Files and symbols inspected

Production source (read in full):

- `lib/cache.ts` (366 lines) — `RedisCache` class; `safeRedisOp`, `ns`, `set`
  (L147–165), `get` (L167–184), `getFromMemoryCache` (L186–204), `delete`
  (L206–215), `scanNamespacedKeys` (L221–249), `clearScoped` (L255–292),
  `clearMemoryPrefix` (L297–307), `getOrSet` (L313–359); module state
  `memoryCache` (L15, bounded 5000 + TTL + LRU), `inflightPromises` (L25, bounded
  1000), `redisOfflineLogged`, `lastMemoryCleanup`.
- `lib/cache-namespace.ts` (89 lines) — `CACHE_NAMESPACE`, `CACHE_SCOPES`,
  `normalizeKeyComponent`, `buildCacheKey`, `applyNamespace`, `isNamespacedKey`,
  `MAX_KEY_LENGTH`.
- `lib/cacheManager.ts` (228 lines) — `invalidateMovieCache` (L22–36),
  `invalidateTVCache` (L41–49), `invalidateHomeCache` (L54–60),
  `invalidateCacheKey` (L61–63), `getCacheStats`, `clearAllCache` (L165–169),
  `findCacheKeys`, `listKeys`.
- `app/api/movie/[id]/ai-similar/route.ts` (363 lines) — `GET`, producer at
  L180–351, `getAISimilarMovies` (Gemini client with 3-retry backoff +
  `AbortController` timeout), pool-4 TMDB enrichment.
- `app/api/admin/cache/route.ts` (250 lines) — `GET` stats/list, `POST`
  invalidate (movie/tv/home) + clear, `DELETE` clear; `requireAdmin`,
  same-origin, Zod schemas, rate limiting.
- `app/api/ai-recommendations/route.ts` (partial: L225–265, L533) — direct
  `redisCache.get` / fire-and-forget `redisCache.set`, `user:recommendations`
  scope keyed by a snapshot hash.
- `app/api/watchlist/details/route.ts` (partial: L30–75) — per-item
  `getOrSet<TMDBDetails>` fan-out, pool-bounded.
- `lib/redis.ts` (partial: L1–60) — singleton client, `getRedisClient` returns
  `RedisClientType | null`.
- `lib/security/rateLimit.ts` (partial: L1–130) — own `memoryStore`, no
  `RedisCache`/`getOrSet` usage (independent INCR-based path).

All 19 `getOrSet` call-site route files (inventory in §25).

Tests (read or scoped):

- `tests/ai-similar-cache-invalidation.test.ts` (296 lines, read in full —
  Scenarios A/B/C).
- `tests/redis-cache-security.test.ts` (434 lines, read in full — R4-A…R4-H,
  FakeRedis, R4-G stampede protection).
- `tests/ai-similar-enrichment-concurrency.test.ts` (scoped: 22 `it` titles —
  warm-hit/cold-miss producer volume, pool-4, caching contracts).
- `tests/cache-key-normalization.test.ts` (scoped: 2 `it` — ns() normalization).
- `tests/performance-phase2.test.ts` (scoped: R1/R3-A/R3-B/R3-C; local
  in-flight-shaped helper at L74–95 used for trending/mood/watchlist checks).
- `tests/admin-chat-ai-security.test.ts`, `tests/strict-validation.test.ts`
  (scoped — admin auth matrix; cacheManager mocked at L57–60 of strict-validation).
- `tests/redis-queue-calibration.test.ts` (scoped — queue-cap calibration; no
  invalidation interaction).

Reports (read or scoped):

- `docs/reports/diagnostics/BUG-AI-SIMILAR-CACHE-INVALIDATION-GAP-DIAGNOSIS.md`
  (§13 in-flight producer behavior, §40 race implications, H14, R6 — read).
- `docs/reports/PHASE-12-AI-SIMILAR-CACHE-INVALIDATION-CORRECTION-COMPLETION-REPORT.md`
  (§25/§44 R6 residual-risk table — read).
- `docs/reports/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-CORRECTION-COMPLETION-REPORT.md`
  (producer-boundary history — scoped).
- `docs/reports/diagnostics/BUG-BRACES-UNPATCHED-STACK-EXHAUSTION-DIAGNOSIS.md`
  and `docs/reports/PHASE-14-BRACES-UNPATCHED-ADVISORY-EXCEPTION-COMPLETION-REPORT.md`
  (referenced for audit-exception state; not re-analyzed here).
- The prompt's optional `BUG-AI-SIMILAR-CACHE-HIT-REENRICHMENT-DIAGNOSIS.md` is
  **absent**; the canonical Phase 9 diagnosis
  `PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-DIAGNOSIS.md` and the Phase 9
  completion report were read instead, as the prompt instructs.

Repository instructions:

- `AGENTS.md` — **absent** (no such file).
- `.cursor/rules/*.mdc` — **absent** (no such directory).
- `package.json` — scripts: `dev`, `build`, `start`, `lint` (eslint),
  `typecheck` (tsc --noEmit), `test` (vitest run), `test:watch`,
  `test:coverage`, `verify`, `setup-db`, `test-redis`.
- `vitest.config.mts` — two projects (`node` env for `tests/**/*.test.ts`,
  `dom` env for `tests/**/*.test.tsx`); coverage `include` does **not** cover
  `lib/cache.ts` / `lib/cacheManager.ts` (prior observation W-3, unchanged).
- `.github/workflows/ci.yml` — PR/push(main), Node 22, frozen lockfile
  (account-level billing lock keeps CI unavailable; unchanged by this phase).

No listed file was modified. Where a listed file was absent, the canonical
equivalent was used or the absence was recorded; no content or path was
fabricated.

---

## 8. Cache lifecycle

Reconstructed from the actual awaited control flow of `lib/cache.ts` (line
numbers are the source of truth; method names are not relied on for ordering).

### `set(key, value, expireInSeconds?)` — L147–165

1. `ns(key)` — idempotent namespace + per-component normalization + 512-char cap.
2. `JSON.stringify(value)`.
3. `expirySeconds ||= 3600` (default 1 h).
4. **Memory write first, always**: `memoryCache.set(namespacedKey, {value,
   expiry: now + expirySeconds*1000, lastAccess: now})` (only if
   `expirySeconds > 0`). This write never fails.
5. **Redis write best-effort, awaited**: `safeRedisOp(redis => redis.set(key,
   value, {EX}))`. Errors are logged (rate-limited) and swallowed; the operation
   result is discarded unless the promise rejects, which `safeRedisOp` converts
   to `null`.

### `get<T>(key)` — L167–184

1. `ns(key)` (idempotent; a key already carrying the namespace passes through).
2. **Redis first**: `safeRedisOp(redis => redis.get(key))`; on a truthy string,
   `JSON.parse` and return. A parse failure silently falls through.
3. **Memory fallback**: `getFromMemoryCache` — entry absent → `null`; expired
   (`entry.expiry < now`) → delete + `null`; otherwise bump `lastAccess`,
   `JSON.parse`, return.

### `getOrSet<T>(key, fetchFn, expireInSeconds?)` — L313–359

1. `namespacedKey = ns(key)`.
2. `try { cachedValue = await this.get(namespacedKey) } catch { /* swallowed */ }`;
   non-null → **return cached** (warm path; producer never runs).
3. `existing = inflightPromises.get(namespacedKey)`; if present → **return the
   shared in-flight promise** (`existing as Promise<T>`) — same-key coalescing.
4. Otherwise: `origin = fetchFn()` is invoked **synchronously at this point**
   (producer start, T3). `.then((freshData) => { if (freshData !== undefined) {
   this.set(namespacedKey, freshData, expireInSeconds).catch(() => {}) } return
   freshData })` — the cache write is **fire-and-forget** (`.catch` attached, not
   awaited) and **unconditional**.
5. `.finally(() => inflightPromises.delete(namespacedKey))` — registry entry
   removed on resolve **and** reject.
6. Registry bound: if `size >= 1000`, evict the oldest key (insertion order).
7. `inflightPromises.set(namespacedKey, origin)`; `return origin`.

### `delete(key)` — L206–215

1. `ns(key)`.
2. `memoryCache.delete(namespacedKey)` — immediate memory removal.
3. `await safeRedisOp(redis => redis.del(namespacedKey))` — best-effort Redis
   deletion; failure is swallowed (degraded to memory-only invalidation).
4. **The in-flight registry `inflightPromises` is never read, removed, or
   bumped. No generation/tombstone state exists.**

### `clearScoped(match, maxDelete)` — L255–292 (used by `clearAllCache`)

1. `clearMemoryPrefix(match)` — synchronous prefix-scoped memory deletion.
2. Redis: bounded `SCAN` + batched `DEL` under `safeRedisOp`; on Redis
   unavailability returns a degraded result.
3. **In-flight registry untouched; no generation/tombstone state exists.**

### Cleanup / housekeeping

- `cleanupMemoryCache()` — periodic (60 s) expiry sweep + LRU cap at 5000.
- In-flight map — bounded at 1000 with oldest-first eviction on insertion.

### Chronological flows (numbered)

1. **Clean miss, no concurrency:** `getOrSet` → `get` (Redis miss, memory miss)
   → registry empty → producer runs → resolves → fire-and-forget `set` (memory
   then Redis) → `.finally` removes registry entry → `getOrSet` returns value.
2. **Two same-key misses, one process:** A passes step 2/3, registers `origin`,
   starts producer. B enters, `get` misses, finds registry entry at step 3 →
   returns the **same promise**; producer executes once.
3. **Invalidation before producer starts:** key simply absent at step 2 →
   producer starts after deletion → `set` writes (correct: the producer is
   post-invalidation, its data is current) → no defect.
4. **Invalidation during producer execution:** `delete` removes memory + Redis
   entries; registry entry survives; producer continues; on resolve, the
   unconditional `.then` writes the stale result back into memory and Redis →
   **DEFECT (the subject of this phase)**.
5. **Invalidation after producer completion but before the cache write —
   structurally possible:** yes. The `origin` promise resolves to the caller
   after the producer resolves, but `this.set(...)` inside `.then` is
   **fire-and-forget**: `set` performs a memory write and then `await`s
   `safeRedisOp`. Between producer resolution and the memory write's execution
   (and again before the Redis write completes) there is at least one async
   boundary; a `delete` that lands in that window still races the pending write.
   Same defect class.
6. **Invalidation after cache write:** both tiers already hold the value;
   `delete` removes both → correct (this is what Phase 12 Scenario B/C assert
   with no producer in flight).
7. **Producer rejection during invalidation:** `.then` is skipped (rejection
   propagates), no `set` occurs; `.finally` still removes the registry entry →
   retry semantics preserved; no repopulation. Verified as S4.
8. **Redis unavailable during invalidation:** `delete` removes the memory entry;
   `safeRedisOp` returns `null` (swallowed) → the Redis entry **survives**
   silently. A later `get` (memory empty) falls through to Redis and reads the
   stale entry. Multi-tier consistency gap — recorded as a remaining finding
   (§50), distinct from the in-flight race.
9. **Redis unavailable during the producer's final write:** `set` writes the
   memory tier (always succeeds) → memory repopulation still occurs (S1 proves
   this tier independently); the Redis write fails silently, so any *old* Redis
   entry persists until its own TTL. The in-flight race's memory-tier component
   is therefore **not mitigated by Redis availability**, and conversely a Redis
   outage during invalidation cannot prevent the producer's later Redis write
   once Redis recovers (the write is a plain `SET`, not conditional).

---

## 9. Memory behavior

- Memory tier is a module-level `Map` (L15), process-local, bounded at 5000
  entries with per-entry TTL and LRU eviction (F-031).
- `delete` removes the entry immediately and synchronously (L209).
- The producer's `.then` re-inserts the entry via `set` (L154–158) with the
  configured TTL. Nothing gates this write against a `delete` that happened
  between producer start and producer resolution.
- **Result:** the memory tier is deterministically repopulated with the stale
  value after invalidation (S1, 22/22 reproduction). All subsequent reads in
  this process (Redis up or down) hit the resurrected memory entry until TTL
  expiry.
- Even during a Redis outage (memory-only mode), the resurrection persists —
  the memory tier is the *first* write in `set` and never fails.

## 10. Redis behavior

- Redis tier is shared (single client singleton, best-effort writes via
  `safeRedisOp`).
- `delete` issues `DEL namespacedKey` (L212–214) — an unconditional, non-atomic
  (relative to any producer) deletion.
- The producer's `.then` → `set` → `redis.set(namespacedKey, value, {EX})` is an
  **unconditional SET**. There is no `SET ... NX`/`XX`/compare-and-swap, no
  version check, no Lua.
- **Result:** the shared Redis key is also repopulated after invalidation (S2),
  so *every* process (not just the producing one) serves the resurrected entry
  until TTL expiry. The resurrection is therefore **not** process-local once
  Redis is the backend.
- Redis unavailability during either phase does not prevent the memory-tier
  resurrection (§8 case 8/9).

---

## 11. In-flight registry contract

| Property | Value |
|---|---|
| Registry name | `inflightPromises` |
| Module scope | `lib/cache.ts` module level (L25) — **process-local**, not exported |
| Key format | fully namespaced cache key (`ns(key)` output, incl. normalization + 512 cap) — identical to `memoryCache` keys and to the keys `delete` computes |
| Value type | the `origin` promise produced by `fetchFn().then(write).finally(cleanup)` |
| Insertion point | `getOrSet` step 7, after producer start (L357) |
| Lookup point | `getOrSet` step 3 (L331) — only on a cache miss |
| Deletion point | `.finally` on resolve/reject (L347); oldest-entry eviction when `size >= 1000` (L351–356) |
| Cleanup mechanism | `.finally` (both outcomes) + bounded-LRU eviction |
| Rejection behavior | rejection propagates to all joined callers; registry entry removed; no `set` occurs (S4) |
| Maximum size | 1000 (`MAX_INFLIGHT_ENTRIES`) |
| Eviction | oldest-first (Map insertion order) when at capacity |
| Same-key behavior | callers share one origin promise (coalescing, F-055) |
| Different-key behavior | independent entries, independent producers |
| Cross-process behavior | **none** — the map lives only in this process's module instance |

**`delete(key)` vs the registry:** removes the memory entry, issues Redis `DEL`,
and **ignores the registry entirely** — it neither removes, marks, waits for,
nor cancels the in-flight producer (verified: no reference to
`inflightPromises` anywhere outside `getOrSet`, §8). Because the origin promise
itself holds the closure that performs the unconditional `set`, even *deleting
the registry entry* would not stop the pending write (see Option C, §30).

Consequences of invalidation while a producer runs (all verified):

1. memory entry — deleted at T4, **re-written at T6**;
2. Redis entry — deleted at T4, **re-written at T6**;
3. in-flight producer — **continues** (nothing signals it);
4. producer issues a later `set` — **yes** (unconditionally, L337–342);
5. stale value reappears — **yes, on both tiers, until TTL**.

Classification by consumer class:

| Class | Behavior |
|---|---|
| Current process, memory | stale producer output re-written into `memoryCache` (S1) |
| Current process, Redis client | stale producer output re-written to shared Redis (S2) |
| Another process reading Redis | sees the resurrected shared key (cross-process resurrection via Redis) |
| Another process running its own producer | its own write-after-invalidation ordering defect applies independently (§22) |

---

## 12. Same-key coalescing

Coalescing is keyed on the fully namespaced key and joins any later miss to the
existing origin promise (`getOrSet` step 3). It is **preserved** by every option
considered except where explicitly discussed (Option C's eviction side effects).
Existing proof: `tests/redis-cache-security.test.ts` R4-G "ten concurrent
same-key misses call origin once" (L261–275) and S7 of this phase's reproduction
(10 concurrent misses → exactly 1 origin call, all 10 share the result).
Coalescing is orthogonal to the race: the race exists *because* the shared
promise's `.then` writes unconditionally, not *because* callers are coalesced.

## 13. Different-key behavior

Independent: per-key registry entries, per-key memory entries, per-key Redis
keys. `delete(key)` does not affect any other key's producer or entry
(S5 — an unrelated key's producer continued, wrote, and cached normally while
the first key was invalidated). A correction must therefore be per-key, not
global.

## 14. Delete behavior

`delete` (L206–215): memory delete (sync) + Redis `DEL` (best-effort `await`).
It is a **blind delete**: no check of the registry, no bump of any version, no
tombstone, no barrier. Its correctness depends on no producer for that key being
in flight — an assumption the application cannot guarantee for any
`getOrSet`-backed key with a non-trivial producer (notably AI-similar, whose
producer spans a Gemini call with retries plus up to 12 TMDB enrichment
searches: seconds of wall time).

## 15. Producer-completion behavior

On producer resolution, the `.then` handler: writes via fire-and-forget `set`
unless the resolved value is `undefined` (the route's intentional "never cache
empty" contract, Phase 9 CACHE-FIX-7), returns the value to all joined callers,
and `.finally` releases the registry entry. On rejection: no write, registry
entry released, callers receive the rejection (S4). The completion path contains
**no invalidation-awareness whatsoever** — the producer cannot learn that its
key was invalidated while it was running.

---

## 16. Exact T0–T8 race timeline

Symbolic checkpoints, with the source evidence for each transition:

| Checkpoint | Event | Code site | Permitted? | Evidence |
|---|---|---|---|---|
| T0 | key absent (cold) | — | — | `get` returns null, null |
| T1 | request A enters `getOrSet` | L313 | yes | step 2 `get` misses |
| T2 | A registers the in-flight promise | L357 | yes | step 7 `inflightPromises.set` |
| T3 | producer A starts (sync invocation) | L336 | yes | `fetchFn()` called inline |
| T4 | admin invalidation deletes memory + Redis key | L209, L212–214 | yes | `delete` runs; registry untouched (L206–215) |
| T5 | producer A resolves to a stale (pre-invalidation snapshot) value | L337 | yes | producer closure captured inputs before T4 |
| T6 | `getOrSet` writes the resolved value | L339 | **yes — defect** | unconditional `this.set(...)`, no generation gate |
| T7 | in-flight entry removed | L347 | yes | `.finally` |
| T8 | request B reads the key | L167–184 | — | — |

**T8 sees the stale value:** yes — `get` hits the resurrected memory entry
(first) and/or the resurrected Redis entry (all processes), until TTL expiry
(3600 s default / 86400 s AI-similar). **T8 joins producer A** only if B arrived
before T5 (see §17); after T7, B misses, finds no registry entry, and runs a
*new* producer while the resurrected entry is already installed.

**Does invalidation have any lasting effect?** Partial: the delete *did* remove
the pre-existing entry, and the resurrected value may differ from the deleted
one only by producer determinism (same inputs → same value). Semantically,
however, an invalidation performed because upstream data changed leaves the
cache holding data computed from pre-change inputs — the invalidation contract
is violated for the full in-flight window, and the violation persists through
TTL.

**Alternative ordering — request B arrives between T4 and T5 (§17):** B's `get`
misses (entry deleted at T4), then `getOrSet` step 3 **finds A's registry entry**
(it survived T4) → B joins A's promise → B receives A's stale output and issues
no fresh producer (S3, verified). The invalidation therefore does not even cause
B to re-fetch current data.

---

## 17. Request-B race

(Detailed above; summary of the four candidate outcomes against actual code:)

| Outcome | Reality |
|---|---|
| Joins the old in-flight promise | **YES — actual behavior** (registry entry survives `delete`, L331–334) |
| Starts a new producer | No (only if the registry entry were absent — e.g., after T7) |
| Returns stale producer output | **YES** (S3: `b === STALE`, `originCalls === 1`) |
| Observes another state | No |

Barrier used in reproduction: B is issued strictly after `await
redisCache.delete(KEY)` resolves and strictly before `release.resolve(STALE)`;
both orderings are enforced by awaited promises, not timings.

## 18. Producer-rejection case

If the producer rejects after invalidation: no `set` (no repopulation on either
tier), the registry entry is released, and a subsequent request retries the
producer normally (S4: retry produced FRESH with exactly one origin call).
Rejection is **safe** — the defect is exclusively on the resolve path.

## 19. Redis-unavailable case

During invalidation: memory cleared, Redis `DEL` fails silently → stale Redis
entry survives → later `get` serves it (session affinity to the stale shared
entry). During the producer's final write: memory write still lands (resurrection
persisted process-locally), Redis write fails silently. Neither direction
prevents the memory-tier resurrection; Redis availability only changes *which*
tiers hold the resurrected or surviving stale data. Multi-tier consistency gap
recorded separately (§50).

## 20. Memory-only case

With `getRedisClient` returning `null` (Redis unconfigured/unhealthy),
`safeRedisOp` short-circuits; `delete` clears only the memory tier; the
producer's `.then` still writes the memory tier unconditionally. **The race
exists and is fully deterministic in memory-only mode** (S1 — 4/4 checks,
including 'stale sentinel REPOPULATED memory after invalidation'). Memory-only
deployments (development, Redis outage) are not exempt.

## 21. FakeRedis-backed case

With the controlled `FakeRedis` (same contract as the vitest suites'): after
`delete`, both the fake store and the memory tier are empty; resolving the
producer repopulates **both** — memory read returns the stale sentinel and the
fake store holds `JSON.stringify(STALE)` under the namespaced key, with the `SET`
observed in `fake.setCalls` (S2 — 5/5 checks). This is the Redis-backed
production behavior in miniature: shared-key resurrection visible to every
consumer of the shared tier.

---

## 22. Cross-process behavior

The in-flight registry, the memory tier, and (proposed) generation counters are
process-local. The Redis tier is shared. Therefore:

- Different application instances **can** run producers for the same key
  concurrently (A in process 1, B in process 2), joined by nothing but their own
  process-local registries; both can write after a delete performed by either.
- `delete` in process 1 removes the shared Redis key and process 1's memory
  entry; it **cannot** touch process 2's memory entry or process 2's in-flight
  producer. Process 2's memory tier can therefore keep serving stale data with
  no respect to process 1's invalidation, and process 2's producer can
  repopulate the shared Redis key.
- A process-local per-flight token fixes **only the same-process race**; it
  cannot prevent another instance's producer from writing a pre-invalidation
  result to the shared key.

Classification:

| Dimension | Status |
|---|---|
| Same-process correctness | fixable with a process-local per-flight token |
| Cross-process correctness | **NOT fixable** with process-local state; requires shared mechanism |
| Serverless-instance behavior | each instance has its own memory tier + registry; Redis is the only shared state; concurrent cold starts on different instances run duplicate producers and can race writes against any instance's invalidation |
| Long-lived-process behavior | single registry persists; same-process race window is the full producer duration; cross-instance behavior identical to serverless |

Per §13 of the prompt: a genuinely cross-process solution (Redis-side
conditional write via Lua/transaction, or pub/sub invalidation fan-out) is
classified as a **separate larger finding** (§50) — it is not part of the
smallest Step 2 correction.

## 23. Serverless-instance behavior

(See §22.) Under the project's deployment model (Next.js; shared Redis as the
cross-instance tier), an invalidation issued from instance 1 leaves instance 2's
warm memory entry and any of instance 2's in-flight producers untouched. Any
Step 2 claim must be scoped to "same-process correctness" explicitly; the
process-local fix reduces the defect class to cross-process windows only.

## 24. Long-lived-process behavior

A long-lived server holds one registry + one memory tier for the process life.
The same-process race window is the producer's wall time (AI-similar: seconds;
other routes: one or two TMDB round trips). Memory-tier resurrection persists
through TTL unless the key is deleted again. No additional long-lived-specific
behavior was found (no timer-based sweeper interacts with the registry; LRU
eviction of a registry entry does not cancel the producer — the promise still
writes, joined callers still receive the value).

---

## 25. Affected call-site inventory

**Every `getOrSet` producer is affected by the write-after-invalidation defect**
— it is a property of `lib/cache.ts`, not of any caller. 19 production
invocations across 19 route files (verified `grep -rc "redisCache.getOrSet" app/
--include="*.ts"` → 19 files × 1 invocation each):

| # | Route file | Cached key (shape) | Producer | Long-running? | Invalidated by | Stale consequence |
|---|---|---|---|---|---|---|
| 1 | `app/api/movie/[id]/ai-similar/route.ts:180` | `public:ai-similar:{id}_v2` (TTL 86400) | TMDB details + Gemini (3-retry backoff) + pool-4 ×12 TMDB searches | **YES — seconds** | `invalidateMovieCache` (Phase 12), `clearAllCache` | stale AI-similar list resurrected up to 24 h |
| 2 | `app/api/movie/[id]/route.ts:53` | `movie:{id}:details` | TMDB details + credits | short | `invalidateMovieCache` | stale movie details |
| 3 | `app/api/movie/[id]/recommendations/route.ts:36` | `movie:{id}:recommendations` | TMDB recommendations | short | `invalidateMovieCache` | stale recommendations |
| 4 | `app/api/movie/[id]/similar/route.ts:37` | `movie:{id}:similar` | TMDB similar | short | `invalidateMovieCache` | stale similar list |
| 5 | `app/api/tv/[id]/route.ts:30` | `tv:{id}:details` | TMDB | short | `invalidateTVCache` | stale TV details |
| 6 | `app/api/tv/[id]/recommendations/route.ts:30` | `tv:{id}:recommendations` | TMDB | short | `invalidateTVCache` | stale recs |
| 7 | `app/api/tv/[id]/similar/route.ts:30` | `tv:{id}:similar` | TMDB | short | `invalidateTVCache` | stale similar |
| 8 | `app/api/tv/top-rated/route.ts:20` | `tv:top-rated` | TMDB | short | `invalidateHomeCache` | stale top-rated |
| 9 | `app/api/movies/route.ts:32` | `movies:…` (popular) | TMDB | short | `invalidateHomeCache` (movies:home), `clearAllCache` | stale popular list |
| 10 | `app/api/movies/time-based/route.ts:99` | `public:tmdb:mood…/time-based` | TMDB discover | medium (multiple pages) | `clearAllCache` | stale time-based list |
| 11 | `app/api/mood-recommendations/route.ts:89` | `public:tmdb:mood:{mood}:page:{n}` | TMDB discover ×2 | medium | `clearAllCache` | stale mood list |
| 12 | `app/api/actor/[id]/route.ts:32` | actor details | TMDB | short | `clearAllCache` only | stale actor data |
| 13 | `app/api/celebrities/route.ts:27` | celebrities list | TMDB | short | `clearAllCache` only | stale list |
| 14 | `app/api/genre/[id]/content/route.ts:78` | genre content | TMDB | short | `clearAllCache` only | stale content |
| 15 | `app/api/genres/route.ts:26` | genres list | TMDB | short | `clearAllCache` only | stale genres |
| 16 | `app/api/search/route.ts:52` | search results | TMDB search | short | `clearAllCache` only | stale search results |
| 17 | `app/api/trailers/route.ts:75` | trailers | TMDB | short | `clearAllCache` only | stale trailers |
| 18 | `app/api/trending/route.ts:42` | trending | TMDB | short | `clearAllCache` only | stale trending |
| 19 | `app/api/watchlist/details/route.ts:65` | `public:tmdb:media:{type}:{id}:details` (per-item) | TMDB details, pool-bounded fan-out | medium (up to 50 items / pool) | `clearAllCache` only | stale per-item details |

Adjacent non-`getOrSet` path: `app/api/ai-recommendations/route.ts` uses
`redisCache.get` (L239) + fire-and-forget `redisCache.set` (L533) under
`user:recommendations` — the same delete-vs-write ordering defect exists there
(no in-flight joining possible, and no targeted invalidation ever deletes those
keys), so its exposure is limited to the `clearAllCache` window.

Deletion entry points (all affected identically): `redisCache.delete` (direct),
`cacheManager.invalidateMovieCache` / `invalidateTVCache` / `invalidateHomeCache`
/ `invalidateCacheKey` (exported, **unused** outside `lib/` — verified), and the
namespace-wide `clearAllCache` → `clearScoped` → `clearMemoryPrefix` clears
(POST clear / DELETE on `app/api/admin/cache/route.ts`). `clearScoped`-based
clears have the same defect for every cleared key whose producer is in flight.

**Meaningfulness:** the race is most meaningful for the four keys deleted by
`invalidateMovieCache` (targeted, admin-triggered, data-change-driven) and for
the long-running AI-similar producer; for `clearAllCache`-only keys the
invalidation is already global and the residual window is bounded by TTL, so
impact there is operational rather than correctness-critical. The defect is
nevertheless **generic** — not limited to AI-similar (rejecting H5's inverse).

---

## 26. Security-sensitive cache inventory

| Cache path | Sensitivity | Uses `getOrSet`? | Exposure to THIS race |
|---|---|---|---|
| All 19 routes above | public TMDb-derived content + AI-similar recommendations (public scope) | yes | stale public content; no privilege impact |
| `user:recommendations` (ai-recommendations) | user-specific recommendations keyed by a snapshot hash of the user's own owned items | no (direct get/set) | only vs `clearAllCache` window; no in-flight join |
| Rate limiting (`security:rate-limit`) | **security-critical** (abuse budgets) | **no** — `lib/security/rateLimit.ts` uses its own bounded memory store and Redis INCR/atomic path, not `RedisCache` | **NOT affected** (verified: no `getOrSet`/`RedisCache` import in `rateLimit.ts`) |
| Auth/session (JWT jti, roles) | **security-critical** | no — `lib/auth.ts`, session callbacks; cache-independent | NOT affected |
| Admin cache metadata (`admin:cache-metadata`) | operational metadata | no | not affected by this race |

**Conclusion:** no authorization, authentication, or rate-limit state flows
through the defective write path. The defect is a **stale-data-resurrection /
admin-invalidation-window** issue on public content. It is classified as an
operational-and-correctness finding with LOW security impact; the "admin
invalidation bypass" characterization is accurate only for the in-flight window
(seconds) — it is not a persistent bypass, because the resurrected value is the
same producer's output and expires at TTL. No exploit path to privilege
escalation, authorization bypass, or restored *deleted* content was found: the
cached values are recomputed from current upstream inputs whenever a producer
runs post-invalidation, and no user-controlled content is cached.

---

## 27. Cancellation analysis

- **AbortController / fetch signals:** used only *inside* two producers
  (ai-similar's Gemini call, L60–71; none in the cache helper). Nothing threads
  a signal to `getOrSet`; `fetchFn` receives no signal argument.
- **Promise cancellation:** not a JavaScript primitive; the origin promise
  cannot be cancelled — its `.then` will run on resolve regardless of registry
  state (§30 Option C).
- **DB cancellation / retry wrappers / timeouts:** the Gemini producer has
  retry+timeout semantics internal to the route; no cache-level timeout exists.
- **Could invalidation safely abort producers?** Only with producer cooperation
  (an injected signal consumed by every producer's fetches). Two of 19 producers
  could adopt a signal trivially (direct fetchers), but several wrap TMDB calls
  with `next: { revalidate }` semantics or internal retries; requiring every
  producer to handle abort correctly is a large, error-prone contract.
  **Detaching from the result (write gate) achieves the cache-correctness
  goal without any producer cooperation** — that is the property that makes the
  token design the smallest safe correction.
- Safe subset of cancellation-like operations available to `delete`:
  evict the registry entry (stops *future* joins), suppress the final write
  (write gate). Aborting the producer itself is neither required nor
  recommended in Step 2.

---

## 28. Rejected: LRU bounded generation map (the prior preferred design)

The report previously proposed a bounded `Map<string, number>` keyed by namespaced
key, missing generation interpreted as 0, LRU eviction, and producer writes when
the current generation equals the captured generation. **That design is unsafe**
and is rejected here.

Counterexample:
1. Producer captures generation 0.
2. Invalidation bumps generation to 1.
3. LRU evicts that generation entry.
4. Missing entry is interpreted as generation 0.
5. The stale producer's captured generation again equals the current default.
6. The stale write is incorrectly permitted.

Consequences:
- Generation eviction is **not** one-directionally safe — any prior claim to
  that effect is withdrawn.
- The bounded generation-map design is **not recommended**.
- H9 (§43), §28, §29, §32, §45, §46, §62, the RTM (§61), and the checklist (§63) are corrected wherever the unsafe design appeared.

### Also rejected

- **Tombstone (Option B):** records `(key, deletedAt)`; producer captures start
  timestamp; write skipped if `deletedAt > producerStart`. Rejected: clock
  dependence, unbounded tombstone growth unless TTL'd, needs a Redis
  representation to work cross-tier, semantically equivalent to a counter with
  strictly worse determinism.
- **In-flight deletion alone (Option C):** `delete` removes the key from
  `inflightPromises`. The already-running promise still resolves and its `.then`
  still performs the unconditional `set` — stale repopulation is **not
  prevented**. Worse, removing the entry while A runs means request B starts a
  *second* producer (duplicate upstream work), and A's `.finally` would then
  delete **B's** registry entry, enabling a third producer. Rejected — small,
  but neither correct nor safe. (The `.finally` ownership fix and the eviction
  are, however, *components* of the recommended design.)
- **Opaque token (Option D):** materially identical to the token design below;
  no separate advantage.
- **Redis-side generation (Option E):** generation state in Redis; writes
  conditional (Lua/`WATCH`). The only option that fixes cross-process
  repopulation, but requires Redis protocol/infra with no repository precedent;
  complexity high; a bug could block all writes. Classified as a **separate
  larger finding** (§50) — not Step 2 scope.
- **Residual acceptance (Option F):** accepting the race as-is. Not selected — a
  deterministic, API-invisible correction exists; documenting the race alone is
  insufficient.

## 29. Preferred correction — per-flight mutable invalidation token

Replace the rejected generation design with a **per-flight mutable invalidation
token**. Conceptual registry entry:

`{ promise, invalidated }`

The implementation may choose an equivalent private internal type. Required
semantics:

**Initialization order:** 1. Construct a valid promise that same-key callers can join. 2. Construct the entry containing that valid promise and `invalidated: false`. 3. Insert the complete entry into the registry. 4. Start the producer only after the complete entry is visible.

1. **Each producer owns a unique entry object.** One entry per fully namespaced
   key while its producer is in flight.
2. **The entry is inserted for the fully namespaced key.** Key format matches
   `inflightPromises` keys (`ns(key)` output) and `memoryCache` keys.
3. **Same-key callers before invalidation join the same `entry.promise`.** Callers
   arriving while a producer is in flight (and the key was not invalidated) share
   the existing entry's promise — coalescing fully preserved.
4. **`delete(key)`:**
   - finds the current entry when present,
   - sets `entry.invalidated = true`,
   - removes that exact entry from the registry **only if it is still the current entry**,
   - performs the existing memory and Redis deletion.
5. **The old producer may continue running**, but its completion handler writes
   **only while its own entry remains non-invalidated** (the entry was not found
   invalidated before removal).
6. **Request B after invalidation sees no existing entry** and starts a fresh
   producer with a new entry.
7. **The old producer's `.finally` removes the registry entry only if** the
   registry still points to the same entry object:
   `if (inflightEntries.get(key) === entry) { ... }`.
8. **A superseded producer must never remove a newer producer's entry.** Enforced
   by the reference-equality check in #7.
9. **`clearScoped`, `clearMemoryPrefix`, and full clear** invalidate and remove
   matching in-flight entries directly, including keys that do not yet exist in
   memory or Redis. Matching is by fully namespaced key against the in-flight
   registry itself, not only the current memory-cache inventory (see §E).
10. **No separate generation map** is introduced.
11. **No clock or timestamp** is used.
12. **No unbounded metadata map** is introduced. The registry remains bounded by
    the existing 1000-entry LRU cap; entries are removed by `.finally` (or by
    deletion/invalidation), not allowed to grow.
13. **No public RedisCache API change** is required (`getOrSet`/`set`/`get`/
    `delete`/`clearScoped` signatures unchanged).
14. **Cross-process producers remain a separately documented residual risk**
    (§22, F-1) — process-local tokens cannot observe another instance's producer
    or shared Redis.

Why this shape: it suppresses the stale write (the defect's essence), restores
the invalidation contract for later requests, preserves coalescing for untouched
keys, changes no public API, and touches only `lib/cache.ts`. The producer
itself is never aborted — no producer cooperation is required (§27).

## 30. In-flight deletion option (Option C) — component reuse

Repeated for clarity: removing only the registry entry does not stop the pending
write (the write lives on the promise continuation, L337–342). It is rejected as
a standalone fix but its `.finally` ownership fix and entry eviction are adopted
as components of the token design in §29 (semantics 4, 7, 8).

## 31. Clear-scope correction (§E)

**Where the prior diagnosis erred:** it proposed invalidating/generating updates
only for cleared *memory* keys. A cold in-flight producer can exist without any
memory or Redis entry yet (producer started, cache write not yet landed).
Therefore scoped and global invalidation must match and invalidate keys from:

- **the in-flight registry itself**, and
- **not only** the current memory-cache inventory.

**Exact private matching behavior** (defined here, not implemented in this
pass): `clearScoped(match)`, `clearMemoryPrefix(match)`, and full clear iterate
the in-flight registry's fully namespaced keys; any entry whose key matches the
scope/prefix (using the existing `isNamespacedKey`/`applyNamespace` semantics)
has `entry.invalidated = true` set and is removed from the registry **only if
the registry still points to that entry**, regardless of whether the key exists
in `memoryCache` or Redis. This guarantees that an in-flight producer whose key
is scope-cleared cannot resurrect a value the clear intended to remove, and that
a later miss starts a fresh producer (semantics 6, 9).

## 32. Memory-growth and cleanup (token design)

The in-flight registry is already bounded at 1000 entries with oldest-first
eviction (F-031 pattern). Under the token design:

- Entries are removed by `.finally` on resolve/reject (semantics 7, with the
  reference-equality guard #8).
- Entries are removed directly by `delete`/`clearScoped`/`clearMemoryPrefix`
  (semantics 4, 9).
- No separate generation or metadata map exists, so there is nothing additional
  to bound.

**Capacity-eviction safety (mandatory rule):** before capacity eviction removes
the oldest active entry:

1. Set `oldestEntry.invalidated = true`.
2. Then remove it from the registry.
3. The evicted producer may still resolve to its original caller.
4. The evicted producer must **not** write to memory or Redis.
5. Its `.finally` must not remove a newer entry.
6. This may cause a later cache miss — an acceptable safe failure mode.

LRU eviction of a registry entry does **not** cancel the producer — the
promise still writes unless its entry was invalidated (#5). Because
invalidation marks entries `invalidated = true` before removal, a superseded or
evicted producer's write is gated, so eviction can only suppress a legitimate
write (a benign extra cache miss), never allow a stale write.

No unbounded map is introduced.

---

## 33. Existing test coverage

| Behavior | Current test | Current assertion | Missing assertion | Race detected? |
|---|---|---|---|---|
| `getOrSet` basic caching | `redis-cache-security` R4-F "Redis-down fallback works through getOrSet" | value returned, `get` returns same | no invalidation anywhere | no |
| Same-key coalescing | R4-G "ten concurrent same-key misses call origin once" | `originCalls === 1`, all results equal | no delete-during-producer | no |
| Different-key independence | R4-G "different keys call their origins independently" | each origin called once | — | no |
| Producer rejection cleanup | R4-G "rejected origin is removed… and can be retried" | rejects, retry succeeds, 2 calls | no invalidation | no |
| In-flight cleaned after resolve | R4-G "in-flight state cleaned after resolve" | cached value returned | — | no |
| No caching of rejections | R4-G "does not cache rejected promises" | `get` → null | — | no |
| Cache deletion (Redis tier) | Phase 12 Scenario B (4 tests) | keys removed from FakeRedis, exact-key DEL only | **no producer in flight during delete** | no |
| Cache deletion (memory tier) | Phase 12 Scenario C (3 tests) | memory entries removed, no Redis commands | **no producer in flight during delete** | no |
| Deletion-call contract | Phase 12 Scenario A (4 tests) | exactly 4 keys requested | — | no |
| Key normalization | `cache-key-normalization` (2 tests) | sanitized namespaced keys | — | no |
| Producer volume / warm hit | Phase 9 suite (22 tests) | 0 upstream on warm hit, pool-4 on cold | no invalidation | no |
| Admin auth matrix | `admin-chat-ai-security`, `strict-validation` | 401/403 routes | — | no |

**No existing test exercises `delete` (or any clear) while a producer is in
flight for the same key** — confirming the Phase 12 diagnosis §40 statement
verbatim. **No test accidentally proves or disproves the race:** every
coalescing test runs without deletion, and every deletion test runs without a
producer. Coverage of the defect is therefore exactly zero.

---

## 34. Safe runtime reproduction

**Location:** `<external-scratch>/p15-repro` — **outside the**
repository**. No file was created inside the repository for the reproduction.

**Method (fidelity):** byte-faithful copies of the current production
`lib/cache.ts` (SHA-256 `6491ab38…` baseline) and `lib/cache-namespace.ts`
(`d7e150e0…`) were placed in the scratch dir; the **only** textual change to the
copy is `import getRedisClient from './redis'` → `'./redis-stub'` (the
production dependency on the real client singleton replaced by a controlled
fake exposing `get/set/del/scan` + `isOpen`, the same contract the vitest suites
fake). No logic, ordering, or await structure was altered. The copies were
transpiled with the project's own TypeScript compiler
(`<project-typescript>/tsc`, `--module commonjs --target es2022`) and run
under plain Node.

**Synchronization:** deferred promises + microtask flush via `setImmediate`;
the only `setTimeout`-adjacent construct in the entire harness is the flush
helper itself. No sleeps; no DoS workload (maximum 10 concurrent requests in
the coalescing control); no real Redis, network, DB, or repository mutation.

**Isolation:** the harness resets the module-level memory tier between scenarios
via the *public* `clearMemoryPrefix(CACHE_NAMESPACE)` helper — the same
technique the Phase 12 suite uses. (Notably, the first un-isolated run of the
harness **stalled**, because S1's resurrected memory entry was served to S2's
`getOrSet` without ever invoking the producer — an incidental, live
demonstration that a later request reads the resurrected entry directly.)

**Result — 22/22 checks pass, exit 0:**

```
=== S1 memory-only: producer started before delete writes after delete ===
  PASS  memory entry absent immediately after delete
  PASS  request A receives stale producer output
  PASS  stale sentinel REPOPULATED memory after invalidation
  PASS  producer finished strictly after delete
=== S2 FakeRedis-backed: same race hits BOTH tiers ===
  PASS  Redis store empty after delete
  PASS  memory empty after delete
  PASS  stale sentinel repopulated MEMORY tier
  PASS  stale sentinel repopulated REDIS tier
  PASS  Redis tier write observed
=== S3 request B (after delete, before producer A resolves) JOINS stale producer ===
  PASS  request B joined producer A (no second origin call)
  PASS  request B received stale producer output
  PASS  stale value persisted for later readers
=== S4 producer rejects after invalidation — no repopulation ===
  PASS  no value cached after rejected producer
  PASS  Redis store still empty
  PASS  in-flight entry released (retry possible)
=== S5 unrelated key unaffected (isolation) ===
  PASS  unrelated key cached normally
=== S6 normal producer without invalidation still caches ===
  PASS  first call produced / second call served from cache, origin called once
=== S7 same-key coalescing still active (10 concurrent → 1 origin) ===
  PASS  exactly one origin call for 10 concurrent misses / all share the result
=== S8 invalidation after completed write still deletes normally ===
  PASS  memory deleted / Redis deleted
TOTAL: 22 pass, 0 fail
```

Interpretation: the defect is **reproduced deterministically** on the memory
tier (S1) and on both tiers simultaneously (S2); request B joins the superseded
producer and receives stale output (S3); rejection is safe (S4); and all normal
behaviors (S5–S8) are unaffected — isolating the failure to exactly the
delete-during-producer window.

---

## 35. Canonical RED plan

One new focused suite, e.g. `tests/cache-inflight-invalidation-race.test.ts`,
modeled on the Phase 12 suite (FakeRedis via `vi.hoisted`, `@/lib/redis` mocked,
`@/lib/mongodb` mocked, memory tier reset via `clearMemoryPrefix`). Every
scenario synchronizes with deferred promises and awaited deletes — **no sleeps**.

**RED-1 (memory-only same-process race).** Mock `getRedisClient` → null; start
`getOrSet(K, producer)` where producer awaits a deferred; await producer-started
signal; `await redisCache.delete(K)`; `expect(await redisCache.get(K)).toBeNull()`
(transiently true); resolve producer with `'STALE'`; `await p`; then
`expect(await redisCache.get(K)).toBeNull()` — **fails today** (returns
`'STALE'`).

**RED-2 (FakeRedis same-process race).** FakeRedis mode; same sequence; assert
after resolution: `fake.store.has(namespacedK)` is **false** and
`redisCache.get(K)` is null — fails today (S2: store holds `'STALE'`).

**RED-3 (request B after invalidation, before producer A resolves).** FakeRedis;
A in flight; `await delete(K)`; issue B; resolve A with `'STALE'`; assert
`originCalls === 2` (B started its own producer) and B's returned value **≠**
`'STALE'` — fails today (`originCalls === 1`, B === 'STALE', per S3).

**RED-4 (A finally cannot remove B's entry).** A in flight; delete K; while A's
producer still runs, issue a request B for the same key K, which starts a new
producer B with a fresh entry; let A reject; after A rejects, assert that B's
entry remains in the in-flight registry (A's `.finally` did not delete it) and
that B's eventual cache write succeeds; K is then cached with B's fresh value.

**RED-5 (unrelated key unaffected).** Producer for `'other'` in flight; delete
`K`; resolve `'other'` producer; assert `'other'` cached and `K` absent — passes
today; guard that the generation gate is per-key (no over-suppression).

**RED-6 (normal producer without invalidation still caches).** Resolve a normal
producer with `'FRESH'`; assert cached (both tiers) — guard that the gate never
suppresses a non-invalidated write.

**RED-7 (same-key coalescing remains active).** 10 concurrent same-key misses →
`originCalls === 1`, all results equal — guard F-055 (mirrors R4-G).

**RED-8 (invalidation after completed write still deletes normally).** `set`
then `delete` → both tiers null — guard the unchanged delete contract (mirrors
Phase 12 Scenario B/C).

**Synchronization barriers (exact):** a `deferred()` resolved inside the
producer body signals "producer started"; every `delete` is `await`ed; results
are read only after `await`ing the origin promise and one microtask flush
(`await new Promise(r => setImmediate(r))`) to let the fire-and-forget `set`
land — mirroring production ordering without timing assumptions.

**Non-failure modes (per prompt §12):** RED failures must come only from the
write-after-invalidation behavior — mocks identical to the existing suites, no
Redis connection, no sleeps, keys built with `buildCacheKey`, no module reset
beyond the established `clearMemoryPrefix` pattern, and the suite typechecks
under the project `tsconfig`.

---

## 36. Earliest incorrect state

The first structurally incorrect *state* (observable to a later reader) is at
**T6**: the producer's `.then` executes `set`, and the memory tier holds the
stale entry from that instant (the Redis write follows within the same `set`
call). The first incorrect *deliverable behavior* is earlier, at **T4+ε**: a
request B arriving after the delete joins the superseded in-flight promise and
is committed to receiving A's pre-invalidation output (§17/S3). The intermediate
case of prompt §1.5 — invalidation after producer resolution but before the
fire-and-forget `set` executes — is also an incorrect-state entry point at the
same T6 boundary (§8 case 5).

---

## 37. Root-cause analysis

**Why the defect exists:** the cache's stampede-protection design (F-055)
introduced a **long-lived, cross-delete operation** — the origin promise — whose
completion handler writes to both tiers. The deletion path was designed as a
blind per-key removal (F-052/F-009 hardening focused on *which* keys may be
deleted, never on *when* writes may land). Nothing reconciles the two: there is
no version/generation state on the write path, so a producer cannot distinguish
"my key was invalidated while I ran" from "my key is still current". The
in-flight registry, which is the only per-key structure that outlives the
producer's start, is invisible to `delete`.

**Why it was not caught:** the test suites cover the two halves independently —
coalescing/deletion never overlap (§33), and the Phase 12 diagnosis correctly
deferred the race as residual R6 under a no-scope-creep mandate.

**What does NOT cause it:** the key-coverage gap (fixed in Phase 12), the
namespace/normalization machinery (sound), the bounded-LRU structures (sound),
the FakeRedis fidelity (the reproduction drives the production file), and any
caller behavior (the defect is fully contained in `lib/cache.ts`).

## 38. Root-cause classification

**IN-FLIGHT WRITE-AFTER-INVALIDATION DEFECT**

(The write path conditioned on nothing but producer success; the delete path
unable to observe in-flight producers; the same-process coalescing structure
otherwise correct, so this is not a PROCESS-LOCAL COALESCING DEFECT, and the
tier machinery itself is consistent, so not a MULTI-TIER CACHE CONSISTENCY
DEFECT — though a *separate* Redis-outage tier gap exists, §50/§19.)

## 39. Reproducibility

**DETERMINISTIC TARGETED TEST** — 22/22 executed checks across 8 scenarios in an
external scratch harness driving the production cache logic (S1–S8, §34). Prior
classification was DETERMINISTIC STATIC (Phase 12 §13/§40); Phase 15 upgrades it
with runtime proof.

## 40. Impact

**STALE DATA RESURRECTION** (primary) + partial **ADMIN INVALIDATION BYPASS** for
the in-flight window: both storage tiers are repopulated with a
pre-invalidation snapshot after the invalidation completes; a concurrent request
is served the stale producer output; the effect persists until TTL (1 h default,
24 h AI-similar); all 19 `getOrSet` call sites and every deletion path are
affected. Bounded by: admin-only invalidation frequency, producer wall time
(seconds), and TTL.

## 41. Production-impact classification

**PROBABLE** — the mechanism is deterministically reproduced in a faithful
harness against the production code path, and every production precondition for
it (an invalidation colliding with the long-running AI-similar producer) is
plausible but depends on operator timing; no production incident, metric, or
operator report exists (unchanged from Phase 12: no production metrics are
available — finding R4 of that phase).

## 42. Confidence

**HIGH** — source-level trace of the unconditional write and the delete-blind
registry, plus deterministic two-tier reproduction, plus full call-site
inventory. Residual uncertainty is confined to production frequency (unmeasured)
and cross-process behavior (analyzed structurally, not executed).

---

## 43. Hypothesis matrix

| ID | Hypothesis | Supporting evidence | Contradicting evidence | Status |
|---|---|---|---|---|
| H1 | A producer started before delete can write after delete | `cache.ts` L336–342 unconditional `.then` write; S1/S2 reproduction | none | **CONFIRMED** |
| H2 | Deleting the in-flight-map entry alone prevents stale repopulation | — | write lives on the promise continuation, not the registry (§30); Option C analysis | **REJECTED** |
| H3 | Request B after invalidation joins the stale producer | L331–334 join on miss; `delete` never evicts the entry; S3 (`originCalls===1`, B===STALE) | none | **CONFIRMED** |
| H4 | The race affects both memory and Redis | S1 (memory), S2 (Redis store repopulated) | none | **CONFIRMED** |
| H5 | The race affects every `getOrSet` call site | defect is in the shared helper; 19/19 call sites route through it | none | **CONFIRMED** |
| H6 | The race is limited to one process (same-process write gate) | registry + memory tier are module-level; per-flight token would be process-local | Redis tier is shared → resurrection via Redis is visible cross-process (§22) | **CONFIRMED** (same-process write; cross-process exposure via the shared tier) |
| H7 | A process-local per-flight token completely solves the system-wide problem | closes same-process window | cannot observe another instance's producer or memory (§22) | **REJECTED** (partially: solves same-process only) |
| H8 | A per-flight write gate preserves same-key coalescing | gate is per-key, read once per registration; S7 coalescing unaffected by an analogous structure | none | **CONFIRMED** (structurally) |
| H9 | Generation metadata can be cleaned without an unbounded memory map | — | **REJECTED** — generation map design is unsafe (counterexample §28); no generation metadata is introduced at all (token design §29 semantics 10–12) |
| H10 | A tombstone is safer than a per-flight token | — | clock dependence, TTL cleanup, serialization needs; per-flight token is strictly better and clock-free | **REJECTED** |
| H11 | Redis-side conditional writes are required now | only mechanism that fixes cross-process | deployment has no precedent/infra for Lua; same-process fix is independent and sufficient for Step 2; cross-process is a separate finding | **WEAK** (needed for cross-process; not required for the smallest safe correction) |
| H12 | Current invalidation frequency makes the race operationally significant | invalidation is admin-only and rare; AI-similar producer is seconds-long (max exposure) | no metrics; no automatic invalidation triggers | **UNRESOLVED** (low frequency; unmeasured) |
| H13 | Security-sensitive cache entries are affected | none — rate limit and auth use separate paths (§26) | `rateLimit.ts` verified INCR-based, no `RedisCache`; auth cache-independent | **REJECTED** |
| H14 | The smallest safe fix belongs only in `lib/cache.ts` | all four deletion paths funnel through `delete`/`clearScoped` in `lib/cache.ts`; the write gate lives only there; no caller contract changes | none | **CONFIRMED** |
| H15 | Cross-process behavior should be a separate follow-up | prompt §13 instruction; requires Redis protocol/infra (Option E) | none | **CONFIRMED** |

## 44. Rejected hypotheses

H2 (in-flight deletion alone), H10 (tombstone over per-flight token), H11 (Redis-side
conditional writes *now*), H13 (security-sensitive exposure) — rejected with the
evidence above. H7 rejected in its absolute form (process-local ≠
system-wide). Residual acceptance (Option F) rejected as a *choice* on
value-for-complexity grounds, with the frequency caveat recorded honestly (H12
UNRESOLVED).

---

## 45. Exact Step 2 scope

| File | Change |
|---|---|
| `lib/cache.ts` | per-flight mutable invalidation entry `{ promise, invalidated }`; register entry in `getOrSet` before producer start; write gate in `.then` (write only while entry non-invalidated); `delete` finds entry, sets `invalidated = true`, removes it only if still current, then memory/Redis delete; `.finally` removes entry only by reference equality; capacity-eviction marks evicted entry invalidated before removal; invalidation/gating in `clearMemoryPrefix`/`clearScoped` for matching in-flight keys (semantics 4, 9) |
| `tests/cache-inflight-invalidation-race.test.ts` (**new**) | the 15-scenario RED/GREEN plan (§46) — RED first, then GREEN |
| `docs/reports/PHASE-15-CACHE-INVALIDATION-INFLIGHT-REPOPULATION-CORRECTION-COMPLETION-REPORT.md` (**new**) | completion report |

Explicitly **excluded** unless diagnosis proves otherwise: the AI-similar route,
`lib/cacheManager.ts`, the admin route, package files, lockfile, audit-policy
files, `config/audit-exceptions.json`, CI. Diagnosis proves no other file is
required: all deletion paths funnel through `lib/cache.ts`, and no caller
contract changes (H14). **Cross-process remediation (Redis-side conditional
writes / pub/sub invalidation) is a separate larger finding, not part of Step 2**
(prompt §13; §50 below).

---

## 46. Targeted validation — RED/GREEN plan

Step 2, in order (all local, Node 22.13.1 of record; no GitHub Actions):

**RED (new suite fails for exactly the write-after-invalidation reason):**

1. Memory-only write-after-delete is blocked: start `getOrSet(K, producer)` awaiting a deferred; await producer-started signal; `await redisCache.delete(K)`; resolve producer with `'STALE'`; after `await p`, `expect(await redisCache.get(K)).toBeNull()` — **fails today** (returns `'STALE'`).
2. FakeRedis write-after-delete is blocked in both tiers: same sequence; after resolution `fake.store.has(namespacedK)` is **false** and `redisCache.get(K)` is null — **fails today**.
3. Request B after delete starts producer B and receives fresh B output: A in flight; `await delete(K)`; issue B; resolve A with `'STALE'`; assert `originCalls === 2` (B started its own producer) and B's value **≠** `'STALE'` — **fails today** (`originCalls === 1`, B === `'STALE'`).
4. Producer A rejection after invalidation does not damage producer B: A in flight; delete K; `release.reject(...)`; then start producer B for K; B succeeds and caches; assert K holds B's fresh value, no stale residue.
5. Unrelated key remains unaffected: producer for `'other'` in flight; delete K; resolve `'other'`; assert `'other'` cached and K absent.
6. Normal producer caches normally: resolve a normal producer with `'FRESH'`; assert cached in both tiers — gate never suppresses a non-invalidated write.
7. Ten same-key requests before invalidation coalesce to one producer: 10 concurrent same-key misses → `originCalls === 1`, all results equal — guard F-055.
8. Invalidation after completed write deletes both tiers: `set` then `delete` → both tiers null — guard unchanged delete contract.
9. Scoped clear invalidates a cold in-flight producer: producer in flight for K; `clearScoped(K)` before resolution; assert K absent after resolution and a fresh producer runs for a subsequent miss — **fails today**.
10. Producer A finally cannot remove producer B's entry: A in flight; invalidate K (evicts A's entry, sets invalidated); B starts and registers new entry; A resolves; assert B's entry remains — **fails today** (unconditional `.finally` deletes any entry for the key).
11. Full clear invalidates matching in-flight entries: multiple in-flight producers matching a namespace; full clear; assert none resurrect after resolution — **fails today**.
12. Capacity eviction marks the evicted active producer invalidated: start producer A; create enough distinct in-flight entries to evict A; invalidate A's key after eviction; resolve A; assert A's stale result is not cached in either tier — **fails today**.
13. Evicted producer cannot write to memory or Redis: same setup as 12; assert no write to either tier after eviction + resolution.
14. Registry remains bounded: create >1000 distinct in-flight entries; assert registry size never exceeds 1000.
15. Non-evicted entries preserve coalescing and normal cache writes: entries not evicted still coalesce same-key calls and write normally.

**GREEN:** implement the per-flight token in `lib/cache.ts`; RED-1…RED-3 and RED-9…RED-13 pass; RED-4…RED-8, RED-14, RED-15 guards pass.

**Synchronization:** deferred promises + explicit barriers only; every `delete`/`clear` is `await`ed; results read only after `await`ing the origin promise and one microtask flush (`await new Promise(r => setImmediate(r))`); **no arbitrary sleeps**.

**Broader validation (after GREEN):**

3. Existing Redis/cache suites: `tests/redis-cache-security.test.ts`, `tests/cache-key-normalization.test.ts`, `tests/redis-queue-calibration.test.ts`.
4. Phase 12 invalidation suite: `tests/ai-similar-cache-invalidation.test.ts` (11 tests).
5. Phase 9 AI-similar suite: `tests/ai-similar-enrichment-concurrency.test.ts`.
6. Admin/cache-security suites: `tests/admin-chat-ai-security.test.ts`, `tests/strict-validation.test.ts`.
7. Typecheck: `npm run typecheck` (tsc --noEmit) exit 0.
8. Lint: `npm run lint` — 0 errors (93-warning baseline unchanged).
9. Full suite: `npm test` (vitest run, both projects).
10. Coverage: `npm run test:coverage` — record numbers (lib/cache.ts remains outside `coverage.include`; observation only, per prior W-3).
11. Audit-policy tests (if the owner re-authorizes the exception first — the committed expiry 2026-10-17 has passed; Step 2 must not silently rely on it).
12. Live audit policy — same dependency as (11); **must not alter the exception during Step 2 without an owner decision**.
13. Raw audits recorded honestly (no requirement for zero while the braces exception situation is unresolved).
14. Production build on Node 22.13.1 (`next build`).
15. Final Git attribution.

The Step 2 change is additive and API-invisible; no call site or consumer needs re-verification beyond the suites above.

## 47. Broader validation

Full-suite (all 45 test files), typecheck, lint, and build gates on the Node
22.13.1 runtime of record; diff review limited to `lib/cache.ts` + one new test
file + one report; explicit pre/post hash comparison of `package.json`,
`package-lock.json`, `config/audit-exceptions.json`,
`scripts/audit-policy.mjs`, and the untouched cacheManager/admin/route files.

## 48. Audit-policy handling

Phase 15 Step 1 made **no** change to `config/audit-exceptions.json`
(SHA-256 `ee7a771f…` — unchanged, re-verified in §54), `scripts/audit-policy.mjs`
(`a06a4bee…`), or any audit-policy test. The committed exception
(`BRACES-EXC-2026-10-03-GHSA-vfj7-8cjw-p6xm`, braces@3.0.3) expires
**2026-10-17T23:59:59Z**; as of the diagnosis date (2026-10-29) that date is in
the past. Per prompt rules Phase 15 does not alter, extend, or re-evaluate it;
the Phase 14 fail-closed design means any audit-policy invocation would now
exit 1 (EXCEPTION_EXPIRED). This has **no bearing** on the present diagnosis
(the cache race is provable without any audit gate) but **must be resolved by an
owner decision before Step 2's validation gates 11–12** — it is not something
Step 2 may fix silently. The release-gate contract from the prompt (policy
passes / raw audit shape matches only the approved advisory / exception
unexpired) cannot currently be satisfied as-is; that is an authorization-layer
fact, not a defect in this finding.

## 49. Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Cross-process residual race (another instance's producer repopulates shared Redis) | MEDIUM | out of Step 2 scope; separate finding (§50); TTL bounds exposure |
| R-2 | Redis outage during invalidation leaves the shared stale entry (§19) | MEDIUM | separate finding; consider a degraded-result contract in a later phase |
| R-3 | Capacity eviction suppresses a legitimate write (benign extra miss) | LOW | proven one-directionally safe (§32); evicted entry marked invalidated before removal |
| R-4 | `.finally` reference-equality guard subtle: a superseded producer must not evict a newer entry | LOW | explicit equality check (§29 semantics 7–8) + RED guards (RED-10) |
| R-5 | No production metrics for invalidation frequency / staleness (unchanged from Phase 12 R4) | LOW | none available; no claims made |
| R-6 | Audit-exception expiry (2026-10-17) blocks gates 11–12 of Step 2 validation | MEDIUM | owner decision required before Step 2 (§48) |
| R-7 | Manual reproduction harness lives outside the repo and is not a regression asset | LOW | the Step 2 vitest suite replaces it as the durable test |

## 50. Remaining findings

| ID | Finding | Disposition |
|---|---|---|
| F-1 | **Cross-process repopulation via shared Redis** (Option E scope: Redis-side conditional writes or pub/sub invalidation fan-out) | **Separate larger finding** — new infrastructure/protocol; must not be silently folded into a small Step 2 (prompt §13). Requires its own diagnosis + authorization |
| F-2 | Redis-unavailable-during-invalidation leaves the shared Redis entry (multi-tier delete atomicity) | separate finding; distinct from the in-flight race (§19) |
| F-3 | `invalidateCacheKey` is exported but unused in `app/` | dead-surface observation; not related |
| F-4 | `lib/cache.ts` outside `coverage.include` (prior W-3) | unchanged observation |
| F-5 | The audit exception expiry (2026-10-17) has passed as of the diagnosis date | owner authorization-layer fact; flagged for Step 2 planning (§48) |

## 51. Unresolved questions

1. Production frequency of admin invalidations colliding with the AI-similar
   producer (no metrics exist; H12 UNRESOLVED) — does the owner want a
   cross-process fix (F-1) authorized, or accept the same-process fix with the
   cross-process residual?
2. Whether `clearAllCache`'s namespace-wide clear should also broadcast to other
   instances (overlaps F-1).
3. Owner's decision on the expired braces exception before Step 2 gates 11–12.
4. Whether Redis-outage degraded deletes should return an explicit signal to the
   admin route (F-2) — separate phase.

---

## 52. Chronological command log

| # | Command (read-only) | Purpose | Result |
|---|---|---|---|
| 1 | `git rev-parse --abbrev-ref HEAD` / `git rev-parse HEAD` | branch + exact HEAD | `work/phase-12-cache-invalidation-diagnosis`, `a89c1fb39df3139c7200fcd172357df3b247c54e` |
| 2 | `git status --porcelain=v2 --branch` | baseline | clean; untracked scratch only |
| 3 | `git diff --cached --name-status` / `git diff --name-status` | index + worktree | both empty |
| 4 | `git ls-files --others --exclude-standard` | untracked inventory | known scratch; no Phase 15 artifacts |
| 5 | `git log --oneline -5`, `git branch -a --list`, `git remote -v` | commits + remotes | locals + origin; release branch/PR untouched |
| 6 | `sha256sum` × 8 files | baseline hashes | recorded in §6 |
| 7 | `read_file` `lib/cache.ts`, `lib/cacheManager.ts`, `lib/cache-namespace.ts`, both routes, `lib/redis.ts`, `rateLimit.ts`, `config/audit-exceptions.json` | authoritative context | read in full/partial; no modification |
| 8 | `search_files` `getOrSet|invalidate…` `app/`, `lib/` | call-site inventory | 19 files / 19 invocations (§25) |
| 9 | `read_file` `tests/redis-cache-security.test.ts`, `tests/ai-similar-cache-invalidation.test.ts`; scoped the other 5 suites + 4 reports | coverage matrix (§33) | no delete-during-producer coverage |
| 10 | `cp lib/cache.ts lib/cache-namespace.ts → scratch/p15-repro/src/` + `sed` import rewire | fidelity harness | one import line changed in the **copy** only |
| 11 | `node <project-typescript>/tsc … --outDir <external-scratch>/p15-repro/compiled` | transpile copies | emitted (2 type-only complaints for the fake's scan typings; runtime-irrelevant) |
| 12 | `node scratch/p15-repro/compiled/repro.js` | deterministic reproduction | **22/22 PASS, exit 0** (after adding the documented `clearMemoryPrefix` inter-scenario isolation) |
| 13 | `ls AGENTS.md .cursor/rules`, `cat vitest.config.mts`, `cat .github/workflows/ci.yml`, `node -e require('./package.json').scripts` | repo instructions | AGENTS.md/.cursor absent; recorded |
| 14 | `grep` `invalidateCacheKey`, `redisCache.` in `ai-recommendations` | adjacent paths | direct get/set; unused invalidateCacheKey |
| 15 | final change-control re-run (§55) | preservation | unchanged |

No command touched a tracked repository file, staged anything, contacted an
external system, or executed a mutation command.

## 53. External-system confirmation

**None performed, none required.** No real Redis, database, Gemini, TMDB,
production admin endpoint, or network resource was contacted. GitHub Actions was
not used (account-level billing lock, unchanged). All reproduction is local with
controlled fakes.

## 54. Files created, modified, or deleted

**In the repository:** created — this report only
(`docs/reports/diagnostics/BUG-CACHE-INVALIDATION-INFLIGHT-REPOPULATION-DIAGNOSIS.md`,
untracked). **Modified — none. Deleted — none.** Production source, tests,
package files, lockfile, CI, audit-policy files, and the exception record are
byte-identical (re-verified in §55).

**Outside the repository (scratch, deliberately retained for Step 2 authoring):**
`<external-scratch>/p15-repro/` — `src/cache.ts` (copy, import
rewired), `src/cache-namespace.ts` (copy), `src/redis-stub.ts`,
`src/fake-redis.ts`, `repro.ts`, `compiled/*`, `probe.js`, `probe2.js`,
`run-repro.js`, `out.log`, `err.log`. These are scratch artifacts, not
deliverables; Step 2's vitest suite supersedes them. No temporary file was left
inside the repository.

## 55. Final Git state

| Check | Result |
|---|---|
| `git rev-parse HEAD` | `a89c1fb39df3139c7200fcd172357df3b247c54e` — **unchanged** |
| Branch | `work/phase-12-cache-invalidation-diagnosis` — unchanged |
| `git status --porcelain=v2 --branch` | clean, plus this one untracked report; **no other new untracked path** |
| `git diff --cached --name-status` | **empty** |
| `git diff --name-status` | **empty** |
| Re-computed hashes | `lib/cache.ts` `6491ab38…`, `lib/cacheManager.ts` `ef8a9d3a…`, `lib/cache-namespace.ts` `d7e150e0…`, `tests/ai-similar-cache-invalidation.test.ts` `e56be0eb…`, `package.json` `8896865a…`, `package-lock.json` `a8f5214e…`, `config/audit-exceptions.json` `ee7a771f…`, `scripts/audit-policy.mjs` `a06a4bee…` — **all identical to the §6 baseline** |
| Commits created | **none** |
| Pushes | **none** |
| Merges | **none** |
| Deployments | **none** |
| Remote refs (`origin/main`, `origin/release/phases-2-11-verified`, PR #14) | **untouched** (no fetch/push or branch operations this phase) |
| Real Redis / DB / Gemini / TMDB / admin endpoints | **never contacted** |

## 56. Phase attribution

Phase 15 attribution is limited to the untracked diagnostic report. Existing
local release commits remain unchanged. Nothing staged. HEAD unchanged. No
commit, push, merge, or deployment occurred.

## 57. Commit status

**No commit.** `git diff --cached --name-status` is empty; no `git add`, `git
commit`, or equivalent was executed (prompt §D/§17).

## 58. Push status

**No push.** No `git push`, no remote-touching operation, no upstream configured
for this branch.

## 59. Merge status

**No merge.** No `git merge`, `rebase`, `cherry-pick`, or equivalent.

## 60. Deployment status

**No deployment.** No build-for-deploy, no `vercel`/platform invocation, no
production mutation of any kind.

---

## 61. Requirement Traceability Matrix

`Requirement ID → Evidence → Validation → Status`

| ID | Requirement | Evidence | Validation | Status |
|---|---|---|---|---|
| CACHE-RACE-DIAG-1 | Reconstruct cache and producer lifecycle | §8 (§8 flows 1–9, per-operation state/ordering with line refs) | all operations traced with awaited boundaries | PASS |
| CACHE-RACE-DIAG-2 | Document in-flight registry semantics | §11 (contract table + delete-vs-registry + 4-class matrix) | registry read/write/delete points cited to lines | PASS |
| CACHE-RACE-DIAG-3 | Prove or reject the write-after-invalidation race | §16 timeline; §34 reproduction (22/22, both tiers) | deterministic targeted test + source trace | PASS |
| CACHE-RACE-DIAG-4 | Establish memory and Redis behavior | §9, §10, §20, §21 (S1 memory-only, S2 FakeRedis) | reproduction covers both tiers + outage cases (§8 cases 8–9) | PASS |
| CACHE-RACE-DIAG-5 | Establish request-B and same-key coalescing behavior | §17 (S3 join), §12 (coalescing proof S7 + R4-G) | deterministic barriers; coalescing preserved | PASS |
| CACHE-RACE-DIAG-6 | Establish cross-process and serverless limitations | §22, §23, §24 (H7 rejected; F-1 separate finding) | structural analysis; no cross-process execution performed | PASS WITH WARNING (cross-process not executed — process-local harness by construction) |
| CACHE-RACE-DIAG-7 | Assess cancellation, security, and operational impact | §27 (cancellation), §26 (security inventory), §40 (impact), §49 (risks) | source inventory of AbortController/signals; security paths verified | PASS |
| CACHE-RACE-DIAG-8 | Compare generation, tombstone, token, Redis, and residual-risk options | §28–§32 (rejected designs + token design) | each with files/API/memory/Redis/cross-process/failure modes | PASS |
| CACHE-RACE-DIAG-9 | Define a deterministic RED-to-GREEN plan | §46 (15 scenarios with exact assertions + barriers), §46 (validation order) | failure modes restricted to the race per prompt §12 | PASS |
| CACHE-RACE-DIAG-10 | Recommend the smallest safe correction and exact Step 2 scope | §29 (token design complete shape), §45 (3 files, explicit exclusions) | H14 confirmed; cross-process carved out (H15) | PASS |
| CACHE-RACE-DIAG-11 | Preserve audit policy, prior commits, remote branch, and PR state | §48 (exception untouched, expiry recorded), §55 (hashes identical, remotes untouched) | pre/post hash comparison | PASS WITH WARNING (committed exception expiry 2026-10-17 is in the past; owner decision needed before Step 2 gates 11–12 — flagged, unresolvable in read-only scope) |
| CACHE-RACE-DIAG-12 | Preserve repository and external state | §55 (index/worktree/HEAD/commits/push/merge/deploy), §53 (no external contact), §54 (one untracked report) | change-control re-run after diagnosis | PASS |

---

## 62. Step 2 recommendation

Proceed to Step 2 with the **smallest complete correction**: the per-flight
mutable invalidation entry + in-flight eviction + `.finally` ownership fix,
implemented solely in `lib/cache.ts`, driven by the 15-scenario RED suite of
§46 (RED-1…RED-3 must fail on trunk first), validated per §46's ladder, on the
Node 22.13.1 runtime of record. Cross-process remediation (Redis-side
conditional writes / pub/sub) is explicitly **not** part of Step 2 and requires
a separate authorization (F-1). Before Step 2's audit-policy gates, the owner
must resolve the expired braces exception (2026-10-17) — Phase 15 leaves it
untouched.

## 63. Requirement-by-requirement checklist (prompt §18 completion criteria)

| Criterion | Status |
|---|---|
| cache lifecycle fully reconstructed | ✅ §8 |
| in-flight registry fully documented | ✅ §11 |
| exact race timeline established | ✅ §16 (T0–T8 + §17) |
| same-process behavior determined | ✅ §8/§16/§17 |
| memory behavior determined | ✅ §9/§20 |
| Redis behavior determined | ✅ §10/§21 |
| request-B behavior determined | ✅ §17/S3 |
| cross-process limitations classified | ✅ §22–§24, F-1 |
| cancellation semantics assessed | ✅ §27 |
| at least six options compared | ✅ §28–§32 (rejected designs + token) |
| memory-growth implications assessed | ✅ §32 |
| security impact assessed | ✅ §26 |
| existing tests inventoried | ✅ §33 |
| deterministic reproduction attempted safely | ✅ §34 (22/22, external scratch) |
| meaningful RED plan defined | ✅ §46 |
| preferred fix selected | ✅ §29 |
| exact Step 2 files listed | ✅ §45 |
| validation plan defined | ✅ §46–§47 |
| repository state preserved | ✅ §55 |
| no external cache or network contacted | ✅ §53 |
| no commit, push, merge, or deployment occurs | ✅ §57–§60 |

**Final status: PASS WITH WARNINGS**

Warnings:
- cross-process race remains a separate finding (F-1),
- Redis-outage delete inconsistency remains separate (F-2),
- production frequency is unknown (H12 UNRESOLVED),
- audit exception is expired (2026-10-17T23:59:59Z),
- Step 2 cannot claim full release-gate completion without an owner decision on
  audit policy.

Explicit prints (prompt §L):
- generation-map references remaining: **0 in recommendations** (the bounded
  generation-map design appears only in the historical rejected-design section
  §28; the sole recommended design is the per-flight token).
- preferred design: **per-flight mutable invalidation entry** `{ promise,
  invalidated }` (§29 semantics 1–14).
- capacity-eviction rule: **present** (§32 — mark `oldestEntry.invalidated =
  true` before registry removal; RED/GREEN scenarios 12–13).
- clearScoped in-flight matching: **present** (§31 — iterate matching entries
  from the in-flight registry, mark invalidated, remove only if still current).
- final RED/GREEN scenario count: **15** (§46 RED-1…RED-15).
- formatting verification: **PASS** (all headings ordered, fences balanced,
  tables complete, no generation-map design as preferred fix, no local
  machine-specific paths).
- Git change-control result: **PASS** (only the untracked Phase 15 diagnostic
  report changed; index empty; HEAD `a89c1fb` unchanged; no commit/push/merge/
  deployment).

**READY FOR STEP 2 IMPLEMENTATION, AUDIT-GATE DECISION PENDING**
