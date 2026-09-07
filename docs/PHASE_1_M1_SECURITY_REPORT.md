# PHASE 1 (M1) — SECURITY CRITICAL: CROSS-USER CACHE LEAK + SESSION LIFECYCLE

- Commit: `aa8f590` — `fix(security): eliminate cross-user cache leak, enforce 1d JWT with per-session revocation, fresh-DB identity on personal routes`
- Date: 2026-09-07 01:29:17 +0300
- Stat: 21 files changed, 910 insertions(+), 134 deletions(-)
- Scope guard: `git diff aa8f590 HEAD --name-only` → empty (after `4bdf6d2`/`229d85e` net-zero CI revert)
- Constraints held: zero breaking public JSON changes, zero UI changes, zero new npm dependencies, no `as any` (grep 0 hits), `git diff package.json package-lock.json next.config.mjs` empty

## 1. Context Confirmation (Step 0)

1. `lib/auth.ts` — NextAuth `authOptions`: JWT/session callbacks, `maxAge`/`updateAge`, `jti`, `signOut` event, secure cookies. Touched ranges: `lib/auth.ts:40-53` (options/session window), `lib/auth.ts:58-129` (jwt callback), `lib/auth.ts:162-192` (session callback), `lib/auth.ts:194-249` (signOut event), `lib/auth.ts:250-292` (pages/cookies).
2. `lib/security/auth.ts` — choke point `requireSession` / `requireUser` / `tryRequireUser` / `requireAdmin` / `requireOwner`. Touched ranges: `lib/security/auth.ts:50-83` (requireSession), `lib/security/auth.ts:88-152` (requireUser + revocation), `lib/security/auth.ts:160-191` (tryRequireUser), `lib/security/auth.ts:196-230` (requireAdmin/requireOwner unchanged behavior).
3. `app/api/movies/time-based/route.ts` — TMDB slot proxy with cache + personalization branch. Touched ranges: `app/api/movies/time-based/route.ts:3` (import), `app/api/movies/time-based/route.ts:86-96` (optional session + params-only key), `app/api/movies/time-based/route.ts:99-140` (getOrSet base only), `app/api/movies/time-based/route.ts:141-191` (per-request personalization + shape-preserving response).
4. `lib/cache.ts` and `lib/cache-namespace.ts` — `getOrSet`, stampede guard, prefix/normalization. Read-only; no changes (out-of-scope confirmation §6).
5. Personal-route auth entry points (auth line only, `requireSession` → `requireUser`): `app/api/favorites/route.ts:13,35,116`, `app/api/watchlist/route.ts:13,35,117`, `app/api/watchlist/details/route.ts:19`, `app/api/chat/route.ts:132`, `app/api/chat-history/route.ts:33,65,100`, `app/api/chat-history/list/route.ts:9`, `app/api/chat-history/[id]/route.ts:13,60`, `app/api/history/route.ts:29`.
6. `lib/models/User.ts` (read-only schema context) and `lib/models/index.ts` (registry; touched `lib/models/index.ts:2` to register `RevokedSession`).
7. `vitest.config.mts` plus `tests/chat-trust-boundary*` and `tests/redis-cache-security*` — harness + mock pattern context. Read-only except mock-drift fixes listed in §3.
8. `docs/SECURITY_AUDIT.md` findings W3-007, W1-001, W1-002, W1-003 — acceptance criteria for §§2.1–2.4.

## 2. Per-finding root cause + fix (file:line evidence)

### 2.1 W3-007 (High): cross-user personalization cache leak

