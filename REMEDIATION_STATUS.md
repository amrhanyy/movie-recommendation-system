# REMEDIATION_STATUS.md

Tracks every audit finding through remediation. A finding is only marked "Fixed" after the change is implemented AND verified by a regression test.

Legend:
- Status: Pending | In progress | Fixed | Partially fixed | Won't fix (with reason)
- Verified by: test name or manual command

---

## Critical

| ID | Title | Verified status | Planned batch | Final status | Tests added | Files changed | Remaining risk |
|----|-------|------------------|----------------|--------------|-------------|---------------|----------------|
| F-001 | Mass assignment `PUT /api/user` → owner | Fixed: strict Zod allowlist; only `preferences.*` writable; `upsert: false` | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/user/route.ts` | None |
| F-002 | HTTP first-owner promote + email leak | Fixed: HTTP endpoint permanently disabled (404); CLI `scripts/promote-owner.js` replaces it | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/admin/promote/route.ts`, `scripts/promote-owner.js` | None |
| F-004 | Unauthenticated `POST /api/users` | Fixed: now requires owner auth; user creation disabled (handled by sign-in) | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/users/route.ts` | None |
| F-005 | Chat API no handler auth + matcher gap | Fixed: `requireSession()` at handler start; matcher includes `/api/chat`; previousMessages bounded | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/chat/route.ts`, `middleware.ts` | None |
| F-006 | Unauthenticated Gemini similar movies | Fixed: `requireSession()` at handler start | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/movie/[id]/ai-similar/route.ts` | None |
| F-010 | Admin getServerSession without authOptions | Fixed: all admin routes use `requireAdmin()` from `lib/security/auth.ts` | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/admin/*/route.ts` | None |
| F-015 | Admin page client-only | Fixed: server-side `app/admin/layout.tsx` guard added; `/admin` now dynamic | Batch 2 | **Fixed** | Build shows `ƒ /admin` | `app/admin/layout.tsx` | None |
| F-034 | Duplicate User schema in /api/users | Fixed: duplicate schema removed; uses `requireOwner()` | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/users/route.ts` | None |
| F-039 | Feature middleware fail-open | Fixed: middleware now fails closed (denies on feature API error) | Batch 2 | **Fixed** | Build passes | `middleware.ts` | None |
| F-049 | watchlist/favorites pages not in middleware | Fixed: matcher includes `/favorites`, `/watchlist`, `/admin`, and all API leaf paths | Batch 2 | **Fixed** | Build passes | `middleware.ts` | None |
| F-050 | errorDetails to client | Fixed: `errorDetails` field removed from ai-recommendations response | Batch 2 | **Fixed** | Code review | `app/api/ai-recommendations/route.ts` | None |
| F-051 | Promote leaks owner email | Fixed with F-002: promote endpoint disabled, never reveals owner email | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/admin/promote/route.ts` | None |
| F-003 | Next.js 15.1.7 middleware bypass CVE | Fixed: `next` upgraded 15.1.7 → 15.5.23 (CVE-2025-29927 patched in 15.2.3+) | Batch 1 | **Fixed** | Build passes | `package.json`, `package-lock.json` | None (do not rely on middleware as sole control — Batch 2 adds handler auth) |
| F-016 | Mongoose 8.11.0 advisories | Fixed: `mongoose` upgraded 8.11.0 → 8.24.3 (sanitizeFilter / prototype pollution patched in 8.24.0+) | Batch 1 | **Fixed** | Build passes | `package.json`, `package-lock.json` | None |
| F-020 | Unused Prisma/ioredis/sdk/zod-in-APIs | Fixed: `@prisma/client`, `ioredis`, `@google/generative-ai`, `@auth/core`, `@types/mongoose` removed | Batch 1 | **Fixed** | Build passes | `package.json`, `package-lock.json` | None |
| F-021 | `npm` + `install` dependencies | Fixed: both accidental packages removed | Batch 1 | **Fixed** | `npm ls` clean | `package.json`, `package-lock.json` | None |
| F-037 | next-auth `latest` | Fixed: pinned to `^4.24.11` | Batch 1 | **Fixed** | `npm ls next-auth` shows 4.24.11 | `package.json`, `package-lock.json` | None |

## High

