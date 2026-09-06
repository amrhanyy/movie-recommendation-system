# Movie Recommendation System

## Overview

MovieMind is a movie and TV recommendation web application built with Next.js (App Router). Signed-in users get personalized recommendations and an AI assistant; content metadata comes from TMDB and AI features use the Google Gemini REST API.

## Features

- **Google sign-in** via NextAuth.js (OAuth), server-side sessions.
- **Discovery:** trending, top-rated, popular, and genre browsing for movies and TV shows; search across titles and people.
- **AI features (optional, require `GOOGLE_API_KEY`):**
  - AI assistant chat with server-validated Gemini responses rendered as safe Markdown (no raw HTML).
  - Personalized AI recommendations and AI "similar movies", both runtime-validated with Zod and verified against TMDB.
- **Personalization:** watchlist, favorites, viewing history (user-consented), mood-based and time-based recommendations.
- **Admin dashboard:** user management, namespace-scoped Redis cache management, system statistics (admin/owner roles).
- **Privacy controls:** data export, account deletion, history deletion, chat deletion, retention limits (see below).

## Security and privacy highlights

- Handler-level authentication/authorization via central server helpers (`lib/security/auth.ts`); roles re-read from the database.
- Strict Zod request schemas; no client-supplied role/email/id trusted for privileged operations.
- Per-user rate limiting on sensitive routes; generic error responses (no upstream bodies, stack traces, or secrets).
- Content Security Policy enforced in `next.config.mjs` (no `unsafe-eval`; documented `style-src` exception).
- Chat history ownership enforced server-side; client-supplied assistant responses rejected.
- Privacy: authenticated export, confirmed account deletion with last-owner protection, history-tracking consent, bounded retention (`lib/privacy-retention.ts`).
- CI quality gates plus gitleaks secret scanning.

These controls reduce risk; they are not absolute security guarantees. Prompt injection against the AI assistant remains a residual risk by design (model output is treated as untrusted). Some controls require staging-browser verification before production (see `DEPLOYMENT_SECURITY_CHECKLIST.md`).

## Architecture

- **Routing:** Next.js App Router route handlers (`app/api/**`) for all data access; same-origin only (no browser calls to TMDB/Gemini; keys stay server-side).
- **Data:** MongoDB via Mongoose models (`lib/models/**`). Ownership is the authenticated user's email across user-owned collections.
- **Cache:** optional Redis (node-redis v4) behind a namespaced cache layer with bounded in-memory fallback, SCAN-based cleanup, and stampede protection (`lib/cache.ts`, `lib/cache-namespace.ts`).
- **AI:** Gemini `generateContent` calls built in `lib/gemini-payload.ts` with separated `systemInstruction`, bounded context, and strict response schemas (`lib/ai-security.ts`).
- **Auth:** NextAuth.js (JWT strategy, Google provider) with secure cookie settings (`lib/auth.ts`).

## Technology stack

- Next.js 15 (App Router), React 18, TypeScript
- NextAuth.js (Google OAuth)
- MongoDB + Mongoose
- `redis` v4 client (node-redis), optional with bounded memory fallback
- Tailwind CSS + shadcn/ui-style components (Radix UI primitives, lucide-react icons)
- Zod validation; React Hook Form
- Vitest + React Testing Library + jsdom
- Google Gemini REST integration; TMDB API
- recharts (admin charts), react-markdown (safe AI output rendering), react-hot-toast/sonner

## Prerequisites

- Node.js 22.x (CI uses 22), npm 10+
- MongoDB instance (local or cloud) - required for authenticated features
- Redis instance - optional; a bounded in-memory fallback is used when Redis is unavailable
- TMDB API key; Google OAuth client credentials; Google Gemini API key (only when AI features are used)

## Installation

Use a reproducible install from the lockfile:

```bash
npm ci
```

`npm install` is only for intentional dependency development work, not normal deployment.

## Environment configuration

1. Copy `.env.example` to `.env.local`.
2. Replace the placeholder values locally.
3. Never commit `.env.local` (it is gitignored).
4. In production use HTTPS values (e.g. `NEXTAUTH_URL` must be https).
5. Generate `NEXTAUTH_SECRET` securely (for example `openssl rand -base64 32`; minimum 32 characters).
6. Redis is optional. If configured:
   - `REDIS_URL` takes precedence over individual variables.
   - `rediss://` enables TLS.
   - `REDIS_HOST` / `REDIS_PORT` / `REDIS_USERNAME` / `REDIS_PASSWORD` / `REDIS_TLS` are the fallback.
   - Do not combine a plain `redis://` URL with `REDIS_TLS=true` (configuration is rejected).
