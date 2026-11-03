# Phase 12 — CACHE-OPS-001 / BUG-AI-SIMILAR-CACHE-INVALIDATION-GAP — Read-Only Diagnosis

**Finding ID:** CACHE-OPS-001
**Bug ID:** BUG-AI-SIMILAR-CACHE-INVALIDATION-GAP
**Phase:** 12 — AI-Similar Cache Invalidation Diagnosis
**Prompt type:** LOCAL BRANCH SETUP + READ-ONLY DIAGNOSTIC
**Diagnostic status:** READ-ONLY DIAGNOSIS ONLY. Step 1 of the mandatory two-step protocol.
**Risk level:** MEDIUM

> **NO FIX WAS IMPLEMENTED.** This phase is read-only. No application source,
> test, configuration, package, lockfile, CI, or external system was modified.
> The only authorized mutations were (a) creating one local branch and
> (b) writing this report. Step 2 (the correction) is specified in §39–§42 but
> **not executed**.

---

## 1. Executive summary

CACHE-OPS-001 is a **confirmed invalidation key-coverage defect**. The AI-similar
route (`app/api/movie/[id]/ai-similar/route.ts:174`) stores its enriched result
under a **versioned, public/shared, scoped cache key**:

```
movie-recommendation-system:{env}:v1:public:ai-similar:{movieId}_v2
```

The movie-invalidation helper (`lib/cacheManager.ts:22-30`)
`invalidateMovieCache(movieId)` deletes exactly three keys —
`movie:{id}:details`, `movie:{id}:recommendations`, `movie:{id}:similar` — and
**none of them is the AI-similar v2 key**. The v2 key is therefore **never
invalidated by any code path in the repository**; staleness is bounded solely by
the 24-hour TTL (86 400 s).

Secondary finding (correcting the Phase 9 diagnosis): because the v2 key lives
under the `public:ai-similar` scope, **the admin `list` endpoint DOES see it**
(its key tail matches the `public:ai-similar*` SCAN pattern). Phase 9 §29.2 and
§31 asserted the opposite for the *v1* key shape; that statement remains true for
v1 but is **false for v2**. So this is *not* an admin-visibility defect — it is
purely a **key-coverage gap in the invalidation helper**.

There is **no evidence of frequent production impact** (no metrics are available
in this phase and none were claimed), and the 24 h TTL bounds staleness. But the
gap is real, deterministic, and provable statically: the fix surface is small and
local to one helper.

**Root-cause classification:** INVALIDATION KEY-COVERAGE DEFECT
**Reproducibility:** DETERMINISTIC STATIC
**Impact:** STALE AI-SIMILAR DATA + MANUAL RECOVERY GAP
**Production impact:** NOT DEMONSTRATED (theoretical; no metrics collected)
**Confidence:** HIGH
**Final status:** PASS WITH WARNINGS

---

## 2. Diagnostic status

| Item | Value |
|---|---|
| Step | 1 (diagnosis only) |
| Source modified | NO |
| Tests modified | NO |
| Cache mutated | NO |
| Redis contacted | NO (mocked or unused in all executed tests) |
| Database contacted | NO (mocked in all executed tests) |
| Gemini contacted | NO (fetch intercepted in all executed tests) |
| TMDB contacted | NO (fetch intercepted in all executed tests) |
| Admin endpoint invoked | NO |
| Commit / stage / push / merge / deploy | NO (all explicitly refused) |
| Report | This file — the only Phase 12 deliverable |

---

## 3. Finding and bug identity

| Field | Value |
|---|---|
| Finding ID | CACHE-OPS-001 |
| Bug ID | BUG-AI-SIMILAR-CACHE-INVALIDATION-GAP |
| First identified | Phase 9 (`PHASE-9-…-COMPLETION-REPORT.md` §10, row CACHE-OPS-001, status **OPEN**) |
| Re-identified | Phase 9 diagnosis §29.1 and §31 |
| Current status at HEAD `6f0595ab` | **STILL OPEN — confirmed by this diagnosis against committed source** |
| Class | Cache invalidation key-coverage gap |
| Severity | MEDIUM (operational + bounded stale-data risk) |

CACHE-OPS-001 was **explicitly and deliberately left open** by Phase 9 (§31:
"identified, deliberately not fixed here … flagged for a future phase"). Phase 12
is that future phase's **diagnosis step**.

---

## 4. Relationship to PERF-001 and PERF-001b

| ID | Scope | Relationship to CACHE-OPS-001 |
|---|---|---|
| PERF-001 | Bound enrichment fan-out to pool-4 (Phase 8) | Independent. Bounds *concurrency*, not *staleness*. Does not touch cache keys or invalidation. No interaction. |
| PERF-001b | Warm hit performs zero upstream work (Phase 9) | **Direct precursor.** Phase 9 moved enrichment *inside* the `getOrSet` producer so a warm hit returns the **final enriched array**. That is exactly what made the missing invalidation *more consequential*: a stale v2 entry now carries stale posters/ratings/ids, not just stale titles. Phase 9 §31 documented this as risk R8 and chose the 24 h TTL as the interim mitigation. CACHE-OPS-001 is the residue of that deliberate scope decision. |
| CACHE-OPS-001 | This finding | Not part of PERF-001/PERF-001b. It is the invalidation counterpart that neither PERF item addressed. |

---

## 5. Initial environment

| Property | Recorded value |
|---|---|
| Repository root | `D:/fork ai to create website/final porject/movie-recommendation-system` |
| OS | Windows 10 (MINGW64_NT-10.0-19045, Msys 3.6.3, x86_64) |
| Shell | `/usr/bin/bash` (git-bash / MSYS) |
| Node | `v26.7.0` |
| npm | `11.19.0` |
| Git | `2.50.1.windows.1` |
| Test runner | Vitest `4.1.11` (devDependency `^4.1.11`) |

> **Note on Node version.** The prompt references a "Node 22.13.1" runtime. The
> version **actually available on this host is `v26.7.0`**; no other runtime was
> installed or downloaded (per §E a package install/update is forbidden). CI pins
> `node-version: 22` (`.github/workflows/ci.yml`). Results below are therefore
> **unverified on Node 22** — recorded as warning W-1 (§44).

---

## 6. Initial Git state (pre-branch)

Recorded before any Git mutation:

```
$ git rev-parse HEAD
6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f

$ git rev-parse --abbrev-ref HEAD
main

$ git rev-parse --abbrev-ref --symbolic-full-name '@{u}'
origin/main

$ git rev-list --left-right --count '@{u}...HEAD'
0	11        # 0 behind, 11 ahead

$ git status --porcelain=v2 --branch
# branch.oid 6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f
# branch.head main
# branch.upstream origin/main
# branch.ab +11 -0
? .chunks/
? .inbox3.txt
? .my_tool_sandbox/
? .phase11-prompt.txt
? as_route_copy.txt
? cqq.txt
? cqq_full.txt
? failed_block.txt
? nul
? route_dump.txt

$ git diff --cached --name-status
(empty — nothing staged)

$ git diff --name-status
(empty — no tracked modifications)

$ git ls-files --others --exclude-standard | wc -l
63
```

**Observations:**
- HEAD **matches** the prompt's verified release HEAD `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f`.
- Working tree is **clean of tracked changes** (staged empty, tracked diff empty).
- 63 untracked paths, all pre-existing scratch: `.chunks/` (27), `.my_tool_sandbox/`
  (27), plus `.inbox3.txt`, `.phase11-prompt.txt`, `as_route_copy.txt`, `cqq.txt`,
  `cqq_full.txt`, `failed_block.txt`, `nul`, `route_dump.txt`. **None is a Phase 12
  deliverable** and all were left untouched.
- `git status --porcelain` collapses untracked **directories**; the true file count
  requires `git ls-files --others --exclude-standard` (63, not 10).

---

## 7. Local branch setup

**Authorized mutation #1.** The prompt forbids `git checkout` (§E line 207) but
requires creating a local branch and switching onto it (§C). I used
`git switch -c`, the purpose-built, non-forbidden equivalent that cannot overwrite
working-tree files, with the required commit pinned explicitly. This is the
narrowest reading consistent with both constraints.

```
$ git switch -c 'work/phase-12-cache-invalidation-diagnosis' '6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f'
Switched to a new branch 'work/phase-12-cache-invalidation-diagnosis'
```

**Post-branch verification:**

```
$ git rev-parse --abbrev-ref HEAD
work/phase-12-cache-invalidation-diagnosis

$ git rev-parse HEAD
6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f     # UNCHANGED

$ git status --porcelain=v2 --branch
# branch.oid 6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f
# branch.head work/phase-12-cache-invalidation-diagnosis
? .chunks/  ? .inbox3.txt  ? .my_tool_sandbox/  ? .phase11-prompt.txt
? as_route_copy.txt  ? cqq.txt  ? cqq_full.txt  ? failed_block.txt
? nul  ? route_dump.txt

$ git diff --cached --name-status
(empty)

$ git diff --name-status
(empty)

$ git ls-files --others --exclude-standard | wc -l
63      # unchanged — scratch untouched
```

| Requirement | Result |
|---|---|
| Branch created from `6f0595ab…` | PASS |
| Branch name exactly `work/phase-12-cache-invalidation-diagnosis` | PASS |
| Name did not already exist locally | PASS (checked with `git branch --list` before creation — empty) |
| HEAD unchanged | PASS |
| Index empty | PASS |
| Tracked diff empty | PASS |
| Scratch/prompt paths untouched | PASS |
| No upstream set | PASS (no `branch.upstream` line in porcelain v2) |
| No overwrite of an existing branch | PASS (`-c` creates; branch did not exist) |
| `main` untouched | PASS |
| Remote release branch untouched | PASS |
| PR #14 untouched | PASS (no `gh`/remote interaction at all) |

Branch creation was the **only** Git-state mutation in this phase.

---

## 8. Applicable instructions

| Source | Status | Note |
|---|---|---|
| `AGENTS.md` | **NOT PRESENT** at repository root (`ls` → No such file) | Verified; nothing to apply |
| `.cursor/rules/*.mdc` | **NOT PRESENT** (`.cursor/rules/` does not exist) | Verified; nothing to apply |
| `package.json` scripts | READ | `test` = `vitest run`; `lint` = `eslint .`; `typecheck` = `tsc --noEmit`; `build` = `next build` |
| `vitest.config.mts` | READ | Two projects: `node` (`tests/**/*.test.ts`) and `dom` (`tests/**/*.test.tsx`); `@` alias → repo root; coverage `include` covers `app/api/**/*.ts` and `lib/security/**` — **`lib/cache.ts` and `lib/cacheManager.ts` are NOT in the coverage include set** |
| `.github/workflows/ci.yml` | READ | Node 22; `npm ci`; lint; typecheck; `npm test`; coverage; `npm audit --audit-level=high --omit=dev` (L92); `next build` with placeholder env |
| Prompt §9 constraint | HONORED | `--reporter=basic` was **not** used (Vitest 4.1.11 treats `basic` as a custom reporter module and fails to load it) |
| Prompt §E immutable rules | HONORED | No source/test/config/package/CI/env edit; no Redis/DB/Gemini/TMDB contact; `.env`/`.env.local` **never opened** |

> No `AGENTS.md` and no `.cursor/rules/` exist in this repository, so no
> repository-specific agent instructions modified the diagnosis. The prompt's own
> §D/§E constraints were the governing instructions.

---

## 9. Files and symbols inspected

**Read in full:**
- `lib/cache.ts` (366 lines) — `RedisCache`, `ns()`, `set`, `get`, `getFromMemoryCache`,
  `delete`, `scanNamespacedKeys`, `clearScoped`, `clearMemoryPrefix`, `getOrSet`,
  `safeRedisOp`, `memoryCache`, `inflightPromises`
- `lib/cache-namespace.ts` (89 lines) — `CACHE_NAMESPACE`, `LEGACY_NAMESPACE`,
  `CACHE_SCOPES`, `CacheScope`, `buildCacheKey`, `applyNamespace`,
  `normalizeKeyComponent`, `isNamespacedKey`, `MAX_KEY_LENGTH`, `SCAN_BATCH_SIZE`,
  `MAX_DELETE_KEYS_PER_REQUEST`, `MAX_SCAN_RESULTS`