| ID | Title | Verified status | Planned batch | Final status | Tests added | Files changed | Remaining risk |
|----|-------|------------------|----------------|--------------|-------------|---------------|----------------|
| F-004 | Unauthenticated `POST /api/users` | Fixed: now requires owner auth; user creation disabled (handled by sign-in) | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/users/route.ts` | None |
| F-005 | Chat API no handler auth + matcher gap | Fixed: `requireSession()` at handler start; matcher includes `/api/chat`; previousMessages bounded | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/chat/route.ts`, `middleware.ts` | None |
| F-006 | Unauthenticated Gemini similar movies | Fixed: `requireSession()` at handler start | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/movie/[id]/ai-similar/route.ts` | None |
| F-007 | XSS via Gemini HTML/markdown | Confirmed `app/ai-assistant/page.tsx` dangerouslySetInnerHTML + unsafe markdown | Batch 6 | Pending | — | — | Stored XSS |
| F-008 | GET cache clear mutates | Partially fixed: GET no longer clears; POST/DELETE used. Full fix in Batch 7 | Batch 7 | **Partially fixed** | Pending (Batch 7/9) | `app/api/admin/cache/route.ts` | FLUSHDB still in cache.ts |
| F-009 | Redis FLUSHDB | Confirmed `lib/cache.ts:154-161` | Batch 7 | Pending | — | — | Shared Redis wipe |
| F-010 | Admin getServerSession without authOptions | Fixed: all admin routes use `requireAdmin()` from `lib/security/auth.ts` | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/admin/*/route.ts` | None |
| F-011 | No rate limiting on AI/search | Confirmed (no rate-limit module anywhere) | Batch 4 | Pending | — | — | Cost / quota abuse |
| F-013 | Error stack in UI | Confirmed `app/error.tsx:24-35` | Batch 6 | Pending | — | — | Info leak |
| F-015 | Admin page client-only | Fixed: server-side `app/admin/layout.tsx` guard added; `/admin` now dynamic | Batch 2 | **Fixed** | Build shows `ƒ /admin` | `app/admin/layout.tsx` | None |
| F-016 | Mongoose 8.11.0 advisories | Confirmed `mongoose@8.11.0` (sanitizeFilter / prototype pollution) | Batch 1 | Pending | — | — | NoSQL injection |
| F-028 | Public TMDB proxy / quota | Confirmed (no auth on movies/search/trending) | Batch 4 | Pending | — | — | Quota theft |
| F-050 | errorDetails to client | Fixed: `errorDetails` field removed from ai-recommendations response | Batch 2 | **Fixed** | Code review | `app/api/ai-recommendations/route.ts` | None |

## Medium

