# FIX_PLAN.md

**Project:** movie-recommendation-system  
**Audit date:** 19 August 2026  
**Nature:** Proposed remediation only. No application code was changed in this audit.

Finding IDs match `PROJECT_AUDIT_REPORT.md` / `SECURITY_AUDIT_REPORT.md`.

---

## Goal

Move from **Not ready** to **Ready after critical fixes**, then **Ready with minor improvements**. Do not treat `next build` success as done: TypeScript and ESLint are currently skipped (`next.config.mjs`).

---

## Batch 0 — Stop the bleeding (P0, days 1–3)

Ship as one PR if possible. Add regression tests in the same PR (project has **zero** tests today; introduce Vitest or Playwright API tests against route handlers).

### B0.1 Privilege escalation (F-001, F-004, F-010, F-002, F-051)

1. **`PUT /api/user`**  
   - Replace `{ $set: data }` with an allowlist: e.g. `preferences.favorite_genres`, `preferences.selected_moods` only.  
   - Never accept `role`, `email`, `_id`, `created_at`, `name`/`image` from the client (name/image come from Google).  
   - Validate with Zod.  
   - Disable `upsert` unless you explicitly want self-heal; prefer 404 if the user row is missing.

2. **Delete or lock `POST /api/users`**  
   - Remove `app/api/users/route.ts` or require owner session + Zod.  
   - Do not keep a second User schema.

3. **Remove HTTP `POST /api/admin/promote`**  
   - Owner bootstrap only via `scripts/promote-owner.js` run by an operator with Mongo access, or a one-time env `OWNER_BOOTSTRAP_SECRET` compared with timing-safe equal, then delete the secret.  
   - Never return `ownerEmail`.  
   - Replace in-memory `ownerCreated` (useless on serverless).

4. **Admin session**  
   - Every admin route: `getServerSession(authOptions)` then load role from Mongo by email (do not trust `session.user.role` alone if you later put role only in JWT).  
   - Extract `requireAdmin()` / `requireOwner()` in `lib/auth.ts`.  
   - If session is null, 401; if role is user, 403 (no user enumeration).

**Verify:** authenticated non-admin cannot set role; unauthenticated POST /api/users is 401/404; promote is gone; admin APIs 401 without cookie.

**Tests required:** yes (F-001, F-004, F-002).

### B0.2 Auth on every AI and sensitive API (F-005, F-006, F-003, F-015, F-049)

1. Add `getServerSession(authOptions)` to **`POST /api/chat`** and **`GET /api/movie/[id]/ai-similar`**.  
2. Rewrite `middleware.ts` `matcher` to a single deny-by-default pattern, or drop middleware auth and **require handlers to auth** (preferred: both). Include leaf paths: `/api/chat`, `/api/ai-recommendations`, `/admin`, `/favorites`, `/watchlist`.  
3. **Upgrade Next.js** off 15.1.7 to a patched 15.x (minimum **15.2.3** for CVE-2025-29927; prefer current patched 15.x/16.x after reading the advisory matrix). Re-test App Router `params` Promises.  
4. Protect `/admin` with a **server** `layout.tsx` calling `getServerSession` + role; keep `AdminCheck` as extra UX only.  
5. Pin `next-auth` to `4.24.x` (not `"latest"`). Plan Auth.js v5 separately; do not mix `app/auth.config.ts` with v4 handler — **delete unused `auth.config.ts`** or migrate fully.

**Verify:** unauthenticated chat/similar/admin HTML/API denied; `npm ls next` shows patched version.

**Tests required:** yes.

### B0.3 Build gates (F-022, F-056, F-057, F-058)

1. Add `eslint-config-next` + non-interactive `next lint`.  
2. Set `typescript.ignoreBuildErrors: false` and `eslint.ignoreDuringBuilds: false`.  
3. Fix or exclude scripts from `tsconfig` `include` (`scripts/setupDatabase.ts` `import.meta`, dead `useWatchlistSort`).  
4. Add `"typecheck": "tsc --noEmit"` and `"test": "vitest run"` (or similar).  
5. CI: lint, typecheck, test, audit (fail on critical).

Until this batch lands, every green `next build` can hide broken types.

---

## Batch 1 — High risk (P1, week 1–2)

### B1.1 XSS and AI output (F-007, F-061, F-013, F-050, F-017)

