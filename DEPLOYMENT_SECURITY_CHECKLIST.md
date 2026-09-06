# DEPLOYMENT_SECURITY_CHECKLIST.md

Production deployment checklist for movie-recommendation-system. Complete every item before going live.

This checklist is expanded as remediation batches land. Items marked [pending] are not yet implemented in code.

---

## 1. Runtime requirements

- [ ] Node.js version: verify against `engines` field in package.json after Batch 1 upgrade
- [ ] npm version matches lockfile
- [ ] Process manager: systemd / pm2 / Vercel / platform-managed
- [ ] No `npm install` at runtime (use CI-built artifact or platform build)

## 2. Required environment variables

- [ ] `MONGODB_URI` — least-privilege MongoDB user (read+write to application DB only)
- [ ] `MONGODB_URI` — network restriction (IP allowlist / VPC peering)
- [ ] `REDIS_URL` — supported and takes precedence over individual fields (R4). `rediss://` implies TLS. Do NOT combine a plain `redis://` URL with `REDIS_TLS=true` (configuration is rejected).
- [ ] Individual Redis configuration is the fallback: `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS` (strict boolean: true/false/1/0/yes/no).
- [ ] `NEXTAUTH_SECRET` — generated with `openssl rand -base64 32` (required in production after Batch 2 env validation)
- [ ] `NEXTAUTH_URL` — canonical HTTPS origin
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth secret rotated and not in git
- [ ] `GOOGLE_API_KEY` — Gemini key with API restrictions (HTTP referrer / IP) where supported
- [ ] `TMDB_API_KEY` — TMDB key with usage restrictions where supported
- [ ] `NODE_ENV=production`

### R7 environment validation

- [x] Typed server-side validation (`lib/env.ts`, R7): production requires MONGODB_URI, NEXTAUTH_SECRET (>=32 chars), GOOGLE_CLIENT_ID/SECRET, TMDB_API_KEY, NEXTAUTH_URL (https). GOOGLE_API_KEY required only when AI routes are used. Redis optional; contradictory Redis config rejected. `NEXT_PUBLIC_*` secrets rejected. Validation errors expose names/categories only.
- [x] `.env.example` committed with placeholders only (no real hosts, emails, or key prefixes)
- [ ] Confirm `GET /api/health/live` and `GET /api/health/ready` return 200 after deploy (R7)

## 3. Authentication

- [ ] Google OAuth redirect URLs set to `https://<domain>/api/auth/callback/google`
- [ ] `NEXTAUTH_SECRET` set (no default; app must refuse to start without it after Batch 2)
- [ ] Cookie `secure: true` in production (after Batch 2 authOptions update)
- [ ] JWT `maxAge` reviewed (after Batch 2)
- [ ] Session invalidation after role change (after Batch 2)

## 4. Owner creation procedure

- [ ] HTTP `POST /api/admin/promote` disabled or returns 404 (after Batch 2)
- [ ] Owner created via operator CLI `scripts/promote-owner.js` (after Batch 2)
- [ ] CLI requires explicit target email, existing authenticated Google user, proof no owner exists
- [ ] CLI never reveals owner email through HTTP

## 5. Database

- [ ] MongoDB user is least-privilege (no `dbAdmin`, no `root`)
- [ ] MongoDB network restrictions (IP allowlist / VPC)
- [ ] Backups configured and restore tested
- [ ] No `setupDatabase.ts` run against production (drops users)

## 6. Redis

- [x] Redis TLS enabled via `REDIS_TLS=true` or `rediss://` URL (R4: `lib/redis-config.ts`)
- [x] Redis ACL: application key prefix scoped, NO `FLUSHDB`/`FLUSHALL` permission (R4: prefix-scoped clear; never FLUSHDB)
- [ ] Redis instance dedicated to this app (no shared DB 0)
- [x] Application key namespace: `movie-recommendation-system:{env}:v1:` (R4: `lib/cache-namespace.ts`)
- [x] Memory fallback bounded: 5000 entries, TTL, LRU eviction, prefix-scoped clear (R4: `lib/cache.ts`)
- [x] KEYS replaced with bounded SCAN (R4: `lib/cache.ts`, `lib/cacheManager.ts`)
- [x] Cache stampede protection via in-flight promise de-duplication (R4: `lib/cache.ts`)
- [x] REDIS_URL takes precedence; falls back to REDIS_HOST/PORT/USERNAME/PASSWORD/TLS (R4)
- [ ] `redis://` + `REDIS_TLS=true` combination never deployed (refused at config parse)
- [ ] Legacy unprefixed keys (pre-R4) expected to expire via TTL; manual migration documented if faster cleanup needed

