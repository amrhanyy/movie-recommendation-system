# RECOVERY_BATCH_R7_REPORT.md

- **Date:** 2026-08-20 (UTC+3)
- **Scope:** R7 only - CI/CD, environment validation, health/readiness checks, secret scanning, deployment documentation, monitoring foundations, rollback, and operational security.
- **Status:** **COMPLETE** - every required command exits 0; previous 148 tests plus all R7 tests pass (175/175); no live external service contacted; no later remediation batch started.

NOTE: R7 was started by an interrupted run that had already drafted several artifacts (two of them left as broken UTF-16 files). This completion pass repaired, corrected, tested, and verified all R7 artifacts; everything below describes the final state.

---

## 1. Initial Git state

- Branch: `main`, HEAD `b4e8023`.
- Dirty tree from R1-R6 preserved (not reset).
- Baseline before R7 edits: lint 0, typecheck 0, 148/148 tests, coverage 0, build 0, diff-check 0 (per R6 report).
- At R7 start, two interrupted-R7 files were broken UTF-16 (`lib/env.ts`, `tests/operational-security.test.ts`) causing lint "binary" parse errors and one TS error; both converted to UTF-8 before any new work.

## 2. Environment-variable inventory

Server-side `process.env` consumers (no client component imports any env helper):

| Variable | Consumers | Role |
|---|---|---|
| `NODE_ENV` | `lib/auth.ts` (cookie secure), `lib/cache-namespace.ts`, `app/error.tsx` | mode |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | `lib/auth.ts` | auth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `lib/auth.ts` | OAuth |
| `MONGODB_URI` | `lib/mongodb.ts`, `scripts/promote-owner.js` | database |
| `TMDB_API_KEY` | `lib/tmdb.ts`, TMDB proxy routes | upstream |
| `GOOGLE_API_KEY` | chat / ai-recommendations / ai-similar routes (server only) | AI |
| `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS` | `lib/redis-config.ts` / `lib/redis.ts` | optional cache |
| `HISTORY_RETENTION_DAYS`, `CHAT_RETENTION_DAYS` | `lib/privacy-retention.ts` | retention |

No `NEXT_PUBLIC_*` usage exists anywhere in code.

## 3. Typed environment validation (lib/env.ts)

