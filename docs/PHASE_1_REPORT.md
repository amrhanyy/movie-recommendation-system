# Phase 1 Report — Security Hardening, Dead Code Elimination & Test Stabilization

**Project:** MovieMind (movie-recommendation-system)
**Date:** 2026-09-05
**Status:** Complete — all acceptance criteria met.

---

## 1. Files Modified

### Security patches
| File | Change | Finding |
|------|--------|---------|
| `app/api/watchlist/details/route.ts` | Deleted `console.log('Session user email:', …)`; switched from raw `getServerSession` to server-authoritative `requireSession` (`@/lib/security/auth`); error logs no longer include the error object | **M-04** |
| `lib/fetchWithRetry.ts` | Added `redactUrlForLog()` (origin + pathname only). All `console.warn`/`console.error`/`throw` messages now use the redacted URL, so `api_key=…` query strings never reach stdout/stderr | **M-02** |
| `lib/security/rateLimit.ts` | `getClientIdentifier` no longer trusts the first (client-controlled) `X-Forwarded-For` hop. Now: honors `TRUSTED_PROXY_CIDRS` (RFC 7239 right-to-left untrusted-hop walk) or otherwise uses the **rightmost** proxy-appended hop, IP shape-validated, compounded with a UA hash. Added `tmdbProxyStrict` (10/min) and `listWrite` (20/min) to `RATE_LIMITS` | **M-01**, **M-03**, **M-05** |
| `lib/env.ts` | Added `TRUSTED_PROXY_CIDRS` to `EnvShape`; exported `parseTrustedProxyCidrList`, `ipInCidrList` (pure, invalid entries ignored, never throws) | **M-01** |
| `app/api/genre/[id]/content/route.ts` | Validate `id` (`tmdbIdSchema` + digit regex), `type` (`mediaTypeStrictSchema`), `page` (digit regex) **before** any fetch; `applyRateLimitPublic(tmdbProxy)`; removed `error.status_message` passthrough (fixed string); `503` when API key missing | **M-03**, **L-07** |
| `app/api/genre/[id]/route.ts` | Same id/type validation before upstream; rate limit; fixed error strings | **M-03**, **L-07** |
| `app/api/movie/[id]/recommendations/route.ts` | id validation, rate limit, 503 on missing key, no console URL logging | **M-03** |
| `app/api/movie/[id]/similar/route.ts` | id validation, rate limit; **L-07**: `TMDB error: ${status}` passthrough replaced with fixed message, upstream 4xx mapped to same status, 5xx → 502 | **M-03**, **L-07** |
| `app/api/tv/[id]/recommendations/route.ts` | id validation, rate limit | **M-03** |
| `app/api/tv/[id]/similar/route.ts` | id validation, rate limit | **M-03** |
| `app/api/movies/route.ts` | `applyRateLimitPublic(tmdbProxy)`; 503 on missing key; removed `statusText` from internal error | **M-03** |
| `app/api/genres/route.ts` | `applyRateLimitPublic(tmdbProxyStrict)` — ~20+ upstream fan-out; 503 on missing key | **M-03** |
| `app/api/trailers/route.ts` | `applyRateLimitPublic(tmdbProxyStrict)` — 1 + up to 10 fan-out; `filter` constrained to strict allowlist (`streaming`, `on tv`, `for rent`, `in theaters`, `popular`), unknown → `popular` (no upstream query tampering); fixed error text | **M-03**, **L-07** |
| `app/api/favorites/route.ts` | `POST`: `applyRateLimitUser(RATE_LIMITS.listWrite)` (20/min) + 500-item capacity check via `countDocuments`/`exists` **before** `findOneAndUpdate` → `400` with explanatory message (re-adding an existing item still allowed at cap) | **M-05** |
| `app/api/watchlist/route.ts` | Same as favorites | **M-05** |
| `app/api/features/route.ts` | DB error `catch` now **fails closed**: `503` + `aiAssistant: false`; error log is a fixed string (no stack/DB detail) | **L-02** |
| `next.config.mjs` | Removed the unconditional `v0-user-next.config` import + `mergeConfig` block (a future/accidental config could have replaced the entire CSP/HSTS security-headers block) | **L-05** |
| `package.json` | `next ^15.5.4 → ^15.5.9`, `next-auth ^4.24.11 → ^4.24.15` (patched floors); removed unused `node-cache` dependency | **L-08**, dead code |
| `package-lock.json` | Synced via `npm install --package-lock-only` (node-cache entry removed; locked `next 15.5.23` / `next-auth 4.24.15` satisfy the new floors — no version movement) | **L-08** |
| `vitest.config.mts` | Replaced deprecated `environmentMatchGlobs` with `test.projects` (node + jsdom) using nested `resolve.alias` — removes the `DEPRECATED "environmentMatchGlobs"` warning; 195 tests pass identically | test hygiene |
| `.env.example` | Documented new optional `TRUSTED_PROXY_CIDRS` | **M-01** |
| `OPERATIONS.md` | Documented M-01 proxy-topology behavior and when `TRUSTED_PROXY_CIDRS` must be set | **M-01** |
| `lib/models/index.ts` | Removed `Movie`/`Rating` + `IMovie`/`IRating` exports (files deleted; zero importers verified by grep) | dead code |

