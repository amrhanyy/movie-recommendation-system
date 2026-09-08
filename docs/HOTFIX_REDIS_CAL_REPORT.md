# HOTFIX (REDIS-CAL) Report — Redis Command-Queue Calibration

**Base:** `64fb31c` (main). **Diagnostic:** `docs/DIAGNOSTIC_REDIS_QUEUE_CALIBRATION.md` ACCEPTED, Option (C) mandated.
**Scope lock:** zero API contract changes, zero UI changes, zero new deps, frozen suites untouched, no env changes.
**Verification:** `npm run lint` exit 0 (0 errors, 94 warnings pre-existing); `npm run typecheck` exit 0; `npm test` exit 0 (36 files / 349 tests, incl. 4 new); `npm run build` exit 0 (shared 102 kB unchanged).

## 1. Files changed

| File | Change |
|---|---|
| `lib/redis-config.ts` | `commandsQueueMaxLength: 5` → `500` in BOTH branches (URL + HOST) + rationale comment. `disableOfflineQueue: true` kept. |
| `app/api/watchlist/details/route.ts` | Unbounded `Promise.all(toResolve.map…)` → batched pool `DETAIL_POOL_SIZE = 8` (M4 mirror); per-item logic untouched. |
| `tests/redis-queue-calibration.test.ts` (new) | 4 tests (see §4). |
| `docs/HOTFIX_REDIS_CAL_REPORT.md` (this file) | Report artifact. |

## 2. BEFORE/AFTER verbatim

**`lib/redis-config.ts` URL branch — BEFORE (lines 72–73):**
```
        commandsQueueMaxLength: 5,
        disableOfflineQueue: true,
```
**AFTER:**
```
        // REDIS-CAL: commandsQueueMaxLength 500 absorbs cross-request
        // summation on a shared serverless instance (e.g. home burst of
        // single-key getOrSet calls + one cold watchlist/details fan-out of
        // ~100 commands). Memory cost is bounded queued command refs only.
        commandsQueueMaxLength: 500,
        disableOfflineQueue: true,
```
**HOST branch — BEFORE (lines 96–99):** identical `5` literal. **AFTER:** identical `500` literal + `// REDIS-CAL: same 500 calibration as the URL branch above.`

**`app/api/watchlist/details/route.ts` — BEFORE (lines 37–38):**
```
    const results = await Promise.all(
      toResolve.map(async (item) => {
```
**AFTER:**
```
    // REDIS-CAL: process in batches of DETAIL_POOL_SIZE so both the Redis
    // getOrSet calls and the TMDB origin fetches are smoothed (pool also
    // bounds in-flight TMDB requests on a full-cold miss).
    const results: Awaited<ReturnType<typeof resolveItem>>[] = [];
    for (let i = 0; i < toResolve.length; i += DETAIL_POOL_SIZE) {
      const batch = toResolve.slice(i, i + DETAIL_POOL_SIZE);
      const batchResults = await Promise.all(batch.map(resolveItem));
      results.push(...batchResults);
    }

    async function resolveItem(item: (typeof toResolve)[number]) {
```
(closing `})` / `);` collapsed into the named function's closing brace; per-item GET→fetch→SET logic byte-identical.)

## 3. Pool logic explanation

M4 `ai-recommendations` pattern mirrored exactly: sequential `for` over `slice(i, i + LIMIT)` batches, `await Promise.all(batch…)` per batch. With `DETAIL_POOL_SIZE = 8` and `MAX_DETAIL_ITEMS = 50`: ≤8 items in flight → ≤8 concurrent `GET`s, then on miss ≤8 concurrent TMDB origin fetches + ≤8 `SET`s. Worst-case per-invocation Redis pressure drops from ~100 simultaneous to ~16, well inside the 500 budget even summed with a home-page burst (~16) and rate-limit ops (~10). Order preserved (batches pushed in order). No dependency added; no sleep inserted; response shape unchanged (same array of enriched base items).

## 4. Tests (4 new, `tests/redis-queue-calibration.test.ts`)

(a) 50 concurrent getOrSet-shaped ops (GET + conditional SET, all-miss = 100 commands) against a queue fake capped at 500 → zero rejections, 50 GET + 50 SET, max in-flight ≤ 500.
(b) 50-item batch loop with `DETAIL_POOL_SIZE = 8` against a concurrency-tracking origin fake → max in-flight ≤ 8 and > 1 (pool parallelizes).
(c) 50 keys, 10 pre-warmed → exactly 40 SETs (SET count == miss count).
(d) `buildRedisConfig` emits `commandsQueueMaxLength: 500` in both URL and HOST branches.
Full suite: **36 files / 349 tests green, exit 0.**

## 5. Commands / exit codes

- `npx vitest run tests/redis-queue-calibration.test.ts` → exit 0, 4 passed.
- `npm run lint` → exit 0 (0 errors, 94 warnings, pre-existing).
- `npm run typecheck` → exit 0 (one iteration: test-file `as NodeJS.ProcessEnv` cast fixed to `as unknown as NodeJS.ProcessEnv`, then green).
- `npm test` (default, full, zero exclusions) → exit 0, 36 passed / 349 passed.
- `npm run build` → exit 0 (shared First Load JS 102 kB unchanged; `/watchlist` 4.31 kB / 150 kB unchanged — server-only change, no client bundle impact).

## 6. Out-of-scope proof

- `git diff --stat` touches exactly: `lib/redis-config.ts`, `app/api/watchlist/details/route.ts`, `tests/redis-queue-calibration.test.ts`, this report. No component, page, context, style, env, CI, or API-contract file modified.
- No new dependency in `package.json` (pool is an inline `for`/`slice` loop).
- `disableOfflineQueue: true` and `reconnectStrategy` untouched (diagnostic §4: offline window is not the binding constraint).
- Frozen suites: zero modifications (only additive new test file).
- Response contract of `GET /api/watchlist/details` unchanged (same JSON array, same caps, same TTLs, same error shapes).