- Root cause: `app/api/movies/time-based/route.ts:73` (pre-fix) built the cache key with a `user:${userId ? 'auth' : 'guest'}` bucket, and the personalized (watchlist/favorites-filtered, genre-re-sorted) payload was written to that cache at the old `:115`. Any authenticated user hitting the same slot/params within TTL received another user's filtered/ordered list.
- Fix:
  - `app/api/movies/time-based/route.ts:96` — params-only key, never identity: `` `movies:duration:${duration}:page:${page}:genre:${genre}:time:${timeSeed}` ``.
  - `app/api/movies/time-based/route.ts:99-140` — `redisCache.getOrSet<TmdbDiscoverResponse>(cacheKey, …, 300)` caches only the unpersonalized TMDB `movieData` base (`:134-138` returns `movieData` directly).
  - `app/api/movies/time-based/route.ts:141-183` — per-request personalization on a copy (`:142-144` `[...baseData.results]`), indexed ownership-scoped reads (`:152-155` `WatchlistModel.find({ userId })` / `FavoritesModel.find({ userId })` with `.select({ itemId: 1, tmdbId: 1, genreIds: 1, _id: 0 })`), legacy-field fallback (`:168` `item.itemId ?? item.tmdbId`), exclusion filter (`:173`) + genre re-sort (`:175-182`). Personalized `results` never written back to cache.
  - `app/api/movies/time-based/route.ts:185-191` — shape preserved: `{ ...baseData, results, duration_info: { range, description } }`; status codes unchanged (400 invalid duration/page/genre at `:64`, `:70`, `:75`; 500 fetch failure at `:194`).

### 2.2 W1-001 (High): session lifetime + per-session revocation

- Root cause: `lib/auth.ts:31` (pre-fix) `maxAge` 30d, no `updateAge`, no `jti`; `lib/security/auth.ts:87` (pre-fix) performed no revocation check, so clearing the client cookie left a stolen JWT reusable until expiry.
- Fix:
  - `lib/auth.ts:51-52` — `maxAge: 86400` (24 h), `updateAge: 3600` (sliding re-issue ≤1/h).
  - `lib/auth.ts:63-64` — `token.jti = randomUUID()` (stdlib `node:crypto`, `lib/auth.ts:3`) assigned once at creation, preserved on updates (`typeof token.jti !== "string" || length === 0` guard).
  - `lib/models/RevokedSession.ts:9` — `jti: { type: String, required: true, unique: true, index: true }`; `lib/models/RevokedSession.ts:10` — `expiresAt: { type: Date, required: true }`; `lib/models/RevokedSession.ts:14` — TTL `schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })` so rows self-reap at JWT expiry.
  - `lib/models/index.ts:2` — `export { RevokedSession } from './RevokedSession';` (registry).
  - `lib/auth.ts:202-230` — `events.signOut`: extracts `jti` (`:204-208`), derives `expiresAt` from `token.exp` with `now + 86400` fallback (`:219-225`), idempotent `RevokedSession.updateOne({ jti }, { $setOnInsert: { jti, expiresAt } }, { upsert: true })` (`:228-230`); never throws (`:239-247` swallow + error event); logs only via `logOperationalEvent(buildOperationalEvent({ event: "health.readiness", … meta: { revoked: boolean } }))` (`:210-216`, `:232-237`, `:241-246`) — boolean only, no email/token.
  - `lib/security/auth.ts:98-109` — enforcement choke point in `requireUser`: `RevokedSession.exists({ jti: sessionJti })` (`:100`) truthy → `401 { error: "Authentication required" }` (`:102-108`). Indexed `exists()` only, before the `User.findOne` fresh read (`:111-114`).
  - Account deletion needs no extra revocation: the fresh-DB read in `requireUser` (`lib/security/auth.ts:111-124`) already returns 401 once the user document is gone (Decision Log §8).

### 2.3 W1-002 (High): stale identity on personal-data routes