### New tests (runnable checks left behind)
| File | Covers |
|------|--------|
| `tests/ratelimit-ip-security.test.ts` (7) | M-01: rotating left XFF hop does **not** mint fresh budgets (rightmost governs); distinct rightmost IP gets its own budget; invalid rightmost falls back to UA fingerprint; M-02: `redactUrlForLog` strips `api_key`/query; malformed URL never echoed |
| `tests/tmdb-proxy-validation.test.ts` (9) | M-03: all nine proxy routes validate before upstream (400, `fetch` never called — e.g. `/api/genre/invalid/content?type=unknown`); all nine apply `applyRateLimitPublic`; L-07: no upstream error text reflected (502 + fixed string) |
| `tests/list-capacity-security.test.ts` (7) | M-05: 429 before DB write when rate-limited; `listWrite` config used; 501st distinct item → 400 before `findOneAndUpdate`; existing-item re-add allowed at cap; watchlist parity |
| `tests/features-fail-closed.test.ts` (1) | L-02: DB failure → 503 + `{ aiAssistant: false }` |

---

## 2. Root Cause of the Previously Failing Test

**Finding:** No test failure exists at this tree's baseline. Pre-change `npx vitest run` was **195/195 green** (10 files, ~20s), exit 0. The `vitest-r5.log` referenced in the task was a stale artifact whose only content was `clean — nothing to commit` (a `git status` dump, not a test run) — it has been deleted as a stray status dump.

**What could have broken during Phase 1 (and how it was handled):**
1. **`projects` migration broke module resolution** — first attempt at removing the deprecated `environmentMatchGlobs` warning put `resolve.alias` at the top level only; Vitest 3 projects do not inherit it, so every `@/…` import failed ("Cannot find package"). **Fix:** nested `resolve.alias` inside each project entry. Verified 195/195 green before proceeding.
2. **Type errors from the M-05 rate-limit wiring** — `applyRateLimitUser(request, …)` requires `NextRequest`; the favorites/watchlist `POST` handlers were typed `Request`. **Fix:** retyped handlers to `NextRequest` (Next.js passes `NextRequest`; `tsc --noEmit` clean).
3. **Test-only `Body is unusable` stderr noise** — a shared `Response` mock body read twice. **Fix:** fresh `Response` per call (matches the existing `tests/helpers.ts mockFetch` contract), and the nine-route check now short-circuits via a mocked 429 so no upstream path executes at all.

No test was bypassed, skipped, or weakened; all 195 pre-existing assertions remain intact.

---

## 3. Verification Output

### `npm test` (vitest) — final
```
 Test Files  14 passed (14)
      Tests  219 passed (219)
   Duration  ~21.5s
   exit code 0
```
Breakdown: 10 pre-existing files (195 tests) + 4 new files (24 tests). No unhandled rejections. Remaining stderr lines are intentional, fixed, detail-free `console.error` strings asserted by the L-02 test ("Features API error: database unavailable or misconfigured") and the pre-existing "Recommendation error" log from `admin-chat-ai-security.test.ts` (unchanged from baseline).

### `npx tsc --noEmit` — final
```
(no output)
   exit code 0
```

### `npm run lint` (eslint .) — final
```
✖ 109 problems (0 errors, 109 warnings)
   exit code 0
```
All 109 warnings are pre-existing `no-unused-vars` / `react-hooks/exhaustive-deps` / `no-img-element` items in files untouched by Phase 1 (one warning was *removed* by this phase). Zero errors.

---

## 4. Closed Security Items

