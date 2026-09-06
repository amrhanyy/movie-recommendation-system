# RECOVERY_BATCH_R8_REPORT.md

- **Date:** 2026-08-21 (UTC+3)
- **Scope:** R8 only - dependency advisory remediation and documentation accuracy.
- **Status:** **COMPLETE** - all quality gates exit 0; 195/195 tests pass; `npm audit --json` reports 0 vulnerabilities (exit 0); no live application service contacted; no later remediation batch started.

---

## 1. Initial Git state

- Branch: `main`, HEAD `b4e8023`.
- Dirty tree from R1-R7 preserved (not reset).
- R7 baseline verified at start: lint 0, typecheck 0, 175/175 tests, coverage 0, build 0, diff-check 0.

## 2. Initial dependency versions

`npm ls next postcss sharp` at R8 start:

- `next@15.5.23` (direct, `^15.5.4`), which bundles:
  - `postcss@8.4.31` (Next's direct dependency, nested copy)
  - `sharp@0.34.5` (Next's optional dependency, `^0.34.3`)
- `postcss@8.5.26` (direct devDependency, `^8`, deduped for autoprefixer/tailwindcss/vite)
- Two divergent postcss copies existed (8.4.31 nested in next + 8.5.26 top-level).

## 3. Initial advisory inventory

`npm audit --json` (exit 1): 3 high, 0 critical.

| Package | Severity | Direct | fixAvailable |
|---|---|---|---|
| next | high | yes | next 16.3.1 (major upgrade) |
| postcss | high | no (effect on next) | next 16.3.1 (major upgrade) |
| sharp | high | no (effect on next) | next 16.3.1 (major upgrade) |

## 4. Advisory-by-advisory analysis

### postcss (GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849)

- Vulnerable range: `<= 8.5.22` (combined advisories: XSS in CSS stringify output, arbitrary file read via attacker-controlled sourceMappingURL, incomplete fix, path traversal in previous source map auto-loading).
- Resolved copy: `8.4.31` nested inside `next` (build-time CSS tooling); top-level copy already `8.5.26`.
- Exploitability here: low-to-moderate - requires attacker-controlled CSS input to PostCSS processing; the app compiles only repo-controlled Tailwind CSS. Still remediated because a patched version exists within the same major.
- Fix: pin top-level devDependency to `8.5.26` and add `overrides.postcss: 8.5.26` so the nested Next copy resolves the patched version. No code migration.

### sharp (GHSA-f88m-g3jw-g9cj; libvips CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591)

- Vulnerable range: `< 0.35.0`. Resolved: `0.34.5` (Next's optional dependency, used for server image optimization).
- Exploitability here: the application sets `images: { unoptimized: true }` in `next.config.mjs`, so sharp is effectively unused at runtime. Still remediated (patched version exists).
- Fix: `overrides.sharp: 0.35.3`. sharp is not imported anywhere in application source (grep verified). No code migration.

### next (advisory via bundled postcss + sharp)

- Range reported: `9.3.4-canary.0 - 16.3.0-preview.10`; patched release only in the 16.x major (16.3.1).
- Analysis: Next 15.5.23 is the newest 15.x release (`npm view next dist-tags`: `backport: 15.5.23`, `latest: 16.3.1`). No patched 15.x exists. R8 rules forbid an unreviewed major framework upgrade, so Next stays on 15.5.23.
- Mitigation applied: the vulnerable components (`postcss`, `sharp`) are overridden to patched versions, removing the underlying exposure. This is why the advisory count reaches 0.
- Residual plan: a Next 16 upgrade is a separately reviewed project (breaking changes, migration, staging verification), not part of R8.

## 5. Package updates applied

`package.json` changes (smallest compatible):

1. `devDependencies.postcss`: `^8` -> `8.5.26` (exact pin; required because npm rejects an override that conflicts with a direct dependency range).
2. Added `overrides`: `{ "postcss": "8.5.26", "sharp": "0.35.3" }`.
3. `npm install` regenerated `package-lock.json` through the normal package manager (no `--force`, no `--legacy-peer-deps`, no hand-edited integrity fields). Result: "added 2 packages, removed 1 package, changed 25 packages ... found 0 vulnerabilities".

No other dependency was added, removed, or upgraded. No security package or test removed.

## 6. Final resolved versions

`npm ls next postcss sharp` (exit 0):

- `next@15.5.23` (single resolved version; `next-auth` dedupes to it)
- `postcss@8.5.26` (overridden; deduped everywhere incl. the next nested copy, autoprefixer, tailwindcss chain, vite)
- `sharp@0.35.3` (overridden)

## 7. Remaining advisories

`npm audit --json` exit 0: `{ info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }`.

## 8. Compatibility changes

- Next 15.5.23 build + full test suite verified against postcss 8.5.26 and sharp 0.35.3 (all green; see sections 20-25). No source code change was required for compatibility; no out-of-scope source file was modified.
- Note: `images.unoptimized: true` remains, so sharp is dormant at runtime regardless.

## 9. README inaccuracies found

1. Tech stack claimed **Prisma** ("Prisma & Mongoose") - Prisma is not a dependency and no prisma schema/code exists.
2. Tech stack claimed **ioredis** - the app uses the `redis` v4 client (node-redis).
3. "Redis instance (local or cloud)" listed as a hard prerequisite - Redis is optional (memory fallback).
4. Installation used `npm install` instead of reproducible `npm ci`.
5. Environment section pasted placeholder credentials inline and used http NEXTAUTH_URL without the https-production caveat; `.env.example` was not referenced.
6. **`npm run setup-db` was step 4 of normal installation** - a destructive script presented as routine setup.
7. Fake clone URL (`https://github.com/your-username/...`).
8. No security/privacy/health/CI/deployment/limitations documentation; required section structure absent.
9. No statement that tests use mocks and do not prove live integration.

## 10. README sections rewritten

Complete rewrite into the required structure: Overview, Features, Security and privacy highlights, Architecture, Technology stack, Prerequisites, Installation, Environment configuration, Running locally, Quality checks, Testing, Owner provisioning, Database operations, Redis configuration, Privacy controls, Health endpoints, CI/CD, Deployment, Operational documentation, Known limitations. (No License section: no LICENSE file exists; the absence is documented in Known limitations.)

## 11. Stack corrections

Removed Prisma and ioredis. Documented actual stack verified against package.json + imports: Next.js 15 App Router, React 18, TypeScript, NextAuth.js, MongoDB + Mongoose, `redis` v4 (node-redis) optional with bounded memory fallback, Tailwind CSS + Radix-based shadcn/ui-style components + lucide-react, Zod, React Hook Form, Vitest + React Testing Library + jsdom, Gemini REST integration, TMDB API, recharts, react-markdown, react-hot-toast/sonner. Ratings/reviews are not user features (only TMDB `vote_average` display/filters) and are not claimed. No compliance certifications or absolute-security claims.

## 12. Installation corrections

`npm ci` documented for reproducible installs; `npm install` labeled as development-only.

## 13. Database safety corrections

- `npm run setup-db` removed from normal instructions; Database operations section labels `scripts/setupDatabase.cts` destructive/potentially destructive, never automatic, never against production; local development needs no destructive drops; production indexes/TTL migrations are operator-controlled with a required verified backup; replica set recommended for account-deletion transactions.
- Owner provisioning documented as disabled HTTP endpoint + operator CLI.
- The `setup-db`/`test-redis` package scripts remain (not removed; out of scope) and are labeled advanced operator commands in Known limitations. They were not executed.

## 14. Environment documentation

README environment section: copy `.env.example` -> `.env.local`; replace placeholders; never commit; HTTPS in production; secure `NEXTAUTH_SECRET` generation; Redis optional; `REDIS_URL` precedence; `rediss://` TLS; individual vars as fallback; `redis://` + `REDIS_TLS=true` rejected; retention bounds. No real credentials anywhere.

## 15. CI audit verification

`.github/workflows/ci.yml` re-verified unchanged (no edit needed): `npm ci`; mandatory lint/typecheck/test/coverage/build gates; read-only `npm audit --audit-level=high --omit=dev` (no fix commands; no `continue-on-error`); gitleaks active; `permissions: contents: read`; no live external services. With the overrides, the audit gate now passes at zero high/critical.

## 16. Tests added (exact names)

`tests/documentation-contract.test.ts` (20 tests; previous 175 preserved; total 195):

R8 README contract:
- `does not mention Prisma`
- `does not mention ioredis`
- `does not instruct normal users to run setup-db`
- `recommends npm ci for installation`
- `refers to .env.example`
- `documents Redis as optional`
- `documents REDIS_URL precedence`
- `documents all quality commands`
- `links OPERATIONS.md, SECURITY.md, PRIVACY.md, and DEPLOYMENT_SECURITY_CHECKLIST.md`
- `contains no editor-export classes or lexical attributes`
- `does not claim live external integration testing`

R8 CI contract:
- `still uses npm ci`
- `has no continue-on-error`
- `does not run audit fix`
- `keeps gitleaks and read-only permissions`

R8 dependency versions:
- `postcss resolves outside the vulnerable range (<= 8.5.22)`
- `sharp resolves outside the vulnerable range (< 0.35.0)`
- `exactly one Next.js version resolves and it stays on the current major`
- `overrides remain declared in package.json`
- `redis client is the redis package (not ioredis) and lockfile agrees`

## 17. Proof no live application service was contacted

- No calls to MongoDB, Redis, Gemini, TMDB, Google OAuth, or YouTube. Only the npm registry was queried (`npm view`, `npm install`, `npm audit` metadata) - required dependency tooling, not application services.
- Not run: `setupDatabase.cts`, `testRedisConnection.ts`, owner-provisioning scripts, `npm audit fix`, `npm audit fix --force`.
- `.env` / `.env.local` untouched.

## 18. Security-search / documentation-search results

- `prisma` in README/docs: none. No `prisma/` directory, no prisma dependency.
- `ioredis` in README/docs/code: none; redis client is `redis` v4 (`lib/redis.ts`, `lib/redis-config.ts`).
- `setup-db` in README: only in the warning ("Do not run ... as part of normal setup") and Known limitations - never in installation steps.
- Editor artifacts in README: none (`data-lexical-text`, `fai-`, `spellcheck=`, `___` classes, `<br>` all absent; verified by test).
- Lockfile: single `node_modules/next` entry at 15.5.23; postcss/sharp at patched versions.
- No real secrets introduced (README env section uses only placeholder guidance referencing `.env.example`).

## 19. Files modified

- `package.json` (postcss pin + overrides)
- `package-lock.json` (regenerated by npm)
- `README.md` (complete rewrite)
- `OPERATIONS.md` (new section 10: dependency advisory remediation)
- `DEPLOYMENT_SECURITY_CHECKLIST.md` (manual action 14: dependency check)
- `tests/documentation-contract.test.ts` (new)
- `RECOVERY_BATCH_R8_REPORT.md` (this file)

No other source file changed; no source file needed changing for package compatibility.

## 20. Exact commands and exit codes

| Command | Exit |
|---|---|
| `node -v` | 0 (v22.17.0) |
| `npm -v` | 0 (11.5.2) |
| `npm ls next postcss sharp` | 0 |
| `npm run lint` | 0 |
| `npm run typecheck` | 0 |
| `npm test` | 0 |
| `npm run test:coverage` | 0 |
| `npm run build` | 0 |
| `npm audit --json` | 0 |
| `git diff --check` | 0 |

## 21. Lint result

Exit 0; 0 errors; pre-existing warnings only.

## 22. Type-check result

Exit 0 (`tsc --noEmit`).

## 23. Test result

Exit 0; 10 files; 195/195 passing (175 prior + 20 R8). One transient 5s timeout on two real-module import tests occurred on a single cold-start run before the dependency change was even exercised; both files passed on immediate re-run and the full suite passed cleanly (documented for transparency; no test was skipped or weakened).

## 24. Coverage result

Exit 0; 195/195 under coverage.

## 25. Build result

Exit 0; "Compiled successfully"; real lint + type validation during `next build`.

## 26. npm audit result

Exit 0; 0 info / 0 low / 0 moderate / 0 high / 0 critical / 0 total. Achieved without `npm audit fix`, without weakening the CI gate, and without a major Next upgrade.

## 27. git diff --check result

Exit 0 (CRLF/LF warnings only).

## 28. Remaining risks

- **Next major upgrade deferred:** `next` remains 15.5.23. The bundled-dependency advisory is neutralized by overrides, but any future advisory inside Next's own code (not a bundled dep) would require the separately reviewed Next 16 migration. Track upstream Next.js security announcements.
- Overrides pin exact versions; future `npm update` of autoprefixer/tailwindcss/vite must keep the override alignment (CI audit gate enforces this).
- sharp 0.35.3 is dormant (`images.unoptimized: true`) but will matter if image optimization is re-enabled; verify then.
- CSP staging-browser verification and other staging checks from R5-R7 remain pending.
- No LICENSE file exists; licensing decision pending (documented in README Known limitations).
- `setup-db` / `test-redis` scripts still exist in package.json as labeled operator commands (kept intentionally; out of R8 scope).

## 29. Manual staging actions

1. On first real CI run confirm the audit gate passes with the new lockfile and that Dependabot PRs re-run all gates.
2. Spot-check image rendering and admin charts in staging after the postcss/sharp overrides (no functional change expected; `images.unoptimized` unchanged).
3. Complete the R5-R7 staging checklist items unchanged.
4. Decide licensing before any public release.

## 30. Confirmation no later batch started

R8 is the only batch executed in this work. No R9 or later batch was started. UI/privacy/AI/Redis redesigns, database or identity migrations, and broad refactoring were not performed.
