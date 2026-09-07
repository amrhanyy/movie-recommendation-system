# Phase 3 (M3-BF) — Build Restoration: Isolate node:net (SRP) + Resurrect List-Cap Rollback

**Base:** `76d54a4` (main). **Date:** 2026-09-08. **Mandate:** diagnostic `docs/DIAGNOSTIC_M3_BUILD_FAILURE.md` ACCEPTED, OPTION A MANDATED. Zero public JSON change, zero UI change, frozen suites unmodified.

## 1 Context Confirmation + CASE 1/2 determination

| File | Summary | Exact import lines |
|------|---------|--------------------|
| `docs/DIAGNOSTIC_M3_BUILD_FAILURE.md` | Accepted diagnostic: latent `03affad` + trigger `76d54a4`, Option A recommended | n/a |
| `lib/env.ts` (HEAD) | `import { z } from "zod"` (l22); `import { BlockList } from "node:net"` (l23, REMOVED); `buildRedisConfig`, `privacy-retention` | l22–l29 |
| `lib/security/rateLimit.ts` (HEAD) | CIDR consumer | l18 `import { parseTrustedProxyCidrList, ipInCidrList, type TrustedProxyEntry } from "@/lib/env"` → retargeted |
| `instrumentation.ts` | Boot hook, unchanged | l7 `import { runtimeEnv } from './lib/env'` |
| `middleware.ts` | No runtime export; imports `next/server`, `next-auth/jwt` only; zero `lib/env` imports | n/a |
| `app/api/health/ready/route.ts` | Server-route consumer of env check (stays) | l3 `import { isCoreConfigReady } from "@/lib/env"` |
| `next.config.mjs` | Untouched (Option C forbidden) | n/a |
| `app/api/favorites/route.ts` (HEAD verbatim) | Rollback block dead code | l113 `const isUpsert = !!(favorite as Record<string, unknown>).upserted;` + l114 `if (isUpsert) {` … l117 `deleteOne({ userId…, itemId…, type… })` |
| `app/api/watchlist/route.ts` (HEAD verbatim) | Same dead code | l114 `const isUpsert = !!(item as Record<string, unknown>).upserted;` + l115 `if (isUpsert) {` … l118 `deleteOne({ userId…, itemId…, type… })` |

CIDR-symbol import audit (EVERY test file):
- `tests/ratelimit-ip-security.test.ts:84` — `const { parseTrustedProxyCidrList, ipInCidrList } = await import('@/lib/env')` (NON-frozen → retargeted to `@/lib/security/proxy-cidr`).
- `tests/documentation-contract.test.ts` — zero hits for `lib/env|proxy-cidr|TrustedProxy|ipInCidr|parseTrusted|blockList`.
- `tests/operational-security.test.ts:9` — `} from '@/lib/env'` imports `validateEnv, isCoreConfigReady, MIN_SECRET_LENGTH` ONLY (no CIDR symbols); l22 mock spreads `...actual`; l59 `import { isCoreConfigReady as readyEnvCheck } from '@/lib/env'`.
- Full `tests/` grep for `parseTrustedProxyCidrList|ipInCidrList|blockListFor|TrustedProxyEntry` → only `tests/ratelimit-ip-security.test.ts` + `lib/security/rateLimit.ts` + `lib/env.ts` (source of move).

**Determination: CASE 1.** No frozen suite imports CIDR symbols from `@/lib/env`. Proceed. No re-export added (forbidden).

## 2 Root-cause recap + fix with file:line

Verbatim diagnostic quotes:
- "Latent hazard `03affad` (top-level `import { BlockList } from "node:net"` in `lib/env.ts`) combined with new entry point `76d54a4` (`instrumentation.ts` importing `./lib/env` at module top)".
- "the `NEXT_RUNTIME === 'nodejs'` guard cannot help because webpack resolves `node:net` at compile time when bundling `instrumentation.ts` … regardless of runtime branching."
- "HEAD code (`app/api/favorites/route.ts:113`, `app/api/watchlist/route.ts:114`): `const isUpsert = !!(doc as Record<string, unknown>).upserted` … without `includeRawResult` … `.upserted` is always `undefined` → `isUpsert` always false → rollback block is dead code."

