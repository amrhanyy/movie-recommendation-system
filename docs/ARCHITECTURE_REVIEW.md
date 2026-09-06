# Architecture Review — MovieMind (movie-recommendation-system)

**Date:** 2026-09-05 · **Mode:** read-only review (this file is the only write)
**Scope:** full repository at `D:/fork ai to create website/final porject/movie-recommendation-system`

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Classification (Phase 1)](#2-project-classification-phase-1)
3. [Relevance Map](#3-relevance-map)
4. [Detailed Findings](#4-detailed-findings)
5. [Maturity Score](#5-maturity-score)
6. [Top 3 Strengths](#6-top-3-architectural-strengths)
7. [Top 5 Architectural Risks](#7-top-5-architectural-risks)
8. [Premature Complexity Tax](#8-premature-complexity-tax)
9. [Missing Essentials](#9-missing-essentials)
10. [Anti-Recommendations](#10-anti-recommendations)
11. [Roadmap: Now / Next / Later](#11-roadmap)
12. [Appendix — Patterns Deliberately NOT Recommended](#12-appendix--patterns-deliberately-not-recommended)

---

## 1. Executive Summary

MovieMind is a **solo-developer MVP / early-growth Next.js 15 SaaS prototype**: a movie/TV discovery app over the TMDB API with Google-OAuth sign-in, an admin dashboard, and an optional Gemini-powered AI assistant. Content metadata is *sourced from TMDB at request time and cached*; MongoDB holds only user-owned state (profiles, watchlist, favorites, history, chat).

**Architectural Maturity Score: 8/10** — for this class. The project is unusually disciplined for an MVP: central server-side authorization with fresh role reads, strict Zod boundary validation, namespaced optional caching with stampede protection, bounded retention, and a real CI gate with secret scanning. The main architectural debts are (a) a MongoDB query inside every session resolution on the hot path, (b) retention enforced at *read* time only, with no physical expiry, and (c) a very large uncommitted working tree mixing many concerns, which makes the system hard to reason about and roll back.

**Top 3 risks** (full ranking in §7):

1. **DB query on every authenticated session resolution** — [lib/auth.ts:86-118](../lib/auth.ts) runs `User.findOne` inside the `session` callback, which `requireSession` triggers on every protected API call; an AI chat request therefore issues 3+ Mongo queries before any real work.
2. **Retention is read-time only** — [lib/privacy-retention.ts:55-95](../lib/privacy-retention.ts) + `RECOVERY_BATCH_R6_REPORT.md` §13: expired history/chats are filtered on read but never physically deleted; `histories`/`chathistories` grow unbounded until the operator runs the documented TTL migration.
3. **TMDB upstream fan-out without cache on several routes** — [app/api/mood-recommendations/route.ts:75-101](../app/api/mood-recommendations/route.ts) makes two un-cached TMDB calls per request, and [app/api/ai-recommendations/route.ts:258-309](../app/api/ai-recommendations/route.ts) fans out one TMDB search per AI suggestion (up to 12 in parallel), burning TMDB quota and latency.

**Top 3 strengths** (detail in §6): central fresh-role authorization ([lib/security/auth.ts](../lib/security/auth.ts)); a genuinely well-designed optional-cache layer with namespace/SCAN/stampede guarantees ([lib/cache.ts](../lib/cache.ts), [lib/cache-namespace.ts](../lib/cache-namespace.ts)); and the AI trust boundary (server-authoritative chat persistence, Zod-validated structured model output, safe markdown rendering — [lib/gemini-payload.ts](../lib/gemini-payload.ts), [lib/ai-security.ts](../lib/ai-security.ts), [app/api/chat/route.ts](../app/api/chat/route.ts)).

**Top anti-recommendation:** do **not** add microservices, GraphQL, a service mesh, queues, or a BFF. A single Node process + MongoDB (+ optional Redis) is the correct shape for this team and load.

---

## 2. Project Classification (Phase 1)

| Dimension | Classification | Evidence |
|---|---|---|
| Project class | **MVP, early growth stage** | [package.json:3-4](../package.json) (`version 1.0.0`, `private: true`); [README.md:153-170](../README.md) lists license, remote, and staging verification as outstanding |
| Load class | **SMB / small SaaS** (real accounts, admin, AI) | ~51 route handlers under `app/api/**`; Google OAuth; three-tier role model |
| Domain type | **AI-assisted content platform** (TMDB discovery + Gemini assistant) | [lib/gemini-payload.ts:1-35](../lib/gemini-payload.ts); [lib/tmdb.ts:1-75](../lib/tmdb.ts) |
| Team stage | **Solo** | No LICENSE file (README:170); operator docs written for a single admin; owner bootstrap is a CLI script |
| Deployment reality | **Single managed Node service**, no public remote yet | README:150-157; [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (CI only, no CD pipeline) |
| External dependencies | MongoDB (required), Redis (optional), TMDB (required), Gemini (optional), Google OAuth | [lib/env.ts:124-146](../lib/env.ts); [.env.example:10-46](../.env.example) |

### Concerns RELEVANT to this project (scored in §4)

- Monolithic App Router structure; clear lib/app boundary
- AuthN/AuthZ model (OAuth JWT + server-side role re-reads)
- Data model & ownership (MongoDB, email-scoped user collections)
- Caching (optional Redis + bounded in-memory fallback, namespacing, stampede)
- Third-party API integration (TMDB quota, Gemini failure modes)
- Input validation & trust boundaries (Zod, client-data rejection)
- Resilience of stateful features (account deletion, chat persistence)
- Observability & operability at MVP scale (health checks, structured ops log, CI gate)
- Frontend performance basics (code splitting, image strategy)
- Privacy/retention (export, deletion, consent, TTL)

### Concerns NOT relevant (marked N/A, never scored, never recommended)

Microservices, DDD service boundaries, API versioning/compatibility contracts (single private same-origin client), async queues/event-driven processing, dead-letter queues, sharding (replica set is a documented *option* for transactions, not a requirement), multi-tenancy, load-balancer topology, distributed tracing, SLO/error budgets, feature-flag platform (one boolean flag exists and is implemented correctly), BFF, CQRS/event sourcing, WebAssembly, vector DB/RAG, edge/CDN strategy, zero-trust architecture, CAP trade-offs, chaos engineering.

---

## 3. Relevance Map

| Checklist item | Applied? | Verdict |
|---|---|---|
| Monolith vs services — appropriate to team/scale | yes | correct (modular monolith) |
| Service boundaries (DDD) | N/A | N/A — single domain, one service |
| API versioning / backward compatibility | N/A | N/A — single same-origin client, private repo |
| Sync vs async justified | yes | correct (all sync REST; no queues needed) |
| Data model / entity ownership | yes | correct (email-scoped ownership, unique compound indexes) |
| Database choice justified | yes | correct (MongoDB for user state only; content stays in TMDB) |
| Caching: layers, invalidation, stampede | yes | mostly correct; one TMDB route bypasses cache |
| ACID vs eventual consistency trade-offs | yes | documented; deletion staged, transactional path optional |
| Concurrency: N+1, indexes, pooling | yes | good indexes/pooling; TMDB fan-out in 2-3 routes |
| Multi-tenancy | N/A | N/A |
| Sharding/replication | N/A (note) | N/A at this scale; replica set correctly *recommended* (README:115) |
| Statelessness | yes | correct (state in Mongo/Redis; JWT sessions) |
| Load balancing / sticky sessions | N/A | N/A — single instance; no sticky-session state |
| Fault tolerance: retries, backoff, timeouts | yes | correct for TMDB/Gemini/Redis |
| Async/queues, DLQ, replay | N/A | N/A |
| Chaos-readiness | N/A | N/A at this class; Redis-down degradation works |
| Performance: unbounded queries, payload size | yes | mostly bounded; watchlist-details N+1 |
| Frontend: code splitting, image optimization | yes | Next.js defaults used; `images.unoptimized: true` |
| Observability: structured logs, no PII | yes | good ops log + health; one PII log line; no metrics |
| Correlation IDs | yes | present ([lib/operational-log.ts:58-69](../lib/operational-log.ts)) but only wired into health routes |
| Metrics/RED/SLO | N/A (partial) | not needed at solo-MVP scale; cache hit-rate endpoint exists ([lib/cacheManager.ts:88-142](../lib/cacheManager.ts)) |
| Feature flags / kill switches | yes | one flag (AI assistant), fail-closed ([middleware.ts:22-52](../middleware.ts)) |
| Rollback / health checks | yes | live/ready probes; rollback runbook in OPERATIONS.md |
| LLM integration patterns (AI product) | yes | strong trust boundary; prompt injection documented as residual risk |
| Edge/CDN, Zero Trust, Data Mesh, Mesh, BFF, CQRS, WASM, CAP | N/A | N/A — see §12 |

---

## 4. Detailed Findings

Verdicts: correct / naive-partial / missing-needed / N/A — rendered with plain words to keep this file encoding-safe.

### 4.1 Architecture boundaries — correct

A monolith with a clean layer split is the right choice. All data access goes through server route handlers (`app/api/**`); business/security logic is centralized in `lib/**` (`lib/security/auth.ts`, `lib/security/schemas.ts`, `lib/security/rateLimit.ts`, `lib/ai-security.ts`, `lib/gemini-payload.ts`); UI holds no business logic. Same-origin only: no browser ever calls TMDB/Gemini directly, so API keys stay server-side — enforced structurally and via CSP `connect-src 'self'` ([next.config.mjs:33](../next.config.mjs)).

**Naive-partial: route-handler discipline is inconsistent.** The newest, security-reviewed routes are exemplary ([app/api/chat/route.ts:97-198](../app/api/chat/route.ts): auth, rate limit, Zod, ownership-scoped query, server-built model payload, bounded persistence). Older discovery routes are thinner:

- [app/api/movies/route.ts:1-52](../app/api/movies/route.ts) uses an inline `fetchFromTMDB` with **no timeout and no retry** (unlike [lib/fetchWithRetry.ts](../lib/fetchWithRetry.ts)) and **no per-IP rate limit** (unlike the `tmdbProxy` limits used by `/api/trending`, `/api/movie/[id]`, `/api/search`). It does cache (6 h), so TMDB-quota impact is bounded, but an unauthenticated client can still trigger repeated cold-cache misses at unbounded rate.
- [app/api/trending/route.ts:25-29](../app/api/trending/route.ts) fetches TMDB with `{ next: { revalidate: 3600 } }` inside a **route handler** — `revalidate` is an ISR/SSG fetch option with no effect in a dynamic route handler, so this is dead configuration, not a cache. The route itself has no Redis cache, so every request hits TMDB (mitigated only by rate limit).
- [app/api/watchlist/details/route.ts:1-82](../app/api/watchlist/details/route.ts) bypasses the central `requireSession` helper (calls `getServerSession` directly — works, but skips the 401/500 contract and the fresh-role read) and does an **N+1 fan-out to TMDB**: one `fetchMediaDetails` per watchlist item, batched 5-wide with a 500 ms sleep between batches ([app/api/watchlist/details/route.ts:18-72](../app/api/watchlist/details/route.ts)). A 30-item watchlist means 30 un-cached TMDB calls plus at least 2 s of pure sleep per load.

**API versioning: correctly absent.** Single same-origin private client; adding `/v1` would be theater.

### 4.2 Data architecture — correct, with two naive-partial notes

**Model choice is right: MongoDB for user-owned state only, TMDB as the content source.** The app deliberately does *not* mirror TMDB's catalog into Mongo (there is a dormant `Movie` model — see §4.10). Mongoose connection is pooled with the standard dev-hot-reload guard and `bufferCommands: false` for fast failure ([lib/mongodb.ts:25-54](../lib/mongodb.ts)).

**Ownership model: email as the owner key.** All user collections scope by `userId: <email>` ([lib/models/FavoritesModel.ts:1-22](../lib/models/FavoritesModel.ts), [lib/models/WatchlistModel.ts:1-23](../lib/models/WatchlistModel.ts), [lib/models/History.ts:1-23](../lib/models/History.ts), [lib/models/ChatHistory.ts:1-24](../lib/models/ChatHistory.ts)). Unique compound indexes on `{userId, itemId, type}` enforce no-duplicates at the DB level (correct: DB constraint over app code). Email is a stable authenticated identity from Google OAuth; the cost is that a Google email change orphans rows — acceptable at MVP scale, not worth an identity-migration design.

**Naive-partial: no TTL / physical retention.** Retention is enforced by *filtering at read time* ([lib/privacy-retention.ts:55-95](../lib/privacy-retention.ts) plus `viewedAt: { $gte: historyCutoff }` in [app/api/history/route.ts:57-62](../app/api/history/route.ts) and [app/api/chat-history/[id]/route.ts:33-38](../app/api/chat-history/[id]/route.ts)). No `expireAfterSeconds` index exists in code (verified across all schemas; the plan lives in `RECOVERY_BATCH_R6_REPORT.md` §13 and [PRIVACY.md:54-72](../PRIVACY.md) as an operator migration). Expired rows remain in the database and in backups until that migration runs. Honestly documented — an acceptable design, but a real data-growth and data-residency debt, not a completed control.

**Naive-partial: ChatHistory shape vs the "conversations" API surface.** `ChatHistory` is **one document per user** with an embedded `messages` array capped at 200 via `$slice` ([app/api/chat/route.ts:162-182](../app/api/chat/route.ts)). The list/read endpoints always return only the single most recent document ([app/api/chat-history/route.ts:36-55](../app/api/chat-history/route.ts), [app/api/chat-history/list/route.ts](../app/api/chat-history/list/route.ts)) — so older chats created in the past exist in Mongo but are unreachable from the UI or the API. Delete-all is total, so there is no leak; but the one-doc-per-user schema contradicts the per-conversation API surface. Either design is fine; they should be the same thing.

**Consistency:** account deletion runs staged `deleteMany` per collection, user doc last, idempotent, with transactionality *optional* depending on topology ([lib/privacy-service.ts:150-184](../lib/privacy-service.ts), [lib/account-deletion.ts:1-76](../lib/account-deletion.ts)). The README correctly states a replica set is *recommended*, not required. Partial-deletion residue on failure is reported, not hidden. Good MVP trade-off, honestly documented.

### 4.3 Caching — correct (best subsystem in the repo)

The cache design is disproportionately good for this class:

- **Optional dependency with graceful degradation.** Redis absent, or down, falls back to a bounded 5,000-entry in-memory LRU+TTL cache per process ([lib/cache.ts:11-52](../lib/cache.ts)), with error-log throttling to once per minute ([lib/cache.ts:85-113](../lib/cache.ts)).
- **Namespacing and blast-radius control.** Canonical key prefix `movie-recommendation-system:{env}:v1:` with component normalization ([lib/cache-namespace.ts:19-79](../lib/cache-namespace.ts)); `clearScoped` deletes only namespace-verified keys via bounded cursor `SCAN`, never `KEYS`/`FLUSHDB` ([lib/cache.ts:193-262](../lib/cache.ts)). The admin cache API accepts only an internal scope allowlist and returns truncated key tails ([app/api/admin/cache/route.ts:64-98](../app/api/admin/cache/route.ts)).
- **Stampede protection.** `getOrSet` de-dupes in-flight fetches per key, bounded to 1,000 entries, released on both resolve and reject so failures are retryable ([lib/cache.ts:279-335](../lib/cache.ts)).
- **Client hardening.** `disableOfflineQueue: true`, `commandsQueueMaxLength: 5`, reconnect cap of 3 attempts ([lib/redis-config.ts:55-99](../lib/redis-config.ts)); a health monitor with a 5-minute cooldown prevents connect storms after `max number of clients` errors ([lib/redis-health.ts:1-100](../lib/redis-health.ts), [lib/redis.ts:79-120](../lib/redis.ts)).

**Naive-partial: cache adoption is uneven across TMDB routes.** Cached: `/api/movies` (6 h), `/api/movie/[id]` (30 min), tv details, top-rated, trailers. Not cached: `/api/trending` (dead `revalidate`, §4.1), `/api/mood-recommendations`, `/api/search`. At one instance and modest traffic this is fine; at growth it is a TMDB-quota risk. The in-memory layer is per-instance, so with multiple instances the fallback diverges silently — acceptable because Redis is the shared tier.

### 4.4 Security architecture (authn/authz, trust boundaries) — correct

The strongest area relative to class:

- **Defense in depth, correctly layered.** Middleware protects only matcher-scoped routes and is explicitly documented as non-authoritative ([middleware.ts:1-131](../middleware.ts)); every sensitive handler re-authenticates via `requireSession`/`requireUser`/`requireAdmin` ([lib/security/auth.ts:1-214](../lib/security/auth.ts)).
- **Fresh role reads.** `requireUser` re-reads the role from Mongo on every call so demotion takes effect immediately, never from the JWT alone ([lib/security/auth.ts:81-134](../lib/security/auth.ts)).
- **Role model is sane and escalation-locked.** Admins cannot touch other admins/owners; only owners can create owners; the last owner cannot be demoted or self-deleted ([app/api/admin/users/route.ts:107-168](../app/api/admin/users/route.ts), [lib/security/auth.ts:194-214](../lib/security/auth.ts), [lib/account-deletion.ts:28-68](../lib/account-deletion.ts)). Owner bootstrap is deliberately *not* an HTTP endpoint (404) and lives in an operator CLI requiring an explicit email and proof no owner exists ([app/api/admin/promote/route.ts:1-24](../app/api/admin/promote/route.ts), [scripts/promote-owner.js:1-90](../scripts/promote-owner.js)).
- **Boundary validation.** Strict Zod schemas reject unknown fields, `$`-operators, dotted keys, and mass assignment at every mutation ([lib/security/schemas.ts:1-143](../lib/security/schemas.ts)). Self-update is allowlisted to `preferences.*` only — `role`, `email`, `name`, `image` are not client-writable ([app/api/user/route.ts:1-22](../app/api/user/route.ts)).
- **Client trust boundary on AI.** `previousMessages` is accepted but ignored; assistant text is only ever server-generated and persisted by `/api/chat` ([app/api/chat/route.ts:115-122](../app/api/chat/route.ts)); direct chat persistence returns 403 ([app/api/chat-history/route.ts:62-91](../app/api/chat-history/route.ts)).
- **Same-origin checks on cookie-authenticated destructive mutations** (account delete, chat delete-all, cache admin) — a sensible CSRF belt on top of `SameSite=Lax` cookies ([app/api/user/account/route.ts:24-33](../app/api/user/account/route.ts), [app/api/admin/cache/route.ts:22-39](../app/api/admin/cache/route.ts)).
- **Rate limiting on every sensitive route**, Redis-backed with bounded in-memory fallback; per-user keys for authed routes, privacy-aware client identifiers for public ones ([lib/security/rateLimit.ts:19-262](../lib/security/rateLimit.ts)).
- **Env hygiene.** Secrets never exposed via `NEXT_PUBLIC_*` (explicit rejection list), HTTPS enforcement for `NEXTAUTH_URL` in production, category-only error messages with no values ([lib/env.ts:33-53](../lib/env.ts), [lib/env.ts:108-235](../lib/env.ts)).

**Residual items (documented, low blast radius):**

- `X-Forwarded-For` is taken as-is for public rate limiting ([lib/security/rateLimit.ts:74-90](../lib/security/rateLimit.ts)). Correct behind a managed host that sets these headers; on a bare-exposed origin a client could spoof the header to rotate rate-limit buckets.
- Prompt injection into the AI assistant is an **acknowledged residual risk**, contained by system-instruction separation, bounded context, a tool-less model, and Zod-validated output ([lib/gemini-payload.ts:29-67](../lib/gemini-payload.ts)). Correct treatment: it cannot be eliminated, only contained — and the containment here is right.

### 4.5 AI/LLM integration — correct

- **Server-side only**; API key in a header, never a URL ([app/api/chat/route.ts:36-95](../app/api/chat/route.ts)).
- **Bounded inputs:** 2,000 chars/message, 20 messages, 8,000 context chars, capped preference JSON ([lib/ai-security.ts:29-37](../lib/ai-security.ts), [lib/gemini-payload.ts:69-87](../lib/gemini-payload.ts)).
- **Bounded, schema-validated outputs:** fenced-JSON extraction with a hard char cap, strict Zod schemas, no silent repair, safe fallback on failure ([lib/ai-security.ts:93-129](../lib/ai-security.ts)). AI recommendations are re-verified against TMDB before any ID is returned — model text is never trusted as data ([app/api/ai-recommendations/route.ts:258-318](../app/api/ai-recommendations/route.ts)).
- **Error mapping without leaks:** stable internal codes, generic client messages, upstream bodies never forwarded or logged, key-redaction helper ([lib/ai-security.ts:227-259](../lib/ai-security.ts), [app/api/chat/route.ts:60-93](../app/api/chat/route.ts)).
- **Safe rendering:** react-markdown with an element allowlist, raw HTML off, HTTPS-only link transform, no images/iframes/forms ([lib/ai-markdown.tsx:1-80](../lib/ai-markdown.tsx)); YouTube embeds only from validated 11-char IDs on youtube-nocookie ([lib/ai-security.ts:71-91](../lib/ai-security.ts)).
- **Degradation:** AI key absent, or feature flag off, returns 503/redirect; the flag check fails *closed* ([middleware.ts:22-52](../middleware.ts)).

**Naive-partial: cost/quota control.** No per-user daily or token budget — only per-minute request limits (10/min chat, 5/min recs). Fine at MVP; the first thing to tighten at growth (§11).

### 4.6 Resilience & fault tolerance — correct for the parts that exist

- TMDB: timeouts + retries ([lib/fetchWithRetry.ts:19-82](../lib/fetchWithRetry.ts)) — used by the shared client, *not* by the inline fetchers in `app/api/movies`, `app/api/search`, `app/api/mood-recommendations` (inconsistency, §4.1).
- Gemini: 15 s timeout, 3 attempts, backoff only on 503, stable 504/502/503 mapping ([app/api/chat/route.ts:42-95](../app/api/chat/route.ts)).
- Redis: full degradation path (§4.3). Mongo: fail-fast with `bufferCommands: false`; sign-in *fails* if the user doc cannot be written — no session without a DB user, which is the correct direction ([lib/auth.ts:56-88](../lib/auth.ts)).
- No circuit breakers or bulkheads: **N/A** — three upstreams, one process; retries-with-timeout is the correct ceiling at this scale.

### 4.7 Observability & operability — naive-partial (good bones, thin wiring)

**Present and well-shaped:**

- Liveness probe: zero external calls, minimal output ([app/api/health/live/route.ts:1-20](../app/api/health/live/route.ts)). Readiness probe: configuration-only via the canonical env validator, generic component states, no secrets, no live-dependency probing (deliberate: avoids quota and secret exposure) ([app/api/health/ready/route.ts:1-57](../app/api/health/ready/route.ts)).
- Structured operational logging with PII-field blacklists, scalar-only meta, secret-look redaction, and validated correlation IDs ([lib/operational-log.ts:25-123](../lib/operational-log.ts)).
- Cache stats endpoint returning sanitized aggregates only ([lib/cacheManager.ts:88-142](../lib/cacheManager.ts), [app/api/admin/cache/route.ts:50-62](../app/api/admin/cache/route.ts)).
- CI gate: lint, typecheck, test, coverage, build (production-mode placeholders), `npm audit --audit-level=high` with a documented no-auto-fix policy, pinned gitleaks scan; read-only permissions, concurrency cancel ([.github/workflows/ci.yml:1-93](../.github/workflows/ci.yml)). Dependabot for npm + Actions.
- OPERATIONS.md runbooks (rollback, secret rotation, backups), SECURITY.md, PRIVACY.md, deployment checklist.

**Gaps (honest, sized to class):**

- The ops logger is wired into **only the two health routes** ([app/api/health/ready/route.ts:43-48](../app/api/health/ready/route.ts)); everything else uses ad-hoc `console.log`/`console.error`. One PII leak in a log line: `console.log('Session user email:', session.user.email)` at [app/api/watchlist/details/route.ts:15](../app/api/watchlist/details/route.ts) — exactly what the ops-log blacklist exists to prevent.
- Correlation IDs exist in the logger, but no request middleware generates or propagates one, so a user request cannot currently be correlated across Mongo/Redis/upstream calls.
- No metrics/RED dashboards, no external error monitoring — both explicitly acknowledged as outstanding ([README.md:164](../README.md), OPERATIONS.md).
- Readiness does not probe Mongo/Redis connectivity (deliberate, documented) — so a down MongoDB returns 200-ready and then 500s on every authed route. A shallow `ping` behind an admin flag is a small, defensible upgrade (§11).

### 4.8 Performance — naive-partial

- Mongo: unique compound indexes on the hot user collections ([lib/models/History.ts:21](../lib/models/History.ts), [lib/models/FavoritesModel.ts:21](../lib/models/FavoritesModel.ts), [lib/models/WatchlistModel.ts:21](../lib/models/WatchlistModel.ts)); `User.email` unique index covers the auth path ([lib/models/User.ts:17](../lib/models/User.ts)). Pagination capped everywhere (100 pages max, limit 100 max) ([lib/security/schemas.ts:75-81](../lib/security/schemas.ts), [app/api/admin/users/route.ts:8-14](../app/api/admin/users/route.ts)).
- **Hot path (Risk 1):** every `requireSession` triggers the `session` callback, which runs `User.findOne` ([lib/auth.ts:86-118](../lib/auth.ts)). `/api/chat` therefore performs: session read (query 1) + chat doc read (query 2) + Gemini + chat write (query 3). Three Mongo round-trips per chat message for identity work. Invisible at solo-MVP load; dominant at growth.
- **TMDB fan-out (Risk 3):** mood route = 2 un-cached upstream calls per request; ai-recommendations = up to 12 parallel un-cached searches per call; watchlist-details = N un-cached detail fetches with 500 ms sleeps between 5-wide batches ([app/api/watchlist/details/route.ts:70-72](../app/api/watchlist/details/route.ts)).
- Frontend: App Router gives route-level code splitting for free. `images: { unoptimized: true }` ([next.config.mjs:9-11](../next.config.mjs)) is fine for remote TMDB posters (they are not `next/image` candidates) but also disables optimization for local assets. `webpackBuildWorker` / `parallelServerCompiles` are dev-speed flags with no runtime effect.

### 4.9 Privacy & retention — naive-partial (controls present, closure pending)

- Export: current-user-only, projection allowlists, caps (500 history / 100 chats), retention-filtered, generic filename, no-store, strict rate limit ([app/api/user/export/route.ts:33-113](../app/api/user/export/route.ts), [lib/privacy-service.ts:26-139](../lib/privacy-service.ts)).
- Account deletion: exact-literal confirmation, same-origin check, last-owner protection, owner-scoped deletes, idempotent, generic errors ([app/api/user/account/route.ts:52-150](../app/api/user/account/route.ts)).
- Consent: history-tracking preference re-read server-side and enforced at write time ([app/api/history/route.ts:25-45](../app/api/history/route.ts), [app/api/history/route.ts:96-100](../app/api/history/route.ts)).
- **Open items:** (1) no physical TTL (§4.2); (2) `isWithinRetention` is a dead helper for export-time filtering that the query-time filter already performs ([lib/privacy-retention.ts:84-95](../lib/privacy-retention.ts)); (3) data sent to Gemini (viewed/watchlist/favorite titles) is a disclosure surface correctly inventoried ([lib/privacy-inventory.ts:95-109](../lib/privacy-inventory.ts)); (4) deleted data persists in backups until expiry (documented, [README.md:166](../README.md)).

### 4.10 Codebase health & change management — missing-needed (the one genuinely weak area)

- **Massive uncommitted working tree.** Git status shows ~100 modified/untracked source files plus ~20 report/patch/log artifacts at repo root (`RECOVERY_BATCH_R*.md`, `*.patch`, `*.txt`, `eslint-r5.txt`, `vitest-r5.log`, `fix-test162.py`, `strip-logs.py`, a bare `cursor-` entry, an `npm` entry). `vitest-r5.log` at the root records **1 failing test out of 34** at capture time. Because the tree is uncommitted, the CI gate (which runs on push) has not been verified against the current state.
- **Dead/dormant code:** `lib/models/Movie.ts` and `lib/models/Rating.ts` (exported from [lib/models/index.ts:1-7](../lib/models/index.ts)) are imported nowhere — no route ever reads or writes a `Movie` or `Rating` collection. `utils/redisExample.ts` is an unreferenced PII-keyed cache utility that the project's own audit says to delete ([docs/SECURITY_AUDIT.md:165-169](../docs/SECURITY_AUDIT.md)). `app/redis-demo` and `app/[mediaType]` are empty leftover directories. `next.config.mjs:1-8` merges a `v0-user-next.config` that does not exist (harmless try/catch; also flagged for deletion by [docs/UI_UX_REVIEW.md:282](../docs/UI_UX_REVIEW.md)).
- **Doc sprawl:** 14+ top-level markdown reports from prior remediation batches. Individually honest; collectively they out-document the code and will rot. They belong in `docs/` or in git history, not the working tree.
- **No LICENSE file** while `package.json` claims ISC ([README.md:170](../README.md)) — blocks any public release.

### 4.11 Anti-patterns checked (all pass)

No `unsafe-eval` in CSP; no client-side API keys; no `FLUSHDB`/`KEYS`; no raw-HTML rendering of model output; no auto `npm audit fix`; no auto-run destructive DB scripts in the normal flow (operator-only, documented, [README.md:108-115](../README.md)); no admin action that trusts a client-supplied role/email/id.

---

## 5. Maturity Score

**8/10 — well-executed MVP with disciplined security architecture and a real (though unwired) observability foundation.**

Calibration for this class: a 10 would mean the hot-path Mongo query, the read-time-only retention, and the uncommitted/failing-test working tree were all closed. A 5 would be a solo app with client-trusted roles and uncached unbounded upstream fan-out. This project sits clearly above that: every security-critical path is server-authoritative and test-backed, and the weaknesses are sizing/closure issues, not design errors. The score reflects *architectural* maturity; the working-tree state (§4.10) is a process debt that drags the 8 down from a 9.

---

## 6. Top 3 Architectural Strengths

1. **Server-authoritative authorization with fresh role reads** — [lib/security/auth.ts:81-170](../lib/security/auth.ts). Middleware is documented as non-authoritative; roles are re-read from the DB per request; escalation is locked at every boundary (no self-demotion, owner-only owner writes, last-owner protection, CLI-only bootstrap). This is the single most valuable property the app has, and it is implemented correctly.
2. **The optional-cache layer** — [lib/cache.ts](../lib/cache.ts) + [lib/cache-namespace.ts](../lib/cache-namespace.ts) + [lib/redis-config.ts](../lib/redis-config.ts) + [lib/redis-health.ts](../lib/redis-health.ts). Redis is a *degradation* concern, not a dependency: bounded memory fallback, namespace-verified SCAN-only cleanup, stampede de-duplication, connect-storm protection. This is production-grade work for an MVP, and it is test-covered.
3. **The AI trust boundary** — [lib/gemini-payload.ts](../lib/gemini-payload.ts) + [lib/ai-security.ts](../lib/ai-security.ts) + [app/api/chat/route.ts](../app/api/chat/route.ts). Client conversation history is ignored (server reads its own DB), model output is Zod-validated and re-verified against TMDB, rendering is allowlist-markdown with safe links, errors are mapped to stable codes without leaking upstream bodies, and the residual prompt-injection risk is explicitly documented rather than claimed away.

---

## 7. Top 5 Architectural Risks

Ordered by blast radius x likelihood.

**R1 — Identity hot path: Mongo query per session resolution.**
[lib/auth.ts:86-118](../lib/auth.ts) — the `session` callback runs `User.findOne` on every `getServerSession` call, and every protected route calls it. An AI chat request is 3 Mongo round-trips before business logic; every protected page is 1.
- *Blast radius:* latency + Mongo connection pressure on **all** authenticated traffic; grows linearly with users.
- *Likelihood:* high — it is on every request today.
- *Remediation:* project the role from the JWT (already set at sign-in, [lib/auth.ts:36-55](../lib/auth.ts)) and re-read from DB only where a *fresh* role matters (admin/owner decisions, which `requireUser` already does). That removes the query from `requireSession` entirely.

**R2 — No physical retention: unbounded growth of user data collections.**
[lib/privacy-retention.ts:55-95](../lib/privacy-retention.ts); `History`/`ChatHistory` schemas have no TTL index ([lib/models/History.ts:1-23](../lib/models/History.ts), [lib/models/ChatHistory.ts:1-24](../lib/models/ChatHistory.ts)); the migration is operator-documented but unapplied (`RECOVERY_BATCH_R6_REPORT.md` §13, [PRIVACY.md:54-72](../PRIVACY.md)).
- *Blast radius:* privacy exposure (expired data still in DB and backups), storage growth, export/cleanup cost.
- *Likelihood:* high — starts accruing on day one of real usage.
- *Remediation:* run the documented `expiresAt` TTL migration on a replica set (backup first, per the checklist). It is a one-time operator action, not new code.

**R3 — TMDB quota/latency exposure via un-cached fan-out routes.**
[app/api/mood-recommendations/route.ts:75-101](../app/api/mood-recommendations/route.ts) (2 upstream calls/request, un-cached), [app/api/ai-recommendations/route.ts:258-309](../app/api/ai-recommendations/route.ts) (up to 12 parallel searches/request, un-cached), [app/api/watchlist/details/route.ts:18-72](../app/api/watchlist/details/route.ts) (N un-cached fetches + batch sleeps), [app/api/trending/route.ts:25-29](../app/api/trending/route.ts) (dead `revalidate`, un-cached).
- *Blast radius:* TMDB rate-limit 429s break public discovery for *all* users; watchlist loads take seconds.
- *Likelihood:* medium — bounded today by per-IP rate limits, but those limits (60/min) are sized for quota, not for the 12x fan-out.
- *Remediation:* route these through the existing `redisCache.getOrSet` (movie details already show the pattern, [app/api/movie/[id]/route.ts:49-56](../app/api/movie/[id]/route.ts)); drop the watchlist batch sleeps; delete the dead `revalidate`.

**R4 — Uncommitted working tree with a known failing test.**
Root-level `vitest-r5.log` shows `1 failed | 33 passed` at capture; ~100 files uncommitted/modified; CI runs only on push.
- *Blast radius:* the "verified" state of the system is unknown; a push could break CI for everyone; rollbacks are impossible because there is nothing to roll *back to*.
- *Likelihood:* high — this is the current state.
- *Remediation:* fix the failing test, split the tree into logical commits (remediation docs to `docs/`, junk artifacts deleted or gitignored), push, let CI go green.

**R5 — Single-instance state in the memory fallbacks (rate limit + cache).**
[lib/security/rateLimit.ts:20-52](../lib/security/rateLimit.ts) and [lib/cache.ts:11-52](../lib/cache.ts) keep their fallback state **per process**. Scaling to N instances without Redis multiplies effective rate limits by N and multiplies cache misses by N.
- *Blast radius:* rate-limit guarantees silently weaken exactly when you scale.
- *Likelihood:* low-medium — only triggers at the moment of horizontal scale, which the project has not done yet.
- *Remediation:* make Redis *required* (not optional) at the point of multi-instance deployment, or move rate limiting to the platform layer (e.g. hosting-provider limits). One decision, documented in OPERATIONS.md.

---

## 8. Premature Complexity Tax

Patterns present that a simpler choice would suffice for (or nearly suffice for) this class:

1. **`node-cache` in dependencies** ([package.json:62](../package.json)) is unused — the hand-rolled bounded map in [lib/cache.ts:11-52](../lib/cache.ts) already does the job with bounds the hand-rolled version controls explicitly. One line of `package.json` to delete. (The hand-rolled part is *fine*; the duplicate dependency is the tax.)
2. **`lib/tmdb.ts` shared client with retry** is used by only 3 routes ([app/api/tv/[id]/similar/route.ts:3](../app/api/tv/[id]/similar/route.ts), [app/api/tv/[id]/recommendations/route.ts:3](../app/api/tv/[id]/recommendations/route.ts), [app/api/watchlist/details/route.ts:6](../app/api/watchlist/details/route.ts)); most routes inline their own fetch. Two parallel TMDB access patterns is a maintenance tax — one should be deleted (preferably the inline ones, per R3).
3. **`lib/privacy-service.ts` dependency-injection seams** (DeleteDeps, OwnerProtectionReads) and the staged-transaction abstraction in [lib/account-deletion.ts](../lib/account-deletion.ts) buy testability that exists, but the *transaction* path is never actually wired to a session — the "two-phase commit" language in the comments overstates what is implemented. Keep the DI (it is used by tests); drop or implement the transaction claim.
4. **`components/ui/*` + 18 Radix packages** ([package.json:14-52](../package.json)) — a large surface of UI primitives relative to the shipped pages. Not wrong (shadcn-style), but several packages (menubar, scroll-area, aspect-ratio) have no visible use; each is a vulnerability-surface and build-size tax.
5. **Two `LoadingSpinner` implementations** ([components/LoadingSpinner.tsx](../components/LoadingSpinner.tsx) and [components/ui/LoadingSpinner.tsx](../components/ui/LoadingSpinner.tsx)) — pure duplication.
6. **`FEATURE_ROUTES` in middleware** ([middleware.ts:5-7](../middleware.ts)) is a mini feature-flag system for exactly one flag read from a Mongo doc on every matched request. At one flag, a config constant or the existing admin settings read would suffice; the abstraction is one step too early. (The *fail-closed* behavior is correct and should be kept.)

None of these block anything; they are the cost of accumulated remediation batches rather than of growth.

---

## 9. Missing Essentials

Only what a project of *this* class and stage genuinely needs:

1. **Commit and green the CI gate** — nothing else matters until the tree is committed and `npm run verify` passes on a push (R4).
2. **Physical retention (TTL migration)** — operator action, already fully specified (R2).
3. **Move the role query off the `requireSession` hot path** (R1).
4. **Cache the un-cached TMDB routes; delete the watchlist batch sleeps** (R3).
5. **Remove the PII log line** [app/api/watchlist/details/route.ts:15](../app/api/watchlist/details/route.ts) and switch that route to `requireSession` for consistency.
6. **A LICENSE file** (or explicit "private, unpublished" note) — [README.md:170](../README.md).
7. **Decide Redis optionality at scale** (R5) — one sentence in OPERATIONS.md: "multi-instance deployment requires Redis."
8. **A shallow Mongo readiness probe** behind the existing readiness endpoint (or an admin-only route) — currently readiness claims "ready" with a dead database.

Deliberately *not* on this list: metrics dashboards, error-monitoring provider, distributed tracing, SLOs, API versioning, queues.

---

## 10. Anti-Recommendations

Things reviewers often pressure teams to add that this project explicitly should NOT add (and why):

1. **Microservices / service extraction.** One domain, one client, one team. Extracting "the AI service" or "the catalog service" adds a network boundary, a deployment unit, and a failure mode for zero user-visible benefit. The monolith boundary (`app/` vs `lib/security` vs `lib/models`) is already clean.
2. **GraphQL or an API gateway.** A single same-origin SPA talking to ~50 REST handlers does not need query-language abstraction or a gateway tier. REST + route handlers is the simple, debuggable choice.
3. **A service mesh, service discovery, or zero-trust networking.** No multi-service deployment exists. NextAuth cookies + CSP + handler-level authorization are the correct control set for a single origin.
4. **Message queues / event-driven processing (BullMQ, Kafka, etc.).** The only "async" work is cache warming, which `getOrSet` already handles with in-flight de-duplication. There are no cross-service consistency requirements.
5. **A BFF layer.** The Next.js app *is* the BFF: server route handlers aggregate TMDB, enforce auth, and cache. Adding another aggregation tier is duplication.
6. **Vector database / RAG / embeddings for the "recommendation" engine.** Recommendations here are (a) TMDB's own similarity endpoints and (b) Gemini over bounded preference JSON, re-verified against TMDB. An embedding store would be a heavier system solving a problem the current approach handles adequately at this scale.
7. **Database-level ACID hardening beyond the documented replica-set option.** Staged, idempotent, owner-scoped deletion with a reported partial-failure state is the right consistency level for user-owned collections. Forcing transactions everywhere buys little at this write volume and complicates standalone deployment.
8. **Circuit breakers / bulkheads / resilience frameworks (e.g. opossum, p-retry libraries).** Three upstreams with timeouts, bounded retries, and a graceful Redis fallback is the correct ceiling; a resilience library adds configuration surface without changing failure behavior.
9. **Feature-flag platform (LaunchDarkly/Unleash/etc.).** One boolean flag in a Mongo doc with fail-closed middleware is complete for this app.
10. **SLOs, error budgets, RED dashboards, distributed tracing.** At solo-dev load the operable questions are "does the health endpoint pass" and "does CI go green," both of which exist. Metrics infrastructure earns its place at multi-instance scale (see R5).
11. **CDN/edge architecture.** Next.js on a managed host already provides the static-asset and (optionally) function edge story; a hand-rolled CDN strategy is not a gap.
12. **API versioning (`/v1`).** Single private client, no third-party consumers. Version the repo, not the API.

---

## 11. Roadmap

### Now (this week — close real risk)

1. Fix the failing test; split the working tree into logical commits; move remediation reports into `docs/`; delete root-level junk (`*.patch`, `*.txt` status files, `fix-test162.py`, `strip-logs.py`, `eslint-r5*.txt`, `vitest-r5.log`, `cursor-`/`npm` entries, empty `app/redis-demo` and `app/[mediaType]` dirs). Push; get CI green. (R4)
2. Delete dead code: `lib/models/Movie.ts`, `lib/models/Rating.ts`, their exports in [lib/models/index.ts](../lib/models/index.ts), `utils/redisExample.ts`, the unused `node-cache` dependency, one of the two `LoadingSpinner` components, the `v0-user-next.config` merge block. (§4.10, §8)
3. Remove the PII log line [app/api/watchlist/details/route.ts:15](../app/api/watchlist/details/route.ts); switch that route to `requireSession`. (§4.7)
4. Move the role read out of the `session` callback into `requireUser`-only paths (JWT already carries the role from sign-in). (R1)

### Next (this quarter — prepare for actual growth)

1. Run the documented TTL `expiresAt` migration on a replica set with a verified backup. (R2)
2. Cache the un-cached TMDB routes (`trending`, `mood-recommendations`, per-item watchlist details) via `redisCache.getOrSet`; delete the batch sleeps; delete the dead `revalidate` option. (R3)
3. Add a shallow Mongo `ping` to readiness (or an admin-only dependency-check route); document that readiness is config-only otherwise. (§4.7)
4. Document the Redis-required-at-scale decision in OPERATIONS.md. (R5)
5. Decide licensing; replace SECURITY/PRIVACY contact placeholders. ([README.md:149-170](../README.md))
6. Add a daily/token budget for AI routes if usage justifies it. (§4.5)

### Later (only when the project justifies it)

1. Multi-instance deployment (behind a load balancer with the live/ready probes already in place) — and *only then*: Redis-mandatory policy, a metrics exporter, and an error-monitoring provider.
2. True conversation list (per-chat documents) if the product actually needs multiple concurrent conversations — today's one-doc-per-user model is a deliberate simplification.
3. A `Movie`/`Rating` persistence layer — only if the product moves beyond TMDB as the content source (e.g. user ratings drive recommendations natively).

Everything else in the §12 appendix is explicitly out of scope.

---

## 12. Appendix — Patterns Deliberately NOT Recommended

| Pattern | Why NOT for this project |
|---|---|
| Microservices / service mesh | One domain, one team, one origin; boundaries are already clean inside the monolith. Adds failure modes and ops cost for zero benefit at this load. |
| GraphQL / API gateway | Single same-origin client; REST route handlers are simpler and fully sufficient. |
| BFF tier (separate from the app) | The Next.js server handlers *are* the BFF (TMDB aggregation, auth, cache). A second aggregation tier is duplication. |
| CQRS / event sourcing | User-owned collections are simple read/write state; there is no audit-replay or high-write-complexity requirement. Staged deletion already covers the only consistency concern. |
| Message queues / event-driven processing | No cross-service work; the only async need (cache warming) is solved by `getOrSet` de-duplication. |
| Vector DB / RAG / embeddings | Current recommendation pipeline (TMDB similarity + bounded Gemini + TMDB re-verification) meets the product need; an embedding store is heavier machinery for the same answers at this scale. |
| SLOs / error budgets / RED dashboards / distributed tracing | Solo-dev load; the operable questions (health endpoint, CI green) already have answers. Revisit at multi-instance scale. |
| Feature-flag platform | One boolean flag, fail-closed in middleware. A flag platform is infrastructure for a one-value system. |
| Circuit-breaker / bulkhead frameworks | Three upstreams already have timeouts + bounded retries + graceful fallback; a framework would not change the failure behavior. |
| Multi-tenancy model | Single-tenant consumer app; "tenancy" is user ownership, already modeled by email scoping + unique indexes. |
| Sharding / read replicas | Data volume (user lists + chat) is nowhere near a sharding threshold; a single MongoDB (optionally a 1-node replica set for transactions) is correct. |
| Edge/CDN custom strategy | Managed hosting already handles static delivery and (optionally) edge functions; no global low-latency requirement justifies custom edge architecture. |
| Zero-trust / mTLS / service discovery | No service-to-service traffic exists; the trust boundary is browser-to-origin, handled by OAuth cookies, CSP, HSTS, and handler-level authorization. |
| WebAssembly | No compute-bound workload; the heaviest work is network I/O to TMDB/Gemini. |
| CAP-aware distributed data design | No distributed data store; consistency decisions are single-database (MongoDB) and already made. |

---

*End of review. All findings cite repository files at their current (uncommitted) state; line numbers refer to the working tree as of 2026-09-05.*