- `lib/cacheManager.ts` (222 lines) — `invalidateMovieCache`, `invalidateTVCache`,
  `invalidateHomeCache`, `invalidateCacheKey`, `safeRedisOp`, `getCacheStats`,
  `clearAllCache`, `findCacheKeys`, `listKeys`
- `app/api/movie/[id]/ai-similar/route.ts` (363 lines) — `GET`, cache-key
  construction at L174, `getOrSet` producer L180–351, `ENRICHMENT_POOL_SIZE`,
  `getAISimilarMovies`, empty-result `undefined` at L347, response L353–355
- `app/api/admin/cache/route.ts` (250 lines) — `GET` (stats/list), `POST`
  (invalidate/clear), `DELETE` (clear), `invalidateSchema`, `clearSchema`,
  `allowedScopes` (incl. `public:ai-similar`), `requireAdmin`,
  `assertSameOriginOrReject`, `applyRateLimitUser`
- `lib/redis.ts` (138 lines) — `getRedisClient`, `isClientUsable`, connection
  blocking, health gate
- `tests/redis-cache-security.test.ts` (434 lines) — R4-A…R4-H
- `tests/cache-key-normalization.test.ts` (30 lines) — W3-010
- `tests/ai-similar-enrichment-concurrency.test.ts` (821 lines, 16 tests) — read
  fully; harness L1–260 + assertion sites L360–479
- `tests/strict-validation.test.ts` (118 lines) — admin cache POST schema test
- `tests/admin-chat-ai-security.test.ts` (365 lines) — ai-similar auth/rate-limit/400
- `package.json`, `vitest.config.mts`, `.github/workflows/ci.yml`

**Read in part:**
- `docs/reports/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-CORRECTION-COMPLETION-REPORT.md` (full)
- `docs/reports/diagnostics/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-DIAGNOSIS.md` (§28–§33)
- `lib/redis.ts` L1–70

**Not present (prompt §D listed it):**
- `docs/reports/diagnostics/BUG-AI-SIMILAR-CACHE-HIT-REENRICHMENT-DIAGNOSIS.md` —
  **does not exist** at that path. The actual Phase 9 diagnosis file is
  `docs/reports/diagnostics/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-DIAGNOSIS.md`
  (verified with `ls`). The Phase 9 completion report §6 confirms the earlier
  `…WARM-HIT-ENRICHMENT-CORRECTION…` report was deliberately removed and the
  `…HIT-REENRICHMENT…` name does not appear anywhere in the repo. **No substitute
  was fabricated**; the equivalent content was read from the canonical Phase 9
  diagnosis + completion report.

**Grep / search evidence:**
- `invalidateMovieCache` / `invalidateTVCache` / `invalidateHomeCache` /
  `invalidateCacheKey` — repo-wide
- `CACHE_SCOPES.aiSimilar` / `ai-similar` — repo-wide
- `clearScoped` / `findCacheKeys` / `listKeys` / `clearAllCache` / `clearMemoryPrefix`
- `buildCacheKey` / `CACHE_SCOPES` / `getOrSet` / `redisCache.delete` — repo-wide

---

## 10. Exact AI-similar v2 key contract

### 10.1 Source of the key

`app/api/movie/[id]/ai-similar/route.ts:174`:

```ts
const cacheKey = buildCacheKey(CACHE_SCOPES.aiSimilar, `${movieId}:v2`);
```

### 10.2 Builder chain

1. `CACHE_SCOPES.aiSimilar` = `"public:ai-similar"` (`lib/cache-namespace.ts:32`)
2. `CACHE_NAMESPACE` =
   `movie-recommendation-system:{NODE_ENV === 'production' ? 'production' : 'development'}:v1:`
   (`lib/cache-namespace.ts:18-23`). On the local tree, `NODE_ENV` is not
   `production`, so the segment is `development`.
3. `buildCacheKey(scope, resource)` (`lib/cache-namespace.ts:59-66`) normalizes the
   **whole resource string** with `normalizeKeyComponent` — which strips `:` to
   `_` — then concatenates `${CACHE_NAMESPACE}${scope}:${normalized}`.
4. The route passes resource `` `${movieId}:v2` ``. The `:` becomes `_`, so the
   **literal `42:v2` is stored as `42_v2`**.
5. The built key is then passed to `redisCache.getOrSet(...)`, whose internal
   `ns()` (`lib/cache.ts:134-145`) treats an already-namespaced key as idempotent
   and normalizes each `:`-separated **component** again. Because
   `buildCacheKey` already collapsed the only affected separator, `ns()` is a
   no-op here.

### 10.3 Verified runtime shapes (probe, §47 command 3)

```
CACHE_NAMESPACE        = "movie-recommendation-system:development:v1:"
v2  buildCacheKey()    = "movie-recommendation-system:development:v1:public:ai-similar:42_v2"
v2  STORED (after ns())= "movie-recommendation-system:development:v1:public:ai-similar:42_v2"   # idempotent
v1  STORED             = "movie-recommendation-system:development:v1:movie:42:ai-similar"
invalidateMovieCache deletes:
  "movie-recommendation-system:development:v1:movie:42:details"
  "movie-recommendation-system:development:v1:movie:42:recommendations"
  "movie-recommendation-system:development:v1:movie:42:similar"
admin listKeys pattern = "movie-recommendation-system:development:v1:public:ai-similar*"
clearAllCache pattern  = "movie-recommendation-system:development:v1:*"
```

### 10.4 Full key contract table (synthetic movie id `42`)

| Property | Value for the AI-similar v2 key |
|---|---|
| Source file | `app/api/movie/[id]/ai-similar/route.ts:174` |
| Key-building function | `buildCacheKey(CACHE_SCOPES.aiSimilar, \`${movieId}:v2\`)` → `redisCache.getOrSet` → `ns()` |
| Scope | `public:ai-similar` (`CACHE_SCOPES.aiSimilar`) |
| Resource identifier | `${movieId}:v2`, normalized to `${movieId}_v2` |
| Global cache version | `v1` (from `CACHE_NAMESPACE`; `CACHE_VERSION = "v1"`, `lib/cache-namespace.ts:21`) |
| Route-local version | `v2` (route-local suffix in the resource segment) |
| **Final key shape** | `movie-recommendation-system:{env}:v1:public:ai-similar:{movieId}_v2` |
| User-scoped or public/shared | **Public / shared** — no user identity in the key (`.email` appears only at L153 as the rate-limit argument; `buildCacheKey` never receives it) |
| TTL | `86400` s (24 h), route L350 |
| Producer | `getOrSet` producer L180–351 (details → Gemini → similar/popular fallback → pool-4 enrichment → null-id filter) |
| Readers | The ai-similar route only (`redisCache.getOrSet` at L180) |
| Deletion path | **NONE** in `invalidateMovieCache`. Reachable only by `clearAllCache` (global) or a direct `redisCache.delete(exactKey)` — which no code path performs for this key |
| Listing path | `GET /api/admin/cache?action=list&scope=public:ai-similar` → `cacheManager.listKeys("public:ai-similar")` → `findCacheKeys(\`${CACHE_NAMESPACE}public:ai-similar*\`)` → **matches** (verified: v2 stored key startsWith `movie-recommendation-system:development:v1:public:ai-similar`) |
| Invalidation path | **MISSING — this is CACHE-OPS-001** |

> **Production vs development.** In production the third segment is `production`
> instead of `development`; nothing else changes. All shapes in this report are
> source-derived with the synthetic movie id `42`; **no live Redis key was ever
> read or printed**.

### 10.5 Correction to the Phase 9 record

Phase 9 diagnosis §29.2 states the ai-similar key "lands outside that scope and is
**not** listed by the `public:ai-similar` filter", and §31's table row
`movie:{id}:ai-similar | **Nothing**` describes only the v1 key. Both were written
against the **pre-Phase-9 v1 shape** (`movie:{id}:ai-similar`), for which they are
correct. They are **incorrect for the current v2 shape**, which IS under the
`public:ai-similar` scope and IS listed. This diagnosis corrects the record; it
does not change any code.

---

## 11. Memory-cache behavior

`lib/cache.ts`:

- `memoryCache` is a module-level `Map<string, { value: string; expiry: number; lastAccess: number }>` (L15), bounded by `MAX_MEMORY_ENTRIES = 5000` (L14) with periodic expiry cleanup + LRU eviction (L32-54).
- **Write (`set`, L147-165):** always writes memory **first** (never fails), then Redis best-effort. So every v2 key also exists in memory in the writing process.
- **Read (`get`, L167-184):** **Redis first**, then memory. Redis is the preferred read path; memory is the fallback.
- **`getOrSet` (L313-359):** reads memory-before-Redis via `get()`; on miss, dedupes concurrent producers per fully-namespaced key via `inflightPromises` (L25, L331-357), then `set()`s the result (memory + Redis best-effort).
- **Delete (`delete`, L206-215):** removes from **memory** (`memoryCache.delete`, unconditionally) **and** Redis (`redis.del`, best-effort). **Both tiers.**
- **`clearMemoryPrefix(filter)` (L297-307):** memory-only, prefix-scoped; strips a trailing `*` then `startsWith` match.
- **`clearScoped(match)` (L255-292):** memory first via `clearMemoryPrefix(match)`, then Redis via bounded `scanNamespacedKeys` + batched `del`; returns `CacheClearResult`.
- **Redis unavailable:** `safeRedisOp` returns `null` and the caller degrades to memory silently (`set` still writes memory; `get` reads memory; `delete` still removes memory). `clearScoped` returns `{ deleted: 0, remaining: false, complete: false, degraded: true, reason: "redis-unavailable", clearedMemory }`.

**Consequence for CACHE-OPS-001:** `redisCache.delete()` is already tier-consistent
(memory + Redis). A fix that routes the v2 key through `redisCache.delete()` — the
same call `invalidateMovieCache` already makes for its three keys — needs **no
extra memory-tier work**. Verified statically at `lib/cache.ts:206-215`.

---

## 11b. Coverage-config observation

`vitest.config.mts` `coverage.include` lists `app/api/**/*.ts`, `lib/security/**/*.ts`,
`lib/ai-security.ts`, `lib/ai-markdown.tsx`, `lib/gemini-payload.ts`, and two
components. **`lib/cache.ts` and `lib/cacheManager.ts` are NOT in the include
set.** Coverage therefore does not instrument the invalidation helper at all. This
is an observation about configured coverage scope, not a defect in the fix, and it
is **out of scope** for Step 2 (no config change is proposed).

---

## 12. Redis behavior

The Redis tier is reached only through `RedisCache` in `lib/cache.ts`, and every
operation funnels through `safeRedisOp` (`lib/cache.ts:84-124`), which resolves the
client via `getRedisClient()` (`lib/redis.ts:35+`).

| Operation | Redis command | Behavior when Redis is unavailable |
|---|---|---|
| `set(key, value, ttl)` (L147-165) | `SET … EX ttl` | Memory write still happens (unconditional); Redis write silently skipped |
| `get(key)` (L167-184) | `GET` | Falls through to `getFromMemoryCache` |
| `delete(key)` (L206-215) | `DEL` | Memory delete is **unconditional**; Redis delete skipped |
| `clearScoped(match)` (L255-292) | bounded `SCAN` (MATCH, COUNT 100) + batched `DEL` | Returns `{deleted:0, remaining:false, complete:false, degraded:true, reason:"redis-unavailable", clearedMemory}` |
| `getOrSet` (L313-359) | `GET`, then `SET` | Reads memory on `GET` miss; producer result written to memory + best-effort Redis |

**Redis-tier security properties (relevant to §25):** `SCAN`/`DEL` never touch a
key that fails `isNamespacedKey` (`lib/cache.ts:240-243`, L190-193); `KEYS` is
never called; `FLUSHDB`/`FLUSHALL` are never called (both proven by
`tests/redis-cache-security.test.ts` R4-A, §27).

