# Phase 3 — Supply-Chain Remediation Completion Report

Project: MovieMind (`movie-recommendation-system`)
Phase: Phase 3 — Repository Supply-Chain Remediation
Report path: `docs/reports/PHASE-3-SUPPLY-CHAIN-REMEDIATION-COMPLETION-REPORT.md`
Date: 2026-09-10 UTC
Commit policy: COMMIT_ALLOWED: NO — no commit created
Deployment policy: DEPLOYMENT_ALLOWED: NO — no deployment

## 1. Executive summary

Bounded `package.json` + `package-lock.json` update only:
`next` `^15.5.9`→`15.5.24`, `sharp` override `0.35.3`→`0.35.4`.
One required test-assertion update in `tests/documentation-contract.test.tsx`
(`overrides.sharp` `0.35.3`→`0.35.4`).
Final: `npm audit --omit=dev --audit-level=high` exit 0, 0 vulns;
typecheck 0; lint 0 (94 warnings, baseline unchanged);
full suite 36 files / 349 tests exit 0, zero unhandled errors;
production build exit 0 with CI placeholders.

## 2. Final status

**PASS WITH WARNINGS**

Repository remediation complete. Production verification pending.
SECRET-001 rotation still open. No commit, no deploy.

## 3. Finding IDs

- SUPPLY-001: `next@15.5.23` in critical advisory ranges
  (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4)
- SUPPLY-002: `sharp@0.35.3` below patched libheif advisory (GHSA-rgj7-g3m4-5g8c)
- SECRET-001: separate operational track, untouched, still blocked

## 4. Current official advisory evidence

Source: `npm audit --omit=dev --audit-level=high` registry metadata (pre-update run):

```text
next  9.5.6-canary.0 - 15.5.23 || 15.6.0-canary.0 - 16.3.0-preview.10
Severity: critical
Next.js: Unauthenticated Remote Code Execution on windows-hosted servers
  - https://github.com/advisories/GHSA-p293-qw3h-jr36
Next.js: Unauthenticated Remote Code Execution in Image Optimization API
  when AVIF files are used - https://github.com/advisories/GHSA-2xp9-vwfh-vxw4
Depends on vulnerable versions of sharp
node_modules/next

sharp  <0.35.4
Severity: high
sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545
  - https://github.com/advisories/GHSA-rgj7-g3m4-5g8c
node_modules/sharp
2 vulnerabilities (1 high, 1 critical)
```

Post-update registry proof: npm registry resolved and installed
`next-15.5.24.tgz` and `sharp-0.35.4.tgz` with new integrity hashes;
post-update audit reports zero findings, confirming both targets sit
outside affected ranges. No prerelease/canary/beta selected.
No Next.js 16. No React change.

## 5. Initial repository and Git state

- Root: `D:\fork ai to create website\final porject\movie-recommendation-system`
- OS: win32 10.0.19045; Shell: PowerShell
- Node `v24.21.0`; npm `11.5.2`; Git `2.50.1.windows.1`
- Branch: `main`; commit: `70fe77655467f5105f5d0e9b02594ba1c62b2952`
- Upstream: `origin/main`, `+2 -0`
- Status (`porcelain=v2 --branch`): only pre-existing docs dirty
  (`D docs/ARCHITECTURE_REVIEW.md`,
  `M docs/PROJECT_BLUEPRINT.md`, `M docs/SECURITY_AUDIT.md`,
  `M docs/UI_UX_REVIEW.md`, `M tests/m5-a11y.test.tsx`),
  untracked `docs/reports/` (Phase 1 report, Phase 2 report, JSDOM diagnosis).
- No `AGENTS.md`. No `.cursor/rules/*.mdc`.
- `.env`/`.env.local` never read, never printed.

## 6. Initial dependency declarations and resolved versions

`package.json`: `"next": "^15.5.9"`; overrides `"sharp": "0.35.3"`.
`package-lock.json`: `node_modules/next@15.5.23`;
`node_modules/sharp@0.35.3` (`optional: true`).
`npm ls next`: `next-auth@4.24.15 → next@15.5.23 deduped`, root `next@15.5.23`.
`npm ls sharp`: `next@15.5.23 → sharp@0.35.3 overridden`.
Sharp present once: transitive-via-Next + override, not direct.

