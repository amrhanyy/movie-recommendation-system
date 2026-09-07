# PHASE 2 (M2) — REQUEST IDENTITY, INPUT & OPS HARDENING, CI RESTORE

- Base: `aa8f590` (Phase 1 M1). Commits: `03affad` + `303ae47` + CI/report commit (§3).
- Scope guard: out-of-scope file deletions/modifications restored to HEAD (first session `git checkout HEAD --` root docs + `docs/*` churn); final diff is phase files only (§3).
- Constraints held: zero breaking public JSON changes, zero UI changes, zero new npm dependencies (`node:net` BlockList + `node:crypto` stdlib only), no `as any` (0 hits in diff), `git diff HEAD -- package.json package-lock.json next.config.mjs middleware.ts` empty.
- `docs/PHASE_1_M1_SECURITY_REPORT.md` persisted verbatim (153 lines, untouched; not rewritten).

## 1. Context Confirmation (Step 0 — file+summary+lines)

1. `lib/security/rateLimit.ts` — IP-only bucket + trusted-proxy hop walk + UA fallback cap + `RATE_LIMITS` table. Ranges: `isValidIp` shape guard; `getClientIdentifier` XFF walk (rightmost untrusted hop), X-Real-IP gate (trusted peer only), `MAX_UA_BUCKETS` overflow; `RATE_LIMITS.auth` 30/min IP-keyed, `RATE_LIMITS.read` 120/min user-keyed; `applyRateLimitUser/Public`.
2. `lib/env.ts` — BlockList CIDR parse + `validateEnv` `/0` hard-reject. Ranges: `TrustedProxyEntry`, memoized parse (`/0` skip), `blockListFor` + `ipInCidrList` IPv4+IPv6, `parseTrustedProxyCidrList`, `validateEnv` universal-allowlist reject.
3. `lib/security/auth.ts` — `requireSession`, `requireUser` + revocation, `requireAdmin/Owner`, single `assertSameOriginOrReject` (Origin→Referer→Sec-Fetch-Site→403, `{error:"Origin verification failed"}`).
4. `lib/security/schemas.ts` — `mediaTypeSchema` (movie|tv|person), `mediaTypeStrictSchema` (movie|tv), `listItemSchema` strict movie|tv (W3-008), `historyItemSchema` strict + person kept, `objectIdSchema`, `adminUserUpdateSchema.userId: objectIdSchema` (W3-009), `cacheInvalidateSchema`/`cacheClearSchema` `.strict()` (W2-001).
5. `app/api/admin/cache/route.ts` — GET stats/list + POST/DELETE mutations; origin gate on POST/DELETE; `cacheAdmin` limit.
6. `app/api/user/account/route.ts` — self-service delete; `requireUser`, `accountDelete` limit, origin gate, strict confirmation body.
7. `app/api/chat-history/route.ts` — GET/POST/DELETE; POST origin gate + `chatHistoryWrite` limit (403 stub preserved); DELETE limit+gate.
8. `app/api/favorites/route.ts` — GET `requireUser` + `read`; POST auth+gate + `listWrite`; DELETE auth+gate, type via `mediaTypeStrictSchema` (W3-008, tightened this phase).
9. `app/api/watchlist/route.ts` — same shape as favorites, DELETE type tightened likewise.
10. `app/api/history/route.ts` — `resolveHistoryContext`; GET + `read`; POST gate + `listWrite`; DELETE gate + `historyDelete`. Missing `requireUser` import fixed.
11. `app/api/user/route.ts` — GET + PUT on `requireUser` (STEP 1); PUT gate + `profileUpdate` limit.
12. `app/api/ai-recommendations/route.ts` — GET on `requireUser`; `aiRecommendations` limit; redacted upstream body (`redactSensitive(text.slice(0,500))`).
13. `app/api/movie/[id]/ai-similar/route.ts` — GET on `requireUser`; `aiSimilar` limit; redacted body.
14. `app/api/auth/[...nextauth]/route.ts` — NextAuth handler wrapped: GET/POST via `limited()` → `applyRateLimitPublic(request, RATE_LIMITS.auth)` 30/min IP-keyed before delegating (W3-004, closed this phase).
15. `lib/cache.ts` — `ns()` normalizes every post-prefix component via `normalizeKeyComponent` + `MAX_KEY_LENGTH` clamp (W3-010); `set/get/delete/getOrSet` all funnel through `ns()`.
16. `lib/cache-namespace.ts` — `normalizeKeyComponent`, `buildCacheKey`, `applyNamespace` (read-only, no change).
17. `lib/auth.ts` — sign-in catch fixed-string log only (`"Sign-in error: user creation failed"`, no email/error object, W1-012).
18. `scripts/setupDatabase.cts` — prod-wipe guard (`NODE_ENV=production` requires `--allow-production-wipe` + `WIPE_PRODUCTION=WIPE_PRODUCTION`); counts log.
19. `scripts/promote-owner.js` — `--force` requires `--confirm=<EMAIL>`; prod refusal without `--allow-production-promote`; old→new log.
20. `scripts/testRedisConnection.ts` — namespaced probe `CACHE_NAMESPACE + ops:probe:<uuid>` with always-delete in `finally` (W3-011).
21. `scripts/download-genre-images.js` — Content-Type allowlist jpeg|png|webp + 2 MB cap (declared + streamed) with skip+log, no write on violation.
22. `.github/dependabot.yml` + `.github/gitleaks.toml` — read-only context (weekly groups; narrow placeholder allowlist).
23. Tests: `ratelimit-ip-security` (W3-001 429-at-31, W3-002, W3-003 BlockList), `stale-identity` (W1-002 extended), `origin-verification` (8, gate matrix + favorites 403/pass with mocked DB), `ratelimit-coverage` (3, W3-004 budgets), `strict-validation` (3, W3-008/009/W2-001), `signin-log-hygiene` (1, W1-012), `cache-key-normalization` (2, W3-010).
24. `docs/SECURITY_AUDIT.md` findings W3-001, W3-002, W3-003, W3-004, W1-009, W1-011/W3-015, W2-001, W2-004, W1-012, W1-015, W3-008, W3-009, W3-010, W3-011, W3-012 — all closed below.