- Root cause: `lib/security/auth.ts:47` (pre-fix) `requireSession` trusted the signed JWT (`session.user.email`) with no DB existence check, so a deleted/demoted user's session claims still passed personal-route auth.
- Fix:
  - `lib/security/auth.ts:110-141` — `requireUser` fresh-DB check `User.findOne({ email }, { role: 1, email: 1, name: 1, image: 1, preferences: 1 }).lean()` (`:111-114`); missing doc → 401 (`:116-124`); returns canonical `dbUser._id.toString()` identity (`:129`), never the JWT claim.
  - `lib/security/auth.ts:160-191` — new `tryRequireUser()` optional-session variant: null on absent email (`:165`), stale/deleted user (`:175`), or any error (`:190`); standalone (fresh-DB + own query, no delegation to `requireUser` internals). Never throws, never logs PII.
  - Switched `requireSession` → `requireUser` in ALL methods of the 8 personal routes (import + call sites): `app/api/favorites/route.ts:2,13,35,116`; `app/api/watchlist/route.ts:2,13,35,117`; `app/api/watchlist/details/route.ts:2,19`; `app/api/chat/route.ts:2,132`; `app/api/chat-history/route.ts:2,33,65,100`; `app/api/chat-history/list/route.ts:2,9`; `app/api/chat-history/[id]/route.ts:2,13,60`; `app/api/history/route.ts:2,29` (history switch inside `resolveHistoryContext`, covering GET/POST/DELETE).
  - `app/api/movies/time-based/route.ts:3,87-88` — optional session via `tryRequireUser()`; `userId = optionalUser?.email`; null → unpersonalized base served.
  - Remaining `requireSession` (non-personal, documented): `app/api/user/route.ts:27,53`, `app/api/ai-recommendations/route.ts:120`, `app/api/movie/[id]/ai-similar/route.ts:122`. (Pre-existing `requireUser` at `app/api/user/export/route.ts:35`, `app/api/user/account/route.ts:58` untouched.)

### 2.4 W1-003 (Medium): fail-closed jwt callback

- Root cause: `lib/auth.ts:65` (pre-fix) catch returned a partially-mutated token, and `:114` (pre-fix) `token.id ?? token.sub ?? ""` fallback could mint/keep a usable session with `id === ""`.
- Fix:
  - `lib/auth.ts:68` — `const fallbackToken = { ...token }` snapshot taken after jti assignment, before any DB mutation.
  - `lib/auth.ts:79-91` — `!dbUser` path: return `fallbackToken` unchanged only when it already carries a valid non-empty `id` (`:84-89`); otherwise `throw new Error("JWT callback: user record unavailable")` (`:90`).
  - `lib/auth.ts:108-119` — catch: never return mutated token, never `""` fallback (`:112-117` return snapshot only if `fallbackToken.id` non-empty); otherwise `throw new Error("JWT callback: authentication unavailable")` (`:118`).
  - `lib/auth.ts:123-128` — post-lookup invariant: sign-in path (`user?.email`) with empty/missing `token.id` throws (`:125`).
  - `lib/auth.ts:162-177` — `session` callback rejects missing id (`:175-177` throw), so no route ever trusts `id === ""`.

## 3. Exact modified + created files

`git show --stat aa8f590 --oneline` (21 files, 910+/134-):

- Modified (17):
  - `app/api/chat-history/[id]/route.ts` | 6 +-
  - `app/api/chat-history/list/route.ts` | 4 +-
  - `app/api/chat-history/route.ts` | 8 +-
  - `app/api/chat/route.ts` | 4 +-
  - `app/api/favorites/route.ts` | 8 +-
  - `app/api/history/route.ts` | 4 +-
  - `app/api/movies/time-based/route.ts` | 129 ++++++++------
  - `app/api/watchlist/details/route.ts` | 4 +-
  - `app/api/watchlist/route.ts` | 8 +-
  - `lib/auth.ts` | 155 +++++++++++++++--
  - `lib/models/index.ts` | 2 +
  - `lib/security/auth.ts` | 59 +++++++
  - `tests/admin-chat-ai-security.test.ts` | 28 +-- (mock drift: `requireSession` mock → `requireUser`)
  - `tests/chat-trust-boundary.test.ts` | 31 ++-- (same mock pattern)
  - `tests/list-capacity-security.test.ts` | 14 +- (same)
  - `tests/performance-phase2.test.ts` | 9 +- (same)
  - `tests/privacy-account-security.test.ts` | 7 +- (same)
- Created (4):
  - `lib/models/RevokedSession.ts` | 18 ++
  - `tests/cache-personalization.test.ts` | 171 ++++++++++++++++++
  - `tests/session-lifecycle.test.ts` | 307 +++++++++++++++++++++++++++++++++
  - `tests/stale-identity.test.ts` | 68 ++++++++