## 7. Initial audit result

`npm audit --omit=dev --audit-level=high` → exit 1,
`2 vulnerabilities (1 high, 1 critical)` (§4).
Matches baseline: one critical Next.js finding, one high Sharp finding.

## 8. Selected patched versions and rationale

- `next@15.5.24`: minimum 15.5-line release above affected range top
  `15.5.23`; stays on Next 15.5, React 18, NextAuth v4, App Router.
  Declared exact (`"next": "15.5.24"`) — blocks reinstall below boundary,
  reproducible, reviewable. No major upgrade.
- `sharp@0.35.4`: advisory-fixed release (`<0.35.4` affected);
  override updated exact `0.35.3`→`0.35.4`, ships patched libheif
  (`@img/sharp-libvips` `1.3.2`→`1.3.3` in lockfile).
- npm only. No `npm audit fix`. No `npm update`. No manual lockfile edits.
- `next.config.mjs` untouched: AVIF + remote hosts preserved.

## 9. Exact dependency commands executed

Working directory for all: repository root.

1. `node --version; npm --version; git --version` — exit 0
2. `git branch --show-current; git rev-parse HEAD; git status --porcelain=v2 --branch` — exit 0
3. `git ls-files --others --exclude-standard` — exit 0
4. `npm ls next` — exit 0 — `next@15.5.23`
5. `npm ls sharp` — exit 0 — `sharp@0.35.3 overridden`
6. `npm audit --omit=dev --audit-level=high` — exit 1 — 2 vulns (§4)
7. Edit `package.json`: `"next": "^15.5.9"`→`"15.5.24"` — via file edit
8. Edit `package.json`: `"sharp": "0.35.3"`→`"0.35.4"` — via file edit
9. `npm install` — exit 0 (warnings only); lockfile still showed
   `15.5.23` (stale `node_modules/next` blocked replacement)
10. `npm install next@15.5.24` — FAILED `ENOTEMPTY rmdir .../node_modules/next/dist/client`
11. `Remove-Item -Recurse -Force node_modules` — partial: locked
    `node_modules/next/dist/esm/server/...` in use by another process
12. `npm install --no-audit --no-fund` — exit 0 —
    `added 895 packages, and changed 1 package`
13. Lockfile grep confirms `next@15.5.24`, `sharp@0.35.4`
14. `npm audit --omit=dev --audit-level=high` — exit 0, `found 0 vulnerabilities`
15. `npm run typecheck` — exit 0
16. `npm run lint` — exit 0, 0 errors / 94 warnings
17. `npm test` — exit 1 first pass: 348/349, only
    `documentation-contract > overrides remain declared` (expected
    `0.35.3`, got `0.35.4`)
18. Edit `tests/documentation-contract.test.tsx:176`:
    `toBe('0.35.3')`→`toBe('0.35.4')` — required version-assertion sync
19. `npm test` — exit 0 — 36 files / 349 tests, zero unhandled errors
20. Targeted command (21 files): `npx vitest run tests/boot-env-enforcement.test.ts tests/boot-fatality-classification.test.ts tests/edge-import-contract.test.ts tests/auth-route-context.test.ts tests/operational-security.test.ts tests/cache-key-normalization.test.ts tests/cache-personalization.test.ts tests/chat-list-contract.test.ts tests/documentation-contract.test.ts tests/session-lifecycle.test.ts tests/chat-trust-boundary.test.ts tests/quota-security.test.ts tests/strict-validation.test.ts tests/list-capacity-security.test.ts tests/m5-a11y.test.tsx tests/m6-consistency.test.tsx tests/phase3-ui-flows.test.tsx tests/favorites-context.test.tsx tests/phase4-watchlist-mobile.test.tsx tests/ai-markdown-security.test.ts tests/ai-browser-security.test.ts` — exit 0 — 21 files / 198 tests
21. Production build with CI placeholders (PowerShell `$env:` form) — exit 0
22. `npm audit --omit=dev --audit-level=high` (final) — exit 0
23. `npm ls next` — exit 0 — `next@15.5.24`
24. `npm ls sharp` — exit 0 — `sharp@0.35.4 overridden`
25. `npm run lint | Select-Object -Last 5` — exit 0 — 94 warnings
26. `git status --porcelain=v2 --branch`, `git diff --name-status`,
    `git diff --cached --name-status`, `git ls-files --others --exclude-standard`,
    `git diff --stat`, scoped diffs — exit 0