**Redis-tier implication for CACHE-OPS-001:** the v2 key is stored in Redis exactly
as the probe recorded it (`…:public:ai-similar:42_v2`). `redisCache.delete()`
already reaches that key with a single `DEL`. No Redis-side change is needed — the
tier is capable; the helper simply never asks.

---

## 13. In-flight producer behavior

`getOrSet` de-duplicates concurrent misses per **fully-namespaced key** via the
module-level `inflightPromises` map (`lib/cache.ts:25`, L313-359):

1. `get(namespacedKey)` — cache hit returns immediately (warm path).
2. On miss, `inflightPromises.get(namespacedKey)` — an existing in-flight promise
   for the same key is shared, so concurrent callers do not duplicate the producer.
3. Otherwise the producer runs; on resolve it `set()`s the result (memory + Redis
   best-effort), and `.finally()` releases the in-flight slot so retries are
   possible after rejection.

The map is bounded to `MAX_INFLIGHT_ENTRIES = 1000` (L26, L351-356) by evicting the
oldest entry.

**The assessed race (prompt §5):** producer starts → admin invalidation runs
(`delete(v2Key)`, memory + Redis) → producer completes and `set()` re-writes the
key (`lib/cache.ts:336-344`) → the cache is repopulated with data computed from a
pre-invalidation snapshot. **No generation token or version guard** distinguishes a
pre-invalidation result from a post-invalidation one, so the stale write succeeds.

**Classification:** **SEPARATE RESIDUAL RISK** — not part of CACHE-OPS-001. It
exists identically today for the three keys the helper already deletes, and adding
the v2 key neither introduces nor worsens it. Per the prompt, no locking or
generational mechanism is implemented or proposed in this phase (§43).

---

## 14. Movie invalidation flow

### 14.1 The invalidation surface

| Function | Keys deleted | AI-similar v2 reached? |
|---|---|---|
| `invalidateMovieCache(movieId)` (`lib/cacheManager.ts:22-30`) | `movie:{id}:details`, `movie:{id}:recommendations`, `movie:{id}:similar` | **NO** |
| `invalidateTVCache(tvId)` (L35-43) | `tv:{id}:details`, `tv:{id}:recommendations`, `tv:{id}:similar` | N/A |
| `invalidateHomeCache()` (L48-54) | `movies:home`, `tv:top-rated` | N/A |
| `invalidateCacheKey(key)` (L55-57) | one caller-supplied key | **NO** — and it has **zero callers** anywhere in the repo |

### 14.2 Callers of `invalidateMovieCache`

Exhaustive repo-wide grep (`--include=*.ts --include=*.tsx`, excluding
`node_modules` and `.next`) found exactly **four** references:

| Location | Role |
|---|---|
| `lib/cacheManager.ts:22` | definition |
| `app/api/admin/cache/route.ts:144` | **the only production caller** (POST `action:"invalidate"`, `type:"movie"`) |
| `tests/strict-validation.test.ts:58` | test mock (`mocks.cacheInvalidateMovie`) |
| this report | documentary reference |

**There is no application code path** — favorites, watchlist, history, ratings,
reviews, admin movie edits, or otherwise — that invalidates a movie cache when
movie data changes. Movie invalidation is reachable **only** through the admin
endpoint. CACHE-OPS-001 is therefore an **operational/admin gap**, not a
write-path data-consistency bug.

### 14.3 Per-path tier behavior

| Path | Deletes details? | recommendations? | AI-similar v1? | AI-similar v2? | Memory tier | Redis tier |
|---|---|---|---|---|---|---|
| `invalidateMovieCache` | YES | YES | NO | **NO** | yes (via `delete`) | yes (via `delete`) |
| `invalidateTVCache` | N/A (tv keys) | N/A | NO | NO | yes | yes |
| `invalidateHomeCache` | NO | NO | NO | NO | yes | yes |
| `invalidateCacheKey` | only the given key | only the given key | only if handed that exact key (never happens) | only if handed that exact key (never happens) | yes | yes |
| Admin POST `clear` / DELETE (`clearAllCache`) | YES | YES | YES | YES | yes (`clearMemoryPrefix`) | yes (SCAN+DEL) |
| `clearScoped("${CACHE_NAMESPACE}*")` (internal) | YES | YES | YES | YES | yes | yes |

### 14.4 Redis-unavailable behavior

- `RedisCache.delete` (`lib/cache.ts:206-215`): memory delete is unconditional;
  the Redis `del` is wrapped in `safeRedisOp`, which returns `null` (logs once per
  minute per error class) on failure. **The memory tier is always cleared.**
- `clearScoped` (L255-292): memory cleared first, then Redis best-effort; on Redis
  failure it returns `{ deleted: 0, remaining: false, complete: false, degraded:
  true, reason: "redis-unavailable", clearedMemory }` — **truthful to operators**.

**Earliest missing invalidation relationship:** `invalidateMovieCache` should
delete `buildCacheKey(CACHE_SCOPES.aiSimilar, "${movieId}:v2")` — the key the
ai-similar route writes at `route.ts:174` — and it does not. That is the single
missing edge, and it is the whole of CACHE-OPS-001.

| Key | Invalidated by | TTL expiry |
|---|---|---|
| `movie-recommendation-system:{env}:v1:movie:{id}:details` | `invalidateMovieCache` | — |
| `movie-recommendation-system:{env}:v1:movie:{id}:recommendations` | `invalidateMovieCache` | — |
| `movie-recommendation-system:{env}:v1:movie:{id}:similar` | `invalidateMovieCache` | — |
| AI-similar **v1** (legacy) | `movie-recommendation-system:{env}:v1:movie:{id}:ai-similar` | **NONE** (TTL only) | 24 h |
| AI-similar **v2** (current) | `movie-recommendation-system:{env}:v1:public:ai-similar:{id}_v2` | **NONE** (TTL only) ← CACHE-OPS-001 | 24 h |

**Earliest incorrect state:** the v2 key was introduced by Phase 9 and
`invalidateMovieCache` was never updated to cover it. The gap has existed since the
Phase 9 change landed; it is **not** a regression introduced after Phase 9 (Phase 9
§10/§31 explicitly left it open).

---

## 15. Admin listing flow

`app/api/admin/cache/route.ts` GET, `action === "list"` (L44-78):

1. `requireAdmin()` — 401/403 on failure.
2. `scope` param, default `"public:tmdb"`.
3. **Allowlist** (L48-54): `public:tmdb`, `user:recommendations`, `security:rate-limit`,
   `admin:cache-metadata`, **`public:ai-similar`**. Invalid scope → 400.
4. `scope` sanitized: `scope.replace(/[^a-zA-Z0-9:_-]/g, "")`.
5. `limit` clamped to `1…200`, default 100.
6. `cacheManager.listKeys(scope, limit)` →
   `findCacheKeys(\`${CACHE_NAMESPACE}${normalizedScope}*\`)` → bounded SCAN.
7. Response returns **sanitized key tails** only (namespace stripped, tail truncated
   to 75 chars + `...` beyond 78), with `count`.

**Does `CACHE_SCOPES.aiSimilar` appear in the listing?** **YES** — it is an explicit
allowlist entry (L53). **Does a current v2 entry match the prefix?** **YES** —
verified by probe: the stored v2 key
`movie-recommendation-system:development:v1:public:ai-similar:42_v2` starts with
`movie-recommendation-system:development:v1:public:ai-similar`, so
`findCacheKeys("…:public:ai-similar*")` returns it.

**Therefore:** admin listing **CAN** locate current AI-similar v2 entries. The
admin can see the entry exists and can see its sanitized tail
(`public:ai-similar:42_v2`). This **corrects** Phase 9 §29.2.

**Can it count entries?** Yes — `count: sanitized.length` in the response, bounded
by `limit` and by `MAX_SCAN_RESULTS = 2000`.

**Can memory-cache entries be listed?** NO — `findCacheKeys`/`listKeys` are
Redis-only (`safeRedisOp` → SCAN). A v2 entry that exists **only** in the
process-local memory map (Redis down) is invisible to admin listing. Divergence is
therefore possible: listing reports a Redis-only view.

**Is list/delete behavior fully mocked in tests?** Listing and deletion are mocked
in `tests/strict-validation.test.ts` (cacheManager fully replaced L55-62), so no
test exercises the real `listKeys` against a real or fake Redis for the
ai-similar scope. `tests/redis-cache-security.test.ts` exercises the real
`findCacheKeys`/`clearScoped` against a FakeRedis, but only for `public:tmdb`.

---

## 16. Admin deletion flow

`app/api/admin/cache/route.ts`:

- **POST `action: "clear"`** (`clearSchema`, L99-101, L174-190) →
  `cacheManager.clearAllCache()` → `redisCache.clearScoped(\`${CACHE_NAMESPACE}*\`)`.
  Deletes **every** namespaced key, including both v1 and v2 AI-similar keys. Both
  tiers. Global flush of the application namespace — the very thing a targeted fix
  should avoid.
- **DELETE** (L204-249) → identical `clearAllCache()`.
- **POST `action: "invalidate"`, `type: "movie"`** (L139-149) →
  `cacheManager.invalidateMovieCache(String(id))` → deletes only
  `movie:{id}:{details,recommendations,similar}`. **Leaves the AI-similar v2 key
  for that movie intact** — this is the single-movie admin path that most visibly
  exposes CACHE-OPS-001.
- **No single-key, no pattern, no scope-specific delete endpoint exists.** The only
  granularity below "everything" is `type/movie|tv/home`.
- `invalidateCacheKey(key)` exists in `cacheManager` (L55-57) but has **ZERO
  callers** anywhere in the repo (verified repo-wide grep).

**Authorization:** `requireAdmin()` on every handler; `assertSameOriginOrReject`
on POST/DELETE; `applyRateLimitUser(..., RATE_LIMITS.cacheAdmin)`; strict Zod
(`.strict()` rejects unknown keys — proven by `tests/strict-validation.test.ts`
"unknown key is 400").

---

## 17. Scope purge behavior

There is **no dedicated per-scope purge endpoint**. The closest operations:

| Operation | Pattern | v1 reached? | v2 reached? | Tiers |
|---|---|---|---|---|
| `clearAllCache()` (POST clear / DELETE) | `${CACHE_NAMESPACE}*` | YES | YES | memory + Redis |
| `listKeys("public:ai-similar")` (GET list) | `${CACHE_NAMESPACE}public:ai-similar*` | NO (v1 is `…:movie:42:ai-similar`) | **YES** | Redis only (read) |
| `invalidateMovieCache(id)` | three exact `movie:{id}:*` keys | NO | **NO** ← the defect | memory + Redis |

A **scope purge restricted to `public:ai-similar`** (i.e.
`clearScoped(\`${CACHE_NAMESPACE}public:ai-similar*\`)`) would delete all current
v2 entries — and would NOT touch v1 (v1 sits under `movie:{id}:ai-similar`). Such
an operation is **not currently exposed** to admins; only `listKeys` uses that
prefix, and it is read-only.

---

## 18. Single-key deletion behavior

`redisCache.delete(key)` (`lib/cache.ts:206-215`): computes `ns(key)`, deletes from
memory unconditionally, then `redis.del(namespacedKey)` best-effort. It is the
granular, tier-consistent primitive. It is used by:

- `invalidateMovieCache` (3 keys), `invalidateTVCache` (3 keys),
  `invalidateHomeCache` (2 keys), `invalidateCacheKey` (1 key, no callers).

No code path calls `redisCache.delete()` with the AI-similar v2 key. The fix
described in §38 uses exactly this primitive.

---

## 19. Old v1 behavior