| ID | Item | Resolution | Verified by |
|----|------|-----------|-------------|
| **M-01** | XFF first-hop trust → rate-limit bypass | Rightmost-hop / `TRUSTED_PROXY_CIDRS` walk + IP validation + UA-hash compound; identifier never includes a client-forgeable raw value | `tests/ratelimit-ip-security.test.ts` (4 tests); OPERATIONS.md topology note |
| **M-02** | TMDB `api_key` in retry logs | `redactUrlForLog()` (origin+path) on all `fetchWithRetry` log/throw lines | `tests/ratelimit-ip-security.test.ts` (3 tests) |
| **M-03** | 9 proxy routes unvalidated + unrated | `tmdbIdSchema`/`mediaTypeStrictSchema`/page/filter validation before any upstream call; `applyRateLimitPublic` on all 9 (`tmdbProxy` 60/min; `tmdbProxyStrict` 10/min for `/genres`, `/trailers`); 503 on missing key | `tests/tmdb-proxy-validation.test.ts` (9 tests) — incl. acceptance case `/api/genre/invalid/content?type=unknown` → 400 with zero fetch calls |
| **M-04** | Email PII in watchlist details logs | `console.log('Session user email:…')` deleted; route now uses `requireSession`; error logs fixed-string only | `app/api/watchlist/details/route.ts`; no email in any log path |
| **M-05** | Unbounded list writes | `POST` on favorites & watchlist: `applyRateLimitUser(listWrite)` 20/min + 500-item cap (`countDocuments` ≥ 500 & new item → 400 before `findOneAndUpdate`) | `tests/list-capacity-security.test.ts` (7 tests) |
| **L-02** | `/api/features` fails open | DB error → 503 + `aiAssistant: false` (matches middleware fail-closed); fixed error log | `tests/features-fail-closed.test.ts` (1 test) |
| **L-05** | `next.config.mjs` v0 merge could override security headers | Import + `mergeConfig` block removed; config is now a single static object | `next.config.mjs`; grep for `v0-user-next.config` → zero references |
| **L-08** | Dependency floors below patched versions | `next ^15.5.9`, `next-auth ^4.24.15`; lockfile synced and still pins `15.5.23` / `4.24.15` | `package.json`, `package-lock.json` (node-cache entry gone) |
| **L-07** | Upstream error text reflected to clients | `status_message` / `TMDB error: ${status}` passthroughs replaced with fixed strings; upstream 4xx preserved, 5xx → 502 | `tests/tmdb-proxy-validation.test.ts` L-07 test |

**Boundaries honored:** no frontend `components/` or page layouts touched (only one pre-existing unused import remains as-is); no new runtime dependencies added (only `node:crypto` stdlib); no test disabled or bypassed; least privilege maintained (all auth via server-side `require*` helpers).

---

## 5. Dead Code & Working-Tree Hygiene

**Deleted (code):**
- `utils/redisExample.ts` — PII-keyed cache pattern, zero importers
- `lib/models/Movie.ts`, `lib/models/Rating.ts` — exports removed from `lib/models/index.ts`, zero importers
- `node-cache` — removed from `package.json` + lockfile (unused; hand-rolled bounded map in `lib/cache.ts` covers it)

**Deleted (root junk / status dumps):**
- `fix-test162.py`, `strip-logs.py`, `eslint-r5.txt`, `eslint-r5b.txt`, `vitest-r5.log`, `r7-audit.json`
- `after-recovery-r1-status.txt` / `.patch`, `after-recovery-r4-status.txt` / `.patch`, `after-recovery-r7-status.txt` / `.patch`, `before-final-accountability-status.txt` / `.patch`, `cursor-partial-remediation.patch`, stray `cursor-` file
- Additional untracked artifacts found at root and removed as dead: `movie_data.json` (no importers), `movie_model.ts` (0 bytes), `npm` (0 bytes)

**Archived:**
- `RECOVERY_BATCH_R1..R8_REPORT.md` → `docs/remediation-archive/` (8 files)

---

## 6. Acceptance Criteria

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `npm test` passes with zero failures | ✅ 219/219, 14 files |
| 2 | `npm run lint` + `npx tsc --noEmit` zero errors | ✅ 0 errors (109 pre-existing warnings), tsc clean |
| 3 | No email / TMDB API key in stdout/stderr | ✅ PII log deleted; all URL logs redacted to origin+path; error logs fixed strings (probe-verified undici errors carry no URL) |
| 4 | Invalid proxy params → 400 without hitting upstream | ✅ `/api/genre/invalid/content?type=unknown` → 400, `fetch` never called (test-asserted for all id/type routes) |
| 5 | Deleted models/utilities/junk fully removed | ✅ git status shows deletions; root contains no patches/dumps; reports archived |

### Follow-ups (out of Phase 1 scope, recommended)
- Deploy decision for `TRUSTED_PROXY_CIDRS` based on actual edge topology (see OPERATIONS.md §9 and docs/SECURITY_AUDIT.md §5.1).
- `watchlist/details` still performs one TMDB call per stored item — the 500-item cap bounds this to ≤500 calls/read; a batched/fan-out cap is a candidate for a later phase.
- 109 pre-existing lint warnings (unused imports etc.) — good candidates for the UI/UX cleanup phases.