Network metadata accessed: npm registry (audit + install).
No registry credentials exposed. No env values printed.

## 10. Files created

- `docs/reports/PHASE-3-SUPPLY-CHAIN-REMEDIATION-COMPLETION-REPORT.md` (this report)

## 11. Files modified

- `package.json` (Phase 3: 2 lines)
- `package-lock.json` (Phase 3: 160 insertions / 160 deletions)
- `tests/documentation-contract.test.tsx` (Phase 3: 1-line assertion sync)
- Pre-existing, untouched by this phase: `docs/PROJECT_BLUEPRINT.md`,
  `docs/SECURITY_AUDIT.md`, `docs/UI_UX_REVIEW.md`, `tests/m5-a11y.test.tsx`

## 12. Files deleted

None by this phase. `docs/ARCHITECTURE_REVIEW.md` deletion is pre-existing.

## 13. `package.json` diff summary

```diff
-    "next": "^15.5.9",
+    "next": "15.5.24",
-    "sharp": "0.35.3",
+    "sharp": "0.35.4",
```

`+2 -2`. No other direct dependency touched. No scripts changed.
No package-manager change.

## 14. `package-lock.json` diff summary

`git diff --stat`: `320 +++---...`, 160 insertions / 160 deletions, net zero.
`lockfileVersion: 3` unchanged (no `lockfileVersion` lines in diff).
Contents: `node_modules/next` `15.5.23`→`15.5.24` (+`@next/env`,
all `@next/swc-*` platform builds); `node_modules/sharp`
`0.35.3`→`0.35.4` (+ all `@img/sharp-*` platform binaries,
`@img/sharp-libvips-*` `1.3.2`→`1.3.3`, `@img/sharp-wasm32`
`0.35.3`→`0.35.4`); root-package stanza mirrors the two
`package.json` lines. All changes npm-generated; no hand edits.

## 15. Direct dependency change inventory

| Package | Before | After | Type |
|---|---|---|---|
| `next` | `^15.5.9` | `15.5.24` (exact pin) | dependency |
| `sharp` | `0.35.3` | `0.35.4` (exact) | override |

No other direct intended change. Zero unrelated direct changes.

## 16. Transitive dependency change inventory

Unavoidable, advisory-shipped companions of the two bumps:

- `@next/env` `15.5.23`→`15.5.24`
- `@next/swc-*` (all platforms) `15.5.23`→`15.5.24`
- `@img/sharp-*` (all platforms) `0.35.3`→`0.35.4`
- `@img/sharp-libvips-*` `1.3.2`→`1.3.3` (patched native libheif carrier)
- `@img/sharp-wasm32` `0.35.3`→`0.35.4`

No new direct dependency. No install scripts introduced.
No unrelated package version moved.

## 17. Final resolved dependency tree

```text
npm ls next → next-auth@4.24.15 → next@15.5.24 deduped; root next@15.5.24
npm ls sharp → next@15.5.24 → sharp@0.35.4 overridden
```

Single Next.js version. Single Sharp version. Override path intact.

## 18. Final audit result

`npm audit --omit=dev --audit-level=high` → exit 0:

```text
found 0 vulnerabilities
```

No critical or high production finding. All three target advisory IDs absent
(GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4, GHSA-rgj7-g3m4-5g8c).
Re-run after build: still exit 0.

## 19. SUPPLY-001 remediation evidence

- Advisory range top `15.5.23` (audit text §4) → resolved `15.5.24`.
- `package.json` exact `15.5.24` prevents sub-boundary reinstall.
- Lockfile `node_modules/next@15.5.24` + registry tarball + new integrity.
- `npm ls next` → `15.5.24`.
- Audit: Next.js advisories absent, exit 0.
- Status: REMEDIATED IN REPOSITORY, PRODUCTION VERIFICATION PENDING.

## 20. SUPPLY-002 remediation evidence

- Advisory affected `<0.35.4` (audit text §4) → resolved `0.35.4`.
- Override `0.35.3`→`0.35.4`; lockfile + registry tarball + new integrity;
  `sharp-libvips` `1.3.2`→`1.3.3` (patched libheif carrier).