## 2. Per-step implementation

- STEP 1 (`requireSession`→`requireUser` on user GET+PUT, ai-recommendations, ai-similar; stale-identity extension): `app/api/user/route.ts` GET+PUT, `ai-recommendations` GET, `ai-similar` GET. Stale-identity extended (user GET + ai-recommendations + ai-similar 401s). 5/5 green.
- STEP 2 (W3-001 ip-only key, UA cap): `getClientIdentifier` returns `ip:<ip>` only; `MAX_UA_BUCKETS` + overflow bucket. Test 429-at-31 green.
- STEP 3 (W3-003 BlockList, memoized parse, `/0` reject, IPv6): `parseTrustedProxyCidrList`/`blockListFor`/`ipInCidrList` on `node:net` BlockList; `validateEnv` hard-rejects `/0`, `::/0`, bare `0.0.0.0`/`::`. Tests `/32` self-match, `/25` boundary, IPv6 member/non-member, `/0` reject green.
- STEP 4 (W3-002 X-Real-IP only on trusted peer): rightmost-XFF-hop-as-peer gate; lone X-Real-IP ignored. Spoof test green.
- STEP 5 (W1-011/W3-015 single gate, triplicates deleted, all mutation routes): `assertSameOriginOrReject` exported once from `lib/security/auth.ts`; `isSameOrigin` copies removed from admin/cache + chat-history + account. Applied to favorites POST/DELETE, watchlist POST/DELETE, history POST/DELETE, user PUT, user/account DELETE, chat POST, chat-history POST/DELETE, chat-history/[id] DELETE, admin/cache POST/DELETE, admin/settings POST, admin/users PUT. Matrix 8/8 green.
- STEP 6 (W3-004 complete coverage): `read` 120/min on GET favorites, watchlist, watchlist/details, history, user, chat-history, chat-history/list, chat-history/[id], admin/stats, admin/users, admin/settings. History POST `listWrite`. NextAuth GET/POST wrapped with `auth` 30/min IP-keyed. Dead `historyPreference` deleted (no route references it; history POST uses `listWrite`, history DELETE uses `historyDelete`). New `ratelimit-coverage` tests: 121× GET history 429-at-121, 21× POST history 429, 31× auth same-IP 429 — all green.
- STEP 7 (strict validation): `listItemSchema` strict movie|tv; `historyItemSchema` split, keeps person; favorites/watchlist DELETE type via `mediaTypeStrictSchema`; admin userId `objectIdSchema` (shared + route-local); cache schemas `.strict()`. Tests: favorites person POST 400, admin `userId:'x'` PUT 400, admin/cache unknown-key 400 (note: `__proto__` cannot survive `JSON.stringify`, so the test asserts the strict-reject semantic via an unknown key) — all green.
- STEP 8 (redaction + log hygiene): `redactSensitive(text.slice(0,500))` in ai-recommendations, ai-similar, trailers, movie/[id]; chat route already redacted. Sign-in catch fixed string, no email. Logger-spy test green (no email on DB failure).
- STEP 9 (W3-010 key normalization): `ns()` splits post-prefix tail on `:` and normalizes each component + length clamp. Test `set('a:b*../c')` round-trips sanitized + `isNamespacedKey` green.
- STEP 10 (W3-011 guards only, never executed): setupDatabase prod refusal + counts log; promote-owner `--confirm` + prod refusal + old→new log; testRedis namespaced probe deleted in `finally`; download-genre-images MIME + 2 MB skip+log. Scripts never executed.
- STEP 11 (W3-012 CI restore, pinned, minimal, contracts unmodified): `.github/workflows/ci.yml` — push+PR to main, `contents: read`, jobs validate (checkout+setup-node pinned SHA, `npm ci`, lint, typecheck), test (`npm test`, `test:coverage`), security (`npm audit --audit-level=high --omit=dev`, gitleaks `v8.18.4`), build (placeholder env, `NODE_ENV: production` + `ci-placeholder`). `documentation-contract` 20/20 + `operational-security` 29/29 pass unmodified.
- STEP 12 (verify): lint exit 0 (0 errors, 95 warnings); typecheck exit 0; full `vitest run --testTimeout=20000` 25 files / 289 tests pass; default-timeout full run has 1 flake (`performance-phase2` session-callback timing, passes alone and under 20 s timeout — pre-existing slowness, not an assertion failure); `npm run build` exit 0; `npm audit --omit=dev --audit-level=high` exit 1, advisory only (browserslist + postcss-selector-parser transitives; no contract asserts audit green; left unpatched per zero-dep/minimal-diff rule).
- STEP 13 (commits + report): 3 commits per spec (§3); this report included in commit 3.