## 4. Tests added/changed + results

- New (17/17 pass):
  - `tests/cache-personalization.test.ts` (2/2): two distinct users, disjoint watchlist/favorites, same params within TTL → different payloads AND exactly one upstream fetch per slot (mocked fetch + cache).
  - `tests/session-lifecycle.test.ts` (13/13): `maxAge` 86400 / `updateAge` 3600 values; `jti` created once via `randomUUID` and preserved across `updateAge` ticks; `signOut` inserts revocation doc (`updateOne`/`$setOnInsert`/upsert); `requireUser` rejects revoked `jti` with 401; stubbed `User.findOne` throw → no usable token (401/false), never `id === ""`.
  - `tests/stale-identity.test.ts` (2/2): session claims of a DELETED user (mocked `User.findOne` → null) → 401 on `POST /api/chat` and `GET /api/favorites`.
- Fixed mock drift (71/71 pass, behavior assertions unchanged, mock pattern `requireSession` → `requireUser` + passthrough where the route is out-of-scope):
  - `tests/chat-trust-boundary.test.ts` 11/11; `tests/list-capacity-security.test.ts` 7/7; `tests/admin-chat-ai-security.test.ts` 13/13; `tests/privacy-account-security.test.ts` 31/31; `tests/performance-phase2.test.ts` 9/9.
- Full suite minus 2 pre-broken: 18 files, 216/216 pass (`npx vitest run --exclude tests/documentation-contract.test.ts --exclude tests/operational-security.test.ts` → exit 0). Raw `npx vitest run` → 216 passed + 2 collection failures (`documentation-contract`, `operational-security`, `ENOENT .github/workflows/ci.yml` — deleted in `afa013c chore: remove ci workflow`, pre-existing, out-of-scope per §6).

## 5. Commands executed + exit code + output tail

| # | Command | Exit | Output tail |
|---|---------|------|-------------|
| 1 | `npm run lint` | 0 | `0 errors, 97 warnings` (pre-existing warnings only) |
| 2 | `npm run typecheck` (`tsc --noEmit`) | 0 | no output |
| 3 | `npx vitest run tests/cache-personalization.test.ts tests/session-lifecycle.test.ts tests/stale-identity.test.ts` | 0 | `3 passed, 17 passed` |
| 4 | `npx vitest run` (5 fixed suites) | 0 | `5 passed, 71 passed` |
| 5 | `npx vitest run` (full) | 1 | `2 failed \| 18 passed, Tests 216 passed`; cause `ENOENT .github/workflows/ci.yml` |
| 6 | `npx vitest run --exclude tests/documentation-contract.test.ts --exclude tests/operational-security.test.ts` | 0 | `18 passed, 216 passed` |
| 7 | `npm run build` | 0 | `49/49 pages`, First Load 102 kB, Middleware 56.7 kB |
| 8 | `git status --porcelain` (before commit) | 0 | staged name-only = the 21 files in §3, nothing else |
| 9 | `git commit -m "fix(security): eliminate cross-user cache leak, enforce 1d JWT with per-session revocation, fresh-DB identity on personal routes"` | 0 | `[main aa8f590] 21 files` |
| 10 | `git show --stat HEAD` | 0 | §3 table (910+/134-) |
| 11 | `git status --porcelain -- app lib tests` (after) | 0 | empty |
| 12 | `grep as any` (diff scope) | 0 hits | — |
| 13 | `git diff package.json package-lock.json next.config.mjs` | empty | — |
| 14 | `git log --oneline -4` | 0 | `229d85e` / `4bdf6d2` / `aa8f590` / `afa013c` |
| 15 | `git diff aa8f590 HEAD --name-only` | empty | net-zero CI revert confirmed |

## 6. Out-of-scope confirmation + git proof

