# BUG-PRODUCTION-DEPENDENCY-AUDIT-HIGH — Diagnosis (Phase 10, Step 1)

**Finding ID:** DEP-AUDIT-001
**Bug ID:** BUG-PRODUCTION-DEPENDENCY-AUDIT-HIGH
**Phase:** Phase 10 — Production Dependency Vulnerability Diagnosis (Step 1 of 2)
**Prompt type:** READ-ONLY DEPENDENCY SECURITY DIAGNOSTIC
**Risk level:** HIGH
**Diagnostic status:** PASS
**Policies:** COMMIT_ALLOWED: NO · DEPLOYMENT_ALLOWED: NO ·
PACKAGE_CHANGES_ALLOWED: NO · LOCKFILE_CHANGES_ALLOWED: NO

> Path spelling note: the request offered both
> `BUG-PRODUCTION-DEPENDENDENCY-AUDIT-HIGH-DIAGNOSIS.md` and the canonical
> corrected `BUG-PRODUCTION-DEPENDENCY-AUDIT-HIGH-DIAGNOSIS.md`. This report
> uses the canonical corrected spelling.

## 1. Executive summary

The mandatory production audit gate is **green**: `npm audit --omit=dev
--audit-level=high` — the exact command the CI `security` job runs
(`.github/workflows/ci.yml` line 92) — **exits 0 with 0 vulnerabilities**
(406 production packages audited). The 4 findings Phase 9 reported (3 moderate,
1 high) reproduce exactly, but all four live **exclusively in the development
dependency tree**: `vitest` 3.2.7 / `@vitest/coverage-v8` 3.2.7 (GHSA-82fw-gwwq-j7x9,
path traversal via `@vitest/mocker` redirect mock) and `js-yaml` 4.3.1 via
`eslint → @eslint/eslintrc` (GHSA-2883-xcg3-v3hh, merge-key CPU exhaustion).
No repository code imports or invokes any of the three packages; the
production `next build` bundle is unaffected. Phase 9's BLOCKED verdict rested
on bare `npm audit` (no `--omit=dev`), which counts the dev tree — reproduced
here as exit 1. Under the documented CI policy the gate passes.

The smallest safe Step 2 plan: **Option A (preferred)** — bump the two direct
dev dependencies `vitest` and `@vitest/coverage-v8` from `^3.2.7` to
`^4.1.11` (minor-range change on the `^3` spec is a semver-major for the
installed version, but 4.1.11 is the first patched release per the advisory
range `>=2.1.0 <4.1.11`), which clears all three Vitest advisories; add a
narrowly scoped `overrides` entry `js-yaml: 4.3.2` (patch, no API change)
since `@eslint/eslintrc@3.3.6` still declares `js-yaml: ^4.3.0` and resolves
4.3.1. Total: `package.json` + `package-lock.json` change in Step 2; no source,
test, config, CI, or environment change required. No major framework upgrade,
no package replacement, no Node 22 conflict.

## 2. Relationship to the blocked Phase 9 audit gate

