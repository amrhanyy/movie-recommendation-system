# OPERATIONS.md

Operational runbook foundations (R7). Pairs with
`DEPLOYMENT_SECURITY_CHECKLIST.md`, `PRIVACY.md`, and `SECURITY.md`.
No real hosts, emails, or secret values appear in this file.

## 1. Environment validation

`lib/env.ts` validates configuration at runtime (server-only):

- Production requires `MONGODB_URI`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `TMDB_API_KEY`, and `NEXTAUTH_URL` (https).
- `NEXTAUTH_SECRET` must be >= 32 characters.
- `GOOGLE_API_KEY` is required only when AI features are used (feature flag
  style; missing key disables AI routes with a safe error, not a crash).
- Redis is optional (memory fallback). `REDIS_URL` takes precedence;
  `rediss://` implies TLS; `redis://` + `REDIS_TLS=true` is rejected
  (delegated to `lib/redis-config.ts`).
- Retention variables are bounded (1..3650 days).
- Secrets named `NEXT_PUBLIC_*` are rejected.

Validation errors name the variable and category only; values are never
included or logged.

## 2. Health endpoints

- `GET /api/health/live` — process liveness. No external calls. Returns
  `{ status, service }` only. `Cache-Control: no-store`.
- `GET /api/health/ready` — configuration readiness. Checks `lib/env.ts`
  validity without connecting to MongoDB/Redis and without consuming
  Gemini/TMDB quota. Returns generic component states
  (`ready`/`unavailable`/`optional`). 200 when core config valid, 503 when
  not. Redis absence never fails readiness.

These endpoints verify configuration, NOT live dependency connectivity. A
load balancer can use `/api/health/live` always and `/api/health/ready` for
traffic gating after deploy. Shallow dependency probes (Mongo ping) are a
documented follow-up behind an internal/admin mechanism; they are not
implemented in R7 and are not claimed to exist.

## 3. Operational events

`lib/operational-log.ts` emits one JSON line per event:

- Fixed event allowlist: `health.liveness`, `health.readiness`,
  `ops.secret_scan_review`, `ops.deploy`, `ops.rollback`.
- Fields: `ts`, `event`, `status`, optional `durationMs`, optional
  `correlationId`, sanitized `meta`.
- Blocked meta keys: email, user, chat, message, title, token, cookie,
  authorization, password, secret, apiKey, connectionString, uri (and any key
  containing token/secret/password). Values resembling connection URIs or
  `key=`/`secret=` pairs are dropped.
- Correlation IDs are validated against `^[A-Za-z0-9_-]{1,64}$`; PII-bearing
  client values are rejected.

No external monitoring provider is integrated. Recommended follow-up: attach
an error-monitoring provider (e.g. Sentry) to the deployment platform,
configured to scrub PII; out of scope for R7.

## 4. CI/CD

`.github/workflows/ci.yml` (pull_request + push to main):

- `npm ci` (frozen lockfile), Node 22, npm cache.
- Gates: lint, typecheck, test, coverage, build — all mandatory
  (no `continue-on-error` on gates).
- Build uses obviously non-production placeholder env values only; no
  production secrets are available to CI.
- `npm audit --audit-level=high --omit=dev`: fails on high/critical
  production advisories. Policy: triage manually; never run `npm audit fix`
  automatically.
- Secret scan: gitleaks (pinned version, default rules, `--redact`) over git
  history + working tree with `.github/gitleaks.toml`.
- Permissions: `contents: read` only. Concurrency cancels superseded runs.
- Coverage report uploaded as an artifact.

Dependabot (`.github/dependabot.yml`): weekly npm + github-actions updates,
grouped minor/patch. Dependabot PRs still pass all CI gates.

## 5. Deployment

1. Build the release artifact in CI (or platform build) from the lockfile.
2. Configure all variables per `.env.example` (real values in the secret
   store, never in the repo).
3. Apply the documented MongoDB indexes (R4 namespace SCAN is index-free;
   R6 TTL indexes are an operator action — see checklist).