7. Retention variables (`HISTORY_RETENTION_DAYS`, `CHAT_RETENTION_DAYS`) are bounded; invalid values fall back to defaults.

Server-side validation lives in `lib/env.ts`; errors name variables and categories only, never values.

## Running locally

```bash
npm run dev
```

Then open http://localhost:3000.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run verify
```

## Testing

Tests run with Vitest and mock all external services (NextAuth sessions, MongoDB/Mongoose, Redis, global fetch). Passing tests do not prove live OAuth, MongoDB, Redis, Gemini, TMDB, YouTube, or CSP compatibility; staging verification remains required (see `DEPLOYMENT_SECURITY_CHECKLIST.md` section 13). Test counts change over time; run `npm test` for the current number.

## Owner provisioning

- The HTTP owner-promotion endpoint (`POST /api/admin/promote`) is disabled (returns 404).
- Owners are created with the documented operator CLI: `scripts/promote-owner.js` (advanced operator command; requires an explicit target email and proof no owner exists). Never run it automatically.
- The last owner can never self-delete their account.

## Database operations

- **Do not run `npm run setup-db` as part of normal setup.** The underlying script (`scripts/setupDatabase.cts`) is destructive/potentially destructive, must never run automatically, and must never run against production. Local development does not require destructive collection drops (Mongoose creates collections on use; unique indexes are declared in the schemas).
- Production indexes and TTL migrations are operator-controlled (documented in `DEPLOYMENT_SECURITY_CHECKLIST.md` and `PRIVACY.md`); a verified backup is required before any migration.
- A MongoDB replica set is recommended so account deletion can run transactionally.

## Redis configuration

See "Environment configuration". Redis keys are namespace-scoped (`movie-recommendation-system:{env}:v1:`); destructive commands (`FLUSHDB`/`FLUSHALL`/`KEYS`) are not used.

## Privacy controls

Signed-in users get:

- **Data export:** `GET /api/user/export` (current user only, no-store, generic filename).
- **Account deletion:** `DELETE /api/user/account` (typed confirmation, last-owner protection; Google account data is not touched).
- **History deletion:** `DELETE /api/history` (current user only).
- **Chat deletion:** one conversation (`DELETE /api/chat-history/:id`) or all (`DELETE /api/chat-history`), session-scoped.
- **History-tracking consent:** `historyTrackingEnabled` preference enforced server-side.
- **Retention:** viewing history default 180 days; chat history default 365 days.

See `PRIVACY.md` and the `/privacy` page for details.

## Health endpoints

- `GET /api/health/live` - process liveness (no external calls, minimal output, no-store).
- `GET /api/health/ready` - configuration readiness via `lib/env.ts` validation. Readiness checks configuration, not live dependency connectivity; Redis absence never fails readiness.

## CI/CD

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`: lint, typecheck, tests, coverage, build, read-only `npm audit` gate (no automatic fixes), and gitleaks secret scanning - with read-only permissions and non-production placeholder values only. Dependabot maintains npm and GitHub Actions dependencies.

## Deployment

Follow `DEPLOYMENT_SECURITY_CHECKLIST.md` and `OPERATIONS.md`. Key points:

- Set all environment variables from `.env.example` with real values in your secret store; never commit them.
- Prefer a MongoDB replica set for transactional account deletion.
- Wire load-balancer probes to `/api/health/live` and `/api/health/ready`.
- Replace the security and privacy contact placeholders (`SECURITY.md`, `PRIVACY.md`, `/privacy`) before production.
- The repository clone URL is not known yet; this README documents local commands only.
- Complete staging verification (CSP browser checks, privacy flows, CI pipeline dry run).

## Operational documentation

- `OPERATIONS.md` - deployment, rollback, backup/restore, secret rotation, monitoring foundations.
- `SECURITY.md` - vulnerability reporting, supported versions, secret-rotation policy.
- `PRIVACY.md` - operator-facing privacy reference (data inventory, retention, deletion, TTL migration).
- `DEPLOYMENT_SECURITY_CHECKLIST.md` - full pre-production checklist.

## Known limitations

- Readiness checks configuration only; shallow Mongo/Redis probes are a documented follow-up.
- No external error-monitoring provider is integrated yet (recommended in `OPERATIONS.md`).
- CSP and several flows require staging-browser verification before production.
- Prompt injection against AI features is a residual risk (model output is treated as untrusted).
- Deleted data may remain in backups until backup expiration.
- `npm run setup-db` / `npm run test-redis` remain in `package.json` as advanced operator commands; they must not be run against production.
- The repository has no public remote yet; CI activates when pushed to GitHub.
- No LICENSE file exists (package.json metadata says ISC but no license text is committed); licensing must be decided before public release.