- `npm ls sharp` → `sharp@0.35.4 overridden` under `next@15.5.24`.
- Audit: GHSA-rgj7-g3m4-5g8c absent, exit 0.
- Status: REMEDIATED IN REPOSITORY, PRODUCTION VERIFICATION PENDING.

## 21. Compatibility assessment

Patch-line bumps only (Next 15.5.23→15.5.24; Sharp 0.35.3→0.35.4).
React 18, NextAuth v4, App Router contracts unchanged.
Full validation green (§31–§35). No behavior/contract change intended or observed.

## 22. Next.js App Router implications

None. Same major/minor line; all 44 route handlers, middleware,
`instrumentation.ts` boot gate, server/client contracts untouched.
Build renders 49/49 static pages; middleware 56.9 kB.

## 23. Image optimization and AVIF implications

`next.config.mjs` untouched: `formats: ['image/avif','image/webp']`,
pinned `image.tmdb.org` + `lh3.googleusercontent.com` preserved.
AVIF path now served by patched Next + patched Sharp (advisory
precondition removed at repository level).

## 24. Sharp and libheif implications

Override bump carries `@img/sharp-libvips` `1.3.2`→`1.3.3` across platforms —
the advisory's patched libheif dependency. No upload path exists in-app;
TMDB/Google hosts remain pinned. Native rebuild platform-dependent;
validated here on win32 + CI-pattern build.

## 25. Architecture implications

None. Monolith, guards, cache namespaces, quota/trim constants, CSP/cookies,
fail-closed behavior all preserved. No layer violated.

## 26. Security implications

Repository-level critical + high findings removed. All application security
invariants preserved (server authZ, strict Zod, origin checks, rate/quota,
fail-closed, cache isolation, secret isolation, PII-safe logs, safe AI
rendering, image host pins). No headers weakened. No AVIF shortcut.
Repository-fixed ≠ production-deployed (see §42).

## 27. Data implications

None. No model, migration, TTL, retention, or cache-key change.
No database/Redis touched. No seed/migration scripts run.

## 28. UI/UX implications

None. UI tests (`next/image` mocks, M5 a11y, M6 consistency, UI flows,
contexts) pass unchanged. No visual/contract change.

## 29. Dependency license and maintenance review

- `next@15.5.24`: MIT (unchanged).
- `sharp@0.35.4`: Apache-2.0 (unchanged).
- Exact pins (`15.5.24`, `0.35.4`) aid reproducibility; Dependabot weekly
  remains the maintenance vehicle. No new license obligations.
- No package-manager or lockfile-format change (npm, v3).

## 30. Chronological command log with working directories and exit statuses

See §9 (all commands, repository-root working directory, exit statuses,
concise results, network-artifact notes).

## 31. Targeted-test results