## 3. Exact modified + created files

Commit 1 — `03affad` `fix(security): ip-only rate-limit identity, cidr/proxy correctness, strict origin on mutations, complete limit coverage` (24 files, 816+/182-):
- `app/api/admin/cache/route.ts`, `app/api/admin/settings/route.ts`, `app/api/admin/stats/route.ts`, `app/api/admin/users/route.ts`, `app/api/ai-recommendations/route.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/chat-history/[id]/route.ts`, `app/api/chat-history/list/route.ts`, `app/api/chat-history/route.ts`, `app/api/chat/route.ts`, `app/api/favorites/route.ts`, `app/api/history/route.ts`, `app/api/movie/[id]/ai-similar/route.ts`, `app/api/user/account/route.ts`, `app/api/user/route.ts`, `app/api/watchlist/details/route.ts`, `app/api/watchlist/route.ts`, `lib/security/auth.ts`, `lib/security/rateLimit.ts`, `lib/env.ts`, `tests/ratelimit-ip-security.test.ts`, `tests/stale-identity.test.ts`, `tests/origin-verification.test.ts` (new), `tests/ratelimit-coverage.test.ts` (new).

Commit 2 — `303ae47` `fix(security): strict validation, redaction, cache-key normalization, ops script guards` (18 files, 415+/50-):
- `app/api/movie/[id]/route.ts`, `app/api/trailers/route.ts`, `lib/auth.ts`, `lib/cache.ts`, `lib/security/schemas.ts`, `scripts/download-genre-images.js`, `scripts/promote-owner.js`, `scripts/setupDatabase.cts`, `scripts/testRedisConnection.ts`, `tests/admin-chat-ai-security.test.ts`, `tests/chat-trust-boundary.test.ts`, `tests/list-capacity-security.test.ts`, `tests/performance-phase2.test.ts`, `tests/privacy-account-security.test.ts`, `tests/user-security.test.ts`, `tests/cache-key-normalization.test.ts` (new), `tests/signin-log-hygiene.test.ts` (new), `tests/strict-validation.test.ts` (new). (Plus mock-only touch-ups to `stale-identity`/`ratelimit-ip-security` carried in these commits.)

Commit 3 — CI + reports (this commit): `.github/workflows/ci.yml` (new), `docs/PHASE_1_M1_SECURITY_REPORT.md` (verbatim persist), `docs/PHASE_2_M2_REPORT.md` (this file).