4. Verify `/api/health/live` then `/api/health/ready` return 200.
5. Run the staging checks in `DEPLOYMENT_SECURITY_CHECKLIST.md` section 13
   (CSP browser verification, privacy flows, ownership checks).
6. Enable traffic only after readiness + staging checks pass.

## 6. Rollback

Rollback is artifact-based (no database down-migrations in R7):

1. Redeploy the previous known-good build artifact.
2. Verify `/api/health/live` and `/api/health/ready`.
3. Do NOT roll back a schema/index change with destructive commands;
   additive indexes are safe to leave. If an index must be removed, do it as
   a deliberate operator action with a change record.
4. Log an `ops.rollback` operational event (event, status, duration).
5. If secrets were rotated during the incident, keep the rotated values;
   do not restore old secrets.

## 7. Backup and restore

- MongoDB: enable scheduled backups with point-in-time recovery where the
  platform supports it. Test restore quarterly (document the test).
- Redis: cache only; no backup requirement. Memory fallback covers outages.
- Deleted user data (R6) may remain in backups until backup expiration;
  this is documented in `PRIVACY.md` and the checklist.
- Retention interaction: expired history/chat rows are filtered at read
  time; TTL indexes (operator action) physically remove them. Backups of
  pre-expiry snapshots can still contain expired rows until they age out.

Restore procedure:

1. Identify the last known-good backup timestamp.
2. Restore to a staging database first; verify app health and spot-check a
   non-PII aggregate (document counts only).
3. Promote only after verification; log `ops.deploy`.

## 8. Secret rotation runbook

Follow `SECURITY.md`. In addition:

- Rotation is a deploy event: update the secret store, redeploy, verify
  health endpoints, and log `ops.deploy`.
- After rotating `NEXTAUTH_SECRET`, all sessions are invalidated (expected).
- After rotating `MONGODB_URI` credentials, verify connection via app
  health/ready (configuration level) and one authenticated smoke test in
  staging.
- Never paste secrets into chat, issues, docs, or logs.

## 9. Known operational limits (R7)

- Readiness checks configuration only; no live Mongo/Redis probes yet.
- No external error-monitoring integration yet.
- gitleaks is downloaded from GitHub releases at CI runtime; for fully
  offline/air-gapped CI, pin a checksum or vendor the binary (follow-up).
- `npm audit` requires registry access; in offline environments mark the
  audit step BLOCKED rather than skipped.
- **Rate-limit client identification (M-01):** public routes bucket by the
  *rightmost* `X-Forwarded-For` hop (the entry your reverse proxy/CDN appends)
  compounded with a UA hash. If your edge **sanitizes and rewrites**
  `X-Forwarded-For` so the rightmost hop is the real client, no config is
  needed. If your edge **preserves the client's original XFF** (appending its
  own hop), set `TRUSTED_PROXY_CIDRS` to the CIDR/IPs of your edge proxies
  so the limiter walks the chain from the right, skips your own proxies, and
  uses the first untrusted hop. With neither, a direct client (no proxy)
  still gets a stable per-IP bucket.

## 10. Dependency advisory remediation (R8)

- 2026-08-21 (R8): three High advisories (`next` via bundled `postcss` and
  `sharp`, plus the underlying `postcss` and `sharp` advisories) were
  resolved WITHOUT a major framework upgrade:
  - `postcss` pinned/overridden to `8.5.26` (direct dev dependency +
    `overrides.postcss`).
  - `sharp` overridden to `0.35.3` (`overrides.sharp`) - Next's optional
    dependency; not imported directly by application code.
  - `next` stayed on the 15.5.x line (15.5.23); no patched 15.x release
    existed for the bundled-dependency advisory path, and the override of
    the vulnerable bundled copies removes the exposure. A future Next major
    upgrade remains a deliberate, separately reviewed project.
- `npm audit --json` reports 0 vulnerabilities after the overrides.
- Policy reminder: never run `npm audit fix` / `--force`; triage manually.
- If `npm ls next postcss sharp` ever shows multiple divergent versions
  again, re-run the override alignment before deploying.