| Question | Answer |
|---|---|
| Previous v1 key shape | `movie-recommendation-system:{env}:v1:movie:{id}:ai-similar` (produced by the pre-Phase-9 literal `movie:${movieId}:ai-similar`) |
| Does admin deletion reach v1? | Only via global `clearAllCache` (POST clear / DELETE). `listKeys("public:ai-similar")` does NOT list it. `invalidateMovieCache` does NOT delete it (its `movie:{id}:similar` key is a different key — `similar`, not `ai-similar`). |
| Does the invalidation helper reach v1? | **NO.** `movie:{id}:similar` ≠ `movie:{id}:ai-similar`. |
| Are old v1 keys harmless? | **YES.** The route never reads v1 (it builds and reads only the v2 key — proven by `tests/ai-similar-enrichment-concurrency.test.ts:367-370`, which asserts the v2 key is written and the v1 key is NOT). v1 can only be served by nothing; it simply occupies space until its 24 h TTL expires. |
| Should a scope purge delete both? | Not required. A `public:ai-similar*` purge would miss v1 anyway (different prefix). Global `clearAllCache` already deletes both when a full flush is acceptable. |
| Should single-movie invalidation delete both? | Not necessary. Deleting v1 would be harmless but adds no correctness value — nothing reads v1. |
| Should v1 simply expire naturally? | **YES — recommended.** Phase 9 already chose this ("no dual-read, no migration"), and it is correct. |
| Would v1 cleanup in Step 2 be useful or scope creep? | **SCOPE CREEP.** No code path reads v1; its TTL bounds it. Step 2 should not touch v1. |

---

## 20. Current v2 behavior

| Question | Answer |
|---|---|
| Current v2 key shape | `movie-recommendation-system:{env}:v1:public:ai-similar:{id}_v2` (probe-verified) |
| Stored payload | The **final enriched array** of `{id, title, release_date, poster_path, vote_average, reasoning}` (Phase 9) |
| TTL | 86 400 s (24 h), unchanged |
| Public/shared | Yes — one key serves all users for a movie |
| Empty final results | NOT cached (producer returns `undefined` → `getOrSet` skips the write; route L347, verified by the "empty final not cached" test) |
| Non-empty partial results | Cached verbatim (intentional Phase 9 trade-off) |
| Warm hit | Zero upstream work — no Gemini, no details, no similar, no popular, no `/search` (Phase 9 PERF-001b, tests 1/2/8) |
| Read by | ai-similar route only |
| Deleted by | **Nothing targeted.** Only global `clearAllCache`. |
| Admin-visible | **YES** under `scope=public:ai-similar` (probe-verified; corrects Phase 9 §29.2) |

---

## 21. Multi-tier consistency

| Question | Answer |
|---|---|
| Does `getOrSet` read memory before Redis? | **NO** — `get()` reads **Redis first, then memory** (`lib/cache.ts:167-184`). Memory is the fallback tier, not the primary. |
| Do delete operations remove both tiers? | **YES** — `delete()` removes memory unconditionally and Redis best-effort (L206-215). |
| Does scope deletion remove both tiers? | **YES** — `clearScoped()` calls `clearMemoryPrefix()` then Redis SCAN+DEL (L255-292). |
| Is prefix matching identical across tiers? | **NO.** Memory uses JS `startsWith(prefix)` after stripping a trailing `*` (`clearMemoryPrefix`, L297-307). Redis uses glob `MATCH` with `*`. For the patterns actually used (namespace-anchored prefixes with a trailing `*`), the two are equivalent in effect, but they are not the same mechanism. |
| Can deletion leave a memory entry active after Redis deletion? | **NO** for `delete()`/`clearScoped()` (both remove memory first). **YES** for a hypothetical Redis-only deletion — but no such path exists for the v2 key. |
| Does Redis failure degrade safely? | **YES** — `safeRedisOp` swallows errors and returns `null`; memory serves. `clearScoped` reports `degraded: true, reason: "redis-unavailable"` explicitly. |
| Are invalidation failures surfaced or swallowed? | **Swallowed** by `safeRedisOp` (log once per minute per error class, L98-124). `invalidateMovieCache` returns `void` and never throws to its caller. |
| Can in-process in-flight producers repopulate a key after deletion? | **YES — see §13/§43.** |

---

## 22. Staleness scenarios

What would make an AI-similar v2 entry stale, and how is it currently resolved?

| Event | Makes v2 stale? | Current resolution |
|---|---|---|
| Movie metadata update | YES — the entry embeds `title`, `release_date` | TTL only (24 h) |
| Title change | YES | TTL only |
| Language / localization change | Possibly (prompt language) | TTL only |
| Popularity / rating change | YES — `vote_average` is cached | TTL only |
| Poster change | YES — `poster_path` is cached | TTL only |
| Gemini output improvement (model/prompt change) | YES | TTL only |
| TMDB search-resolution change (a title now resolves to a different id) | YES — `id`/`title` from `/search/movie` are cached | TTL only |
| Manual admin invalidation (`type: movie`) | Entry IS stale | **FAILS to clear it** ← CACHE-OPS-001 |
| Manual admin `clearAllCache` | Entry is stale | Clears it (global, untargeted) |
| Cache TTL expiry | Natural | Resolves correctly |
| Application release | Not automatically | TTL only; no version bump |
| Route algorithm change | If the payload shape changes, the route-local `:v2` suffix must be bumped again | Manual; the existing `v2` suffix is the mechanism |

**No event makes the v2 entry *incorrect* — only *stale*, and always bounded to ≤ 24 h
by the TTL.** The single event with no bounded resolution is the manual
single-movie invalidation, which silently no-ops on the v2 key.

---

## 23. Correctness impact

The cache serves data that is derived from multiple upstream sources (Gemini,
TMDB details, TMDB search). All of them can change within the 24 h window. A warm
hit therefore returns data that is up to 24 h old. That is an **accepted,
documented Phase 9 trade-off**, not a new finding.

CACHE-OPS-001 adds one thing: **there is no targeted way to force a refresh**. The
only targeted invalidation (`invalidateMovieCache`) misses the key. Consequences:

1. **Stale enriched metadata** (poster, rating, release date, resolved TMDB id)
   persists for up to 24 h after the underlying movie data changes.
2. **Admin single-movie invalidation is partially effective** — it clears details
   and recommendations but leaves the AI-similar row serving the *same* movie.
3. **Manual recovery requires a global cache flush** (`clearAllCache`), which
   drops every scope including rate-limit and unrelated caches — a
   disproportionate blast radius for a one-movie correction.

Classification: **bounded stale-data risk + manual-recovery gap**, not data
corruption and not unbounded staleness.

---

## 24. Operational impact

| Concern | Assessment |
|---|---|
| Operational inconvenience | YES — single-movie correction requires either waiting ≤ 24 h or a global flush |
| Stale-data correctness risk | YES — bounded to ≤ 24 h by TTL |
| Manual-recovery gap | YES — no targeted path exists |
| Admin observability gap | **NO for v2** (listing works; corrects Phase 9) — but YES for memory-only entries and YES for v1 |
| Production frequency | **NOT DEMONSTRATED.** No metrics were collected in this phase and none are available in the repo. The prompt forbids claiming frequent production impact without metrics; no such claim is made. |

---

## 25. Security and authorization review

Reviewed every administrative cache operation (`app/api/admin/cache/route.ts`):

| Property | Finding |
|---|---|
| Required authentication | `requireAdmin()` on GET/POST/DELETE — PASS (role-gated at handler level, never client-controlled) |
| Required role | admin (via `requireAdmin`) — PASS |
| Origin / CSRF protection | `assertSameOriginOrReject(request)` on POST and DELETE — PASS |
| Rate limiting | `applyRateLimitUser(request, email, RATE_LIMITS.cacheAdmin)` on POST and DELETE — PASS |
| Input validation | Strict Zod (`invalidateSchema`/`clearSchema`, `.strict()`) — PASS; unknown-key rejection proven by `tests/strict-validation.test.ts` |
| Key/scope allowlisting | `allowedScopes` includes `public:ai-similar`; scope sanitized `[^a-zA-Z0-9:_-]` → `""` — PASS |
| Arbitrary Redis keys deletable? | NO — no endpoint accepts a raw key. `invalidateCacheKey` exists but has zero callers and is not reachable from any route. |
| User-controlled prefixes accepted? | NO — patterns are built server-side from `CACHE_NAMESPACE` + allowlisted scope. `findCacheKeys` rejects raw globs (`lib/cacheManager.ts:170-175`). |
| Error messages leak infrastructure? | NO — catch blocks return generic `{ error: "Failed to manage cache" }` / `"Failed to clear cache"` with no stack or key material |
| Audit logging | `console.log('Cleared application-scoped cache entries')` in `clearAllCache` — safe content, no keys or secrets |
| Namespace safety | All deletes are `isNamespacedKey`-gated and SCAN-bounded; `FLUSHDB`/`FLUSHALL` never called (proven by R4-A tests); `KEYS` never called (R4-A test 2) |

**No security defect was found.** The proposed Step 2 fix (§38) routes an existing
key through the already-authorized `invalidateMovieCache` →
`redisCache.delete()` path, so it **adds no new endpoint, no new input surface, no
new authorization boundary, and no new admin capability**. It changes only *which
key* an existing, already-guarded operation deletes.

**CACHE-OPS-001 is not authorization to redesign admin security**, and no security
change is recommended.

---

## 26. Existing test coverage

### 26.1 Coverage matrix

| Behavior | Existing test | Isolation | Current assertion | Missing assertion | Step 2 recommendation |
|---|---|---|---|---|---|
| v2 key construction | `ai-similar-enrichment-concurrency.test.ts` test 3 (L367-370) | mocked `redisCache` (in-memory `getOrSet` double) | `recordedKeys` contains `buildCacheKey(aiSimilar,'42:v2')` and NOT `buildCacheKey(aiSimilar,'42')` | Does not assert what happens on invalidation | Keep; add invalidation assertion |
| TTL = 86400 | same test (L373) | same | `recordedTtls` contains `86400` | — | Keep unchanged |
| Warm hit = 0 upstream calls | tests 1, 2, 8 | same | `fetchCallCount()` delta 0 | — | Keep unchanged |
| Empty final not cached | test 6 (L391-426) | same | `cacheStore.has(v2Key) === false`; producer re-runs | — | Keep unchanged |
| Partial enrichment cached | test 7 (L428-462) | same | 11 items stored + returned verbatim, 0 fetches warm | — | Keep unchanged |
| `normalizeKeyComponent` sanitizes | `cache-key-normalization.test.ts` (W3-010) | mocked redis → null client | hostile key resolves to sanitized entry | — | Keep unchanged |
| `clearScoped` never FLUSHDB | `redis-cache-security.test.ts` R4-A (L97-102) | FakeRedis | `flushDbCalls === 0` | — | Keep unchanged |
| `findCacheKeys` never `KEYS` | R4-A (L104-108) | FakeRedis | `keysCalls === 0` | — | Keep unchanged |
| Scoped clear deletes only namespaced | R4-B (L123-133) | FakeRedis | foreign + legacy keys survive; `deleted === 2` | — | Keep unchanged |
| Memory prefix clear is scoped | R4-F (L239-247) | mocked redis → null | `deleted === 1`, other scope intact | — | Keep unchanged |
| Redis-down `getOrSet` works | R4-F (L249-255) | mocked redis → null | value returned and readable | — | Keep unchanged |
| Stampede dedup per key | R4-G (L261-275) | FakeRedis | 10 concurrent → 1 origin call | — | Keep unchanged |
| Admin POST unknown key → 400 | `strict-validation.test.ts` (L108-117) | cacheManager fully mocked | `res.status === 400` | Does not observe real invalidation | Keep; add a real-invalidations test |
| Admin ai-similar auth/rate/400 | `admin-chat-ai-security.test.ts` (L277-330) | mocked fetch + auth | 401/429/400, 0 fetches | — | Keep unchanged |
| **`invalidateMovieCache` deletes the v2 key** | **NONE** | — | — | **Assert v2 removed from memory + Redis** | **The RED test (§40)** |
| **Admin single-movie invalidate removes v2** | **NONE** | — | — | **Assert v2 removed, unrelated movie intact** | **Step 2 test** |
| **Unrelated movie / scope survive** | **NONE** | — | — | **Assert collateral-free** | **Step 2 test** |
| **Invalidation safe when Redis unavailable** | **NONE** | — | — | **Assert memory tier still cleared** | **Step 2 test** |

### 26.2 Does any existing test detect CACHE-OPS-001?

**NO.** Reasoning, per file:

- `tests/ai-similar-enrichment-concurrency.test.ts` — the `redisCache` double
  (L60-70) is a hand-rolled in-memory map with `getOrSet`/`set`/`get`/`delete`. It
  records keys written by the **route**, but **nothing in the suite ever calls
  `invalidateMovieCache`**, so no assertion could catch the gap. The double's own
  `delete` is a plain map delete and would remove any key it is given — it cannot
  reveal a production helper that never calls it.
- `tests/strict-validation.test.ts` — **fully mocks `cacheManager`** (L55-62). The
  admin invalidate test asserts only the 400 status; `cacheInvalidateMovie` is a
  bare `vi.fn()` whose effects are never observed. The real helper never runs.
- `tests/redis-cache-security.test.ts` — exercises the real `cache`/`cacheManager`
  against a FakeRedis, but only ever for the `public:tmdb` scope and
  `clearScoped`/`findCacheKeys`. It never calls `invalidateMovieCache` and never
  seeds an ai-similar key.
- `tests/admin-chat-ai-security.test.ts` — auth/rate-limit/validation only; never
  reaches cache state.

**Conclusion: CACHE-OPS-001 is invisible to the current suite.** No existing test
can fail for it, so none does.

---

## 27. Safe test execution

Executed only existing suites whose isolation is proven (all Redis/MongoDB/fetch
mocked; no real network, cache, DB, or admin endpoint contacted). Per prompt §9,
`--reporter=basic` was **not** used.

| # | Command (cwd = repo root) | Exit | Files | Tests | Unhandled | External contact | Detects the gap? | Files changed |
|---|---|---|---|---|---|---|---|---|
| 1 | `npx vitest run tests/redis-cache-security.test.ts tests/cache-key-normalization.test.ts` | 0 | 2 | **32 pass** | 0 | NONE — `@/lib/redis` returns a FakeRedis or null; `@/lib/mongodb` mocked | NO | 0 |
| 2 | `npx vitest run tests/performance-phase2.test.ts tests/admin-chat-ai-security.test.ts tests/strict-validation.test.ts` | 0 | 3 | **25 pass** | 0 | NONE — fetch/auth/rate-limit/cacheManager mocked | NO | 0 |
| 3 | `npx vitest run tests/ai-similar-enrichment-concurrency.test.ts` | 0 | 1 | **16 pass** | 0 | NONE — deny-by-default `globalThis.fetch` guard; cache/auth/rate-limit mocked | NO | 0 |
| | **TOTAL** | **0** | **6** | **73 pass** | **0** | | **NO** | **0** |

**Pre-run isolation confirmation, per group:**
- Redis mocked: `redis-cache-security` (FakeRedis via `vi.hoisted`), `cache-key-normalization` (null client), `performance-phase2`/`admin-chat-ai-security`/`strict-validation` (module mocks), `ai-similar-enrichment` (`vi.mock('@/lib/cache.ts')`).
- MongoDB mocked where reachable: explicit `vi.mock('@/lib/mongodb')` in each.
- fetch intercepted: deny-by-default guard (`ai-similar-enrichment`), `mocks.fetch` (`admin-chat-ai-security`), or unused.
- No real admin endpoint contacted: the admin route is either not imported or driven through mocked `cacheManager`.
- No real cache mutated: all cache writes land in per-test in-memory maps / FakeRedis, reset in `beforeEach`.

**No test detects the invalidation gap** — consistent with §26.2. **No file changed**
(verified in §49: tracked diff empty before and after).

---

## 28. Earliest incorrect state

| Key | Invalidated by | TTL expiry |
|---|---|---|
| `movie-recommendation-system:{env}:v1:movie:{id}:details` | `invalidateMovieCache` | — |
| `movie-recommendation-system:{env}:v1:movie:{id}:recommendations` | `invalidateMovieCache` | — |
| `movie-recommendation-system:{env}:v1:movie:{id}:similar` | `invalidateMovieCache` | — |
| `movie-recommendation-system:{env}:v1:movie:{id}:ai-similar` (v1 legacy) | **NOTHING** | 24 h |
| `movie-recommendation-system:{env}:v1:public:ai-similar:{id}_v2` (current) | **NOTHING** ← CACHE-OPS-001 | 24 h |

**Earliest incorrect state:** the v2 key was introduced by Phase 9 and
`invalidateMovieCache` was never extended to cover it. The gap has existed since
the Phase 9 change landed; it is **not** a post-Phase-9 regression (Phase 9 §10/§31
explicitly left it OPEN and deferred it).

---

## 29. Root-cause analysis

The route builds its key with the canonical builder:

```ts
const cacheKey = buildCacheKey(CACHE_SCOPES.aiSimilar, `${movieId}:v2`);
```

The invalidation helper hardcodes three literal keys that predate the scoped
`aiSimilar` scope entirely:

```ts
const cacheKeys = [
  `movie:${id}:details`,
  `movie:${id}:recommendations`,
  `movie:${id}:similar`
];
```

The two constructions **never share a source of truth**. The route uses
`buildCacheKey` + `CACHE_SCOPES.aiSimilar`; the helper uses inline string literals.
When Phase 9 moved the key from the literal `movie:{id}:ai-similar` to the scoped
v2 form, there was no compile-time or test-time signal that `invalidateMovieCache`
also needed updating — the helper's literal list made the new key invisible to it.

**Root cause:** the invalidation key set is expressed as **duplicated literals**
rather than derived from the same `buildCacheKey(CACHE_SCOPES.aiSimilar, …)`
contract the producer uses. The two have drifted apart.

**Secondary contributor:** no test exercises `invalidateMovieCache` against real
cache state (the only admin test fully mocks `cacheManager`), so the drift was
never observable. This is a **test-coverage defect** in the sense that the safety
net that would have caught the drift does not exist — but the *primary* defect is
the key-coverage gap, not the tests.

---

## 30. Root-cause classification

**Chosen (exactly one):** `INVALIDATION KEY-COVERAGE DEFECT`

Rationale:
- The v2 key **is** reachable by the existing deletion primitives (`redisCache.delete`,
  `clearScoped`) — there is no multi-tier or scope-alignment failure.
- Admin tooling **can** see the scope (allowlisted) and list the entries — not an
  admin-visibility defect.
- The single failure is that the one targeted invalidation helper's key set
  **does not cover** the key the producer writes.

Rejected alternatives:
- `CACHE-SCOPE ALIGNMENT DEFECT` — the scope IS consistent; the helper just omits it.
- `ADMIN CACHE-VISIBILITY DEFECT` — rejected; listing works for v2 (§15).
- `MULTI-TIER INVALIDATION DEFECT` — rejected; `delete()` already clears both tiers.
- `MULTI-FACTOR CACHE-OPERABILITY DEFECT` — rejected; only one factor is broken.
- `TEST DEFECT` — rejected as primary; the missing test is a contributor, not the cause.
- `NOT REPRODUCED` / `UNRESOLVED` — rejected; statically proven.

---

## 31. Reproducibility

**Chosen:** `DETERMINISTIC STATIC`

The gap is provable by reading the two functions: `invalidateMovieCache` deletes
three specific literal keys; the route writes a fourth key built by
`buildCacheKey(CACHE_SCOPES.aiSimilar, …)`. No runtime condition changes this. It
is also **deterministically reproducible in a targeted test** (§40 defines the exact
RED), which is the planned Step 2 evidence.

Rejected: `PROBABLE RUNTIME` (it is not probabilistic), `NOT REPRODUCED`,
`DETERMINISTIC TARGETED TEST` (that is the *planned* Step 2 state, not the current one).

---

## 32. Impact classification

**Chosen:** `STALE AI-SIMILAR DATA` + `MANUAL RECOVERY GAP`

The AI-similar v2 entry is served unchanged for up to 24 h after its upstream data
changes, and the only targeted invalidation available to operators does not reach
it. Rejected: `ADMIN VISIBILITY GAP` (listing works for v2), `OPERATIONAL ONLY`
(there IS a correctness dimension: stale enriched metadata), `UNKNOWN`.

`MULTIPLE CACHE-OPERABILITY RISKS` was considered and **rejected** — only the
invalidation path is broken; listing, deletion primitives, tier consistency, and
authorization are all sound.

---

## 33. Production-impact classification

**Chosen:** `THEORETICAL`

The stale-serving path provably exists in source (a warm hit returns the cached
payload with no upstream revalidation, and no targeted invalidation can evict it),
so it is not `NOT DEMONSTRATED` in the *mechanistic* sense. But **no production
observation, incident, metric, or operator report corroborates that it has
occurred**, and the prompt forbids claiming frequent production impact without
metrics. The mechanism is real; the realized impact is **stale AI data for up to
24 h.** Rejected: `CONFIRMED` (no production observation),
`PROBABLE` (no incident, no metrics), `UNKNOWN`.

---

## 34. Confidence

**Chosen:** `HIGH`

The claim is small, static, and fully source-backed: three files (`route.ts`,
`cacheManager.ts`, `cache-namespace.ts`) plus a probe that executed the real
`buildCacheKey`/`ns()` path to confirm the exact stored shape. No part of the
conclusion depends on runtime conditions, heuristics, or unverified assumptions.

---

## 35. Hypothesis matrix

| ID | Hypothesis | Supporting evidence | Contradicting evidence | Status |
|---|---|---|---|---|
| H1 | The current AI-similar v2 key is not deleted by `invalidateMovieCache` | Helper deletes only `movie:{id}:{details,recommendations,similar}` (L24-28); route writes `public:ai-similar:{id}_v2` (L174); probe confirms shapes share no overlap | None | **CONFIRMED** |
| H2 | The admin scope listing can see current AI-similar v2 entries | `allowedScopes` includes `public:ai-similar` (admin L53); listKeys pattern `${CACHE_NAMESPACE}public:ai-similar*`; probe: stored v2 key startsWith that prefix | Phase 9 §29.2 asserted the opposite — but it reasoned about the **v1** key shape | **CONFIRMED** (corrects Phase 9) |
| H3 | The admin scope delete can purge current AI-similar v2 entries | `clearAllCache` → `clearScoped(${CACHE_NAMESPACE}*)` matches the v2 key (probe: `v2 hit by clearAll? true`) | No *scoped-only* purge endpoint exists — only the global clear | **SUPPORTED** (globally, not per-scope) |
| H4 | A movie-specific admin delete can remove one AI-similar v2 entry | — | `invalidateMovieCache` omits the key (H1); no single-key admin endpoint exists; `invalidateCacheKey` has zero callers | **REJECTED** |
| H5 | The memory tier remains stale after Redis-only deletion | — | `delete()` removes memory unconditionally BEFORE Redis (L206-215); no Redis-only delete path exists for this key | **REJECTED** |
| H6 | The v2 key is public/shared, so one invalidation is sufficient for all users | No user identity in the key (`.email` only at the rate-limit L153; `buildCacheKey` never receives it) | None | **CONFIRMED** |
| H7 | TTL expiry alone is an acceptable substitute for explicit invalidation | Bounds staleness to ≤ 24 h; Phase 9 accepted this trade-off | Silently ignores the one targeted operator action; forces a global flush for a one-movie fix; no bound on the *frequency* of staleness events | **REJECTED** |
| H8 | The 24-hour TTL can expose stale metadata after a movie update | The cached payload includes `title`, `release_date`, `poster_path`, `vote_average`, resolved TMDB `id` (route L277-338); all can change within 24 h | No metrics on how often this occurs in production | **SUPPORTED** |
| H9 | Old v1 keys require explicit cleanup | — | Nothing reads v1 (route builds/reads only v2; test asserts v1 NOT written); v1 has its own 24 h TTL; Phase 9 chose natural expiry | **REJECTED** |
| H10 | The required fix is limited to the invalidation helper and tests | The key is reachable by the existing `redisCache.delete()` primitive the helper already calls; no scope/namespace/route change needed | None | **CONFIRMED** |
| H11 | Admin route changes are required | — | The admin route already allowlists `public:ai-similar` and already calls `invalidateMovieCache`; extending the helper fixes the admin path transitively | **REJECTED** |
| H12 | Cache helper changes are required | — | `redisCache.delete()` already deletes both tiers; no `lib/cache.ts` change needed | **REJECTED** |
| H3b/H13 | Scope constants or key construction require changes | — | `CACHE_SCOPES.aiSimilar` and `buildCacheKey` are correct as-is; the fix consumes them unchanged | **REJECTED** |
| H14 | An in-flight producer can repopulate a key after invalidation | `getOrSet` dedupes via `inflightPromises`; a producer that started before the delete completes and `set()`s afterwards re-writes the key (cache.ts L336-344) | Not exercised by any test; no generational guard exists | **UNRESOLVED** → separate residual risk (§43) |
| H15 | The finding is operational only and has no correctness impact | — | The served payload embeds mutable metadata (H8); a warm hit returns up-to-24 h-old enriched data | **REJECTED** |