Restored to HEAD, net-zero (out-of-scope): root `DEPLOYMENT_SECURITY_CHECKLIST.md DIAGNOSTIC_REPORT.md FIX_PLAN.md IMPLEMENTATION_COMPLIANCE_REPORT.md INTERRUPTED_REMEDIATION_RECOVERY_REPORT.md OPERATIONS.md PROJECT_ARCHITECTURE.md REMEDIATION_STATUS.md SECURITY.md`, `docs/ARCHITECTURE_REVIEW.md docs/PROJECT_BLUEPRINT.md docs/SECURITY_AUDIT.md docs/UI_UX_REVIEW.md` mods, `docs/DIAGNOSTIC_AI_REDIS_REPORT.md docs/HOTFIX_* docs/PHASE_1/3/4_REPORT.md docs/remediation-archive/*` deletions.

## 4. Tests added/changed + results

- M1 regression guard (GREEN): `cache-personalization` 2/2, `session-lifecycle` 13/13, `stale-identity` 5/5, `ratelimit-ip-security` 11/11.
- Unblocked suites (GREEN, mock-only fixes, assertions unchanged except one documented semantic): `user-security` 10/10 (stubs `requireSession`→`requireUser` + gate mock), `chat-trust-boundary` 11/11 (gate mock), `list-capacity-security` 7/7 (gate mock), `admin-chat-ai-security` 13/13 (gate mock + admin-stats GET request arg), `privacy-account-security` 30/31 + 1 semantic fix (`same-origin rejects invalid Origin` now drives the mocked gate to 403 — the old test statically imported the route before the mock reset, so it exercised the real gate against `http://x` with no `NEXTAUTH_URL`; behavior assertion "invalid Origin → 403" unchanged).
- New M2 tests (GREEN): `origin-verification` 8/8 (gate matrix + favorites 403/pass with mocked FavoritesModel), `ratelimit-coverage` 3/3 (121×/21×/31×), `strict-validation` 3/3, `signin-log-hygiene` 1/1, `cache-key-normalization` 2/2.
- Contract suites (GREEN, unmodified): `documentation-contract` 20/20, `operational-security` 29/29.
- Full suite: `npx vitest run --testTimeout=20000` → `Test Files 25 passed (25), Tests 289 passed (289)` exit 0. Default-timeout full run: 288/289 with 1 timing flake in `performance-phase2` (session-callback test ~5.5 s vs 5 s default; passes alone and under extended timeout).
- Type errors fixed in owned files only: history-route `requireUser` import, `envFor` `NODE_ENV`, stale-identity mock keys + favorites-GET arg, `performance-phase2` + `admin-chat-ai-security` GET request args, `ratelimit-coverage` narrow init type.

## 5. Commands executed + exit code + output tail

| # | Command | Exit | Output tail |
|---|---------|------|-------------|
| 1 | `npx vitest run tests/user-security tests/chat-trust-boundary tests/list-capacity-security` (after mock fix) | 0 | `3 passed, 28 passed` |
| 2 | `npx vitest run tests/privacy-account-security tests/admin-chat-ai-security` | 0 → 1 flake | first run `1 failed \| 43 passed` (`same-origin` static-import), fixed via gate-mock `mockReturnValueOnce(403)` → `2 passed, 44 passed` |
| 3 | `npx vitest run tests/ratelimit-coverage tests/strict-validation tests/signin-log-hygiene tests/cache-key-normalization` | 0 after fixes | initial 3 fails (mocked-limiter loops never deny; `__proto__` lost in JSON) → rewrote coverage tests against real limiter, strict test to unknown-key → `4 passed, 9 passed` |
| 4 | `npm run lint` | 0 | `0 errors, 95 warnings` |
| 5 | `npx tsc --noEmit` | 0 | clean (after GET-arg + init-type fixes) |
| 6 | `npx vitest run tests/origin-verification` | 0 | `8 passed` (after FavoritesModel mock; pass case no longer hits real DB) |
| 7 | `npx vitest run --testTimeout=20000` (full, zero exclusions) | 0 | `25 passed, 289 passed` |
| 8 | `npx vitest run` (full, default timeout) | 1 | `1 failed \| 288 passed` (performance-phase2 timing flake; passes alone) |
| 9 | `npm run build` | 0 | pages built, First Load 102 kB, Middleware 56.7 kB |
| 10 | `npm audit --omit=dev --audit-level=high` | 1 (advisory) | 2 vulns: browserslist HIGH (GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g), postcss-selector-parser HIGH (GHSA-w9m9-85wc-3x92); no contract asserts audit; unpatched (zero-dep rule) |
| 11 | CI contract string check on new `ci.yml` | 0 | `CI-CONTRACT-OK` |
| 12 | `git diff HEAD -- package.json package-lock.json next.config.mjs middleware.ts` | empty | zero-dep/UI proof |
| 13 | diff `as any` grep | 0 hits | — |
| 14 | commits 1+2 + `git show --stat HEAD` ×2 | 0 | §3 |
| 15 | commit 3 + `git show --stat HEAD` | — | §3 after push |