## 7. AI (Gemini)

- [ ] Gemini quota and budget alerts configured in Google Cloud
- [ ] Per-user daily/rolling quota enforced (after Batch 4)
- [ ] Unauthenticated requests cannot reach Gemini (after Batch 2)
- [ ] Timeouts on Gemini calls (after Batch 4)
- [ ] Bounded retries with backoff (after Batch 4)

## 8. Network / HTTPS

- [ ] HTTPS only; HTTP redirects to HTTPS
- [ ] HSTS: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (rolled out carefully; don't preload until certain)
- [ ] CSP validated against the real site (after Batch 6)
- [ ] Security headers present (after Batch 6): X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors

## 9. Privacy

- [ ] Privacy policy page published and linked from the footer (`/privacy`, R6)
- [ ] Operator contact placeholder on `/privacy` and in `PRIVACY.md` replaced (R6)
- [ ] Policy reviewed by qualified counsel before production (R6; do not claim legal compliance)
- [ ] Account export `GET /api/user/export` verified: authenticated, current-user only, generic filename, no-store (R6)
- [ ] Account deletion `DELETE /api/user/account` verified: confirmation required, current-user only, last-owner blocked (R6)
- [ ] History deletion `DELETE /api/history` clears only the current user (R6)
- [ ] Chat delete-one `DELETE /api/chat-history/:id` and delete-all `DELETE /api/chat-history` owned by session (R6)
- [ ] History-tracking preference (`historyTrackingEnabled`) enforced server-side; new accounts default to enabled; migration documented (R6)
- [ ] Retention defaults verified: viewing history 180 days, chat history 365 days (bounds 1..3650); read routes filter expired records (R6)
- [ ] MongoDB TTL indexes created in production (dedicated `expiresAt`, not `viewedAt`/`updatedAt`) — see R6 migration section and `PRIVACY.md` (R6)
- [ ] Google account data is NOT deleted by app deletion; backups may retain deleted data until expiration (R6)

### R6 retention configuration

- `HISTORY_RETENTION_DAYS` default `180`; `CHAT_RETENTION_DAYS` default `365`.
- Values are server-only, strict-parsed and clamped to `1..3650` (`lib/privacy-retention.ts`); invalid input falls back to the default.
- Never log or return retention environment values to clients.

### R6 TTL index migration (operator action; do not run in this batch)

MongoDB TTL expires documents by an indexed date. To avoid changing the semantics of the existing `viewedAt`/`updatedAt` fields, add a dedicated `expiresAt: { type: Date }` to the `History` and `ChatHistory` schemas (backfill in a batch), then create:

```
db.histories.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
db.chathistories.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

Do not rely on Mongoose `autoIndex` in production. Chat arrays stay bounded independently via `$slice` in `app/api/chat/route.ts`.

### R6 account-deletion transaction/fallback

- Prefer a MongoDB replica set and wrap the staged deletions in `session.withTransaction()` ("All Writes").
- On standalone MongoDB the same staged deletions run without a transaction; a mid-sequence failure returns a generic error and records a residual partial-deletion risk (count only, no PII).
- Global/public TMDB cache and system feature settings are never cleared.

## 10. CI / CD

- [x] CI workflow (`.github/workflows/ci.yml`, R7): runs lint, typecheck, test, coverage, build on `pull_request` and push to `main`; frozen lockfile (`npm ci`); read-only permissions; no production secrets (obvious `ci-placeholder` values only); no live external services
- [x] Dependency audit gate (R7): `npm audit --audit-level=high --omit=dev` fails CI on high/critical production advisories; policy is manual triage, never automatic `npm audit fix`
- [x] Secret scanning in CI (R7): gitleaks with default rules + narrow placeholder allowlist (`.github/gitleaks.toml`); scans history + working tree; `--redact`
- [x] Dependabot (R7): weekly npm + github-actions updates; PRs pass the same CI gates
- [ ] CI uses mock env vars (no real Mongo/Redis/Gemini/TMDB) — satisfied by design; verify on first pipeline run
- [ ] CI does not expose OAuth secrets — verify on first pipeline run
- [ ] Secret scanning enabled at repository level (GitHub settings) where supported

## 11. Monitoring and rollback

- [x] Health endpoints (R7): `GET /api/health/live` (process only) and `GET /api/health/ready` (configuration validity; no external calls; Redis optional); both `no-store`; no secrets/versions/hostnames exposed
- [x] Operational event logging foundation (R7): `lib/operational-log.ts` fixed event allowlist, sanitized metadata, validated correlation IDs; no PII
- [x] Rollback procedure documented (R7): `OPERATIONS.md` section 6 (artifact-based redeploy; no destructive DB rollback)
- [x] Backup/restore and secret-rotation runbooks documented (R7): `OPERATIONS.md` sections 7–8
- [ ] Application health endpoint wired to load balancer probes (operator action)
- [ ] Error monitoring provider attached (recommended follow-up; not integrated in R7)
- [x] Secret rotation procedure documented (`SECURITY.md`)

## 12. Secrets to rotate (by type only)

After remediation, rotate (if any were exposed in git history or logs):
- [ ] `NEXTAUTH_SECRET` (type: JWT signing secret)
- [ ] `GOOGLE_CLIENT_SECRET` (type: OAuth client secret)
- [ ] `GOOGLE_API_KEY` (type: Gemini API key)
- [ ] `TMDB_API_KEY` (type: TMDB API key)
- [ ] `MONGODB_URI` (type: database connection string)
- [ ] `REDIS_PASSWORD` (type: Redis auth password)

## 13. Manual deployment actions (after code lands)

1. Run `npm ci` to install patched dependencies from updated lockfile (after Batch 1)
2. Set all environment variables from `.env.example` template with real values
3. Generate fresh `NEXTAUTH_SECRET`
4. Run owner-creation CLI with the chosen owner's email
5. Verify security headers via browser devtools / securityheaders.com
6. Verify unauthenticated `/api/chat`, `/api/movie/[id]/ai-similar`, `/api/ai-recommendations` return 401
7. Verify `/admin` page requires admin session server-side
8. **R6 staging checks:** on a staging account, verify export returns only that user's data with no `userId`/email in the filename; verify account deletion requires the typed confirmation, is blocked for the last owner, cascades to favorites/watchlist/history/chats and clears nothing global.
9. **R6 staging checks:** toggle history tracking off and confirm no new `histories` rows are written; clear history; delete one conversation and all conversations; confirm each is session-scoped and returns `Cache-Control: no-store` where applicable.
10. **R6 retention check:** confirm read routes and export exclude records older than the configured retention.
11. **R6 privacy/log check:** confirm no email, chat text, viewing title, exported content, DB URI, or stack appears in logs for export/deletion/clear operations.
12. **R7 health checks:** `GET /api/health/live` returns 200 with `no-store`; `GET /api/health/ready` returns 200 with valid config and 503 with deliberately invalid config in a staging environment.
13. **R7 CI verification:** first pipeline run passes all gates with placeholder values only; confirm no production secret is referenced; confirm the gitleaks step runs and fails on an intentionally planted test secret in a throwaway branch (then remove it).
14. **R8 dependency check:** after any dependency change run `npm ci`, `npm ls next postcss sharp`, and `npm audit --json`; confirm 0 high/critical and single resolved versions. `postcss`/`sharp` overrides live in `package.json` (R8); a Next major upgrade is a separately reviewed project, not part of routine deploys.