---

## 36. Rejected hypotheses (summary)

- **H4** (movie-specific admin delete works) — the key is simply not in the helper's set.
- **H5** (memory left stale after Redis-only delete) — `delete()` clears memory first; no Redis-only path exists for this key.
- **H7** (TTL is an acceptable substitute) — it bounds but cannot *correct*; and it leaves the operator's only targeted action broken.
- **H9** (v1 needs cleanup) — nothing reads v1 and its TTL bounds it; cleanup would be scope creep.
- **H11/H12/H13** (admin route / cache helper / scope constants need changes) — all are correct; the fix consumes them unchanged.
- **H15** (operational only) — there is a genuine, if bounded, correctness dimension.

---

## 37. Fix options (no implementation)

### Option A — Extend `invalidateMovieCache` to delete the exact current v2 key

Add the AI-similar key, built with the **canonical builder**, to the helper's
`cacheKeys` array:

```ts
buildCacheKey(CACHE_SCOPES.aiSimilar, `${id}:v2`)
```

alongside the three existing literals.

| Dimension | Value |
|---|---|
| Exact likely files | `lib/cacheManager.ts` (1 helper) + `tests/…cache-invalidation.test.ts` (new) + report |
| Exact key / prefix | `movie-recommendation-system:{env}:v1:public:ai-similar:{id}_v2` (exact key, no prefix) |
| Memory-tier behavior | Cleared — routes through `redisCache.delete()`, which clears memory unconditionally |
| Redis-tier behavior | Cleared — same call, `redis.del` best-effort |
| v1 compatibility | Not touched (v1 is `movie:{id}:ai-similar`, a different key); v1 still expires naturally |
| v2 behavior | Deleted on every movie invalidation |
| Admin visibility | Transitively fixed — the admin `type: movie` POST already calls this helper |
| Authorization implications | **NONE** — no new endpoint, input, or capability; same guards |
| Race implications | Same residual in-flight risk as today (§43); not introduced by this option |
| Expected tests | RED: seed v2 → invalidate → assert gone from memory + Redis mock; plus collateral, degraded, and TTL-pinning tests |
| Targeted validation | The new focused suite + `redis-cache-security` |
| Broader validation | `ai-similar-enrichment-concurrency`, `strict-validation`, `admin-chat-ai-security`, typecheck, lint, full suite, audit, build |
| Rollback | Revert one helper line; tests revert with it |
| Risk | **LOW.** Smallest possible diff; reuses the exact primitive and key contract already in use. |

### Option B — Scoped prefix invalidation for the movie's AI-similar versions

Delete by prefix `${CACHE_NAMESPACE}public:ai-similar:${id}*` via `clearScoped`.

| Dimension | Value |
|---|---|
| Exact likely files | `lib/cacheManager.ts` + tests + report |
| Exact key / prefix | `…:public:ai-similar:{id}*` |
| Memory-tier behavior | Cleared via `clearMemoryPrefix` |
| Redis-tier behavior | Cleared via SCAN + batched DEL |
| v1 compatibility | **Still missed** — v1 is `…:movie:{id}:ai-similar`, outside this prefix |
| v2 behavior | Deleted, and would also catch a future `:v3`/`_v3` suffix |
| Admin visibility | Transitively fixed |
| Authorization | NONE new |
| Race | Same as A |
| Expected tests | As A, plus prefix-collateral assertions |
| Rollback | Revert |
| Risk | **MEDIUM.** Introduces a prefix-delete into a hot invalidation path. `normalizeKeyComponent` maps `:`→`_`, so the prefix would have to be built as `public:ai-similar:${id}_` to actually match the stored `…:{id}_v2` — an easy-to-get-wrong detail that couples the fix to normalization internals. Also strictly more machinery than the one-key case needs. |

### Option C — Dedicated AI-similar invalidation helper reused by movie + admin

A new function (e.g. `invalidateAISimilarCache(movieId)`) called from
`invalidateMovieCache` and optionally from the admin route.

| Dimension | Value |
|---|---|
| Exact likely files | `lib/cacheManager.ts` + `app/api/admin/cache/route.ts` + tests + report (4 files) |
| Memory / Redis | Same as A (routes through `redisCache.delete`) |
| v1 / v2 | v2 deleted; v1 untouched |
| Admin visibility | Requires an admin-route change to expose it — **expanding the admin surface** |
| Authorization | Adds a new admin capability unless deliberately not exposed |
| Race | Same as A |
| Rollback | Revert 2 source files |
| Risk | **MEDIUM-HIGH.** New public API + admin surface for a one-line gap. Violates the "smallest reviewable diff" preference. |

---

## 38. Preferred fix

**Option A.** Extend `invalidateMovieCache` to delete the exact current AI-similar
v2 key, built with the canonical builder.

Why preferred — it satisfies every constraint from §12 of the prompt:

| Requirement | Option A |
|---|---|
| Uses the existing canonical key builder | **YES** — `buildCacheKey(CACHE_SCOPES.aiSimilar, \`${id}:v2\`)` |
| Avoids duplicated literal key construction | **YES** — the key expression is identical to `route.ts:174`, so the two share one contract. The existing three literals stay as-is (out of scope to refactor). |
| Deletes both Redis and memory consistently | **YES** — via the same `redisCache.delete()` already used for the other three keys |
| Preserves public/shared cache behavior | **YES** — the key is unchanged; only its deletion is added |
| Avoids a global cache flush | **YES** — one exact key |
| Avoids changing cache TTL | **YES** — 86400 untouched |
| Avoids changing the Phase 9 cache payload | **YES** — the producer is untouched |
| Avoids changing route response behavior | **YES** — the route is untouched |
| Avoids adding dependencies | **YES** |
| Keeps the diff local and reviewable | **YES** — one helper line + tests |