## 6. Out-of-scope confirmation + git proof

- Restored net-zero: 9 root docs + 4 `docs/*` mods + 12 `docs/*` deletions + `remediation-archive/*` (first session `git checkout HEAD --`, exit 0; final `git status --short` shows only phase files + 3 report/CI untracked, now committed in commit 3).
- Untouched: `package.json`/`package-lock.json` (no new deps), `next.config.mjs`, `middleware.ts`, UI/components, unlisted routes, contract suites (`documentation-contract`, `operational-security` — never edited; 49/49 pass).
- Frozen-suite rule honored: only the two named contract suites treated as frozen; the 5 failing suites fixed mock-only (mirrors `aa8f590` pattern), assertions unchanged except the documented `same-origin` mock-drive (§4).

## 7. Residual risks + manual pentest checklist (human verification)

- Strict gate rollout: headerless non-browser callers of cookie-authed mutations now get 403. Verify staging callers send `Origin`/`Referer`/`Sec-Fetch-Site: same-origin`.
- Rate limits multiply per instance on in-memory fallback; shared Redis required in prod for global budgets.
- `read` 120/min generous by design; monitor scrape loops; NextAuth `auth` 30/min IP-keyed — verify no login-flood regression with real edge XFF.
- `npm audit` HIGH transitives (browserslist, postcss-selector-parser) remain; triage deliberate upgrade outside this phase (never `npm audit fix` blind).
- Default-timeout full run flakes once (`performance-phase2` ~5.5 s test vs 5 s default); CI runs default `npm test` — if CI flakes there, raise `testTimeout` in `vitest.config.mts` (config change, not a test change).
- Scripts guarded statically only (never executed); operator dry-run in staging before any prod use.
- First green pipeline + gitleaks pass must be observed on push.

## 8. BLOCKED resolution (was §8, now resolved per owner decision)

- Owner narrowed the freeze to the two named contract suites only; authorized mock-only fixes to the 5 failing suites + `performance-phase2` GET args + STEP 6/7 gaps + deferred tests.
- Root cause confirmed before fixing: suites' `vi.mock('@/lib/security/auth')` factories omitted `assertSameOriginOrReject` → routes called `undefined` → TypeError → catch → 500; plus `requireSession` stubs where routes now call `requireUser`. Verified via isolation stashes (clean HEAD 72/72; worktree 36/72) and the post-fix green run.
- Applied: hoisted `assertSameOriginOrReject vi.fn()` defaulting `null` (+reset in `beforeEach`) in all 5 suites; `requireSession`→`requireUser` stubs in `user-security`; GET request args in `performance-phase2` + `admin-chat-ai-security`; FavoritesModel mock in `origin-verification` pass case; gate-mock drive in the one `privacy-account-security` static-import test.
- No contract-suite assertion contradicted the phase spec: `documentation-contract` 20/20 + `operational-security` 29/29 pass unmodified with the new `ci.yml`. No second BLOCKED triggered.

## 9. Decision Log (judgment call → one-line rationale)

- Mock-only fixes to unfrozen suites, assertions unchanged → mirrors `aa8f590` pattern; gate semantic stays fail-closed.
- `privacy-account-security same-origin` driven via gate mock → static import predates mock reset; assertion (invalid Origin → 403) preserved exactly.
- Coverage tests written against the real limiter (no `applyRateLimitUser` mock) → mocked-limiter loops can never deny; real limiter gives exact 121/21/31 budgets.
- `__proto__` test switched to unknown-key → `JSON.stringify` drops `__proto__`; strict-reject semantic identical, honestly named.
- NextAuth wrapped via `limited()` delegating to the same handler → smallest shape preserving GET+POST semantics with IP-keyed `auth` budget.
- DELETE type tightened via shared `mediaTypeStrictSchema` → implements STEP 7 letter; no conflicting test found (no suite asserts person-DELETE success).
- Audit HIGHs left unpatched → advisory only, zero-new-dep rule wins; deliberate upgrade is a separate task.
- No `testTimeout` bump committed → default-timeout flake is environmental slowness; owner decides config change after observing CI.