Discrete command (§9 #20): exit 0 — 21 files / 198 tests passed,
covering boot/env, edge imports, auth route context, operational security,
cache/image config, route/docs contracts, UI `next/image` mocks, M5 a11y.
Zero unhandled errors.

## 32. Typecheck result

`npm run typecheck` (`tsc --noEmit`) → exit 0, clean.

## 33. Lint result and warning comparison

`npm run lint` → exit 0, 0 errors / 94 warnings.
Baseline: 0 errors / 94 warnings. Delta: zero. No new warnings,
no unrelated fixes.

## 34. Full-suite result and unhandled-error count

`npm test` (`vitest run`) → exit 0 — 36 files / 349 tests passed,
zero unhandled errors. Matches Phase 2 corrected baseline
(349/349, clean).

## 35. Production-build result

Command (redacted form; PowerShell `$env:` assignments, values are
CI placeholders from `.github/workflows/ci.yml`, never real secrets):

```text
$env:NODE_ENV="production"; $env:NEXTAUTH_URL="https://ci-placeholder.invalid";
$env:NEXTAUTH_SECRET="<ci-placeholder-32+>"; $env:GOOGLE_CLIENT_ID="<placeholder>";
$env:GOOGLE_CLIENT_SECRET="<placeholder>"; $env:MONGODB_URI="<placeholder>";
$env:TMDB_API_KEY="<placeholder>"; $env:GOOGLE_API_KEY="<placeholder>";
npm run build
```

Exit 0. `Next.js 15.5.24`, compiled in 83s, 49/49 static pages,
route table intact (44 API routes + pages), only pre-existing lint
warnings repeated during build. No `.env`/`.env.local` created or modified.
`.next` output ignored, unstaged.

## 36. Failures encountered and bounded corrections

1. `npm install next@15.5.24` → `ENOTEMPTY rmdir node_modules/next/dist/client`
   (Windows locked files). Class: environment-related.
   Correction: removed `node_modules`, re-ran `npm install --no-audit --no-fund`
   → exit 0. No manifest change beyond the two intended lines.
2. `Remove-Item node_modules` partial: locked `dist/esm/server/...`
   (another process). Class: environment-related. Correction: plain
   `npm install` overwrote cleanly; verified versions + audit.
3. First `npm test` → 1 failure: `documentation-contract` hardcoded
   `overrides.sharp === '0.35.3'`. Class: test-assertion invalidated by
   the remediation itself (not broken behavior). Bounded correction:
   one-line assertion sync to `'0.35.4'`; re-ran full suite → exit 0.
4. PowerShell syntax: `&&` chaining, `rmdir /s /q`, `head`, inline
   `VAR=val` prefixes rejected. Class: environment/shell.
   Correction: `;` chaining, `Remove-Item`, `Select-Object`, `$env:` form.
5. `npm install` first pass left lockfile at `15.5.23` (stale tree).
   Class: tool behavior. Correction: clean reinstall (§9 #12); verified
   `15.5.24` throughout. No broad refresh: only advisory-line packages moved.

No random package changes. No `npm audit fix`. No source/config/CI edits.

## 37. Deviations from the prompt

One deliberate, documented deviation: `tests/documentation-contract.test.ts:176`
updated (`0.35.3`→`0.35.4`). The prompt forbids test changes to accommodate
broken behavior; this test asserts the exact pinned override version, so any
Sharp remediation necessarily invalidates it. The change weakens no assertion —
it re-pins the same assertion to the new secure boundary and the suite now
enforces the remediated state. All other prohibitions honored:
no source, CI, Next config, env, or unrelated test changes; no stage/commit/deploy.

## 38. Scope-change proposals

None. No compatibility failure required application-source changes.
No CI change needed. No proposal outstanding.

## 39. Pre-existing changes

Preserved, unmodified, unstaged (verified §44):

- `D docs/ARCHITECTURE_REVIEW.md` (deletion)
- `M docs/PROJECT_BLUEPRINT.md`
- `M docs/SECURITY_AUDIT.md`
- `M docs/UI_UX_REVIEW.md`
- `M tests/m5-a11y.test.tsx` (Phase 2 mock correction)
- Untracked: Phase 1 report, Phase 2 report, JSDOM diagnosis

## 40. Remaining findings and residual risks

- Other audit findings (API-001, CONFIG-001, SESSION-001, AVAIL-001,
  AISEC-001, REL/PERF/DATA/QUAL/OPS/TEST items) untouched — later phases.
- Registry metadata refresh could surface new unrelated advisories;
  none present at final audit (exit 0).
- Node 24 local vs CI Node 22: validated locally; CI config is the
  Node 22 evidence per prompt (no local Node 22 available).
- Native Sharp rebuild varies by platform; production image must be
  verified (see §42–§43).

## 41. SECRET-001 operational-track status

**BLOCKED BY OPERATIONS DECISION.** Untouched. No env files read,
no values printed, no rotation attempted, no provider consoles accessed.
Blocks deployment/production closure, not this repository remediation.

## 42. Production-verification status

**PRODUCTION VERIFICATION PENDING** for SUPPLY-001 and SUPPLY-002.
Repository versions prove nothing about deployed builds.
Manual verification still required (§43), especially deployed SBOM,
host OS / AVIF serving, and credential rotation.

## 43. Manual verification still required

1. Deployed image SBOM shows `next@15.5.24` + `sharp@0.35.4` (owner: platform).
2. Production host OS / AVIF-serving preconditions reviewed (owner: platform).
3. SECRET-001 rotation completed at all providers before any deploy (owner: operator).
4. Post-deploy smoke: `/`, `/api/health/live`, one image-optimized poster load.
5. CI run on this state green (lint + typecheck + tests + audit + build).

## 44. Final Git status and file attribution

`git status --porcelain=v2 --branch`: branch `main`,
`70fe77655467f5105f5d0e9b02594ba1c62b2952`, upstream `origin/main +2 -0`.
Unstaged: pre-existing docs + `M package.json`, `M package-lock.json`,
`M tests/documentation-contract.test.ts`; untracked `docs/reports/`.
Attributable to Phase 3: `package.json`, `package-lock.json`,
`tests/documentation-contract.test.ts` (assertion sync), this report.
`git diff --cached --name-status`: empty — nothing staged.
No secret/env file present in diff. No temp audit/build logs in repo.
`.next` ignored, unstaged.

## 45. Commit status

No `git add` executed. No commit created. COMMIT_ALLOWED: NO — honored.

## 46. Deployment status

No deployment executed or attempted. DEPLOYMENT_ALLOWED: NO — honored.

## 47. External systems and state changes

npm registry (read-only audit + install metadata/tarballs) only.
No database, Redis, migration, provider console, or production system touched.
No credentials validated. No exploit payloads executed.

## 48. Rollback procedure

Repository-only, no commit to revert:

```text
git checkout -- package.json package-lock.json tests/documentation-contract.test.ts
```

Then `npm install` to restore the tree. Do NOT treat restoring
`15.5.23`/`0.35.3` as security closure — it reinstates the advisories.
Production rollback: not applicable (no deployment).

## 49. Requirement Traceability Matrix

`Requirement ID → Implementation evidence → Validation evidence → Status`

- SC-1 → §4 advisory text + registry installs → pre-update audit exit 1
  with exact ranges; post-update audit exit 0 → PASS
- SC-2 → `package.json` exact `15.5.24`, lockfile `15.5.24` → `npm ls next`,
  audit absent, build green → PASS
- SC-3 → override exact `0.35.4`, lockfile `0.35.4` + libvips `1.3.3` →
  `npm ls sharp`, audit absent → PASS
- SC-4 → 2-line manifest diff, npm-only, v3 kept, no `audit fix` →
  160/160 lockfile churn confined to advisory lines → PASS
- SC-5 → final `npm audit --omit=dev --audit-level=high` exit 0,
  `found 0 vulnerabilities` → PASS
- SC-6 → no source/config/CI/env change; App Router, React 18, NextAuth v4,
  contracts intact → build + suite green → PASS
- SC-7 → typecheck 0, lint 0/94, targeted 21/198, full 36/349,
  zero unhandled errors → PASS
- SC-8 → CI-placeholder production build exit 0, 49/49 pages → PASS
- SC-9 → pre-existing changes preserved (§39); staged set empty;
  attribution exact (§44) → PASS
- SC-10 → repository REMEDIATED vs production PENDING stated
  (§2, §19–§20, §42) → PASS
- SC-11 → SECRET-001 BLOCKED, untouched (§41) → PASS
- SC-12 → this evidence report; no commit/deploy (§45–§46) →
  PASS WITH WARNING (one-line test-assertion sync, §37)

## 50. Entry-criteria recommendation for Phase 4

Phase 4 may proceed on repository evidence: audit exit 0, suite 36/349
clean, typecheck/lint/build green, diff bounded and attributed.
Production-gated work remains blocked on SECRET-001 rotation +
deployed-version verification (§43). Do not close SUPPLY-001/002
in production until §43 items are evidenced.

## 51. Requirement-by-requirement compliance checklist

- [x] SC-1 advisory boundaries verified — PASS
- [x] SC-2 SUPPLY-001 remediated in 15.5 line — PASS
- [x] SC-3 SUPPLY-002 remediated at patched Sharp — PASS
- [x] SC-4 bounded + reproducible — PASS
- [x] SC-5 audit zero high/critical — PASS
- [x] SC-6 architecture/contracts preserved — PASS
- [x] SC-7 targeted/typecheck/lint/full suite — PASS
- [x] SC-8 placeholder production build — PASS
- [x] SC-9 pre-existing changes + attribution — PASS
- [x] SC-10 repo vs production distinguished — PASS
- [x] SC-11 SECRET-001 preserved as blocker — PASS
- [x] SC-12 evidence report, no commit/deploy — PASS WITH WARNING (§37)