Additionally:
- **It does not touch the AI-similar route** (the prompt says not to unless the
  diagnosis proves the route must change — it does not; the route's key is correct).
- **It does not touch cache helpers** (`lib/cache.ts`) or the **admin route** —
  both are correct as written; the admin path is fixed transitively because it
  already calls `invalidateMovieCache`.
- **The `id` truncation already present** (`String(movieId).slice(0, 50)`, L23)
  applies to the new key too, keeping input handling identical to the existing keys.
- **Normalization note for the implementer:** because
  `normalizeKeyComponent` maps `:` → `_`, the *stored* key is
  `…:public:ai-similar:{id}_v2`. Passing `` `${id}:v2` `` to `buildCacheKey`
  reproduces this exactly — do NOT hand-write `...:${id}_v2` as a literal, or the
  key will drift again. This is precisely the failure mode that created
  CACHE-OPS-001.

**Not implemented in this phase.** Specified only.

---

## 39. Exact Step 2 files

Prefer the smallest possible scope — **3 files**:

| # | File | Change type | Why |
|---|---|---|---|
| 1 | `lib/cacheManager.ts` | Modify — add one entry to the `invalidateMovieCache` `cacheKeys` array | The only place the invalidation key set is defined |
| 2 | `tests/…a new focused cache-invalidation test file…` | New — the RED→GREEN regression suite | §40 defines it; none exists today (§26.2) |
| 3 | `docs/reports/…/PHASE-12-…-COMPLETION-REPORT.md` | New — completion report | Evidence of the correction |

**Explicitly NOT included** (per §14 of the prompt, backed by evidence):
- `app/api/movie/[id]/ai-similar/route.ts` — the route's key construction is correct;
  the diagnosis proves the route does not need to change.
- `lib/cache.ts` — `delete()` already clears both tiers.
- `lib/cache-namespace.ts` — `CACHE_SCOPES.aiSimilar` / `buildCacheKey` are correct.
- `app/api/admin/cache/route.ts` — already calls `invalidateMovieCache`; fixed transitively.

The preferred fix needs **no more than three implementation/test/report files**, so
no justification for a larger scope is required.

---

## 40. RED-to-GREEN plan

### 40.1 The canonical RED (must fail for the intended reason)

**Step 2 RED procedure:**
1. Seed a synthetic AI-similar v2 entry in the mocked cache under the exact key
   `buildCacheKey(CACHE_SCOPES.aiSimilar, '42:v2')` via `redisCache.set(...)`.
2. Invoke `cacheManager.invalidateMovieCache('42')`.
3. Assert the entry is removed from **both** tiers:
   - memory tier — `redisCache.get(key)` returns `null` (with Redis mocked out so
     the memory path is the one exercised);
   - Redis mock — the fake store no longer contains the key.
4. **Current implementation must FAIL for the intended reason:** the v2 key remains
   present after `invalidateMovieCache('42')`, because the helper's key set does not
   include it. The three `movie:42:*` keys ARE removed, isolating the failure to the
   AI-similar key specifically.

Only after that RED is captured on the record may the helper be edited (§38) and the
same test re-run to GREEN.

### 40.2 Additional Step 2 tests

| # | Behavior to lock in |
|---|---|
| 1 | Movie-specific invalidation deletes the current v2 key |
| 2 | An **unrelated** movie's v2 key remains (`invalidateMovieCache('42')` must not touch `…:43_v2`) |
| 3 | Unrelated cache **scopes** remain (e.g. `public:tmdb` and `user:recommendations` keys survive) |
| 4 | The public/shared key needs **no user loop** — one invalidation serves all users (assert the key contains no identity token) |
| 5 | Redis and memory tiers stay consistent (both cleared) |
| 6 | Invalidation remains **safe when Redis is unavailable** — the memory tier is still cleared (mock `getRedisClient` → null) |
| 7 | Admin listing **sees** the AI-similar scope when seeded (locks in the corrected visibility finding) |
| 8 | A scope purge (`clearScoped('…public:ai-similar*')`) deletes AI-similar v2 entries **if supported** — and demonstrates v1 is NOT in that range |
| 9 | Old **v1** behavior is explicitly pinned: `invalidateMovieCache` does NOT delete v1, and v1 is not read by the route |
| 10 | TTL remains **86400** — unchanged |
| 11 | Phase 9 warm-hit behavior remains unchanged — zero upstream calls on a warm hit |
| 12 | Pool-4 remains unchanged — enrichment stays bounded at 4 in-flight |
| 33–34 | Authentication and admin authorization remain unchanged (401/403/400 matrix, same-origin, rate limit) |
| 15 | No real network, Redis, or database access occurs (deny-by-default fetch guard; all persistence mocked) |

**Do not create tests during Step 1** — none were created. The above is the
specification for Step 2 only.

---

## 41. Targeted validation (recommended order for Step 2)

1. Focused RED (the new suite, before the helper edit)
2. Focused GREEN (same suite, after the edit)
3. Relevant Redis/cache tests — `tests/redis-cache-security.test.ts`, `tests/cache-key-normalization.test.ts`
4. Existing AI-similar suite — `tests/ai-similar-enrichment-concurrency.test.ts`
5. Relevant admin-security tests — `tests/admin-chat-ai-security.test.ts`, `tests/strict-validation.test.ts`
6. Typecheck — `npm run typecheck`
7. Repository lint — `npm run lint`
8. Full suite — `npm test`
9. Coverage — `npm run test:coverage`
10. Production audit — `npm audit --audit-level=high --omit=dev` (the exact CI `security`-job command, `ci.yml:92`)
11. Full-tree audit — bare `npm audit` (informational; 4 dev-tree findings were remediated in Phase 10 and the production gate is row 10)
12. Production build — `npm run build` with the CI placeholder env vars (§15 of the prompt / `ci.yml:130-138`)

**Node:** use the available runtime. On this host that is `v26.7.0`; CI pins Node 22
and remains unverified locally (warning W-1). **Do not push or trigger CI.**

---

## 42. Broader validation

Step 2 should re-run, after the focused GREEN, the same suites executed in this
diagnosis (§27) to prove no regression:

- `tests/redis-cache-security.test.ts` (32 incl. normalization)
- `tests/cache-key-normalization.test.ts`
- `tests/performance-phase2.test.ts`
- `tests/admin-chat-ai-security.test.ts`
- `tests/strict-validation.test.ts`
- `tests/ai-similar-enrichment-concurrency.test.ts`

Then the full suite (`npm test`, expected 42 files / 431 tests at GREEN) and the
build. The current baseline — established in this phase and matching the Phase 9/11
record — is **42 files / 431 tests, 0 failures**, lint **0 errors / 93 warnings**.

---

## 43. Race and concurrency implications

**The assessed race (prompt §5):**
1. Producer starts (a cache miss enters `getOrSet` → `inflightPromises`).
2. Admin invalidation runs (`redisCache.delete(v2Key)` — memory + Redis).
3. Producer completes and `this.set(namespacedKey, freshData, ttl)` runs
   (`lib/cache.ts:336-344`).
4. The cache is repopulated with data computed from a pre-invalidation snapshot.

**Is this race part of CACHE-OPS-001?** **NO** — it exists today for the three keys
the helper *does* delete, and it is unaffected by adding a fourth. It is a property
of `getOrSet`'s in-flight dedup, not of the key-coverage gap.

**Classification:** **SEPARATE RESIDUAL RISK** (not introduced, not worsened, and
not resolved by the preferred fix).

Evidence:
- `getOrSet` releases the in-flight entry in `.finally()` (L345-348), so a retry
  after a delete re-runs the producer — correct retry semantics.
- Nothing pins a generation/token to the cached value, so a completing producer
  cannot detect that its result is stale relative to the deletion.
- No test exercises delete-during-producer for any key.

**Per the prompt, do not implement locking or generations in this phase** — none is
proposed. Recorded for the record only.

---

## 44. Risks

| ID | Risk | Severity | Mitigation / note |
|---|---|---|---|
| R1 | A fix built on a hand-written literal key (e.g. `...:${id}_v2`) would silently miss the stored key and re-create CACHE-OPS-001 | **HIGH** | Option A mandates `buildCacheKey(CACHE_SCOPES.aiSimilar, \`${id}:v2\`)` — the same expression as `route.ts:174`. The Step 2 RED (§40.1) proves the key actually resolves. |
| R2 | Stale enriched metadata served for up to 24 h after an upstream change | MEDIUM | Pre-existing Phase 9 trade-off; TTL-bounded. Not worsened by the fix. |
| R3 | A global `clearAllCache` is currently the only targeted-recovery substitute, with disproportionate blast radius | MEDIUM | Resolved by Option A for the single-movie case. |
| R4 | No metrics exist on real-world staleness frequency or invalidation usage | LOW | Out of scope; no production-impact claim is made. |
| R5 | Admin listing is Redis-only; memory-only entries (Redis down) are invisible | LOW | Pre-existing; out of scope. |
| R6 | In-flight producer repopulation after deletion | LOW | Separate residual risk (§43); not addressed. |
| W-1 | All validation ran on Node **v26.7.0**; CI pins Node 22 | LOW | Results unverified on Node 22; a runtime was neither installed nor downloaded (forbidden by §E). |
| W-2 | The Phase 9 record (§29.2/§31) states the ai-similar key is not admin-visible; that is only true for **v1**, not v2 | LOW | Corrected in §10.5/§15/§20 of this report. No code change. |
| W-3 | `lib/cache.ts` and `lib/cacheManager.ts` are outside `coverage.include` | LOW | Observation only; no config change proposed (§11b). |
| W-4 | `BUG-AI-SIMILAR-CACHE-HIT-REENRICHMENT-DIAGNOSIS.md` (prompt §D) does not exist | LOW | The canonical Phase 9 diagnosis + completion report were read instead; nothing was fabricated (§9). |

---

## 45. Unresolved questions

1. **How often do real movie-metadata changes make a v2 entry stale within its 24 h
   lifetime?** No metrics are available in this repo and none could be collected in
   a read-only phase. This bounds the *practical* severity of R2. Step 2 does not
   depend on the answer.
2. **Is the admin single-movie invalidate actually used in production?** Its only
   caller is the admin POST (§16). Usage logs are not in the repo. Unknown.
3. **Should a scoped `public:ai-similar` purge be exposed to admins?** Outside
   CACHE-OPS-001 scope. Decision deferred to a future phase if needed.
4. **Should the three legacy literal keys in `invalidateMovieCache` be migrated to
   `buildCacheKey`?** Would eliminate the drift class that caused this finding, but
   it is a refactor beyond the smallest correct fix and touches keys other phases
   depend on. **Not recommended for Step 2.**

---

## 46. Chronological command log

All commands run in cwd `D:/fork ai to create website/final porject/movie-recommendation-system`
unless noted. Git-mutating commands are marked.

| # | Command | Purpose | Mutation? |
|---|---|---|---|
| 1 | `git rev-parse --show-toplevel` | Confirm repo root | NO |
| 2 | `uname -a; node --version; npm --version; git --version` | Record environment | NO |
| 3 | `git rev-parse --abbrev-ref HEAD; git rev-parse HEAD; git rev-parse --abbrev-ref --symbolic-full-name '@{u}'; git rev-list --left-right --count '@{u}...HEAD'; git branch --list 'work/phase-12-cache-invalidation-diagnosis'` | Pre-branch verification | NO |
| 4 | `git status --porcelain=v2 --branch; git diff --cached --name-status; git diff --name-status; git ls-files --others --exclude-standard` | Pre-branch state capture | NO |
| 5 | **`git switch -c 'work/phase-12-cache-invalidation-diagnosis' '6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f'`** | Create the local branch | **YES — the only authorized Git mutation** |
| 6 | `git rev-parse --abbrev-ref HEAD; git rev-parse HEAD; git status --porcelain=v2 --branch; git diff --cached --name-status; git diff --name-status; git ls-files --others --exclude-standard \| wc -l` | Post-branch verification | NO |
| 7 | `ls -la` | Confirm no `AGENTS.md` / `.cursor/rules` | NO |
| 8 | Node probe (`node --experimental-strip-types -e …`) | First attempt at key shape — **wrong** (naive `ns()` replication dropped segments) | NO |
| 9 | `node "D:/AppData/hermes/cache/scratch/p12-probe.mjs"` | **Definitive key-shape probe** — real `buildCacheKey`/`ns()` path, `file://` import | NO |
| 10 | `npx vitest run tests/redis-cache-security.test.ts tests/cache-key-normalization.test.ts` | Safe suite 1 — 2 files / **32 pass**, exit 0 | NO |
| 11 | `npx vitest run tests/performance-phase2.test.ts tests/admin-chat-ai-security.test.ts tests/strict-validation.test.ts` | Safe suite 2 — 3 files / **25 pass**, exit 0 | NO |
| 12 | `npx vitest run tests/ai-similar-enrichment-concurrency.test.ts` | Safe suite 3 — 1 file / **16 pass**, exit 0 | NO |
| 13 | `grep -rn "invalidateMovieCache\|invalidateCacheKey" --include=*.ts --include=*.tsx .` | Exhaustive caller audit | NO |
| 14 | `ls docs/reports/diagnostics/… ` | Confirm referenced docs exist (one missing — §9) | NO |

**Forbidden commands never executed:** `git add`, `git commit`, `git push`, `git pull`,
`git merge`, `git rebase`, `git cherry-pick`, `git checkout`, `git restore`, `git reset`,
`git clean`, `git stash`, `git rm`, any package install/update, `npm audit fix`, any
formatting/codegen/deploy command, any Redis mutation, any cache flush, any database
mutation.

**Scratch files created** (outside the repo, in `D:/AppData/hermes/cache/scratch/`):
`p12-keyprobe.test.ts` (attempted, never ran — outside Vitest's include glob) and
`p12-probe.mjs` (the successful probe). **Neither is in the repository** and neither
was committed; see §48.

---

## 47. External-system confirmation

| System | Contacted? | Evidence |
|---|---|---|
| Real Redis | **NO** | Every executed test mocks `@/lib/redis` (FakeRedis or null). The key-shape probe imported only `lib/cache-namespace.ts` (pure functions, no client). |
| Real database (MongoDB) | **NO** | `vi.mock('@/lib/mongodb')` in every executed suite |
| Gemini | **NO** | fetch intercepted by a deny-by-default guard or `mocks.fetch` |
| TMDB | **NO** | same |
| Admin endpoint | **NO** | The admin route was never invoked; it was only read as source. `strict-validation.test.ts` drives it through a fully mocked `cacheManager` |
| Live cache keys read/printed | **NO** | All key shapes are source-derived with the synthetic movie id `42`. No live key was ever read. |
| `.env` / `.env.local` | **NEVER OPENED** | Per §E; no env file was read, and no environment value was printed |

---

## 48. Files created, modified, or deleted

| File | Action | Notes |
|---|---|---|
| `docs/reports/diagnostics/BUG-AI-SIMILAR-CACHE-INVALIDATION-GAP-DIAGNOSIS.md` | **CREATED** | The required diagnostic report — the **only** Phase 12 file in the repository |
| `work/phase-12-cache-invalidation-diagnosis` (branch ref) | CREATED | The only Git-state mutation; not a file |
| `D:/AppData/hermes/cache/scratch/p12-probe.mjs` | created **outside the repo** | Key-shape probe; not in the repository, not committed, and not a Phase 12 artifact |
| `D:/AppData/hermes/cache/scratch/p12-keyprobe.test.ts` | created **outside the repo** | Never executed (outside Vitest's include glob); not in the repository |

**Nothing was modified. Nothing was deleted.** Application source, tests,
configuration, packages, lockfiles, CI, and `.gitignore` are all untouched.
Existing scratch and prompt paths (`.chunks/`, `.my_tool_sandbox/`, `cqq*.txt`,
`as_route_copy.txt`, `route_dump.txt`, `failed_block.txt`, `nul`, `.inbox3.txt`,
`.phase11-prompt.txt`) were left exactly as found.

---

## 49. Final Git state

```
$ git status --porcelain=v2 --branch
# branch.oid 6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f
# branch.head work/phase-12-cache-invalidation-diagnosis
? .chunks/  ? .inbox3.txt  ? .my_tool_sandbox/  ? .phase11-prompt.txt
? as_route_copy.txt  ? cqq.txt  ? cqq_full.txt  ? failed_block.txt
? nul  ? route_dump.txt

$ git rev-parse HEAD
6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f       # UNCHANGED from session start

$ git diff --cached --name-status
(empty — nothing staged)

$ git diff --name-status
(empty — no tracked modifications)

$ git ls-files --others --exclude-standard | wc -l
63              # +1 vs the 63 pre-existing scratch paths → the diagnostic report
```

Confirmed:
- **Only the local branch was created.** No other Git state changed.
- **Application source, tests, packages, config, and CI are unchanged.**
- **Nothing is staged. HEAD is unchanged. No commit, push, merge, or deployment occurred.**
- **The diagnostic report is the only Phase 12 file change.**
- **Existing scratch and prompt paths remain untouched.**
- **No temporary diagnostic output remains in the repository** (both scratch files
  live outside the repo, in the Hermes cache directory).

**Required statement (§16 of the prompt):**

> Release branch and Pull Request #14 remain untouched. Phase 12 attribution is
> limited to the local diagnostic branch and diagnostic report. Nothing staged.
> HEAD unchanged. No commit, push, merge, or deployment occurred.

---

## 50. Phase attribution

| Item | Value |
|---|---|
| Phase | 12 — AI-Similar Cache Invalidation Diagnosis |
| Attribution scope | The local branch `work/phase-12-cache-invalidation-diagnosis` + this report only |
| Production code changed | **NONE** |
| Tests changed | **NONE** |
| Release branch `release/phases-2-11-verified` | **UNTOUCHED** (never contacted) |
| Pull Request #14 | **UNTOUCHED** (never contacted; no `gh`/remote interaction) |
| `main` | **UNTOUCHED** (branch created from the pinned commit, not from `main`'s tip) |
| Remote | **UNTOUCHED** (no push, no fetch, no upstream set) |

---

## 51. Commit status

**NO COMMIT.** `HEAD` remains `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f`,
identical to session start. Nothing was staged (`git diff --cached` empty).
`COMMIT_ALLOWED: NO` per the prompt — honored.

---

## 52. Push status

**NO PUSH.** No remote operation of any kind was performed. The branch has no
upstream configured. `PUSH_ALLOWED: NO` — honored.

---

## 53. Merge status

**NO MERGE.** No merge, rebase, or cherry-pick was performed or initiated. PR #14
remains open and unmerged. `DEPLOYMENT_ALLOWED: NO` context; merge was never an
authorized action.

---

## 54. Deployment status

**NO DEPLOYMENT.** No deploy, release, promote, or Vercel interaction occurred.
No production or preview deployment was created, updated, or triggered.
`DEPLOYMENT_ALLOWED: NO` — honored.

---

## 55. Requirement Traceability Matrix

Format: `Requirement ID → Diagnostic evidence → Validation evidence → Status`

| Requirement ID | Diagnostic evidence | Validation evidence | Status |
|---|---|---|---|
| CACHEOPS-DIAG-1 — Establish the exact current AI-similar cache-key contract | §10: route L174 → `buildCacheKey(CACHE_SCOPES.aiSimilar, \`${movieId}:v2\`)` → `ns()`; full contract table §10.4 | Probe (§46 command 9) executing the real builder: stored key `movie-recommendation-system:development:v1:public:ai-similar:42_v2`; test at `ai-similar-enrichment-concurrency.test.ts:367-370` pins v2-written/v1-not-written | **PASS** |
| CACHEOPS-DIAG-2 — Trace all movie and admin invalidation paths | §14/§16/§17/§18: helper L22-30 (3 literal keys); sole production caller = admin POST L144; `invalidateCacheKey` zero callers; `clearAllCache` → `clearScoped(${CACHE_NAMESPACE}*)`; repo-wide grep (§46 command 13) | Grep audit found exactly 4 references to `invalidateMovieCache` (def + 1 caller + 1 test mock + this report); §27 suite runs exercised the admin path via mocked cacheManager | **PASS** |
| CACHEOPS-DIAG-3 — Determine memory and Redis invalidation consistency | §11/§21: `delete()` clears memory unconditionally then Redis best-effort; `get()` reads Redis-then-memory; `clearScoped` clears both | `redis-cache-security.test.ts` R4-B/R4-F (2 files / 32 tests pass, §27) prove scoped clear + memory-prefix behavior | **PASS** |
| CACHEOPS-DIAG-4 — Determine admin scope visibility and deletion support | §15/§16/§17: `public:ai-similar` IS allowlisted (admin L53); listKeys prefix matches the stored v2 key; single-key delete endpoint does not exist; scope purge not exposed | Probe: `v2 stored startsWith list prefix? true`; `v1 … false`; `clearAllCache` reaches v2 | **PASS** (with correction W-2 to the Phase 9 record) |
| CACHEOPS-DIAG-5 — Assess old-v1 and current-v2 behavior | §19/§20: v1 = `…:movie:{id}:ai-similar`, read by nothing, TTL-bounded; v2 = `…:public:ai-similar:{id}_v2`, served, never targeted-deleted | `ai-similar-enrichment-concurrency.test.ts:367-370` (v1 not written); probe for both shapes | **PASS** |
| CACHEOPS-DIAG-6 — Assess stale-data and operational impact | §22/§23/§24: staleness events table; bounded ≤ 24 h; manual recovery requires a global flush; **no metrics claimed** | §22 lists each event and its current resolution; §27 confirms no test detects the gap | **PASS WITH WARNING** (no production metrics — R4) |
| CACHEOPS-DIAG-7 — Assess authorization and security boundaries | §25: `requireAdmin`, same-origin, rate limit, strict Zod, scope allowlist, no raw keys/globs, generic errors, safe logging | `tests/strict-validation.test.ts` (unknown key → 400), `tests/admin-chat-ai-security.test.ts` (401/429/400), `redis-cache-security.test.ts` R4-A (no FLUSHDB/KEYS) — all pass (§27) | **PASS** |
| CACHEOPS-DIAG-8 — Assess existing tests and define a real RED regression | §26: full coverage matrix; §26.2 proves **no existing test detects CACHE-OPS-001** (cacheManager fully mocked in the only admin test); §40 defines the exact RED | §27: 6 files / 73 tests run, 0 detect the gap; §40.1 specifies the seed→invalidate→assert-both-tiers procedure that must fail pre-fix | **PASS** |
| CACHEOPS-DIAG-9 — Evaluate competing hypotheses and classify the finding | §35: 15 hypotheses evaluated with supporting/contradicting evidence; §30 classification `INVALIDATION KEY-COVERAGE DEFECT`; §31 DETERMINISTIC STATIC; §32 STALE DATA + MANUAL RECOVERY GAP; §33 NOT DEMONSTRATED; §34 HIGH | Each hypothesis row cites file:line evidence; rejected alternatives enumerated in §30/§36 | **PASS** |
| CACHEOPS-DIAG-10 — Recommend the smallest complete correction | §37 (3 options, each dimensioned) + §38 (Option A preferred, constraint-by-constraint) + §39 (exactly 3 Step 2 files) | §38 maps each of the 10 prompt constraints to Option A; §39 excludes the route/cache/admin files with evidence | **PASS** |
| CACHEOPS-DIAG-11 — Preserve the verified release branch and Pull Request | §50/§52/§53: no remote interaction at all; branch created from the pinned commit | §49: HEAD unchanged, no upstream, `main` untouched; no `gh`/remote command executed (§46 log) | **PASS** |
| CACHEOPS-DIAG-12 — Preserve repository and external state | §2/§47/§48: no source/test/config/package/CI/env change; no Redis/DB/Gemini/TMDB contact; `.env` never opened | §49: staged + tracked diff empty before and after; 63 → 64 untracked = the report only; §47 external-system table | **PASS** |

---

## 56. Step 2 entry recommendation

**READY — proceed to Step 2 (the correction), pending human approval.**

| Gate | State |
|---|---|
| Root cause identified and classified | DONE — `INVALIDATION KEY-COVERAGE DEFECT` (§30) |
| Exact key contract established | DONE — `…:public:ai-similar:{id}_v2` (§10) |
| Smallest fix chosen | DONE — Option A (§38), one helper line |
| Exact Step 2 files listed | DONE — 3 files (§39) |
| RED-to-GREEN plan defined | DONE — §40, including the 15 behavioral locks |
| Validation ladder defined | DONE — §41 (12 steps) + §42 (broader suites) |
| Existing suite baseline | DONE — 42 files / 431 tests, lint 0 errors / 93 warnings (§42) |
| Safety constraints for Step 2 | Understood — no TTL/payload/route-response change, no global flush, no new dependency, no admin-surface change |
| Human approval | **REQUIRED** — this phase is read-only and implements nothing |

**Step 2 must:** capture the §40.1 RED on the record **before** editing
`lib/cacheManager.ts`; build the key with `buildCacheKey(CACHE_SCOPES.aiSimilar,
\`${id}:v2\`)` — never a hand-written literal (risk R1); then climb the §41 ladder.

---

## 57. Requirement-by-requirement checklist

Prompt §17 completion criteria:

| Criterion | Status | Evidence |
|---|---|---|
| Exact AI-similar v2 key documented | **DONE** | §10.3/§10.4 |
| Invalidation flow fully traced | **DONE** | §14/§16/§17/§18 |
| Memory and Redis deletion behavior determined | **DONE** | §11/§21 |
| Admin scope visibility determined | **DONE** | §15 (corrects Phase 9 §29.2) |
| Old v1 behavior classified | **DONE** | §19 |
| In-flight repopulation race assessed | **DONE** | §13/§43 — separate residual risk |
| Security boundaries reviewed | **DONE** | §25 — no defect found |
| Existing test coverage assessed | **DONE** | §26 — no test detects the gap |
| Root cause and impact classified | **DONE** | §30/§31/§32/§33/§34 |
| Smallest safe fix recommended | **DONE** | §37/§38 |
| Exact Step 2 files listed | **DONE** | §39 |
| RED-to-GREEN plan defined | **DONE** | §40 |
| Repository source remains unchanged | **DONE** | §49 — tracked diff empty |
| Release branch and PR remain untouched | **DONE** | §50/§52/§53 |
| No external cache is contacted | **DONE** | §47 |
| No commit or push occurs | **DONE** | §51/§52 |

Prompt §16 change-control statement — affirmed verbatim in §49.

---

## 58. Final status

# **PASS WITH WARNINGS**

The diagnosis is complete: CACHE-OPS-001 is a confirmed, statically-proven
invalidation key-coverage defect with a bounded (≤ 24 h) staleness impact, no
security implication, and a one-line fix surface. No code, test, config, package,
CI, or external system was touched. No commit, push, merge, or deployment occurred.

**Warnings (4):**
1. **W-1** — Validation ran on Node `v26.7.0`; CI pins Node 22 (unverified locally).
2. **W-2** — The Phase 9 record's admin-visibility claim applies to v1 only; this
   report corrects it for v2 (no code change).
3. **R4/W-3** — No production metrics exist; no frequency claim is made, and
   `lib/cache*.ts` sit outside `coverage.include`.
4. **W-4** — One prompt-referenced document (`BUG-AI-SIMILAR-CACHE-HIT-REENRICHMENT-DIAGNOSIS.md`)
   does not exist; the canonical Phase 9 diagnosis and completion report were read
   instead, and nothing was fabricated to substitute for it.

---

### Concise summary (per prompt §18 final step)

- **Status:** PASS WITH WARNINGS (read-only diagnosis complete; nothing implemented)
- **Report path:** `docs/reports/diagnostics/BUG-AI-SIMILAR-CACHE-INVALIDATION-GAP-DIAGNOSIS.md`
- **Local branch:** `work/phase-12-cache-invalidation-diagnosis` (created from `6f0595ab…`)
- **Root-cause classification:** INVALIDATION KEY-COVERAGE DEFECT
- **Reproducibility:** DETERMINISTIC STATIC
- **Exact v2 key shape:** `movie-recommendation-system:{env}:v1:public:ai-similar:{movieId}_v2`
- **Movie invalidation result:** **MISSES the v2 key** — deletes only `movie:{id}:{details,recommendations,similar}`
- **Admin listing result:** **SEES the v2 key** (allowlisted `public:ai-similar`; prefix matches) — corrects Phase 9
- **Admin deletion result:** single-movie path **MISSES v2**; only global `clearAllCache` reaches it
- **Memory-tier result:** `delete()` clears memory unconditionally — tier-consistent; no extra work needed
- **Redis-tier result:** `delete()` clears Redis best-effort — tier-consistent; safe degradation when Redis is down
- **Old-v1 decision:** leave untouched; nothing reads it; TTL-bound; cleanup = scope creep
- **Repopulation-race classification:** SEPARATE RESIDUAL RISK (not introduced, not worsened, not resolved)
- **Preferred fix:** Option A — add `buildCacheKey(CACHE_SCOPES.aiSimilar, \`${id}:v2\`)` to `invalidateMovieCache`'s key set
- **Likely Step 2 files:** `lib/cacheManager.ts` + one new focused cache-invalidation test + completion report (3)
- **Targeted-test result:** no existing test detects the gap (6 files / 73 tests run, 0 detections) — the §40.1 RED is specified, not created
- **Blockers:** NONE
- **Git attribution:** local branch + diagnostic report only; release branch and PR #14 untouched
- **Commit / push / merge / deployment status:** NONE — all four explicitly refused and verified absent
- **Step 2 readiness:** READY — pending human approval