- Untouched per hard constraints: rate limiting, CIDR/proxy parsing, origin checks, cache schemas, Zod schemas beyond Steps 1–4, UI/components, `next.config.mjs`, `package.json`, CI files, unlisted routes.
- Proof: before-commit `git status --porcelain` staged only the 21 files in §3; `git diff package.json/lock/next.config` empty; after-commit `git status --porcelain -- app lib tests` clean. Remaining unstaged root/docs churn pre-existing.
- CI revert: `4bdf6d2 fix(ci): restore deleted CI workflow required by contract tests` (+92 `.github/workflows/ci.yml`) violated the Phase 1 `Do NOT touch CI files` constraint and was reverted by `229d85e revert: remove out-of-scope CI workflow restore (Phase 1 constraint)` (−92 same file). Net effect zero: `git diff aa8f590 HEAD --name-only` → empty. The 2 contract suites (`documentation-contract`, `operational-security`) remain red because their fixture (deleted in `afa013c`) is still absent; restoring them is a separate, explicitly out-of-scope task (see Decision Log).

## 7. Residual risks + manual pentest checklist (human verification)

- Revocation is TTL-bound: a stolen JWT stays valid up to 24 h until its `jti` is revoked via signOut. Pentest: sign in → capture JWT → signOut → replay JWT against `GET /api/favorites` → expect 401.
- Deleted-user replay: session claims of a deleted user → expect 401 pre-write on `POST /api/chat` and `GET /api/favorites` (covered by `tests/stale-identity.test.ts`; manually re-verify against staging DB).
- Expired JWT rejected; `updateAge` re-issue preserves `jti` (verify `jti` stable across refresh, revocation still hits after refresh).
- A/B isolation: two users, same `duration/page/genre` within one 5-min slot → different payloads, exactly one TMDB upstream fetch; cache key contains no email/uid (inspect Redis key `movies:duration:*:page:*:genre:*:time:*`).
- DB-down behavior: `tryRequireUser` returns null → time-based serves unpersonalized base; verify no PII leaks in that path and no 500 on the public route.
- Extra load: `requireUser` adds one indexed `RevokedSession.exists` + one projected `User.findOne` per personal-route call. Load-test personal routes before peak.
- Still-`requireSession` surface (non-personal but re-check): `app/api/user/route.ts:27,53`, `app/api/ai-recommendations/route.ts:120`, `app/api/movie/[id]/ai-similar/route.ts:122` — test deleted-user JWT there in a follow-up phase.
- Pre-broken (do not silence): restore `.github/workflows/ci.yml` or update the 2 contract tests in a separate scoped task.

## 8. Decision Log (judgment call → one-line rationale)

- `tryRequireUser` standalone, not delegating `requireUser` → avoids cross-worker coupling between the W1-001 and W1-002 patches.
- No `tokenVersion` check in `tryRequireUser` → schema has no such field; adding one is out-of-scope migration.
- History switch inside `resolveHistoryContext` → single entry covers GET/POST/DELETE without triplicating logic.
- SignOut `updateOne` + `$setOnInsert` + upsert → idempotent; concurrent signOuts never duplicate-key throw.
- SignOut reuses `health.readiness` ops event → `OPERATIONAL_EVENTS` allowlist is closed; no new event name.
- `expiresAt` from `token.exp`, fallback `now + 86400` → blocklist row bounded by JWT lifetime; TTL keeps collection bounded.
- Revocation check before `User.findOne` → fail-fast on indexed `exists()`; skips DB user read for known-revoked tokens.
- Pre-`jti` cookies skip the check and stay valid → backward compatibility for sessions minted before M1.
- `crypto.randomUUID` stdlib → random, never PII-derived; no new dependency.
- Logs boolean (`revoked: true/false`) only → no email/token leakage via `operational-log`/`redactSensitive`.
- Test mock passthrough (`requireSession: mocks.requireUser` where route still uses `requireSession`) → out-of-scope routes unchanged.
- Left the 2 documentation/operational contract suites red → fixing them needs the CI restore forbidden by Phase 1 scope.
- Account deletion needs no extra revocation row → fresh-DB read in `requireUser` already fails once the user document is gone.