- Pure `validateEnv(env)` + lazy `runtimeEnv()` singleton + `isCoreConfigReady()` + `aiFeaturesConfigured()`.
- Production-required: `MONGODB_URI`, `NEXTAUTH_SECRET` (>= 32 chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TMDB_API_KEY`, `NEXTAUTH_URL` (https enforced). `GOOGLE_API_KEY` is feature-conditional (AI routes degrade safely without it).
- Test mode accepts explicit placeholders (secret-length check relaxed only in `NODE_ENV=test`; production still enforces 32+).
- Redis optional; parsing delegated to `lib/redis-config.ts` (no contradictory logic); `redis://` + `REDIS_TLS=true` rejected; `REDIS_PORT` bounds 1..65535.
- `NEXT_PUBLIC_*` copies of any application secret are rejected.
- Errors contain variable name + category only; values never appear in errors or logs.
- `import "server-only"` intentionally NOT added (package not installed; adding a dependency was unnecessary - documented; the env module is only imported by server routes/tests, verified by grep).

`.env.example` (new): placeholders only, covers NODE_ENV, NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID/SECRET, MONGODB_URI, TMDB_API_KEY, GOOGLE_API_KEY, all Redis vars, retention vars. No real hosts/emails/key prefixes.

## 4. CI workflow (.github/workflows/ci.yml)

- Triggers: `pull_request` and `push` to `main`.
- `permissions: contents: read` (least privilege), `concurrency` cancels superseded runs, `timeout-minutes: 20`.
- Steps: checkout (v4), setup-node (v4, Node 22, npm cache), `npm ci` (frozen lockfile), lint, typecheck, test, coverage, build.
- Build step uses obviously non-production placeholder env values (`ci-placeholder`, `*.invalid` hosts) only; no production secrets; placeholders never echoed.
- Dependency audit gate: `npm audit --audit-level=high --omit=dev` with explicit failure message; policy = manual triage, never automatic `npm audit fix`.
- Secret scan: gitleaks v8.18.4 standalone binary (`--redact`, `--exit-code 1`, `--log-opts="--all"` = full git history + working tree) with `.github/gitleaks.toml`.
- Coverage artifact upload (`if: always()`).
- No `continue-on-error` on any core gate; no destructive scripts; no live service URLs.

## 5. Secret scanning

- `.github/gitleaks.toml`: `useDefault = true` (detects Google API keys, OAuth secrets, JWT secrets, generic keys). Allowlist is narrow and exact: paths `.env.example` and `tests/*`, plus four documented placeholder regexes. No suppression of real secret classes; no history rewriting.
- `.gitignore` ignores `.env`, `.env.local`, `.env.*.local`.
- Spot-check of committed reports/patches: no secret values present (placeholders like `test-placeholder-key` only, already in allowlisted paths/types).
- Policy (SECURITY.md): on detection record type+file only, rotate, do not claim safety until rotated.

## 6. Health endpoints

`GET /api/health/live`:
- Returns `{ status: "ok", service: "movie-recommendation-system" }`, 200, `Cache-Control: no-store`, `nosniff`.
- No env access, no external calls, no versions/hostnames/uptime/commit hashes/paths.

`GET /api/health/ready`:
- Configuration readiness only via `isCoreConfigReady()`. Does NOT connect to MongoDB/Redis and does NOT consume Gemini/TMDB quota.
- Component states generic: `ready` / `unavailable` / `optional` (`config`, `redis`). Redis absence never fails readiness.
- 200 when config valid; 503 when invalid. No connection strings, server names, credential status, or error text exposed.
- Builds (does not emit) a sanitized operational event for the probe.
- Shallow Mongo/Redis probes are a documented follow-up behind an internal mechanism (not claimed implemented).

## 7. Operational logging foundation (lib/operational-log.ts)

- Fixed event allowlist: `health.liveness`, `health.readiness`, `ops.secret_scan_review`, `ops.deploy`, `ops.rollback`.
- Structured JSON lines: `ts`, `event`, `status`, optional `durationMs`, optional validated `correlationId`, sanitized `meta`.
- Blocked meta keys (lowercased comparison): email, user, userid, chat, message, title, token, cookie, authorization, password, secret, apikey, connectionstring, uri; plus any key containing token/secret/password; plus values resembling connection URIs or `key=`/`secret=` pairs.
- Correlation IDs validated `^[A-Za-z0-9_-]{1,64}$`; PII-bearing client values rejected (never echoed verbatim).
- Platform-neutral stdout/stderr output; no Sentry/external integration; existing log calls deliberately not mass-refactored (documented follow-up).
- Bugs found and fixed during completion: blocked-key set had mixed-case entries (case-sensitivity hole) - fixed to all-lowercase; two forbidden `eslint-disable` comments removed.

## 8. Dependency audit (read-only)

`npm audit --json` (network available in this environment; audit exit 1 reflects findings, not a tool failure):

- Totals: 3 high, 0 critical, 0 moderate/low/info.
- Advisories:
  1. `next` (high) - Next.js advisory.
  2. `postcss` (high) - XSS via unescaped `</style>` in CSS stringify output.
  3. `sharp` (high) - inherited libvips CVEs (CVE-2026-33327/33328/35590/35591).
- Per R7 rules: `npm audit fix` / `--force` NOT run. Triage and deliberate upgrades are operator follow-up; the CI audit gate enforces the policy going forward.

## 9. Documentation added/updated

- `SECURITY.md` (new): vulnerability reporting (contact placeholder to replace), supported versions, scope notes (including prompt-injection residual risk), secret-rotation table, secret-scan handling policy.
- `OPERATIONS.md` (new): env validation reference, health endpoint semantics, operational events, CI/CD description, deployment steps, rollback (artifact-based, no destructive DB rollback), backup/restore, secret rotation runbook, known limits.
- `DEPLOYMENT_SECURITY_CHECKLIST.md`: sections 10 (CI/CD) and 11 (monitoring/rollback) marked implemented with R7 references; section 2 extended with R7 env-validation items; section 13 extended with R7 health + CI staging checks.
- `README.md`: Operations and security section added (CI, env validation, health, runbook pointers).
- No real hosts, emails, keys, or internal domains added to any doc.

## 10. Tests added (exact names)

`tests/operational-security.test.ts` (27 tests; previous 148 preserved; total 175):

R7 environment validation:
- `accepts a valid test configuration`
- `rejects missing production-required variables without leaking values`
- `requires HTTPS for NEXTAUTH_URL in production`
- `requires NEXTAUTH_URL in production`
- `enforces a minimum NEXTAUTH_SECRET length in production`
- `accepts explicit placeholders in test mode`
- `treats optional Redis absence as valid`
- `rejects contradictory Redis configuration (redis:// + TLS true)`
- `rejects a NEXT_PUBLIC secret variable`
- `rejects an invalid MONGODB_URI scheme`
- `rejects a REDIS_PORT out of bounds`
- `isCoreConfigReady reflects validity`

R7 health endpoints:
- `liveness returns 200, no-store, and no internal detail`
- `ready returns 200 with valid core config and generic components`
- `ready returns 503 when required configuration is invalid`
- `never calls Gemini/TMDB via health endpoints`

R7 operational logging:
- `sanitizes blocked keys and sensitive values`
- `sanitizes values that look like connection URIs`
- `rejects non-scenario correlation ids`
- `logs no PII and no raw body`

R7 CI workflow contract (static file assertions):
- `uses npm ci (frozen lockfile), not npm install`
- `contains all core quality gates`
- `does not reference live external service URLs or destructive scripts`
- `uses read-only workflow permissions`
- `does not set any build-bypass variable and uses non-production placeholders`
- `does not contain a real secret pattern`
- `runs on pull_request and push to main`

All tests use mocks/explicit placeholders; none read `.env`; none contact live services.

## 11. Finding IDs covered

- Checklist CI/CD items (previously deferred): implemented.
- Checklist monitoring/rollback items: implemented/documented.
- F-048 (security headers, closed earlier) untouched; CSP unchanged.

## 12. Extra files changed (documented necessity)

- `lib/env.ts`, `lib/operational-log.ts`, `app/api/health/live/route.ts`, `app/api/health/ready/route.ts`, `tests/operational-security.test.ts` - repaired from interrupted-R7 UTF-16/broken state (all allowed R7 files).
- `.gitignore` - env ignore lines verified present (required by Part 3 rule 6).
- No other out-of-scope files changed.

## 13. Proof no external service was contacted

- All tests mock env/fetch; health tests assert `fetch` never called.
- Not run: `setupDatabase.cts`, `testRedisConnection.ts`, owner scripts, migrations, TTL-index creation, `npm audit fix`.
- `npm audit --json` queried the npm registry (read-only metadata lookup required by Part 6); no other external call. No MongoDB/Redis/Gemini/TMDB/Google/YouTube contact.
- `.env`/`.env.local` untouched.

## 14. Post-implementation security search

- `NEXT_PUBLIC_`: zero code usages.
- `process.env`: server modules only (`lib/auth.ts`, `lib/mongodb.ts`, `lib/redis-config.ts`, `lib/cache-namespace.ts`, retention via env, TMDB/Gemini route handlers, `app/error.tsx` dev-only branch). No client component imports `lib/env` or `lib/operational-log` (grep verified).
- `eslint-disable` / `@ts-ignore` / `@ts-nocheck`: none in source.
- New R7 modules log only sanitized JSON lines; health live logs nothing.
- Workflow contains only `ci-placeholder` / `*.invalid` values; gitleaks allowlist limited to documented placeholders.

## 15. Files modified/created by R7

Created:
- `lib/env.ts`
- `lib/operational-log.ts`
- `app/api/health/live/route.ts`
- `app/api/health/ready/route.ts`
- `.github/workflows/ci.yml`
- `.github/gitleaks.toml`
- `.github/dependabot.yml`
- `.env.example`
- `SECURITY.md`
- `OPERATIONS.md`
- `tests/operational-security.test.ts`
- `RECOVERY_BATCH_R7_REPORT.md`

Modified:
- `DEPLOYMENT_SECURITY_CHECKLIST.md`
- `README.md`

## 16. Exact commands and exit codes

| Command | Exit |
|---|---|
| `node -v` | 0 (v22.17.0) |
| `npm -v` | 0 (11.5.2) |
| `npm run lint` | 0 |
| `npm run typecheck` | 0 |
| `npm test` | 0 |
| `npm run test:coverage` | 0 |
| `npm run build` | 0 |
| `git diff --check` | 0 |
| `npm audit --json` | 1 (3 high advisories found; read-only; no auto-fix) |

## 17. Lint result

Exit 0, 0 errors. Pre-existing warnings only; no suppressions added.

## 18. Type-check result

Exit 0 (`tsc --noEmit`).

## 19. Test result

Exit 0. 9 files, 175/175 passing (148 prior + 27 R7).

## 20. Coverage result

Exit 0, 175/175 under coverage.

## 21. Build result

Exit 0. Real lint + TypeScript validation during `next build`. No `ignoreBuildErrors`/`ignoreDuringBuilds`.

## 22. `git diff --check` result

Exit 0 (CRLF/LF warnings only).

## 23. Remaining risks

- gitleaks binary downloaded from GitHub releases at CI runtime without checksum verification (documented in OPERATIONS.md; pin/vendor for air-gapped or higher-assurance CI).
- `npm audit` gate requires registry access; offline environments must mark BLOCKED rather than skip.
- 3 high dependency advisories (next, postcss, sharp) require deliberate operator triage/upgrade (auto-fix prohibited by R7 rules).
- Health readiness checks configuration only; no live Mongo/Redis probes yet (documented follow-up).
- No external error-monitoring provider integrated (recommendation documented).
- CSP staging-browser verification still pending from R5/R6.
- Interrupted-batch hygiene: two UTF-16 corrupted files existed at R7 start; repaired. Future interrupted batches should be checked for encoding corruption.
- Existing `console.*` calls in pre-existing routes not migrated to the operational logger (documented follow-up).

## 24. Manual deployment actions

1. Push to a GitHub repository so the CI workflow and Dependabot activate.
2. Replace the security-contact placeholder in `SECURITY.md`.
3. Verify first pipeline run: all gates pass with placeholder values only.
4. Plant a test secret in a throwaway branch to confirm gitleaks fails, then remove it.
5. Triage the 3 high audit advisories and schedule deliberate upgrades.
6. Wire load balancer probes to `/api/health/live` (always) and `/api/health/ready` (traffic gating).
7. Complete remaining staging checks in `DEPLOYMENT_SECURITY_CHECKLIST.md` section 13.

## 25. Confirmation no later batch started

R7 is the only batch executed in this work. No R8 or later batch was started. Broad performance work, identity migration, large UI refactoring, CSP redesign, AI redesign, Redis redesign, real-database migrations, and unrelated dependency upgrades were not performed.