1. Stop `dangerouslySetInnerHTML` on model text unless sanitized (DOMPurify with `ALLOWED_TAGS` / `ALLOWED_URI_REGEXP` https/http only). Prefer `react-markdown` + `rehype-sanitize`.  
2. Treat `previousMessages` as untrusted: cap count (e.g. 20) and bytes; ignore client `role: assistant` or re-fetch from DB.  
3. Use Gemini `systemInstruction` (not a fake user part) in `app/api/chat/route.ts`.  
4. Strip `error.stack` from `app/error.tsx`; map Gemini errors to generic 502/429.  
5. Remove `errorDetails` from JSON (`ai-recommendations`).  
6. Redact emails and prompt bodies in logs.

### B1.2 Rate limit and cost (F-011, F-006, F-028)

1. Per-user (and per-IP for public) limits: chat 10/min, AI recs 5/min, search 30/min, similar 10/min. Redis token bucket is enough.  
2. Max query length on `/api/search`.  
3. Timeout Gemini (AbortController); do not retry 3× on every 429 without a global budget.

### B1.3 Cache and Redis (F-008, F-009, F-052, F-031)

1. Remove GET `action=clear`; POST/DELETE only.  
2. Replace `flushDb()` with `SCAN` + delete keys matching `movie:*`, `tv:*`, `movies:*`.  
3. Stop `KEYS *`; use `SCAN`. Prefix all keys (`moviemind:`).  
4. Enable TLS for Redis Cloud (`socket.tls: true`) if the provider requires it.  
5. Dedicated Redis DB / instance for this app.

### B1.4 Dependencies (F-016, F-003, F-021, F-020)

1. Upgrade `mongoose` past 8.24.0 (advisory range 8.0.0–8.24.0). Re-test upserts.  
2. Remove packages: `npm`, `install`, `@prisma/client` (unless you restore Prisma properly), `ioredis` if unused, unused Radix if you want a later cleanup.  
3. `npm audit` until **direct** criticals are gone; nested tooling noise can be documented.

### B1.5 Validation (F-033, F-032, F-034)

Zod on every mutation:

- `itemId`: positive int  
- `type`: `movie` | `tv` (| `person` for history)  
- `title`: string max 500  
- `posterPath`: optional string matching `/` or null  
- admin `limit` 1–100  

### B1.6 Privacy baseline (F-041, F-062)

1. DELETE `/api/history` (user’s rows).  
2. “Delete account” that removes User, Favorites, Watchlist, History, ChatHistory.  
3. Export JSON of the same.  
4. Disclose Gemini/TMDB sharing in a privacy page.  
5. Do not record history until the user has an in-product notice (or opt-in).

**Tests required:** XSS renderer cases; rate-limit 429; cache clear not GET; zod 400s; delete-account cascade.

---

## Batch 2 — Architecture cleanup (P2, week 2–4)

### B2.1 One auth, one DB, one flag source (F-018, F-019, F-053, F-063)

1. Delete unused: `app/auth.config.ts`, `lib/db.ts` if Mongoose is canonical, `createOrUpdateUser` native path, `lib/settings.ts` **or** migrate flags to it (not both).  
2. Document real env names: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `MONGODB_URI`, `TMDB_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.  
3. Set `secret` explicitly in live `authOptions`. Cookie `secure` in production.  
4. `signIn` should **fail** (return false) if the user row cannot be created.

### B2.2 Middleware vs handlers (F-039, F-049)

Pick one:

- **A:** Middleware matcher `'/((?!_next|static|images|favicon.ico).*)'` and fail **closed** on feature API errors; or  
- **B:** Middleware only for redirects (profile/admin pages); every API authenticates itself.

Do not leave a broad function + narrow matcher.

### B2.3 Remove demos and corpses (F-027, F-044, F-045, F-036, F-046)

1. Delete `/redis-demo`, `/api/redis-example`, `utils/redisExample.ts`.  
2. Delete empty `movie_model.ts`, unused `movie_data.json` or move to scripts.  
3. Delete `app/hooks/useWatchlistSort.ts` or restore its components.  
4. One chat UI (assistant page **or** home widget, not two implementations).  
5. Admin stats: real aggregations or remove the charts (no `Math.random()`).

### B2.4 Headers and browser (F-048, F-024)

1. `headers()` in `next.config.mjs`: CSP (strict enough for TMDB/YouTube), `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, HSTS on HTTPS.  
2. Remove `Access-Control-Allow-Origin: *` unless you have a real public API.  
3. CSP must allow your sanitized markdown or you drop HTML.

