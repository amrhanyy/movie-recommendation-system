# Security Audit Report - movie-recommendation-system

- **Date:** 2026-08-31
- **Method:** Strictly read-only static review (code, config, CI, lockfile, git index). No dynamic testing, no file modification.
- **Scope:** Full repository working tree (44 API routes, middleware, auth, cache, AI, frontend sinks).
- **Companion docs:** earlier `SECURITY_AUDIT_REPORT.md` / `REMEDIATION_STATUS.md` exist in-repo; this report supersedes them for the current tree state.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope & Method](#2-scope--method)
3. [Findings](#3-findings)
4. [Positive Notes](#4-positive-notes)
5. [Items Needing Manual Verification](#5-items-needing-manual-verification)
6. [Prioritized Remediation Roadmap](#6-prioritized-remediation-roadmap)

---

## 1. Executive Summary

**Stack:** Next.js 15.5 (App Router) + React 18 + TypeScript - NextAuth 4 (Google OAuth, JWT strategy) - MongoDB (Mongoose) - Redis (optional, in-memory fallback) - Google Gemini (AI) - TMDB (public media proxy) - Node 22 CI (lint, typecheck, vitest, build, `npm audit`, gitleaks).

**Counts by severity:**

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 5 |
| Low | 8 |
| Informational | 2 |

**Top 5 risks:**

1. Public rate limits keyed on attacker-controlled `X-Forwarded-For` -> per-IP limits trivially bypassed (M-01).
2. TMDB API key written to server logs on upstream retry failures via full-URL logging (M-02).
3. Public TMDB proxy routes with no rate limit and unvalidated path/query values interpolated into the upstream URL -> quota exhaustion and upstream path/query injection (M-03).
4. PII (user email) written to server logs (M-04).
5. Unbounded per-user write volume (favorites/watchlist) with no rate limit (M-05).

**Quick wins (<= 1 day total):**

1. Validate `type`/`id` in `app/api/genre/[id]/content/route.ts` and the four `[id]/recommendations|similar` routes - closes M-03 injection surface.
2. Add `applyRateLimitPublic` to the public routes listed in M-03.
3. Redact `api_key` (or drop the query string) in `lib/fetchWithRetry.ts` log lines - closes M-02.
4. Delete `console.log('Session user email:', ...)` in `app/api/watchlist/details/route.ts:15` - closes M-04.
5. Rate-limit `POST /api/favorites` and `POST /api/watchlist` - closes M-05.

---

## 2. Scope & Method

- **Attack surface mapped:** all 44 `app/api/**/route.ts` handlers, `middleware.ts`, NextAuth config (`lib/auth.ts`), central authorization (`lib/security/auth.ts`), rate limiting (`lib/security/rateLimit.ts`), validation schemas (`lib/security/schemas.ts`), AI payload builders (`lib/gemini-payload.ts`, `lib/ai-security.ts`), cache layer (`lib/cache.ts`, `lib/cache-namespace.ts`, `lib/cacheManager.ts`, `lib/redis.ts`, `lib/redis-config.ts`), privacy services (`lib/privacy-service.ts`, `lib/privacy-retention.ts`, `lib/account-deletion.ts`), env validation (`lib/env.ts`), frontend sinks (`components/*`, `app/**/page.tsx`), security headers (`next.config.mjs`), CI/secret scanning (`.github/workflows/ci.yml`, `.github/gitleaks.toml`), dependency versions (lockfile).
- **Trust boundaries traced:** user input -> Zod/regex validation -> Mongoose queries (ownership-scoped) -> Redis cache (namespaced) -> output (JSON / SafeMarkdown). Upstream: server-side-only fetches to TMDB and Gemini with env keys.
- **Dependencies:** lockfile pins `next 15.5.23` (above CVE-2025-55182 RCE / CVE-2025-55183 / CVE-2025-55184 fixes, <= 15.5.9) and `next-auth 4.24.15` (above CVE-2026-73418/73419/73420 and VU138945, fixed in 4.24.15). `zod 3.24.2` has no direct advisory for the 3.24 line. No vulnerable pinned versions found in the lockfile; `package.json` floors (`next ^15.5.4`, `next-auth ^4.24.11`) predate the patched releases (see L-08).
- **Secrets:** no hardcoded credentials/keys found in source, untracked logs/patches, or git index; `.env.example` contains placeholders only; CI uses explicit non-production placeholders; gitleaks runs against full git history in CI.

---

## 3. Findings

### M-01 - Public rate limits bypassable via spoofed `X-Forwarded-For`

- **Category:** OWASP A04:2021 Insecure Design / A07:2021 · CWE-290 (Authentication Bypass by Spoofing)
- **Severity:** Medium
- **Location:** [lib/security/rateLimit.ts:77-90](../lib/security/rateLimit.ts) (`getClientIdentifier`)
- **Description:** For unauthenticated routes the rate-limit key is the *first* IP from the client-supplied `X-Forwarded-For` header, then `X-Real-IP`, then a user-agent hash. There is no trusted-proxy allowlist. Any caller of the public endpoints (`/api/search`, `/api/mood-recommendations`, `/api/celebrities`, and every `tmdbProxy`-limited route) can rotate a forged `X-Forwarded-For` value on each request and receive a fresh rate-limit budget per header value.
- **Attack scenario:** Attacker scripts 100 forged `X-Forwarded-For` values x 60 req/min each -> 6,000 req/min against the TMDB proxy quota instead of 60. Exhausts the shared TMDB API quota, degrading the product for all users (quota-based DoS) and amplifying upstream cost.
- **Impact:** Rate limiting on all public endpoints is effectively advisory; TMDB quota exhaustion / cost amplification; degraded availability for legitimate users.
- **Recommended fix (sketch):** Only honor `X-Forwarded-For` when configured behind a known proxy (e.g., a `TRUSTED_PROXY_CIDRS` env + take the right-most untrusted hop); otherwise default to hashing the full header value plus UA. Minimum: never take a single attacker-chosen hop as the identity.
- **Verification hint:** Fire 100 sequential `GET /api/search?query=x` requests, each with a distinct `X-Forwarded-For: 1.2.3.N`; confirm 429 still occurs at ~30 requests.

### M-02 - TMDB API key leaked to server logs on upstream retry

- **Category:** OWASP A09:2021 Security Misconfiguration (secret exposure) · CWE-532 (Insertion of Sensitive Information into Log File)
- **Severity:** Medium
- **Location:** [lib/fetchWithRetry.ts:70-71](../lib/fetchWithRetry.ts) (`console.warn('Fetch attempt N failed for ${url}...')`); key enters the URL via [lib/tmdb.ts:57-69](../lib/tmdb.ts) (`createTMDBUrl` appends `api_key=${TMDB_API_KEY}`)
- **Description:** `fetchWithRetry` logs the **full URL, including the query string with `api_key=...`**, on every non-final failed attempt. `fetchJsonWithRetry` is used by `lib/tmdb.ts` (watchlist details, TV recommendations, TV similar). A TMDB outage or 5xx burst causes the live API key to be written to stdout/stderr on each retry of each failing request.
- **Attack scenario:** A log aggregator, container log viewer, or compromised log pipeline (or anyone with read access to host logs) harvests the TMDB key. Even a "public-ish" TMDB key is an account secret tied to billing/quota, recoverable only by rotation.
- **Impact:** Secret disclosure to log consumers; TMDB quota/billing abuse by third parties; forced key rotation.
- **Recommended fix (sketch):** Log only host+pathname, or run the URL through `redactSensitive()` from [lib/ai-security.ts:255-261](../lib/ai-security.ts) (which already redacts `key=` values).
- **Verification hint:** Induce one upstream 503 (local mock), inspect logs for the absence of `api_key=<real-value>`.

### M-03 - Public TMDB proxy routes: unvalidated upstream interpolation + missing rate limits

- **Category:** OWASP A05:2021 Security Misconfiguration / A03 Injection · CWE-93 (CRLF/parameter injection into outbound request), CWE-285 (unprotected public endpoint)
- **Severity:** Medium
- **Locations (all public, verified by reading each handler):**
  - [app/api/genre/[id]/content/route.ts:26-57](../app/api/genre/[id]/content/route.ts) - `type` and `id` interpolated **unvalidated** into `/discover/${type}?...&with_genres=${genreId}` (no regex, no enum, no rate limit).
  - [app/api/movie/[id]/recommendations/route.ts:6-27](../app/api/movie/[id]/recommendations/route.ts) - `movieId` unvalidated, no rate limit.
  - [app/api/movie/[id]/similar/route.ts:5-22](../app/api/movie/[id]/similar/route.ts) - `movieId` unvalidated, no rate limit, raw `TMDB error: ${status}` passthrough.
  - [app/api/tv/[id]/recommendations/route.ts:8-28](../app/api/tv/[id]/recommendations/route.ts) - `id` unvalidated, no rate limit.
  - [app/api/tv/[id]/similar/route.ts:8-28](../app/api/tv/[id]/similar/route.ts) - `id` unvalidated, no rate limit.
  - [app/api/movies/route.ts:14-44](../app/api/movies/route.ts) - no rate limit (3 upstream calls per cache miss).
  - [app/api/genres/route.ts:6-58](../app/api/genres/route.ts) - no rate limit; ~20+ upstream `discover` calls per request (most expensive public route).
  - [app/api/trailers/route.ts:41-120](../app/api/trailers/route.ts) - no rate limit; 1 + up to 10 upstream calls per request.
  - [app/api/genre/[id]/route.ts:8-58](../app/api/genre/[id]/route.ts) - no rate limit; 2 upstream calls; `id` unvalidated (harmless locally - only compared against fetched lists).
- **Description:** Sibling routes already apply `applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy)` plus `^\d{1,8}$` ID validation (e.g., [app/api/movie/[id]/route.ts:15-48](../app/api/movie/[id]/route.ts), [app/api/tv/[id]/route.ts:11-25](../app/api/tv/[id]/route.ts)), so the gaps above are inconsistent omissions, not intentional design.
- **Attack scenario:**
  1. *Quota exhaustion:* unlimited unauthenticated `GET /api/genres` -> each request burns ~21 TMDB calls; a small botnet exhausts the monthly TMDB quota, breaking movie/TV data for all users.
  2. *Upstream injection:* `GET /api/genre/28/content?type=movie/../search/multi` (or `type` containing `;`, `&`, spaces) rewrites the upstream path/query. The fetch host is fixed (`api.themoviedb.org`), so this is **upstream path/query injection only** (no cross-host SSRF - the URL authority cannot be changed via path interpolation). Consequences: hitting unintended TMDB endpoints with the app's key, unexpected error bodies reflected to the client, and cache-key pollution (Redis/`revalidate` keyed on attacker-chosen values).
- **Impact:** TMDB quota/billing abuse (availability + cost), unbounded upstream fan-out, inconsistent security posture; limited SSRF-adjacent upstream path tampering.
- **Recommended fix (sketch):** In the `[id]`/`type` routes validate with `tmdbIdSchema` ([lib/security/schemas.ts:19-20](../lib/security/schemas.ts)) and `type in {movie, tv}` (reuse `mediaTypeStrictSchema`), mirroring `app/api/tv/[id]/route.ts`; add `applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy)` to the listed routes (tighter, e.g. 10/min, for `/api/genres` and `/api/trailers` given their fan-out).
- **Verification hint:** `curl /api/genre/28/content?type=../search/multi` should now 400; 61 requests/min to `/api/genres` should 429.

### M-04 - PII (user email) written to server logs

- **Category:** OWASP A02:2021 / A05:2021 · CWE-532
- **Severity:** Medium (low blast radius; violates the codebase's own no-PII-logging policy)
- **Location:** [app/api/watchlist/details/route.ts:15](../app/api/watchlist/details/route.ts) - `console.log('Session user email:', session.user.email);`
- **Description:** Every call to this authenticated endpoint logs the caller's email in plain text. The rest of the codebase (e.g., [lib/operational-log.ts:24-39](../lib/operational-log.ts) `BLOCKED_KEYS`, [app/api/user/account/route.ts:46-56](../app/api/user/account/route.ts) comments) explicitly treats emails as no-log PII; this line contradicts that policy and the privacy statement at [app/privacy/page.tsx:85-93](../app/privacy/page.tsx).
- **Attack scenario:** Log aggregator breach or over-broad log access exposes the account list over time (emails of every user who ever opened watchlist details).
- **Impact:** PII disclosure via logs; privacy-policy non-compliance.
- **Recommended fix:** Delete the line (or log only an opaque truncated-hash marker).
- **Verification hint:** Grep server logs after one request; assert no email appears.

### M-05 - Unbounded per-user write volume (favorites / watchlist)

- **Category:** OWASP A04:2021 Insecure Design (resource exhaustion) · CWE-770
- **Severity:** Medium
- **Locations:** [app/api/favorites/route.ts:28-79](../app/api/favorites/route.ts) (`POST`, no rate limit, no collection-size cap) - [app/api/watchlist/route.ts:28-79](../app/api/watchlist/route.ts) (same)
- **Description:** Both POST handlers validate item shape but impose no per-user rate limit (contrast: `historyDelete`, `chatDeleteAll`, `profileUpdate` all have limits in [lib/security/rateLimit.ts:198-229](../lib/security/rateLimit.ts)) and no maximum list size. A single account can upsert arbitrary distinct `itemId`s (TMDB ID space up to 10,000,000 per `tmdbIdSchema`).
- **Attack scenario:** Compromised or abusive account inserts hundreds of thousands of rows -> MongoDB storage growth, and - critically - `app/api/watchlist/details/route.ts` then performs **one TMDB call per item** in batches: a 10,000-item watchlist is ~10k upstream calls per read, a direct quota-DoS weaponized through the user's own data (see M-03 fan-out).
- **Impact:** Storage exhaustion, TMDB quota exhaustion, degraded read latency, shared upstream quota abuse.
- **Recommended fix (sketch):** Add `applyRateLimitUser` (e.g., new `listWrite: 20/min`) to both POSTs, and cap list size (e.g., 500 items; 400/409 above cap) enforced before `findOneAndUpdate`.
- **Verification hint:** 21 rapid distinct-item POSTs -> 429; 501st item -> 4xx.

### L-01 - Same-origin checks treat a *missing* `Origin` header as non-browser

- **Category:** OWASP A01 / A04 · CWE-346 (Origin Validation Error)
- **Severity:** Low
- **Locations:** [app/api/user/account/route.ts:27-36](../app/api/user/account/route.ts) - [app/api/chat-history/route.ts:8-19](../app/api/chat-history/route.ts) - [app/api/admin/cache/route.ts:24-40](../app/api/admin/cache/route.ts)
- **Description:** `isSameOrigin()` returns `true` when the `Origin` header is absent. Browsers always send `Origin` on cross-site fetch/XHR, so real CSRF is still blocked; but any non-browser client (curl, stolen-cookie replay tooling) skips the check entirely. The comments document this as intentional for CLI/server-to-server, yet these same routes are also called by the browser UI (account deletion, cache clear), so the exemption is broader than necessary.
- **Attack scenario:** Attacker with a stolen session cookie uses curl to `DELETE /api/user/account` or `POST /api/admin/cache {action:"clear"}` without any origin constraint.
- **Impact:** Marginally lowers the bar for destructive actions given cookie theft; no impact without cookie access.
- **Recommended fix (sketch):** For these destructive cookie-authenticated routes, require `Origin` and validate it (fail closed when absent), or add a custom header check; keep the CLI path available via a service token instead.
- **Verification hint:** Send the DELETE with and without `Origin: https://evil.example` - both currently pass; after fix, both non-matching/absent should 403 (absent - operator decision).

### L-02 - `/api/features` fails open to "enabled" on database error

- **Category:** OWASP A04:2021 Insecure Design · CWE-755 (Improper Handling of Exceptional Conditions)
- **Severity:** Low
- **Location:** [app/api/features/route.ts:44-52](../app/api/features/route.ts) (`catch { return NextResponse.json(DEFAULT_CONFIG) }` with `DEFAULT_CONFIG.features.aiAssistant = true`)
- **Description:** When MongoDB is unavailable, the feature-flag endpoint returns the default "aiAssistant: enabled". The middleware at [middleware.ts:31-50](../middleware.ts) fails *closed* (503) for its own fetch errors - but a client reading `/api/features` directly (it is public, and `components/layout/FeatureNavItems.tsx` consumes it) sees the feature as enabled while the backing AI endpoints may 503. Inconsistent fail-open/fail-closed semantics across the two layers.
- **Impact:** Confusing degraded-mode UX; if the default were ever flipped to a *more privileged* flag, this becomes an availability-driven privilege surface. Currently low.
- **Recommended fix (sketch):** On DB error, return 503 from `/api/features` (matching middleware's fail-closed stance) or return `aiAssistant: false` as the safe default.
- **Verification hint:** Stop Mongo, `GET /api/features` -> should be 503 (or `false`), not `true`.

### L-03 - Admin user list exposes all users' PII to any admin

- **Category:** OWASP A01 / A05 · CWE-639 (data minimization)
- **Severity:** Low
- **Location:** [app/api/admin/users/route.ts:36-60](../app/api/admin/users/route.ts) - `User.find({}, { __v: 0 })` returns `email`, `name`, `image`, `preferences`, `created_at` for every user to any `admin` (not only `owner`).
- **Description:** Any admin-role account can enumerate the entire user base (emails included). The promotion API is owner-gated, but read access is not.
- **Impact:** Bulk PII exposure to the (small) admin class; abuse if an admin account is compromised.
- **Recommended fix (sketch):** Mask emails for non-owner callers (e.g., `j***@example.com`) or gate full listing to `requireOwner()`; keep `role`/`created_at` visible to admins.
- **Verification hint:** As an admin (non-owner), `GET /api/admin/users` -> emails should be masked.

### L-04 - Dead utility writes user IDs into cache keys (footgun)

- **Category:** OWASP A05 · CWE-561 (Dead Code)
- **Severity:** Low
- **Location:** [utils/redisExample.ts:44-64](../utils/redisExample.ts) - `storeUserPreferences(userId, ...)` / `getUserPreferences` build keys `user:${userId}:preferences`
- **Description:** No importer found in the app tree (verified by grep). The code violates the documented cache-key policy ("No email, IP, OAuth id... may appear" - [lib/cache-namespace.ts:8-13](../lib/cache-namespace.ts)) and would store PII-keyed entries outside the admin-clearable scope if ever imported.
- **Impact:** None today; regression risk if resurrected.
- **Recommended fix:** Delete the file, or rewrite to use `buildCacheKey(CACHE_SCOPES.userRecommendations, ...)`.
- **Verification hint:** `rg "redisExample"` -> zero app imports; then remove.

### L-05 - `next.config.mjs` merge can silently override security headers

- **Category:** OWASP A05 · CWE-755
- **Severity:** Low
- **Location:** [next.config.mjs:1-4](../next.config.mjs) (`import('./v0-user-next.config')`) and [next.config.mjs:86-105](../next.config.mjs) (`mergeConfig` replaces non-object keys outright - a function-valued `headers` override would replace the CSP/HSTS block)
- **Description:** The file `v0-user-next.config` does not exist in the tree, but the merge is unconditional and would let a future (e.g., generated or accidentally committed) config file **replace** the entire `headers()` security configuration (CSP, HSTS, XFO, nosniff).
- **Impact:** Silent removal of all security headers if such a file appears.
- **Recommended fix (sketch):** Drop the v0 merge entirely, or restrict `mergeConfig` to an explicit allowlist of keys and assert `headers` is never overridden.
- **Verification hint:** Grep for `v0-user-next.config` -> absent; delete the merge block.

### L-06 - In-memory rate-limit fallback is per-process

- **Category:** OWASP A04 · CWE-1281
- **Severity:** Low (documented design trade-off)
- **Location:** [lib/security/rateLimit.ts:18-58](../lib/security/rateLimit.ts)
- **Description:** When Redis is down/unconfigured, limits live in a per-process `Map`. On multi-instance deployments (or serverless with multiple functions), the effective limit is `N_instances x configured limit`.
- **Impact:** Rate limits weakened proportionally during Redis outages or on scaled deployments.
- **Recommended fix (sketch):** Accept as documented degradation (Redis is the primary), or lower per-instance limits by an instance-factor env.
- **Verification hint:** Document the deployment topology; if multi-instance, note the multiplier in OPERATIONS.md.

### L-07 - Upstream error text echoed to clients

- **Category:** OWASP A05 · CWE-209 (Information Exposure Through Error Messages)
- **Severity:** Low
- **Locations:** [app/api/genre/[id]/content/route.ts:58-64](../app/api/genre/[id]/content/route.ts) (`error.status_message` passthrough) - [app/api/movie/[id]/similar/route.ts:19-23](../app/api/movie/[id]/similar/route.ts) (`TMDB error: ${response.status}`)
- **Description:** TMDB status messages/status codes are reflected in client responses. Content is third-party but can reveal upstream state details.
- **Impact:** Minor information disclosure.
- **Recommended fix (sketch):** Return fixed strings (`"Upstream error"` + status) as done in the hardened routes.
- **Verification hint:** Induce a TMDB 404 (invalid id) -> response body should contain no upstream text.

### L-08 - `package.json` dependency floors below the patched versions

- **Category:** OWASP A06:2021 Vulnerable Components · CWE-1104
- **Severity:** Low
- **Location:** [package.json:57](../package.json) (`"next": "^15.5.4"`), [package.json:58](../package.json) (`"next-auth": "^4.24.11"`); lockfile pins `next 15.5.23` and `next-auth 4.24.15` (verified in `package-lock.json` lines 9906-9907 and 9958-9959).
- **Description:** The installed (locked) versions are above the fixes for CVE-2025-55182/55183/55184 (Next.js, fixed <= 15.5.9) and CVE-2026-73418/73419/73420 + VU138945 (next-auth, fixed in 4.24.15). The declared *minimums* (`^15.5.4`, `^4.24.11`) predate the fixes; `npm ci` is safe (frozen lockfile, enforced in CI), but a non-locked `npm install` could resolve a vulnerable older release.
- **Impact:** Supply-chain regression risk only if the lockfile is bypassed.
- **Recommended fix:** Raise floors to the patched minimums: `"next": "^15.5.9"`, `"next-auth": "^4.24.15"`.
- **Verification hint:** `npm ls next next-auth` shows >= patched versions; CI `npm ci` unchanged.

### I-01 - Unused duplicate admin schema

- **Category:** Maintainability · CWE-1188
- **Severity:** Informational
- **Location:** [lib/security/schemas.ts:97-110](../lib/security/schemas.ts) (`adminUserUpdateSchema`) - the live route defines its own inline schema at [app/api/admin/users/route.ts:19-33](../app/api/admin/users/route.ts).
- **Recommended fix:** Point the route at the shared schema (or delete the shared one) to keep a single source of truth.

### I-02 - Middleware matcher omits `/api/movie/**`

- **Category:** Defense-in-depth · CWE-1059
- **Severity:** Informational
- **Location:** [middleware.ts:106-132](../middleware.ts) (matcher list) vs [app/api/movie/[id]/ai-similar/route.ts:111-114](../app/api/movie/[id]/ai-similar/route.ts)
- **Description:** `/api/movie/...` routes are absent from the middleware `config.matcher`, so the middleware token gate never runs for them. The AI-similar handler calls `requireSession()` itself, so protection is intact; the comment at [middleware.ts:76-79](../middleware.ts) also lists `/api/movie/` as a public prefix, which is misleading for the authenticated sub-route.
- **Impact:** None today; drift risk if the handler check is ever removed.
- **Recommended fix:** Add `/api/movie/:path*` to the matcher's protected set (and remove it from the public-prefix comment), or document that `/api/movie/[id]/ai-similar` is handler-guarded.

---

## 4. Positive Notes

What this codebase does well, verified by reading:

1. **Server-authoritative authz.** Every mutating/authenticated route calls `requireSession`/`requireUser`/`requireAdmin`/`requireOwner` from [lib/security/auth.ts](../lib/security/auth.ts); admin/owner roles are re-read from MongoDB on every privileged call (`requireUser`), defeating stale-JWT privilege escalation. No client-supplied `id`/`role`/`email` is trusted anywhere found.
2. **No IDORs found.** All personal resources (favorites, watchlist, history, chats, export, account deletion) filter by the session-derived `userId` (email) - e.g., [app/api/chat/route.ts:137-146](../app/api/chat/route.ts) (`_id: chatId, userId`).
3. **Strict Zod `.strict()` schemas** at all write boundaries ([lib/security/schemas.ts](../lib/security/schemas.ts)) block mass assignment, `$`-operator and prototype-pollution keys; explicit `$set` allowlists at write sites.
4. **Role-escalation lock-down.** HTTP owner bootstrap disabled ([app/api/admin/promote/route.ts](../app/api/admin/promote/route.ts) returns 404), public user creation disabled ([app/api/users/route.ts](../app/api/users/route.ts)), self-demotion blocked, admins cannot touch other admins/owners, last-owner protection with fail-safe direction ([lib/security/auth.ts:189-214](../lib/security/auth.ts)), owner promotion is a manual CLI with explicit args ([scripts/promote-owner.js](../scripts/promote-owner.js)).
5. **AI pipeline hardened.** Gemini key only in `x-goog-api-key` header (never in URL/logs, plus `redactSensitive`), bounded prompts/history ([lib/gemini-payload.ts:69-101](../lib/gemini-payload.ts)), system/user separation, Zod-validated model output, safety settings, upstream error mapping without body leakage ([lib/ai-security.ts:228-247](../lib/ai-security.ts)), client-supplied `previousMessages` ignored (server-authoritative history).
6. **XSS surface closed.** AI/assistant text renders via `react-markdown` with element allowlist, no raw HTML, HTTPS-only `urlTransform`, `rel="noopener noreferrer nofollow"` ([lib/ai-markdown.tsx](../lib/ai-markdown.tsx)); no `dangerouslySetInnerHTML` on any user/model text path (only shadcn chart CSS vars in `components/ui/chart.tsx`, not user input); YouTube embeds built from validated 11-char IDs only ([components/SafeYouTubeEmbed.tsx](../components/SafeYouTubeEmbed.tsx), [lib/ai-security.ts:75-91](../lib/ai-security.ts)).
7. **Strong transport/security headers.** CSP (no `unsafe-inline` scripts; `frame-src` pinned to youtube-nocookie; `connect-src 'self'`), HSTS preload, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` ([next.config.mjs:9-79](../next.config.mjs)).
8. **Secure cookie flags.** `httpOnly: true`, `sameSite: lax`, `secure` in production for all NextAuth cookies ([lib/auth.ts:124-161](../lib/auth.ts)). Sign-in fails closed when the user record cannot be created ([lib/auth.ts:58-87](../lib/auth.ts)).
9. **Cache discipline.** Canonical namespaced keys with normalization ([lib/cache-namespace.ts](../lib/cache-namespace.ts)), no `KEYS`/`FLUSHDB` (bounded `SCAN`, prefix-scoped deletes, [lib/cache.ts:196-266](../lib/cache.ts)), admin key listing sanitized to 75-char tails, no PII in keys, stampede protection.
10. **Secrets hygiene.** No hardcoded secrets in source, logs, patches, or git index; placeholder-only `.env.example`; `NEXT_PUBLIC_*` secret names actively rejected ([lib/env.ts:35-50](../lib/env.ts)); env error messages reveal names/categories, never values; CI runs gitleaks over full history and `npm audit --audit-level=high` with `contents: read`-only permissions.
11. **Privacy features implemented, not cosmetic.** Retention-bounded reads ([lib/privacy-retention.ts](../lib/privacy-retention.ts)), consent re-read server-side for history ([app/api/history/route.ts:22-47](../app/api/history/route.ts)), scoped data export with projection allowlists and no-store ([app/api/user/export/route.ts](../app/api/user/export/route.ts)), confirmed same-origin-gated account deletion with last-owner protection ([app/api/user/account/route.ts](../app/api/user/account/route.ts)).
12. **Pinned patched dependency versions in the lockfile** (Next.js 15.5.23, next-auth 4.24.15 - both above all known 2025/2026 advisory fix versions, verified against advisories).

---

## 5. Items Needing Manual Verification

These could not be concluded from static reading and require runtime/dynamic confirmation:

1. **Deployment proxy topology** - does the real reverse proxy/CDN append the client IP to `X-Forwarded-For` after sanitization? Determines the exact fix for M-01 and whether a trusted-proxy allowlist suffices.
2. **Multi-instance / serverless scaling** - confirm how many Node processes serve requests; quantify the L-06 effective-limit multiplier and Redis-fallback behavior in the actual environment.
3. **Live `npm audit` on the current lockfile** - CI enforces it; an independent run (`npm ci && npm audit`) should be captured for the record, including transitive advisories.
4. **Full git-history secret scan on a clean clone** - gitleaks runs in CI, but a one-off local `gitleaks detect --log-opts="--all"` against the entire history should be archived as evidence (working tree was spot-checked here: no matches for key/URI/token patterns in untracked logs/patches).
5. **Dynamic CSP/iframe test** - browser test that a malicious `frame-src` violation (e.g., a crafted TMDB video key) is blocked, and that YouTube embeds only accept 11-char IDs (unit tests exist; an end-to-end check is still worthwhile).
6. **OAuth flow verification** - confirm the deployed Google OAuth redirect URIs allowlist, and that `NEXTAUTH_URL` in production matches (env-validated, but deployment-specific).
7. **Admin demotion race** - two concurrent last-owner demotions (TOCTOU in `wouldRemoveLastOwner`, [lib/security/auth.ts:197-214](../lib/security/auth.ts)) - needs a load test or a transactional guard decision.
8. **MongoDB topology** - standalone vs replica set determines whether account deletion can be wrapped in a real transaction (documented as optional in [lib/account-deletion.ts:7-16](../lib/account-deletion.ts)); confirm the deployed topology.

---

## 6. Prioritized Remediation Roadmap

### Now (this week)

| # | Action | Findings |
|---|---|---|
| 1 | Delete `console.log` of email in `app/api/watchlist/details/route.ts:15` | M-04 |
| 2 | Redact `api_key` from `lib/fetchWithRetry.ts` log lines (use `redactSensitive` or log host+path only) | M-02 |
| 3 | Add ID/type validation to the 6 unvalidated `[id]`/`type` proxy routes; add `applyRateLimitPublic(tmdbProxy)` to the 9 unrated public routes (tighter limit for `/api/genres`, `/api/trailers`) | M-03 |
| 4 | Fix `X-Forwarded-For` trust in `getClientIdentifier` (trusted-proxy config or stop taking first hop) | M-01 |
| 5 | Raise `package.json` floors: `next ^15.5.9`, `next-auth ^4.24.15` | L-08 |

### This sprint

| # | Action | Findings |
|---|---|---|
| 6 | Rate-limit + cap size of `POST /api/favorites` and `POST /api/watchlist` (and cap fan-out in `watchlist/details`) | M-05 |
| 7 | Fail-closed `/api/features` on DB error (503 or `false` default) | L-02 |
| 8 | Mask/limit admin user-list PII (non-owner) | L-03 |
| 9 | Delete `utils/redisExample.ts` (dead PII-keyed cache code) and the `v0-user-next.config` merge in `next.config.mjs` | L-04, L-05 |
| 10 | Replace upstream error passthrough with fixed strings | L-07 |

### Backlog

| # | Action | Findings |
|---|---|---|
| 11 | Require+validate `Origin` on destructive cookie-auth routes (or service-token path for CLI) | L-01 |
| 12 | Document/quantify per-instance rate-limit degradation; consider shared fallback store | L-06 |
| 13 | Consolidate duplicated admin schema; add `/api/movie/:path*` to middleware matcher (defense in depth) | I-01, I-02 |
| 14 | Complete the manual-verification list (section 5), especially proxy topology, Mongo transactions, and archived gitleaks/audit evidence | Section 5 |

---

*Report generated by read-only static analysis. No source files were modified; no state-changing commands were run. Findings are cited to file and line in the audited working tree.*
