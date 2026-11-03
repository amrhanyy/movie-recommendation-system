# ADR-001 — Architecture, Deployment, and Resilience Decisions

**Status:** ACCEPTED · **Date:** 2026-09-09 · **Phase:** M7 release hardening
**Supersedes:** scattered notes in `docs/DIAGNOSTIC_*`, `docs/HOTFIX_*`,
`docs/PHASE_*_REPORT.md` (consolidated here; those files remain as history).
**Constraints honoured:** zero breaking API changes, zero new major deps.

## 1. Canonical Redis provider: Upstash

- **Decision:** Upstash is the canonical managed Redis provider.
- **Config:** `REDIS_URL` (preferred; `rediss://` implies TLS) takes precedence
  over `REDIS_HOST`/`REDIS_PORT`/`REDIS_USERNAME`/`REDIS_PASSWORD`/`REDIS_TLS`
  (see `lib/redis-config.ts`, README "Installation"). TLS is the default for
  hosted connections (`rediss://`; explicit `REDIS_TLS=true` only with the
  `REDIS_*` field form — never combined with plain `redis://`, which
  `validateEnv` rejects).
- **Observed free-tier shape:** ~500K commands/month free tier is sufficient
  for this workload (diagnostic evidence: single-instance bursts measured in
  hundreds of commands, dataset ~15 KB — see
  `docs/DIAGNOSTIC_REDIS_QUEUE_CALIBRATION.md` §0).
- **Provider portability:** the app pins only the `redis` (node-redis v4)
  client API (`documentation-contract` test asserts no `ioredis`); any
  RESP-compatible endpoint works via the same two config forms.

## 2. ACCEPTED-ADMIN-DEBT: GitHub Actions billing lock

- **Fact:** GitHub Actions for this repo is blocked: the latest CI run fails
  in ~4s with all jobs reporting "account is locked due to a billing issue"
  (`docs/PHASE_5_M5_REPORT.md` §6).
- **Decision (ACCEPTED-ADMIN-DEBT):** the release does NOT depend on green
  cloud CI. The local gate is authoritative: `npm run lint`, `npm run
  typecheck`, `npm test` (full, default timeout), `npm run build` — each run
  directly with exit codes recorded in every phase report. The Actions
  workflow (`.github/workflows/ci.yml`) is unchanged and will resume
  enforcement once the owner clears the billing lock. No workflow change is
  made to work around the lock.

## 3. Redis Queue Calibration (permanent resilience strategy)

- **Decision:** `commandsQueueMaxLength: 500` in BOTH `buildRedisConfig`
  branches (URL + HOST) **plus** a bounded fan-out pool of 8 in
  `app/api/watchlist/details/route.ts` (`DETAIL_POOL_SIZE = 8`, M4
  `ai-recommendations` batch-loop mirror). `disableOfflineQueue: true` and
  the reconnect strategy are unchanged.
- **Why both (diagnostic `docs/DIAGNOSTIC_REDIS_QUEUE_CALIBRATION.md`,
  Option C):** the node-redis command queue is per client instance and shared
  by every concurrent request on a warm serverless instance. A single cold
  50-item list page issues ~100 commands (50 GET + up to 50 SET) via
  `getOrSet`; summed with a home-page burst (~16) and rate-limit ops (~10),
  the old cap of 5 overflowed ~20×. The pool bounds the single-call term
  (≤16 in flight); the 500 cap absorbs the cross-request summation term.
- **Failure semantics (unchanged):** queue-full rejections are caught in
  `safeRedisOp`, fall back to the bounded in-memory cache, and the route
  stays 200 — cost is hit-rate/latency only, rate-limited to ≤1 error line
  per minute per instance.
- **Regression lock:** `tests/redis-queue-calibration.test.ts` (4 tests)
  asserts zero rejections at 500, pool ≤ 8, SET-count == miss-count, and both
  config branches emitting 500.

## 4. Boot classification: Core-Fatal vs Optional-Degraded

- **Decision (M4 STEP 0-A, `instrumentation.ts` + `lib/boot-state.ts`):**
  production boot distinguishes two failure classes.
  - **Core-Fatal (throw, process does not boot):** any `validateEnv` error
    whose `name` is NOT `REDIS_URL`/`REDIS_PORT` — i.e. `MONGODB_URI`,
    `NEXTAUTH_SECRET` (+ length), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
    `TMDB_API_KEY`, `NEXTAUTH_URL` (+ https), every `NEXT_PUBLIC_*` secret
    guard name, `TRUSTED_PROXY_CIDRS`, `HISTORY_RETENTION_DAYS`,
    `CHAT_RETENTION_DAYS`.
  - **Optional-Degraded (boot continues, memory fallback):** redis-shape
    errors only (`REDIS_URL`, `REDIS_PORT`) → `setBootRedisState(
    'misconfigured')` + one `health.readiness/warn` ops event + a single
    `[BOOT] Redis misconfigured; memory fallback active` line.
- **Readiness contract:** `GET /api/health/ready` reports
  `components.redis: "misconfigured" | "optional"`; a redis-misconfigured
  state alone NEVER downgrades overall status (200 ready when the shallow
  Mongo `ping` succeeds). Mongo down → 503 `degraded`; invalid core config →
  503 `unavailable`.
- **Regression lock:** `tests/boot-fatality-classification.test.ts` (3 tests).

## 5. Related standing decisions (recorded, unchanged)

- Single Node monolith + MongoDB (+ optional Redis); no microservices,
  queues, or BFF tier (`docs/ARCHITECTURE_REVIEW.md` §10).
- Retention TTL stays an **operator migration** (indexes commented out in
  `lib/models/History.ts`, `lib/models/ChatHistory.ts`; env vars documented
  in `.env.example`); read-time bounds are the enforced control
  (`docs/RETENTION_MIGRATION_PLAN.md`).
- `server-only` enforcement on `lib/env.ts`, `lib/auth.ts`,
  `lib/security/*`, `lib/cache*.ts` (M7) — any client-component import of
  server secrets fails the build.