### B2.5 Performance (F-054, F-055, F-038)

1. Favorites/watchlist membership: `GET /api/favorites/contains?itemId&type` or embed a Set from one request in context.  
2. Put role/`id` in JWT at login; refresh on role change; avoid Mongo on every session callback **or** keep DB check only for admin mutations.  
3. Re-enable Next Image optimizer with `remotePatterns` for `image.tmdb.org` when you patch Next (watch image CVEs).  
4. Convert home/movie pages toward Server Components + fetch where possible.

### B2.6 Logging

Structured logger; never log `message`, email, or Google error bodies. Request id. No `console.log` of Gemini JSON.

---

## Batch 3 — Hardening and product completeness (P3)

| Item | Action |
|------|--------|
| F-037 | Keep NextAuth semver-pinned; schedule v5 migration as its own project |
| F-040 | SameSite=lax is OK for Google OAuth; add Origin check on JSON mutations if you add mobile/cross-site clients |
| F-043 | Untrack `logs/`; add to `.gitignore` |
| F-047 | Design pass (out of security scope) |
| F-054 leftover | Cache TMDB client; abort stale |
| Ratings | Either implement `/api/ratings` with authz or delete `Rating` model + `dbUtils` recs |
| Chat DELETE | Delete **all** chats or require id; document behavior |
| FeatureSettings | `findOneAndUpdate` upsert one doc, not insert-every-save |
| Gemini SDK | Use `@google/generative-ai` or drop the unused dependency |
| `setup-db` | Remove `drop()` of `users` or require an explicit `--yes-drop` |
| OpenRouter types | Delete if unused |
| shadcn unused | Trim unused `components/ui/*` to reduce bundle/admin 275 kB |

---

## Suggested PR sequence

| PR | Contents | Risk if skipped |
|----|----------|-----------------|
| 1 | F-001 allowlist + delete `/api/users` + delete promote | Account takeover |
| 2 | Auth on chat + ai-similar + admin `authOptions` + `/admin` server guard | Spend + data + UI bypass |
| 3 | Next + mongoose upgrades | Middleware CVE + NoSQL advisories |
| 4 | ESLint config + enable build gates + first tests for PR1–2 | Silent regressions |
| 5 | Sanitize markdown + rate limits + no GET flush | XSS + cost + Redis wipe |
| 6 | Env/docs/dead code/redis TLS/zod | Ops and maintainability |
| 7 | Privacy delete/export + logging redaction | GDPR/policy |
| 8 | Performance + CSP + demo deletion | Quality |

Do not combine Next major upgrade with authz allowlist in one unreviewed diff if the team cannot test login.

---

## Verification checklist (release)

- [ ] `PUT /api/user` with `{role:owner}` leaves role `user`  
- [ ] `POST /api/users` 401/404  
- [ ] `POST /api/admin/promote` 404  
- [ ] `POST /api/chat` 401 without cookie  
- [ ] `GET /api/movie/550/ai-similar` 401 without cookie  
- [ ] Non-admin `/api/admin/users` 403  
- [ ] `getServerSession(authOptions)` used everywhere  
- [ ] `npm run lint` non-interactive exit 0  
- [ ] `npm run typecheck` exit 0  
- [ ] `npm test` exists and covers P0 routes  
- [ ] `next.config` does **not** ignore TS/ESLint  
- [ ] `npm ls next` patched  
- [ ] Redis clear cannot FLUSHDB  
- [ ] Assistant HTML does not execute `<script>` or `javascript:`  
- [ ] README env names match `lib/redis.ts` and `lib/auth.ts`  

---

## Dependencies between fixes

- Next upgrade may change `params` / middleware API — do after or with a dedicated compile pass.  
- Enabling `ignoreBuildErrors: false` **depends on** deleting/fixing `auth.config.ts`, `useWatchlistSort`, `dbUtils` NodeNext exports.  
- CSP depends on how you render markdown.  
- Image optimizer depends on patched Next.  
- Rate limits depend on Redis remaining optional (fail closed on AI, fail open on TMDB cache).

---

## What not to do

- Do not `npm audit fix --force` blindly (`@auth/core` / `next-auth` major jumps).  
- Do not run `npm run setup-db` against a shared Mongo (drops `users`).  
- Do not “fix” promote by checking `ownerCreated` only.  
- Do not hide admin buttons and call it authorization.  
- Do not claim prompt injection is solved after adding a system string.