Fix:
- `lib/security/proxy-cidr.ts` (new, 1–130): `import { BlockList } from "node:net"` (l10); `TrustedProxyEntry` (l16); `parseTrustedProxyCidrs` (l37); `blockListFor` (l80); `ipInCidrList` (l98); `parseTrustedProxyCidrList` (l119); `trustedProxyMatches` (l123). Moved verbatim in behavior from `lib/env.ts`.
- `lib/env.ts`: deleted l23 `node:net` import + moved block (former l109–l230); `validateEnv` CIDR validation (pure string: format, prefix bounds, `/0`/`::/0`/bare `0.0.0.0`/`::` reject) kept, zero `node:` imports, zero `proxy-cidr` imports.
- `lib/security/rateLimit.ts:18`: `… from "@/lib/security/proxy-cidr"`.
- `tests/ratelimit-ip-security.test.ts:84`: `await import('@/lib/security/proxy-cidr')`.
- `instrumentation.ts`: unchanged (`./lib/env`).
- `app/api/favorites/route.ts:96–131`: `findOneAndUpdate(…, { upsert: true, new: true, includeRawResult: true })` cast via narrow local `FavoritesUpsertResult` (`lastErrorObject?: { upserted?: unknown }; value?: { _id: unknown } | null`), `isUpsert = !!res.lastErrorObject?.upserted`, `doc = res.value`; rollback `deleteOne({ _id: doc._id })` only when `isUpsert && countAfter > 500 && doc`; returns `doc`.
- `app/api/watchlist/route.ts:96–131`: identical shape with `WatchlistUpsertResult`.
- `tests/edge-import-contract.test.ts` (new): asserts `lib/env.ts` zero `node:` + no `proxy-cidr` string, `instrumentation.ts`/`middleware.ts` no `node:net`, sole `node:net` importer under `lib/`+`app/` is `lib/security/proxy-cidr.ts`.
- `tests/list-capacity-security.test.ts`: `deleteOne` mock added to hoisted mocks + both model mocks; rawResult-shaped defaults; (a) `upserted:'new-id'` + 499→501 → 400 + `deleteOne({ _id: 'new-id' })`; (b) `lastErrorObject:{n:1}` + 499→501 → 200 + `deleteOne` not called; all 7 pre-existing tests green (9 total in suite).

## 3 Modified/created files

Modified: `lib/env.ts` (−124 moved lines), `lib/security/rateLimit.ts` (1 import line), `app/api/favorites/route.ts`, `app/api/watchlist/route.ts`, `tests/list-capacity-security.test.ts`, `tests/ratelimit-ip-security.test.ts` (1 import line).
Created: `lib/security/proxy-cidr.ts`, `tests/edge-import-contract.test.ts`, `docs/PHASE_3_M3_BUILD_FIX_REPORT.md` (this file).
Untouched: `next.config.mjs`, `middleware.ts`, `instrumentation.ts`, `package.json`, `package-lock.json`, frozen suites, the 9 neutral untracked owner docs.

## 4 Tests added/changed + results

| Suite | Tests | Result |
|---|---|---|
| `tests/edge-import-contract.test.ts` (new) | 3 | PASS |
| `tests/list-capacity-security.test.ts` (+2 rollback) | 9 | PASS |
| `tests/ratelimit-ip-security.test.ts` (import retarget) | 11 | PASS |
| `tests/operational-security.test.ts` (frozen, UNMODIFIED) | 29 | PASS |
| `tests/documentation-contract.test.ts` (frozen, UNMODIFIED) | 20 | PASS |
| Full `npm test` (default timeout, zero exclusions) | 300/300, 28 files | PASS exit 0 |

## 5 Commands + exit codes + tails

| # | Command | Exit | Tail |
|---|---|------|------|
| 1 | `npm run lint` | 0 | `96 problems (0 errors, 96 warnings)` |
| 2 | `npm run typecheck` | 0 | clean (`tsc --noEmit`) |
| 3 | `npx vitest run tests/edge-import-contract tests/list-capacity-security tests/ratelimit-ip-security tests/documentation-contract tests/operational-security` | 0 | `5 passed, 72 passed` |
| 4 | `npm test` (full, default timeout) | 0 | `Test Files 28 passed (28) / Tests 300 passed (300)` |
| 5 | `npm run build` (CI-placeholder env, PRIMARY GATE) | 0 | `✓ Compiled successfully in 76s / Linting and checking validity of types ... / Collecting page data ... / Generating static pages (49/49) / Finalizing page optimization ... / Collecting build traces ... / Route (app) … ƒ Middleware 56.9 kB / First Load JS shared by all 102 kB` |
| 6 | `npm audit --omit=dev --audit-level=high` | 0 | `found 0 vulnerabilities` |
| 7 | `rg node:net` (source) | 0 | sole importer `lib/security/proxy-cidr.ts:10`; `lib/env.ts` zero `node:` imports |
| 8 | `rg proxy-cidr` | 0 | importers: `lib/security/rateLimit.ts:18`, `tests/ratelimit-ip-security.test.ts:84` (+ contract test self-ref) |
| 9 | `git status --porcelain -uall` (pre-commit) | 0 | 6 modified + 2 new source/test files; 9 neutral untracked untouched; no `next.config.mjs`/`package*` drift |