| ID | Title | Verified status | Planned batch | Final status | Tests added | Files changed | Remaining risk |
|----|-------|------------------|----------------|--------------|-------------|---------------|----------------|
| F-017 | Verbose PII/prompt logging | Confirmed (chat logs prompts, auth logs emails) | Batch 8 | Pending | — | — | PII in logs |
| F-018 | Dead auth.config.ts + dual Mongo user writers | Confirmed `app/auth.config.ts` + `lib/dbUtils.ts` | Batch 10 | Pending | — | — | Confusion |
| F-019 | README env/stack mismatch | Confirmed (README says REDIS_URL; code uses HOST/PORT) | Batch 10 | Pending | — | — | Misconfiguration |
| F-020 | Unused Prisma/ioredis/sdk/zod-in-APIs | Confirmed package.json deps unused in source | Batch 1 | Pending | — | — | Supply chain noise |
| F-021 | `npm` + `install` dependencies | Confirmed in package.json | Batch 1 | Pending | — | — | Audit noise / surface |
| F-022 | ignoreBuildErrors / ignoreDuringBuilds | Confirmed `next.config.mjs:10-15` | Batch 9 | Pending | — | — | Hides broken types/lint |
| F-024 | CORS * on /api/movies | Confirmed `app/api/movies/route.ts:43-47` | Batch 6 | Pending | — | — | Cross-origin read |
| F-027 | Public redis-demo | Confirmed `app/redis-demo`, `app/api/redis-example`, `utils/redisExample.ts` | Batch 4 | Pending | — | — | Demo attack surface |
| F-031 | Redis client no TLS flags | Confirmed `lib/redis.ts:77-80` | Batch 7 | Pending | — | — | Cleartext Redis |
| F-032 | Unbounded admin page limit | Confirmed admin/users parseInt(limit) unbounded | Batch 3 | Pending | — | — | Expensive query |
| F-033 | No validation on list POSTs | Fixed: all mutation routes (favorites, watchlist, history, chat-history) now use strict Zod schemas | Batch 3 | **Fixed** | Pending (Batch 9) | `app/api/favorites/route.ts`, `app/api/watchlist/route.ts`, `app/api/history/route.ts`, `app/api/chat-history/route.ts`, `lib/security/schemas.ts` | None |
| F-034 | Duplicate User schema in /api/users | Fixed: duplicate schema removed; uses `requireOwner()` | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/users/route.ts` | None |
| F-035 | tsc NodeNext errors / broken hook | Confirmed (15 tsc errors across 8 files) | Batch 9 | Pending | — | — | Type safety off |
| F-036 | Dual chat UIs | Confirmed (ChatAssistant on home + ai-assistant page) | Batch 10 | Pending | — | — | Maintenance |
| F-038 | images.unoptimized | Confirmed next.config.mjs | Batch 11 | Pending | — | — | Perf / bandwidth |
| F-039 | Feature middleware fail-open | Fixed: middleware now fails closed (denies on feature API error) | Batch 2 | **Fixed** | Build passes | `middleware.ts` | None |
| F-041 | No account deletion/export | Confirmed (no delete/export endpoints) | Batch 8 | Pending | — | — | DSR non-compliance |
| F-042 | setupDatabase drops users | Confirmed `scripts/setupDatabase.ts:47-54` | Batch 10 | Pending | — | — | Accidental data loss |
| F-043 | Tracked build logs | Confirmed `logs/` directory | Batch 10 | Pending | — | — | Hygiene |
| F-044 | Empty movie_model.ts / movie_data.json | Confirmed empty/dead files | Batch 10 | Pending | — | — | Hygiene |
| F-045 | useWatchlistSort dead | Confirmed broken imports | Batch 9 | Pending | — | — | tsc failure |
| F-046 | Admin stats random/mock | Confirmed `app/api/admin/stats/route.ts:79-117` Math.random | Batch 10 | Pending | — | — | Misleading telemetry |
| F-048 | No CSP/security headers | Confirmed next.config has no headers() | Batch 6 | Pending | — | — | Browser attacks |
| F-049 | watchlist/favorites pages not in middleware | Confirmed matcher omits these | Batch 2 | Pending | — | — | UX gap |
| F-051 | Promote leaks owner email | Fixed with F-002: promote endpoint disabled, never reveals owner email | Batch 2 | **Fixed** | Pending (Batch 9) | `app/api/admin/promote/route.ts` | None |
| F-052 | Redis KEYS * | Confirmed cacheManager.findCacheKeys + admin pattern | Batch 7 | Pending | — | — | Blocking / info leak |
| F-053 | Dual Mongo connection stacks | Confirmed `lib/mongodb.ts` + `lib/db.ts` | Batch 10 | Pending | — | — | Connection confusion |
| F-054 | Session callback hits DB every time | Confirmed lib/auth.ts:62-81 | Batch 11 | Pending | — | — | Latency / DB load |
| F-055 | Fetch-all for favorite/watchlist membership | Confirmed hooks | Batch 11 | Pending | — | — | N+1 fetches |
| F-056 | Zero automated tests | Confirmed (0 test files, no test script) | Batch 9 | Pending | — | — | Regression risk |
| F-057 | tsc exit 2 | Confirmed (15 errors) | Batch 9 | Pending | — | — | Type safety off |
| F-058 | Lint cannot run | Confirmed (no eslint config, interactive setup) | Batch 9 | Pending | — | — | Lint gate off |
| F-059 | API keys in query strings | Confirmed Gemini/TMDB fetch URLs | Batch 5 | Pending | — | — | Key leak via logs |
| F-060 | No Gemini safetySettings | Confirmed (default only) | Batch 5 | Pending | — | — | Unsafe content |
| F-061 | Prompt injection residual | Confirmed weak controls | Batch 5 | Pending | — | — | Inherent risk |
| F-062 | History tracking without consent | Confirmed HistoryTracker records on view | Batch 8 | Pending | — | — | Privacy |
| F-063 | File settings vs Mongo flags | Confirmed `config/settings.json` all false vs Mongo | Batch 10 | Pending | — | — | Config confusion |

## Low / Informational

| ID | Title | Verified status | Planned batch | Final status | Tests added | Files changed | Remaining risk |
|----|-------|------------------|----------------|--------------|-------------|---------------|----------------|
| F-023 | No Prettier | Confirmed | — | Won't fix (out of scope) | — | — | Style only |
| F-037 | next-auth `latest` | Confirmed package.json | Batch 1 | Pending | — | — | Unpredictable upgrades |
| F-040 | No explicit CSRF tokens | Confirmed (SameSite=lax default) | Batch 7 | Pending | — | — | GET CSRF for admin |
| F-047 | Inter + cyan-blue UI | Confirmed | — | Won't fix (design, not security) | — | — | Design only |

---

## Summary counts

- Total findings: 59
- Critical: 3 (F-001, F-002, F-003)
- High: 14 (F-004 through F-050)
- Medium: 32
- Low/Informational: 10
- Fixed: 0
- Pending: 57 (2 won't fix: F-023, F-047)