Phase 9
(`docs/reports/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-CORRECTION-COMPLETION-REPORT.md`,
rows 228/248/429/472) recorded `npm audit` → exit 1, 4 vulnerabilities
(3 moderate, 1 high), and marked CACHE-FIX-10 BLOCKED. That reproduction is
confirmed byte-for-byte in section 9 below — **but the command Phase 9 ran was
bare `npm audit`, which audits dev dependencies too.** The CI workflow's
documented policy (`.github/workflows/ci.yml` line 91–92, "Dependency audit
(documented policy)") runs:

```
npm audit --audit-level=high --omit=dev
```

Reproduced in this diagnosis verbatim: **exit 0, 0 vulnerabilities**. The
"blocked" verdict therefore does not reflect the CI gate; it reflects the
stricter bare-audit count. Whether Step 2 should chase a fully-green bare
audit (dev tree included) is a policy decision recorded in section 28 — the
remediation plan below achieves exactly that, at low risk, so both readings
converge green.

## 3. Initial Git state (read-only snapshot, session start)

- Branch: `main`; HEAD `70fe77655467f5105f5d0e9b02594ba1c62b2952`; upstream
  `origin/main`; ahead 2 / behind 0 (both commits predate this session).
- Staged additions / modifications / deletions: **none**
  (`git diff --cached --name-status` empty).
- Unstaged modifications: 35 tracked files plus 1 deletion
  (`docs/ARCHITECTURE_REVIEW.md`) — 36 changed paths total, all pre-existing
  multi-phase work
  (routes, pages, components, contexts, docs, `lib/security/*`, `middleware.ts`,
  **`package.json`, `package-lock.json`**, 7 test files). No file was modified
  by this diagnosis (hash proof in section 21).
- Unstaged deletions: `docs/ARCHITECTURE_REVIEW.md` (pre-existing).
- Untracked: 84 paths at session start (85 after this report is written —
  the +1 is this file itself), all otherwise pre-existing scratch/diagnostic
  earlier sessions (`.chunks/`, `.my_tool_sandbox/`, `*.txt` dumps,
  `docs/reports/`, `tests/ai-similar-enrichment-concurrency.test.ts`, etc.).
- The accumulated multi-phase working tree is preserved untouched.

## 4. Environment versions

| Tool | Version |
|------|---------|
| OS | MINGW64_NT-10.0-19045 (Git-Bash/MSYS2 on Windows 10 build 19045) |
| Shell | `/usr/bin/bash` |
| Node | `v26.7.0` (local; CI pins Node 22 — see section 24) |
| npm | `11.19.0` |
| Git | `2.50.1.windows.1` |
| Package manager | npm (no `packageManager` field; `package-lock.json` `lockfileVersion: 3`) |
| npm / lockfile | npm 11.19.0 reads/writes lockfileVersion 3 (no upgrade pressure) |

## 5. Files inspected

- `package.json` (full, 103 lines) — 52 production deps, 16 dev deps,
  `overrides: { postcss 8.5.26, sharp 0.35.4, browserslist >=4.28.7,
  postcss-selector-parser >=6.1.3 }`. No `packageManager` field.
- `package-lock.json` (structure only — head + targeted `node -e` queries; never
  rewritten). `lockfileVersion: 3`, root `movie-recommendation-system@1.0.0`.
- `.github/workflows/ci.yml` (full) — Node 22, `npm ci`, audit command
  `npm audit --audit-level=high --omit=dev` (line 92), gitleaks secret scan,
  placeholder-env production build.
- `next.config.mjs` (full) — image remote patterns, CSP/security headers; no
  dependency-relevant config.
- `vitest.config.mts` — standard Vitest projects config; no dependency pins.
- `eslint.config.mjs` (head) — `FlatCompat` over `next/core-web-vitals` +
  `next/typescript`; no dependency pins.
- `AGENTS.md` / `.cursor/rules/*.mdc` — **absent** (both paths do not exist;
  no repo-level agent instructions to follow).
- Phase 9 completion report (audit rows 228/248/429/472 + section 7 detail).
- The pre-existing `package.json` / `package-lock.json` drift (`next ^15.5.9 →
  15.5.24`, `overrides.sharp 0.35.3 → 0.35.4`) was reconciled against this
  diagnosis: the lockfile diff touches **only** `next` / `sharp` (+ `@next/*`,
  `@img/*` platform entries) — **none** of the four vulnerable packages
  (`vitest`, `@vitest/coverage-v8`, `@vitest/mocker`, `js-yaml`, `eslint`)
  appear in the diff. The drift neither causes nor remediates DEP-AUDIT-001.
- No `.env` / `.env.local` was read. No secret was printed.

## 6. Audit reproduction (read-only commands, outputs in scratch)

All audit outputs were redirected to `D:/AppData/hermes/cache/scratch/`
(`phase10-*.json/stdout/stderr`) — **nothing was written inside the repo**.

| # | Exact command | Exit | Result |
|---|---------------|------|--------|
| 1 | `npm audit --omit=dev --json` | 0 | `vulnerabilities: {}`, total **0** (prod 406 / dev 451 / optional 119 / peer 9 / total 896 counted, 0 vulnerable) |
| 2 | `npm audit --audit-level=high --omit=dev` (byte-identical to CI line 92) | **0** | **clean** — this IS the CI gate, and it passes |
| 3 | `npm audit --json` (full tree, bare) | 1 | total **4** (moderate 3, high 1) — reproduces Phase 9 exactly |
| 4 | `npm audit --audit-level=high` (bare, no `--omit=dev`) | 1 | same 4 findings surface at high threshold |

Section 13 commands (`npm ls`, `npm explain`, `npm view … --json`) are
read-only: `ls`/`explain` read the local tree; `view` performs registry GETs
only (no auth, no secrets transmitted, no disk mutation).

## 7. Severity inventory

| Scope | Info | Low | Moderate | High | Critical | Total | Exit |
|-------|------|-----|----------|------|----------|-------|------|
| Production (`--omit=dev`) | 0 | 0 | 0 | 0 | 0 | **0** | 0 |
| Full tree (bare, Phase 9 parity) | 0 | 0 | **3** | **1** | 0 | **4** | 1 |

The counts Phase 9 reported are confirmed — but only for the bare command.
Under `--omit=dev` every bucket is zero.

## 8. Advisory inventory

### ADV-1 — `js-yaml` (HIGH)

- Advisory: https://github.com/advisories/GHSA-2883-xcg3-v3hh —
  "js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources".
- CVE: none assigned in audit payload. CWE: CWE-400, CWE-407. CVSS 7.5
  (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`) — availability only.
- Installed: **4.3.1** (`node_modules/js-yaml`, lockfile agrees, disk agrees).
- Vulnerable range: `>=4.0.0 <4.3.2`. First patched: **4.3.2**
  (registry-verified; deps `argparse ^2.0.1` — unchanged major).
- `fixAvailable: true` (patch, non-breaking).
- Status: **transitive dev** — `eslint@9.39.5 → @eslint/eslintrc@3.3.6 →
  js-yaml@^4.3.0 → 4.3.1`. npm marks it `dev` (section 9).

### ADV-2 — `vitest` (MODERATE)

- Advisory: https://github.com/advisories/GHSA-82fw-gwwq-j7x9 —
  "Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock".
- CWE: CWE-22. CVSS 5.9
  (`CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:H` per payload — confidentiality
  + availability, high attack complexity).
- Installed: **3.2.7** (direct dev dep `^3.2.7`; lockfile + disk agree).
- Vulnerable range: `2.1.0-beta.1 - 4.1.10` (advisory range `>=2.1.0 <4.1.11`).
- Fix: **5.0.2** per audit (`isSemVerMajor: true`) — but **4.1.11 also clears
  the range** (first version ≥ 4.1.11; registry lists 4.1.11 as latest 4.x;
  `@vitest/coverage-v8` has a matching 4.1.11). See H3/H10.
- Status: **direct dev** (`dev vitest@^3.2.7 from the root project`).

### ADV-3 — `@vitest/coverage-v8` (MODERATE)

- Same GHSA-82fw-gwwq-j7x9 via `vitest` (audit `via: ["vitest"]`).
- Installed: **3.2.7** (direct dev dep `^3.2.7`; peer `vitest@3.2.7` satisfied).
- Vulnerable range: `2.1.0-beta.1 - 4.1.10`. Fix per audit: 5.0.2 (major);
  4.1.11 exists with peer `vitest: 4.1.11` — lockstep bump required.
- Status: **direct dev**.

### ADV-4 — `@vitest/mocker` (MODERATE)

- Same GHSA-82fw-gwwq-j7x9 (the actual vulnerable package; `nodes:
  node_modules/vitest/node_modules/@vitest/mocker` — nested under vitest 3).
- Installed: **3.2.7**. Vulnerable range `2.1.0 - 4.1.10`; no patched 3.x
  exists (3.x tail is 3.2.7 — the installed version is the latest 3.x).
- Fix per audit: parent `vitest@5.0.2` (major); equally fixed by parent
  `vitest@4.1.11` which pins `@vitest/mocker: 4.1.11`.
- Status: **transitive dev** (via `vitest@3.2.7`). No direct action needed —
  resolved by the vitest bump.

No advisory was collapsed: ADV-2/3/4 share one GHSA but are three distinct
nodes with distinct fix edges; each is tracked separately.

## 9. Dependency-path inventory

```
js-yaml@4.3.1 (dev, transitive)
└── @eslint/eslintrc@3.3.6 (js-yaml: ^4.3.0)
    └── eslint@9.39.5 (dev ^9.39.5, root)
        ├── peer of eslint-config-next@15.5.4 (dev)
        ├── peer of eslint-import-resolver-typescript / eslint-plugin-import /
        │   eslint-plugin-jsx-a11y (all under eslint-config-next, dev)
        └── (single installed copy — no version multiplicity)

vitest@3.2.7 (dev, direct: ^3.2.7 from root)
├── @vitest/coverage-v8@3.2.7 (dev, direct: ^3.2.7 from root; peer vitest@3.2.7 ✓)
└── @vitest/mocker@3.2.7 (nested: node_modules/vitest/node_modules/@vitest/mocker)
```

- Direct production: **none** of the four.
- Direct dev: `vitest`, `@vitest/coverage-v8`.
- Transitive dev: `js-yaml` (via eslint), `@vitest/mocker` (via vitest).
- Multiple installed versions: **no** — one copy each (lockfile + disk agree).
- Deduplication effect: none (nested mocker is pinned by vitest 3.2.7's own
  `dependencies`, not deduplicated to root).
- Bundled into production output: **no** — all four are `dev`-flagged; `next
  build` does not bundle devDependencies, and the repo contains zero imports
  of any of them (section 11).

## 10. js-yaml specific analysis (spec section 4)

- Installed: single copy, **4.3.1** (lockfile `node_modules/js-yaml`,
  on-disk `package.json` agrees).
- Path: `eslint → @eslint/eslintrc → js-yaml` (section 9). **Transitive**;
  `npm explain` flags it `dev`.
- In production tree after `--omit=dev`: **NO** — the `--omit=dev` audit
  reports zero vulnerabilities across 406 production packages.
- Vulnerable range `>=4.0.0 <4.3.2`; first patched **4.3.2** (patch release,
  same `argparse ^2.0.1` dep — no API change).
- Parent update resolves it? **No**: `@eslint/eslintrc@3.3.6` is the latest
  3.x line compatible with eslint 9, and it still declares `js-yaml: ^4.3.0`,
  which resolves to the vulnerable 4.3.1. Updating eslint cannot pull 4.3.2
  without an override or a lockfile-pinned transitive bump.
- Lockfile-only transitive update possible? **Yes in principle** (4.3.2
  satisfies `^4.3.0`), but npm has no read-only-supported command to effect
  it without mutating the lockfile — Step 2 executes it.
- Override compatible? **Yes**: `js-yaml@4.3.2` is a patch on the same major
  with identical dependency shape; `@eslint/eslintrc` uses only `load`/`safe`
  config-file parsing, unaffected by merge-key accounting changes.
- Reachability from untrusted input: **NOT DEMONSTRATED**. Repo-wide search
  for `js-yaml|yaml.load|loadAll|from 'yaml'|from "yaml"` returns **0 matches**
  in application source. The only consumer is ESLint's own config-file loader
  (local `.eslintrc`/compat path), which never parses request bodies, uploads,
  or database content. Exploit prerequisite (attacker-controlled YAML with
  empty merge sources reaching `yaml.load`) has no path in this codebase.
  Per the spec, "not obviously reachable" ≠ safe — hence it is classified
  PROBABLE/UNRESOLVED rather than dismissed (section 12), and the patch is
  still recommended because it is nearly free.

## 11. Other vulnerable-package analyses

### Vitest chain (ADV-2/3/4, GHSA-82fw-gwwq-j7x9)

- The vulnerable primitive is `@vitest/mocker`'s redirect-mock handling
  (CWE-22 path traversal → arbitrary file read, CVSS 5.9, AC:H).
- Exposure in this repo: Vitest runs **locally and in CI** (`npm test`,
  `npm run test:coverage`) — never in production, never on untrusted input.
  A malicious actor would need to plant a hostile redirect-mock in a test file
  the developer then executes — i.e. code execution is already assumed. As
  with js-yaml this is not a dismissal: the fix is recommended because the
  bump is small and covered by the full suite in Step 2 validation.
- No patched 3.x exists (3.2.7 is the 3.x tail). Patched releases: **4.1.11**
  (first version outside `>=2.1.0 <4.1.11`) and 5.0.2 (audit suggestion).
  `@vitest/coverage-v8@4.1.11` declares peer `vitest: 4.1.11` — the two must
  move in lockstep; both are direct dev deps so one `package.json` edit
  covers both.
- `vite` is **absent** from the tree (`npm ls vite` empty) — vitest 4/5's
  `vite ^6||^7||^8` dependency will be a fresh transitive install in Step 2,
  not a conflict. `@types/node ^20.0.0` satisfies vitest 4.1.11's peer
  (`^20 || ^22 || >=24`); vitest 5.0.2 wants `^22 || >=24` — a peer warning
  risk on the repo's `@types/node@^20`, avoided by choosing 4.1.11.

## 12. Runtime reachability, exploit prerequisites, impact

| Package | Repo usage | Reachability | Prerequisites | Impact |
|---------|-----------|--------------|---------------|--------|
| js-yaml 4.3.1 | None (0 matches); only via ESLint config loader | NOT DEMONSTRATED (dev-tool config parsing only) | Attacker YAML reaching `yaml.load` with empty merge sources — no path exists | DoS (CPU) per CVSS A:H — **UNKNOWN** production exposure |
| vitest / coverage-v8 / mocker 3.2.7 | Test runner only (`npm test`, CI) | NOT DEMONSTRATED (never executes in prod; needs hostile test file) | Attacker-controlled test source executed by a developer/CI | Arbitrary file read (C:H, AC:H) — **NOT DEMONSTRATED** in production |

"Not obviously reachable" is not treated as safe: both are kept as
UNRESOLVED reachability with the fixes still recommended (cheap + verifiable).

## 13. Node 22 and framework compatibility

- CI pins Node 22 (`actions/setup-node`, three jobs). Local runs Node 26.7.0.
- `vitest@4.1.11` engines: `^20 || ^22 || >=24` — **Node 22 explicitly
  supported**. `vitest@5.0.2` engines: `^22.12 || ^24 || >=26` — also supports
  22, but its `@types/node ^22 || >=24` peer conflicts with the repo's
  `@types/node ^20.0.0` (warning-level, but avoidable — another reason to
  prefer 4.1.11).
- Framework compat of the preferred plan: Next.js 15.5.24, React 18.3.1,
  NextAuth 4, Mongoose 8, TS 5, ESLint 9.39.5, Redis client 4.7 — **none are
  touched** (dev-only test-runner + transitive YAML parser bumps). No peer
  implications beyond the vitest/coverage-v8 lockstep pair, which move
  together. `@types/node@^20` already satisfies vitest 4's peer range.
- Node 22 does not constrain the remediation: both candidate targets run on
  22; the preferred one (4.1.11) is the safer fit.

## 14. Remediation options

### Option A (PREFERRED) — minor-range parent bump + narrow transitive override

- `vitest`: `^3.2.7` → `^4.1.11` (direct dev; installed-major 3→4, first
  patched release 4.1.11).
- `@vitest/coverage-v8`: `^3.2.7` → `^4.1.11` (direct dev, lockstep peer).
- `overrides`: add `"js-yaml": "4.3.2"` (patch; forces transitive copy past
  the vulnerable range without touching eslint).
- `package.json` impact: 2 version edits + 1 override line.
  `package-lock.json`: regenerated entries for the vitest subtree (+ fresh
  `vite` transitive), js-yaml 4.3.1→4.3.2.
- Semver: vitest chain = installed-major bump (3→4); js-yaml = patch.
- Peers: coverage-v8@4.1.11 ↔ vitest@4.1.11 satisfied; `@types/node@^20`
  satisfies vitest 4's `^20||^22||>=24`. No other peer movement.
- Compat: Node 22 ✓ (engines include ^22); Next/React/Auth/Mongoose/TS/ESLint/
  Redis untouched. Expected test/build risk: **low** — vitest 3→4 may rename
  config options; mitigated by full-suite + build validation in Step 2.
- Expected audit: bare `npm audit` → 0; `--omit=dev --audit-level=high` → 0.
- Rollback: revert the two files (`git checkout -- package.json
  package-lock.json` is a Step 2 operator action, not taken here) and re-run
  `npm ci`.
- Risk: **low**.

### Option B — full-major to vitest 5.0.2 (audit's literal suggestion)

- Same shape as A but `^5.0.2` for both packages. Rejected as preferred:
  larger migration surface (vitest 5 requires `vite ^6||^7||^8`, drops Node
  20 from engines, wants `@types/node ^22||>=24` which the repo doesn't
  declare), with zero additional security benefit over 4.1.11 (same GHSA
  cleared). Kept as fallback if 4.1.11 shows incompatibilities in Step 2.
- Risk: **medium**.

### Option C — `npm audit fix` without `--force` (informational baseline)

- Would apply only non-breaking fixes: js-yaml 4.3.1→4.3.2 if resolvable
  within `^4.3.0` (possible), but **cannot** move vitest 3.2.7→4.1.11/5.0.2
  (semver-major, requires `--force`). Insufficient alone. **Not recommended
  as the plan** (and forbidden to run in Step 1 regardless).
- Risk: **low but incomplete**.

### Explicitly NOT recommended

- `npm audit fix --force`: would jump to vitest 5.0.2 unilaterally (breaking
  change, per audit output "Will install vitest@5.0.2, which is a breaking
  change") without the lockstep coverage-v8 edit or peer review. Unsafe as
  the preferred path.
- Major framework upgrade (Next/React/etc.): no advisory touches them.
- Package replacement/removal: patched versions exist for everything.

## 15. Exact Step 2 scope

Allowed to change:
- `package.json` — 2 devDependency version edits + 1 `overrides` line.
- `package-lock.json` — regenerated (vitest subtree, vite transitive, js-yaml).
- New completion report (`docs/reports/…PHASE-10…COMPLETION…md` or
  Step-2-designated path).
- Targeted dependency-contract tests **only if genuinely required** (existing
  suite is expected to be sufficient — vitest upgrade covered by running the
  full suite under the new runner).

Must NOT change: all `app/`, `components/`, `contexts/`, `lib/`,
`middleware.ts`, existing tests, `next.config.mjs`, `vitest.config.mts`,
`eslint.config.mjs`, `.github/workflows/ci.yml`, environment files, secrets.

- `package.json` can remain untouched? **No** — the vitest 3→4 move needs the
  direct spec edit (an override alone for a direct dep is inappropriate).
- Lockfile-only update possible? **Partially** — js-yaml 4.3.2 satisfies
  `^4.3.0` and could be lockfile-pinned, but vitest cannot; one `package.json`
  edit is unavoidable, so do both changes coherently in Step 2.
- Override appropriate? **Yes, but only for js-yaml** (transitive, parent
  range already permits the fixed version, patch-level, no API delta).
- Existing tests sufficient? **Yes, expected** — the vitest bump is validated
  by running the unchanged 42-file / 431-test suite under the new runner.

## 16. Step 2 validation plan (minimum, in order)

1. `npm audit --omit=dev --audit-level=high` → exit 0 (CI gate).
2. `npm audit --omit=dev --json` → 0 vulnerabilities.
3. Bare `npm audit --json` → 0 (dev tree also green — the Phase 9 reading).
4. Lockfile integrity (`npm ci` dry-consistency; clean `npm ci` in an isolated
   environment when authorized).
5. `npm run typecheck` → 0 errors.
6. `npm run lint` → 0 errors (warnings ≤ 93 baseline).
7. Targeted dependency-sensitive suites: `vitest` self-hosting suites —
   `tests/ai-similar-enrichment-concurrency.test.ts` (16 tests, heaviest mock
   usage), `tests/performance-phase2.test.ts`, `tests/performance-m4.test.ts`,
   `tests/redis-cache-security.test.ts` — under the new runner.
8. Full suite `npm test` → 42 files / 431 tests pass.
9. Production build with CI placeholders → compiles; route present.
10. Node 22 CI compatibility — engines/peers already verified (section 13);
    CI run confirms.
11. No unauthorized package drift (`git diff -- package.json package-lock.json`
    shows exactly the planned edits).
12. Final Git attribution + hash comparison.

## 17. Risks, rollback, unresolved questions

- Risks: vitest 3→4 migration friction (config/API renames — low, caught by
  full suite); fresh `vite` transitive install surface (lockfile-reviewed in
  Step 2); registry drift between diagnosis (2026-09-25) and remediation
  (re-run audit first in Step 2).
- Rollback: `package.json` + `package-lock.json` revert + `npm ci` restores
  the exact pre-Step-2 tree (hashes in section 21).
- Unresolved: (1) whether policy wants bare-audit-green (plan achieves it
  anyway); (2) exact vitest-4 migration notes pending Step 2's `npm view
  vitest@4.1.11` changelog read; (3) CI Node 22 confirmation pending Step 2.

## 18. Hypothesis matrix

| ID | Hypothesis | Evidence for | Evidence against | Status |
|----|-----------|--------------|------------------|--------|
| H1 | All four vulns affect production deps | Bare audit counts 4 | `--omit=dev` → 0; all four `npm explain`-flagged `dev` | **REJECTED** |
| H2 | High-severity finding is transitive | js-yaml via eslint→eslintrc, single copy | — | **CONFIRMED** |
| H3 | High-severity finding has a non-breaking patch | 4.3.2 = patch, same argparse dep, parent range `^4.3.0` admits it | — | **CONFIRMED** |
| H4 | Lockfile-only update resolves all | js-yaml 4.3.2 ∈ `^4.3.0` | vitest 3→4 needs spec edit; no read-only command can do it | **REJECTED** (partial only) |
| H5 | package.json must change | vitest/coverage-v8 are direct `^3.2.7`; fix is 4.x/5.x | js-yaml alone could be lockfile-only | **CONFIRMED** |
| H6 | An npm override is required | eslintrc pins `^4.3.0`→4.3.1; nothing pulls 4.3.2 unaided | Lockfile pin could work, but override is deterministic | **SUPPORTED** (for js-yaml only) |
| H7 | A major framework upgrade is required | — | No advisory touches Next/React/Auth/Mongoose; vitest 4 suffices | **REJECTED** |
| H8 | Affected APIs reachable from untrusted input | — | 0 repo imports; YAML only via ESLint config loader; vitest never in prod | **REJECTED** (NOT DEMONSTRATED; kept UNRESOLVED per policy, still patched) |
| H9 | Findings are false positives | Unreachable in prod; CI gate already green | Advisory ranges genuinely match installed versions — real, dev-scoped vulns | **REJECTED** (real but dev-scoped) |
| H10 | `npm audit fix` (no `--force`) suffices | Would take js-yaml patch | Cannot cross vitest 3→4 major boundary | **REJECTED** |
| H11 | `npm audit fix --force` introduces breakage | Audit output itself: "Will install vitest@5.0.2, which is a breaking change" | — | **CONFIRMED** (hence not preferred) |
| H12 | Node 22 constrains remediation | CI pins 22; local runs 26 | vitest 4.1.11 engines include ^22; preferred plan avoids the @types/node-22 peer demand of v5 | **REJECTED** (no constraint on Option A) |

## 19. Root-cause / reproducibility / impact / exposure / confidence

- Root cause: **MULTIPLE VULNERABLE PRODUCTION DEPENDENCIES** is rejected —
  correct classification: **VULNERABLE TRANSITIVE + DIRECT DEV DEPENDENCIES**
  (no production exposure). Closest allowed label:
  **LOCKFILE STALENESS** (pinned 3.2.7/4.3.1 while patched 4.1.11/4.3.2 exist).
- Reproducibility: **DETERMINISTIC AUDIT** (bare: 4/3-mod/1-high, exit 1) +
  **DETERMINISTIC DEPENDENCY TREE** (`npm ls`/`explain` stable; lockfile+disk
  agree on all four versions). Registry metadata read-only supplement.
- Impact: **SUPPLY-CHAIN RISK** (dev tooling) — no RCE/DATA EXPOSURE path
  demonstrated; DoS (js-yaml) and file-read (mocker) primitives exist only in
  non-production contexts.
- Production exposure: **NOT DEMONSTRATED** (CI production audit green, zero
  repo imports, dev-only execution contexts).
- Confidence: **HIGH** (every claim reproduced from the live tree; versions
  triple-verified: audit JSON + lockfile + disk).

## 20. Requirement Traceability Matrix

`Requirement ID → Diagnostic evidence → Validation evidence → Status`

| Req | Diagnostic evidence | Step 2 validation | Status |
|-----|--------------------|--------------------|--------|
| DEP-DIAG-1: reproduce + inventory every production finding | Sections 6–8: CI-exact cmd exit 0/0 vulns; bare audit 4 (3 mod + 1 high) with advisory IDs/CVSS/ranges | Step 2 items 1–3 | **PASS** |
| DEP-DIAG-2: every vulnerable path | Section 9: full `npm ls`/`explain` chains, single-copy, no multiplicity | Step 2 item 11 | **PASS** |
| DEP-DIAG-3: direct/transitive + prod/dev | Sections 8–9: 2 direct-dev, 2 transitive-dev, 0 production | Step 2 items 1–2 | **PASS** |
| DEP-DIAG-4: patched versions + fix availability | Sections 8/10/11: 4.3.2 (patch), 4.1.11 (minor-major-install), 5.0.2; registry-verified | Step 2 items 3–4 | **PASS** |
| DEP-DIAG-5: js-yaml + every other package individually | Section 10 (js-yaml deep-dive) + section 11 (vitest chain) | Step 2 item 7 | **PASS** |
| DEP-DIAG-6: reachability + impact | Section 12: 0 imports, NOT DEMONSTRATED both, impact table | Step 2 items 7–8 | **PASS WITH WARNING** (reachability UNRESOLVED by policy — absence of path ≠ proof of safety) |
| DEP-DIAG-7: Node 22 + framework compat | Section 13: engines/peers checked, 4.1.11 fits 22 + @types/node@20 | Step 2 item 10 | **PASS** |
| DEP-DIAG-8: bounded option comparison | Section 14: A (preferred) / B / C + explicit non-recommendations | Step 2 items 4–9 | **PASS** |
| DEP-DIAG-9: exact Step 2 package/lockfile/validation scope | Sections 15–16: file lists, lockfile-only verdict, 12-step validation | Step 2 execution | **PASS** |
| DEP-DIAG-10: preserve state, no mutation | Section 21 hashes match section 3; section 21 git state; no fix/install/ci command run | Step 2 item 11–12 | **PASS** |

## 21. Change control (final verification)

Recomputed after all evidence gathering (no mutation commands were run at any
point — no `audit fix`, `install`, `update`, `dedupe`, `prune`, `ci`, staging,
commit, checkout, or reset):

- `package.json` sha256: `143628fc…98d261bd3` — **matches initial**.
- `package-lock.json` sha256: `7df6c4be…676cbbc89` — **matches initial**.
- `git status --porcelain=v2 --branch`: HEAD `70fe776…` / `main` /
  `origin/main` / +2 −0 — unchanged; staged empty; unstaged = same 35
  pre-existing modifications + 1 pre-existing deletion; untracked = same 84
  pre-existing paths + this diagnostic report.
- No package, lockfile, source, test, config, CI, or environment file changed
  by this diagnosis (the only modified-file mtimes in the tree predate it).
- No temporary registry/audit output remains **in the repository** (all audit
  captures live under `D:/AppData/hermes/cache/scratch/phase10-*`, outside
  the repo).
- No credentials or environment values appear in this report (versions only).
- No commit, no deployment.

"Accumulated multi-phase working tree preserved. Package manifests and
lockfile remain byte-identical. Phase 10 Step 1 attribution is limited to the
diagnostic report. Nothing staged. HEAD unchanged."

## 22. Files created / modified / deleted

- Created: `docs/reports/diagnostics/BUG-PRODUCTION-DEPENDENCY-AUDIT-HIGH-DIAGNOSIS.md`
  (this report — the only Phase 10 change).
- Modified: none. Deleted: none.

## 23. Chronological command log (read-only)

1. `git rev-parse --show-toplevel; uname -a; node --version; npm --version;
   git --version; git branch --show-current; git rev-parse HEAD; …@{u};
   git status --porcelain-v2 --branch` — environment + git baseline.
2. `sha256sum package.json package-lock.json` — initial hashes.
3. `git status --porcelain; git ls-files --others --exclude-standard` —
   unstaged (36) + untracked (84) inventory.
4. `git diff --cached --name-status` — staged: empty.
5. `git diff -- package.json` — characterized pre-existing `next 15.5.24` +
   `sharp 0.35.4` drift (not this phase).
6. Reads: `package.json` (full), `package-lock.json` (head + `node -e`
   queries), `ci.yml` (full), `next.config.mjs`, `vitest.config.mts`,
   `eslint.config.mjs` (head), Phase 9 report audit rows; AGENTS.md /
   `.cursor/rules` confirmed absent.
7. `npm audit --omit=dev --json` → scratch (exit 0, 0 vulns).
8. `npm audit --audit-level=high --omit=dev` → scratch (exit 0; CI-exact).
9. `npm audit --json` → scratch (exit 1, 4 vulns — Phase 9 parity).
10. `npm audit --audit-level=high` (bare) → scratch (exit 1).
11. `npm ls js-yaml --all; npm explain js-yaml` — eslint path.
12. `npm ls vitest @vitest/coverage-v8 @vitest/mocker; npm explain
    @vitest/coverage-v8; npm explain vitest` — dev-direct paths.
13. Lockfile/disk triple-check via `node -e` (vitest 3.2.7, coverage 3.2.7,
    mocker 3.2.7, js-yaml 4.3.1, eslint 9.39.5).
14. `npm view js-yaml@4.3.2 …; npm view vitest@5.0.2 peerDependencies engines
    …; npm view @vitest/coverage-v8@5.0.2 …; npm view vitest versions …` —
    fix-version + v5 compat metadata.
15. `npm view @vitest/mocker versions …; npm ls vite; npm ls vite --all` —
    no 3.x patch; vite absent from tree.
16. `npm view vitest@4.1.11 engines/dependencies/peerDependencies …;
    npm view @vitest/coverage-v8 versions …; @vitest/coverage-v8@4.1.11
    peerDependencies` — 4.1.11 viability.
17. Repo searches: `js-yaml|yaml.load|loadAll` → 0 matches (no app usage).
18. Final: recomputed sha256 (match), `git status` (unchanged) — section 21.

Registry-access confirmation: steps 14–16 used `npm view` (registry GET,
read-only; no credentials, no secrets, no disk writes).

## 24. Commit / deployment status; Step 2 entry recommendation

- Commit: **NONE** (policy COMMIT_ALLOWED: NO). Staged: nothing. HEAD
  unchanged `70fe77655467f5105f5d0e9b02594ba1c62b2952`.
- Deployed: **NO** (policy DEPLOYMENT_ALLOWED: NO).
- External systems / state changes: **none** — local audit + registry GETs
  only; no writes outside scratch + the single diagnostic report.
- **Final status: PASS** — audit reproduced, every path classified, fix plan
  complete (Option A: vitest + coverage-v8 → ^4.1.11, `overrides` js-yaml →
  4.3.2), manifests unchanged, Step 2 safely actionable.
- Step 2 readiness: **READY** — enter remediation with sections 15–16 as the
  execution contract. First Step 2 action: re-run the section 6 audit pair
  (registry drift check), then apply the three `package.json` edits.