Build tail (verbatim sections): `✓ Compiled successfully in 76s`, `Collecting page data ...`, `Generating static pages (49/49)`, `Finalizing page optimization ...`, `Collecting build traces ...`, route table with `ƒ Middleware 56.9 kB`, `First Load JS shared by all 102 kB`. No `UnhandledSchemeError`.

## 6 rg proofs + out-of-scope proof

- `node:net` across `lib/ app/ instrumentation.ts middleware.ts` → exactly ONE hit: `lib/security/proxy-cidr.ts:10 import { BlockList } from "node:net"`.
- `from "node:` across `lib/` → `lib/auth.ts:3` (`node:crypto`), `lib/security/proxy-cidr.ts:10` (`node:net`), `lib/security/rateLimit.ts:15` (`node:crypto`) — `lib/env.ts` absent.
- `proxy-cidr` importers → `lib/security/rateLimit.ts` + non-frozen `tests/ratelimit-ip-security.test.ts` only (plus the contract test asserting the invariant).
- `lib/env.ts` has zero `node:` imports and zero `proxy-cidr` references (contract-tested).
- Out-of-scope proof: `git diff --name-only` = the 6 files above only; `next.config.mjs`, `middleware.ts`, `instrumentation.ts`, `package.json`, `package-lock.json`, `app/api/health/ready/route.ts`, frozen suites unchanged; 9 neutral owner docs (`docs/DEPLOYMENT_SECURITY_CHECKLIST.md`, `docs/DIAGNOSTIC_REPORT.md`, `docs/FIX_PLAN.md`, `docs/IMPLEMENTATION_COMPLIANCE_REPORT.md`, `docs/INTERRUPTED_REMEDIATION_RECOVERY_REPORT.md`, `docs/OPERATIONS.md`, `docs/PROJECT_ARCHITECTURE.md`, `docs/REMEDIATION_STATUS.md`, `docs/SECURITY.md`) never deleted/committed/modified — phase-induced worktree delta is zero after commits.

## 7 Residual risks + CI run id + manual checklist

- `node:crypto` remains in `lib/auth.ts`/`lib/security/rateLimit.ts`/`app/api/ai-recommendations/route.ts` — webpack-safe stdlib, no action.
- Rollback is still pre-check + post-rollback (TOCTOU window narrowed, not eliminated); concurrent overshoot now actually rolls back ONLY the overshooting `_id`.
- TTL indexes still deferred (forbidden to apply here); monitor `UsageQuota.expiresAt` in staging.
- Next caret `^15.5.9` → `15.5.23` drift remains (pin forbidden); contract test guards recurrence across upgrades.
- CI run id: PENDING-OWNER (`gh` check recorded below; no id fabricated).
- Manual checklist: [ ] observe green CI pipeline run; [ ] smoke Vercel preview (auth, favorites/watchlist cap, AI routes, health/ready); [ ] confirm `UsageQuota` TTL expiry in staging; [ ] load-test list cap with concurrent POSTs; [ ] known-open from M1: signOut JWT replay → 401 still open (unchanged by this hotfix).

## 8 Decision Log

| # | Decision | Rationale |
|---|---|---|
| 1 | Option A (move, not config exception/inline check) | SRP: env validation is not network address parsing; fixes all current + future edge-safe importers at once |
| 2 | No re-export from `lib/env` | Any re-export pulls `node:net` back into the instrumentation bundle (CASE-2 guard) |
| 3 | `deleteOne({ _id })` not filter | Update-path documents must NEVER be deleted; `_id` targets ONLY the overshooting insert |
| 4 | Narrow local `…UpsertResult` type, `as unknown as T` once | Typed `lastErrorObject.upserted` access without `as any` (mandate) |
| 5 | Contract test via fs-reads, path-normalized | Compile-hazard tripwire survives Windows/Posix separators; fails loudly on any new `node:net` importer |
| 6 | Max 2 commits, report in commit 2 | Scope lock + reviewable atomic history |

## 9 Report Artifact paths

- `docs/PHASE_3_M3_BUILD_FIX_REPORT.md` (this file)
- `docs/DIAGNOSTIC_M3_BUILD_FAILURE.md` (accepted diagnostic)
- `lib/security/proxy-cidr.ts`
- `tests/edge-import-contract.test.ts`
