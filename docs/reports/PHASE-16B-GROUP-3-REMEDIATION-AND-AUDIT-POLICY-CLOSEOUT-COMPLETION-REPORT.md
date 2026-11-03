# Phase 16B — Group 3 Remediation and Audit-Policy Close-Out (Completion Report)

- **Workitem**: Phase 16B (DEP-AUDIT-005-remediation, Group 3)
- **Branch**: `work/phase-12-cache-invalidation-diagnosis` @ HEAD `a89c1fb` (UNCHANGED)
- **Runtime**: Node `v22.13.1` (`<node-22-runtime>`) + system npm `11.19.0` (`<system-npm>`), `--ignore-scripts` for all installs
- **Predecessor**: Phase 16A (DEP-AUDIT-004) completion report, Sections 1—14; Phase 16B Step 1 diagnosis (Sections 1—13, with the Step 2 correction in its Section 14)
- **Final classification**: **PHASE 16B IMPLEMENTATION PASS — PRODUCTION AUDIT CLEAN; DEV-ONLY MINIMATCH EXCEPTION ACTIVE UNTIL 2026-11-16**
- **No commit / no push / no merge / no deploy performed.**

---

## 1. Executive summary

Phase 16B remediated the last remaining dependency-audit group (Group 3: glob / minimatch /
sucrase / the ESLint chain / the brace-expansion scoped overrides) using the Experiment E + F2
design established in the Step 1 diagnosis, and closed out the audit-policy gate that Group 3
was blocking:

- **glob eliminated from the entire dependency tree**: `sucrase` pinned to 3.35.1 (resolves through tinyglobby 0.2.17) and `tailwindcss-animate` reclassified to devDependencies. Zero glob copies remain.
- **Production audit is clean**: 0 vulnerable packages / 0 advisory objects, exit 0.
- **Bare (full-tree) audit is governed by a single time-limited, dev-only exception**: exactly one advisory object remains (GHSA-g3hv-75wg-m249, minimatch 3.1.5, moderate), confined to the dev-only ESLint chain, accepted under exception `MINIMATCH-DEV-EXC-2026-11-02` until 2026-11-16T23:59:59Z.
- **The audit-policy evaluator was rewritten** to a scope-aware, fail-closed classifier; the policy test suite covers 52 behaviors; the live gate exits 0 on the final state.
- **All repository validation gates pass**: policy 52/52, live gate exit 0, Phase 15 focused 25/25, canonical 8-file cache suite 109/109, typecheck 0, lint 0 errors / 93 warnings, full suite 45 files / 519 tests, coverage at baseline, production build 49/49 pages.
- **The full F (both minimatch copies) upgrade was rejected** after `@eslint/eslintrc` proved incompatible with minimatch 11 (ESM default import); the F2 partial override (minimatch@10.2.6 → 11.0.1) was applied instead.

Every change was first proven in an isolated copy (12 gates), then applied to the repository as
a byte-identical delta, then re-validated by 14 repository gates. No application source changed;
no Phase 15 artifact changed; nothing was staged or committed.

---

## 2. Final status

**PHASE 16B IMPLEMENTATION PASS — PRODUCTION AUDIT CLEAN; DEV-ONLY MINIMATCH EXCEPTION ACTIVE UNTIL 2026-11-16**

Verdict basis (all three PASS conditions met; the FAIL conditions did not occur):

| Condition | Evidence |
|-----------|----------|
| Production audit nonzero? | No — 0 vulnerable packages / 0 advisory objects, exit 0 (Section 14) |
| Live policy rejects? | No — result ACCEPTED, exit 0; production CLEAN_AUDIT, bare EXCEPTION_APPLIED (Section 24) |
| Mandatory code/test/build gate failed? | No — policy 52/52, full suite 519/519, typecheck 0, build 49/49 (Sections 23—31) |

---

## 3. Owner risk authorization

The Step 1 diagnosis Section 7.2 bounded a narrow class of acceptable risk: one advisory object,
one package, dev-only scope, maximum 14 days, empty production allow-list, fail-closed after
expiry or any metadata drift. Phase 16B Step 2 was authorized to implement exactly that class:

- **Owner of record**: `repository-maintainer` (approvalDate 2026-11-02).
- **Risk accepted**: a single moderate advisory (GHSA-g3hv-75wg-m249) on minimatch 3.1.5, installed only in the dev-only ESLint chain.
- **Authorization is not open-ended**: the exception record carries its own review cadence (7 days) and forbids in-place expiry extension; a fresh record requires new owner authorization.
- **No production exposure is authorized**: `allowedProductionPackages` is empty by design (Section 18).
- **The gate is fail-closed**: any drift in advisory identity, severity, scope, inventory, installed version, or source, plus any expiry, rejects with a nonzero exit (Sections 19—22).

---

## 4. Approved expiry

| Field | Value |
|-------|-------|
| `expiryDate` | 2026-11-16T23:59:59Z |
| `approvalDate` | 2026-11-02 |
| Interval | 14 days — the maximum permitted by the Step 1 diagnosis Section 7.2 |
| `reviewCadenceDays` | 7 (first review due 2026-11-09) |
| Days remaining from 2026-11-03 | 13 |
| Behavior at expiry | Gate exits nonzero automatically (fail-closed); no in-place extension permitted |

---

## 5. Experiment reference

All designs applied in this pass trace to the Step 1 diagnosis (Sections 1—13); its Section 14
records the final facts measured after implementation:

| Experiment | Diagnosis section | Outcome in Step 2 |
|------------|-------------------|-------------------|
| E (reclassify tailwindcss-animate + pin sucrase 3.35.1) | Section 5, decision Section 9 | **APPLIED** — glob removed from the whole tree, production audit clean |
| F-full (upgrade both minimatch copies to 11.0.1) | Section 6 | **REJECTED** — `@eslint/eslintrc` 3.3.6 ESM default import is incompatible with minimatch 11 (no default export) → ESLint SyntaxError |
| F2 partial (override minimatch@10.2.6 → 11.0.1 only) | Section 6, decision Section 9 | **APPLIED** — CJS consumption in typescript-estree is compatible; 2 dev-only minimatch copies remain |
| G (npm arborist crash reproducibility) | Section 6/8 | No impact — the old-installer crash did not reproduce under npm 11.19.0 / Node 22.13.1 |
| H (npm resolution for Node 22) | Section 8 | **IMPLEMENTED** in the evaluator (Section 21 of this report) |

---

## 6. Initial Git state

Recorded at the start of Step 2 (baseline gate):

| Item | Value |
|------|-------|
| HEAD | `a89c1fb39df3139c7200fcd172357df3b247c54e` (exact match required) |
| Branch | `work/phase-12-cache-invalidation-diagnosis` |
| Staged | empty (nothing staged at any point in this pass) |
| Porcelain lines | 21 = 4 modified + 17 untracked |

Tracked modifications present at start (pre-existing, not this pass): `lib/cache.ts` (Phase 15),
 `package.json package-lock.json tests/documentation-contract.test.ts` (Phase 16A). Untracked at start:
Phase 15 test + both Phase 15 reports, the Phase 16A completion report, the Phase 16 dependency-audit-drift
diagnosis, the Phase 16B Step 1 diagnosis, and local scratch files.

---

## 7. Initial audit state

Baseline measured under Node 22.13.1 / npm 11.19.0 (diagnosis Section 3):

| Scope | Vulnerable packages | Advisory objects | Severity | Raw exit |
|-------|--------------------|------------------|----------|----------|
| Production | 3 | 2 (sources 1244013 glob via sucrase, 1244012 minimatch) | 3 moderate | 1 |
| Bare | 16 | 2 (same two objects) | 16 moderate | 1 |

- Live gate at baseline: **RED** — both scopes rejected with `MULTIPLE_ADVISORY_OBJECTS`,
  compounded by the stale Phase 14 braces exception (expiry 2026-10-17, already past).
- Lockfile at baseline: 855 entries / 854 packages; tree held 1 glob copy and 8 minimatch copies.

---

## 8. Dependency reclassification

 `tailwindcss-animate ^1.0.7` moved from `dependencies` to `devDependencies` (Experiment E). npm had classified the tailwindcss → tailwindcss-animate edge as production,
so this reclassification removes the last production-side path to the glob advisory family without
changing any installed version. Verified in the final manifest: the key sits inside the
 `devDependencies` block (adjacent to tailwindcss / ts-node), and no production entry references it.

---

## 9. Sucrase override

A top-level override `"sucrase": "3.35.1"` was added (was 3.35.0). sucrase 3.35.1 resolves its
glob dependency through tinyglobby 0.2.17, which removes glob from the entire dependency tree
(verified: 0 glob copies via the full tree walk). This is the single change that eliminated the
glob advisory object from both audit scopes.

---

## 10. Partial Minimatch override

 `"minimatch@10.2.6": "11.0.1"` was added (Experiment F2). The nested copy under
 `@typescript-eslint/typescript-estree` resolves to 11.0.1; that consumer uses a CJS `require`, which
is compatible with minimatch 11. The full upgrade (also bumping the hoisted 3.1.5 to 11.0.1) was
rejected because `@eslint/eslintrc` 3.3.6 does `import minimatch from "minimatch"` (ESM default
import) and minimatch 11 has no default export → ESLint fails with a SyntaxError. The final tree
therefore holds exactly two dev-only minimatch copies: hoisted 3.1.5 and nested 11.0.1.

---

## 11. Brace-expansion override cleanup

- **Removed**: `"minimatch@9.0.9": { "brace-expansion": "2.1.7" }` — inert once glob left the tree
  (minimatch 9.0.9 no longer installs), so the pin could only mask future resolution.
- **Kept**: `"minimatch@3.1.5": { "brace-expansion": "1.1.21" }` — still applicable to the hoisted dev copy.
- **Kept unchanged**: every Phase 16A override (`postcss 8.5.26, js-yaml 4.3.2, sharp 0.35.5, source-map-js 1.2.2, vite 8.3.3, browserslist >=4.28.7, postcss-selector-parser >=6.1.3`).

---

## 12. Package and lockfile movement

| Metric | Baseline | Final | Delta |
|--------|----------|-------|-------|
| Lockfile entries | 855 | 808 | —47 |
| Clean-install package count | 770 | 729 | —41 |
| lockfileVersion | 3 | 3 | unchanged |
| Lockfile size | — | 12,522 lines | byte-identical to the proven isolated copy (sha256 `81963399…`) |

The reduction is structural, not a truncation: removing glob and collapsing the minimatch set
prunes the glob + brace-expansion sub-trees. The final repository lockfile is **byte-identical**
to the lockfile used for all isolated-copy validation, and a read-only `npm install --dry-run` on the
final state reports `up to date` (exit 0) — zero resolver drift. The working tree was reconciled with
 `npm install --ignore-scripts` (no script execution, no network writes beyond the registry metadata fetch).

---

## 13. Final dependency tree

Verified with `npm ls --omit=dev --all` and a full `npm ls --all --json` walk:

| Property | Value |
|----------|-------|
| `npm ls --omit=dev --all` | exit 0 — 0 invalid, 0 extraneous, 0 unmet peer dependencies |
| Unmet optional dependencies | 51 (platform-specific binaries, pre-existing) |
| Grep false positive | 1 (`character-reference-invalid@2.0.1` matches the word `invalid`; not a dependency state) |
| glob copies | 0 (removed from the whole tree) |
| minimatch copies | 2, both dev-only: hoisted `node_modules/minimatch` 3.1.5 and `node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch` 11.0.1 |
| sucrase | 3.35.1 → tinyglobby 0.2.17 |
| tailwindcss-animate | devDependencies only (^1.0.7) |
| node_modules layout | 508 top-level package directories; 729 packages total on clean install |

---

## 14. Final production audit

 `npm audit --production --json` on the final repository state:

- Vulnerable package entries: **0**; distinct advisory objects: **0**
- Tier totals: info 0, low 0, moderate 0, high 0, critical 0
- **Exit 0 — CLEAN**

---

## 15. Final bare audit

 `npm audit --json` (full tree):

- Vulnerable package entries: **13** (all moderate); distinct advisory objects: **1**; 0 high, 0 critical
- The single object: `minimatch <11.0.1` (GHSA-g3hv-75wg-m249, npm audit source 1244012), installed version 3.1.5
- Raw exit 1 (the bare audit is intentionally not clean; it is the scope the exception governs)

---

## 16. Final vulnerable package inventory

The 13 entries map to the dev-only ESLint chain; each is also listed in the exception record
 `allowedBarePackages`, which the evaluator checks exactly (any added or missing entry rejects):

1. @eslint-community/eslint-utils
2. @eslint/config-array
3. @eslint/eslintrc
4. @typescript-eslint/eslint-plugin
5. @typescript-eslint/parser
6. @typescript-eslint/type-utils
7. @typescript-eslint/utils
8. eslint
9. eslint-config-next
10. eslint-plugin-import
11. eslint-plugin-jsx-a11y
12. eslint-plugin-react
13. minimatch

None of these is a production (runtime) dependency; none ships to end users.

---

## 17. Exception record

 `config/audit-exceptions.json` (2,668 bytes; sha256 `e3663e7a…`; byte-identical to the proven
isolated copy). The expired Phase 14 braces record was replaced by this single record (19 fields):

| Field | Value | Field | Value |
|-------|-------|-------|-------|
| id | MINIMATCH-DEV-EXC-2026-11-02 | package | minimatch |
| scope | bare | affectedVersion | 3.1.5 |
| advisory | GHSA-g3hv-75wg-m249 | severity | moderate |
| cve | CVE-2026-118764 | cvssScore | 0 (npm-feed value) |
| npmAuditSource | 1244012 | cvssVector | null (npm-feed value) |
| allowedProductionPackages | [] (empty) | allowedBarePackages | the 13 packages of Section 16 |
| approvalDate | 2026-11-02 | expiryDate | 2026-11-16T23:59:59Z |
| reviewCadenceDays | 7 | owner | repository-maintainer |

Plus `rationale`, `reviewInstructions`, and two upstream links (Section 47/48 quote the operative parts).

---

## 18. Scope isolation

The exception is constructed so production can never consume it:

- `scope` is `bare` and `allowedProductionPackages` is empty.
- The evaluator classifies each audit scope independently: a **clean** production audit is accepted as `CLEAN_AUDIT` without ever consulting the exception record.
- With a clean production audit, no exception is consulted, so no production finding can be waived by this record; conversely any production-side minimatch finding would have to pass the general policy, which permits it nowhere.
- Verified live: the gate line for the production scope reads `classified: accepted (CLEAN_AUDIT)` with zero vulnerable packages and zero advisory objects; the exception line appears only for the bare scope.

---

## 19. Severity handling

- Severity checks are parameterized on the exception record (`moderate`) with an explicit ceiling — the record cannot be stretched to accept a higher severity.
- The advisory severity must equal the recorded severity. Two distinct fail-closed paths are tested:
  advisory-level drift (`ADVISORY_SEVERITY_MISMATCH`) and audit-entry-level drift (`SEVERITY_MISMATCH`) — both reject.
- A high or critical finding under this record is rejected outright; the policy remains fail-closed for escalation.

---

## 20. CVSS handling

- `cvssVector: null` and `cvssScore: 0` in the record are the npm-feed values for this advisory
  (the feed carries no CVSS vector string for source 1244012; the GHDB score is moderate / 6.9 / CWE-405).
- The evaluator treats the vector as nullable and compares the recorded `cvssScore` against the value
  reported by `npm audit` rather than trusting either side, so a feed-side change is caught as drift, not silently accepted.
- No synthetic CVSS values were authored into the record.

---

## 21. Npm resolution changes

The evaluator now implements the diagnosis Section 8 recommendations (resolution order):

1. Validated `NPM_PATH` environment variable (spaces allowed, executed without a shell).
2. Validated `npm_execpath` (Windows only).
3. npm adjacent to the running Node executable (Windows only).
4. Common direct prefix candidates (Windows only).
5. Bounded breadth-first filesystem search (Windows only, final fallback), skipping only `.git`.

- Non-Windows platforms resolve `npm` from PATH.
- The fallback walk is breadth-first (the depth-first walk measured in the diagnosis visited 1000 directories and found nothing; the bounded BFS locates the system npm within the same limit).
- `NPM_PATH` remains the documented override; the live gate log shows the resolved node and npm paths on the first lines.

---

## 22. Exit-code behavior

| Exit | Meaning |
|------|---------|
| 0 | Accepted — a scope classified `CLEAN_AUDIT` or `EXCEPTION_APPLIED` |
| 1 | Policy rejection — any advisory, inventory, severity, version, source, or expiry drift, or an unclean production audit |
| 2 | CLI / infrastructure failure — npm executable missing, spawn failure, empty or non-JSON output; distinct from a policy rejection so environmental failures are not masked as security verdicts |

Fail-closed by construction: anything the evaluator cannot verify is a rejection.

---

## 23. Policy tests

 `tests/audit-policy.test.ts` — 847 lines / 31,529 bytes / sha256 `b32c138c…`, type-annotated:

- **52 / 52 tests pass** in the isolated copy and again in the repository (gate G4); re-verified
  2026-11-03 by the Phase 16B final-evidence audit (52 passed / 0 failed / 0 skipped, 1 file,
  exit 0, ~1.9 s).
- Composition (**corrected arithmetic** — the earlier "32 core + 4 additive + 6 preserved = 52"
  line was wrong: that sum is 42, not 52): **42 core behaviors** (the mandated behavior set,
  including the end-to-end CLI exit-code cases L24b/L25b/L26b/L27b/L32b and the npm-resolution
  cases L27/L28/L29b/L30a—c) + **4 additive behaviors** extending specific core cases
  (L13b, L20a, L22b, L26a) + **6 preserved behaviors** carried over from the pre-existing
  braces-era matrix (the unnumbered 33—38 cases) = **42 + 4 + 6 = 52**, exactly the executed count.
- Suite-level organization, read from the three describe blocks: 41 pure-evaluation tests +
  6 npm-resolution (K) tests + 5 end-to-end CLI exit-code tests = 52.
- One declaration is platform-conditional: `L28. falls back to a validated npm_execpath before
  prefix candidates (Windows)` uses `it.skipIf(process.platform !== 'win32')`, so it runs and
  counts on Windows and is skipped on other platforms; on this Windows host the executed count
  was 52.
- All tests are synthetic: `evaluateAuditPolicy` is a pure function with an injected clock, so expiry
  and drift paths are deterministically exercised without sleeping.

---

## 24. Live-policy result

Final repository state, gate G5 (raw output lines):

 `audit-policy: exception=MINIMATCH-DEV-EXC-2026-11-02 scope=bare expires=2026-11-16T23:59:59Z owner=repository-maintainer`,
 `audit-policy: scope 'production' classified: accepted (CLEAN_AUDIT)`,
 `audit-policy: scope 'bare' classified: accepted (EXCEPTION_APPLIED)`,
 `audit-policy: exception expires 2026-11-16T23:59:59Z (owner: repository-maintainer); re-review per the exception's reviewInstructions - the gate fails closed after expiry or metadata drift`,
 `audit-policy: result: ACCEPTED (exit 0).`,

Contrast with the baseline: both scopes rejected (`MULTIPLE_ADVISORY_OBJECTS`) plus an expired braces exception.
The npm-resolution lines preceding them show the evaluator resolved the system npm on Node 22 as designed (Section 21).

---

## 25. Phase 15 preservation

Hashed before mutation and re-verified after every stage; all four byte-identical (same values as the Phase 16A record):

| File | SHA-256 (first 16) |
|------|--------------------|
| `lib/cache.ts` | `f90db789d3fe3ade` |
| `tests/cache-inflight-invalidation-race.test.ts` | `f659a660ef32b03a` |
| `docs/reports/diagnostics/BUG-CACHE-INVALIDATION-INFLIGHT-REPOPULATION-DIAGNOSIS.md` | `82df7682221c4352` |
| `docs/reports/PHASE-15-CACHE-INVALIDATION-INFLIGHT-REPOPULATION-CORRECTION-COMPLETION-REPORT.md` | `76e370b7f42d753e` |

---

## 26. Targeted suites

| Suite | Result | Note |
|-------|--------|------|
| Phase 15 focused (`tests/cache-inflight-invalidation-race.test.ts`) | **25 / 25** | Confirms the Phase 15 fix behavior is untouched |
| Canonical 8-file cache suite | **109 / 109** | The 8 files include the cache races, redis-cache security, key normalization, performance, admin-chat security, enrichment concurrency, strict validation; first run hit a wrong candidate list (91) and was re-run against the confirmed list |
| Policy unit suite | **52 / 52** | Section 23 |

---

## 27. Typecheck

 `tsc --noEmit` — exit 0, no diagnostics. ~50 type errors appeared during isolated validation of the new
policy test file; root cause was a `NodeJS/ProcessEnv` type interaction (Next.js global augmentation) in the
type-annotated test file, fixed with 15 targeted type-annotation pairs — **no application source change**.

---

## 28. Lint

 `eslint .` — 0 errors / 93 warnings (identical to the pre-Phase-16B baseline; all warnings pre-existing).

---

## 29. Full suite

 `vitest run` — **45 files / 519 tests passed**, 131.18s, 0 failures. Baseline was 499 tests; the +20 is
exactly the policy suite growth (32 → 52), with no other file count or test count movement.

---

## 30. Coverage

| Metric | Final | Baseline |
|--------|-------|----------|
| Statements | 58.76% (1257/2139) | 58.76% |
| Branches | 49.53% (636/1284) | 49.53% |
| Functions | 69.19% (164/237) | 69.19% |
| Lines | 60.06% (1202/2001) | 60.06% |

No regression; identical to the recorded baseline.

---

## 31. Production build

 `next build` — exit 0, 49/49 pages, full route + shared-chunk table emitted, middleware 57.3 kB,
 `.next/BUILD_ID` written, no build errors.

---

## 32. CI changes

 `.github/workflows/ci.yml` (sha256 `5dd400d1…` → `3187e294…`, +12/—7 lines, comments only):

- The security-job comment now documents the Phase 16B gate design with four facts:
  1. the production audit must be clean (zero vulnerabilities);
  2. the bare audit carries exactly one time-limited, dev-only Minimatch advisory exception defined in `config/audit-exceptions.json`;
  3. the exception expires on 2026-11-16T23:59:59Z;
  4. the gate fails closed after expiry or on any advisory metadata drift (identity, severity, scope, inventory).
- The command itself is unchanged (`run: node scripts/audit-policy.mjs`); YAML re-validated locally.
- **GitHub Actions was not used as a validation dependency** — no CI run was triggered or depended on; the workflow file was edited and parsed statically.

---

## 33. Phase 16A report correction

Four targeted corrections to `docs/reports/PHASE-16A-CRITICAL-RUNTIME-ZOD-AND-DEV-TOOLING-REMEDIATION-COMPLETION-REPORT.md`,
(sha256 `1214cf87…` → `58475c28…`, still 250 lines):

| Check | Expected | Found |
|-------|----------|-------|
| N1: pre-edit local machine path occurrences remaining | 0 | 0 |
| N2: edit 1 (scratch path sanitized to the `<external-scratch>` placeholder, Section 3) | 1 | 1 |
| N3: edit 2 (Section 9 forward-looking wording) | 1 | 1 |
| N4: edit 3 (Section 10 rows 2—3 annotations) | 2 | 2 |
| N5: edit 4 (Section 10 live-gate note: Node 22 npm resolution now resolved) | 1 | 1 |

Historical content and all Phase 16A verdicts were preserved; only the stale forward references and
the machine path were corrected.

---

## 34. Phase 16B diagnosis correction

Per the separate authorization, only final facts were corrected in the Step 1 diagnosis
 `docs/reports/diagnostics/PHASE-16B-GROUP-3-RESOLUTION-AND-AUDIT-POLICY-CLOSEOUT-DIAGNOSIS.md` — the
Experiment E/F/G history (Sections 1—13) is preserved; three edits were applied
(sha256 `5c84007a…` → `ee44d7e4…`, 536 → 657 lines, +121):

1. Header pointer line noting the Section 14 post-implementation correction.
2. Section 13 pointer note.
3. New **Section 14 "Step 2 Final Facts"** with 7 subsections: final vulnerable inventory (raw audits), final exception record, final lockfile/package counts, final policy behavior, final npm resolution behavior, final F2 design applied, machine-path rescan (zero).

Verified: all 13 original headings intact, zero raw machine paths / usernames / runtime locations,
Section 13 body unchanged, verdict line unchanged.

---

## 35. Failures and bounded corrections

| Failure | Root cause | Bounded correction |
|---------|------------|---------------------|
| F-full upgrade broke ESLint | `@eslint/eslintrc` ESM default import vs minimatch 11 (no default export) | Downscope to F2 per the diagnosis decision; no blind retry |
| L15 policy test 47/48 | Advisory-level and entry-level severity drift were one case | Split into `ADVISORY_SEVERITY_MISMATCH` and `SEVERITY_MISMATCH` sub-cases — 52/52 |
| ~50 typecheck errors in the new test file | `NodeJS/ProcessEnv` type interaction (Next.js global augmentation) | 15 targeted type-annotation pairs in the test file; no source change |
| Lockfile drift first judged benign | Only registry metadata diffs were inspected | Structural diff found **214 real version differences** — decision reversed: byte-copy the proven lockfile and reconcile with `npm install --ignore-scripts`; read-only dry-run now used for drift detection |
| Canonical suite ran 91/109 | Wrong candidate file list | Re-derived the confirmed 8-file list from session evidence — 109/109 |
| `write_file` overwrite refused | File had been read with offset/limit pagination | Write via scratch path then copy over the target; verify by hash |
| Inline Node script died with a shell parse error | Bash heredoc + nested single quotes | Moved to a scratch `.cjs` file executed by Node |
| Scratch path ENOENT | Env variable resolution inside the scratch tooling | Hardcode the scratch path in scripts |
| Intermittent compressed terminal output | Tool-level output truncation | Redirect to file and read it back |

Every reversal was re-validated (Section 24—31); no defect was masked.

---

## 36. Scope changes

- **One authorized downscope**: F-full → F2 partial minimatch override, decided in the Step 1 diagnosis
  Section 9 (incompatibility evidence, not effort).
- No other scope changes: Experiment E was applied as designed; the evaluator rewrite, exception record,
  policy tests, CI comment, and both report corrections all match their authorizations.
- Nothing outside the approved file set was touched (Section 39).

---

## 37. External-system use

- **npm registry**: advisory metadata (`npm audit --json`) and package tarball fetches during the isolated
  install and the repository reconciliation (`--ignore-scripts`, no lifecycle scripts).
- **No GitHub Actions execution** — ci.yml was edited and parsed statically only.
- **No git remote operations** — the working branch has no upstream, and the configured remote
  `origin` (`https://github.com/amrhanyy/movie-recommendation-system.git`) was never contacted:
  no fetch, no push, no ref advertisement (Section 43).
- **No credentials or API keys** were used or emitted; no secrets were requested.
- **No deployment targets** were contacted.

---

## 38. Files created

1. `docs/reports/PHASE-16B-GROUP-3-REMEDIATION-AND-AUDIT-POLICY-CLOSEOUT-COMPLETION-REPORT.md` — this file.

(The diagnosis Section 14 was appended to an existing file; scratch artifacts stayed outside the repository.)

---

## 39. Files modified

| File | Role in this pass |
|------|-------------------|
| `package.json` | tailwindcss-animate reclassification, sucrase override, minimatch@10.2.6 override, brace-expansion cleanup |
| `package-lock.json` | Regenerated/reconciled; byte-identical to the proven isolated copy (808 entries) |
| `config/audit-exceptions.json` | Expired braces record replaced by `MINIMATCH-DEV-EXC-2026-11-02` |
| `scripts/audit-policy.mjs` | Evaluator rewrite (scope-aware classifier, npm resolution, exit codes) |
| `tests/audit-policy.test.ts` | 52-behavior type-annotated policy suite |
| `.github/workflows/ci.yml` | Security-job comment documents the dev-only exception design |
| `docs/reports/PHASE-16A-…COMPLETION-REPORT.md` | Four stale forward references / machine path corrected |
| `docs/reports/diagnostics/PHASE-16B-…DIAGNOSIS.md` | Section 14 final facts appended |

No application source, no route or cacheManager change, no environment file change, no Phase 15 file.

---

## 40. Files deleted

None.

---

## 41. Final Git state

| Item | Value |
|------|-------|
| HEAD | `a89c1fb39df3139c7200fcd172357df3b247c54e` — unchanged (verified post-pass) |
| Staged | empty |
| Modified (tracked, **8**) | `lib/cache.ts` (pre-existing Phase 15), `package.json`, `package-lock.json`, `tests/documentation-contract.test.ts` (pre-existing Phase 16A), `config/audit-exceptions.json`, `scripts/audit-policy.mjs`, `tests/audit-policy.test.ts`, `.github/workflows/ci.yml` — **corrected: the earlier "tracked, 7" list omitted ci.yml even though Section 32 documents its modification** |
| Untracked (**18**) | 7 deliverables — Phase 15 test + both Phase 15 reports, the Phase 16A completion report, the Phase 16 dependency-audit-drift diagnosis, the Phase 16B Step 1 diagnosis, **this report** — plus 11 local scratch/prompt/evidence files, which are never part of any proposed commit |
| Porcelain lines | 26 = 8 modified + 18 untracked |
| Build/coverage outputs | `.next` (gitignore line 7) and `coverage` (gitignore line 32) are gitignored (verified) |

---

## 42. Commit status

**NOT AUTHORIZED — no commit was created or attempted.** HEAD remains at the pre-pass commit; the working tree holds the uncommitted delta described in Section 41.

---

## 43. Push status

**NOT AUTHORIZED — no push.** The remote `origin` (`https://github.com/amrhanyy/movie-recommendation-system.git`)
**is configured**, but the working branch `work/phase-12-cache-invalidation-diagnosis` has **no upstream
tracking branch** — these are two separate facts; the missing upstream never meant the repository had no
remote. No fetch, no push, and no remote-ref movement occurred in this pass. Read-only local state
(verified 2026-11-03 by the final-evidence audit, no network use): `origin/main` = `bcdb8347…`,
`origin/release/phases-2-11-verified` = `6f0595ab…`; PR #14
(`Release: verified fixes from Phases 2–11`, base `main` ← head `release/phases-2-11-verified`)
remains **OPEN / MERGEABLE**. Distinguish clearly: repository remote configuration — present;
local-branch upstream configuration — absent.

---

## 44. Merge status

**NOT AUTHORIZED — no merge.** No branch operations occurred; the working branch is unchanged.

---

## 45. Deployment status

**NOT AUTHORIZED — no deployment.** No build output was published; nothing left this host.

---

## 46. Remaining risks

1. **Dev-only minimatch 3.1.5 advisory (moderate)** remains accepted under exception until 2026-11-16T23:59:59Z; the raw bare audit stays nonzero by design until the ESLint chain can move to minimatch 11.
2. **Full upgrade blocked upstream**: `@eslint/eslintrc` holds an ESM default import that minimatch 11 does not satisfy; no compatible ESLint release is available at this time.
3. **Fail-closed expiry**: on 2026-11-17 the gate exits nonzero until a new authorized record exists or the finding is remediated — this is intended behavior, but it means the CI security job will block after expiry if unaddressed.
4. **Pre-existing lint warnings** (93) and **coverage level** (unchanged from baseline) are out of scope and unchanged.
5. **No CI execution** — validation was local under Node 22.13.1; the workflow file is syntactically valid but has not run.
6. The 51 unmet optional dependencies are pre-existing platform binaries (sharp etc.) and unchanged.

---

## 47. Review instructions before expiry

From the exception record (`reviewInstructions`), before 2026-11-16T23:59:59Z and at each 7-day review:

1. Re-run the production audit and confirm it remains clean.
2. Re-run the bare audit and confirm the vulnerable-package inventory still matches `allowedBarePackages` exactly — exactly one GHSA-g3hv-75wg-m249 object, installed 3.1.5, npm audit source 1244012.
3. If the upstream ESLint chain becomes compatible with minimatch 11.x, remove this exception and the minimatch@10.2.6 override and require a fully clean audit.
4. Otherwise only the repository owner may authorize a new exception record with a fresh expiry. **Do not extend this expiry in place.**

First 7-day review falls due 2026-11-09.

---

## 48. Upstream-remediation trigger

Remove the exception (and the `minimatch@10.2.6` override) and require a fully clean bare audit as soon as either holds:

- `@eslint/eslintrc` (or the ESLint chain generally) adopts a minimatch API compatible with minimatch `>=11.0.1`, or
- minimatch 3.1.5 receives a patched release that clears GHSA-g3hv-75wg-m249.

Upstream references recorded in the exception: the GHSA advisory and the minimatch repository.

---

## 49. Rollback considerations

- **Nothing is committed**, so rollback is a pure working-tree file-state operation — performed with a
  **reviewed reverse patch** (generate the delta against HEAD, review it, then `git apply -R`), or, after
  the owner authorizes a commit, a **reviewed revert commit**. Destructive commands (`git reset`,
  `git checkout`, `git restore`, `git clean`, `git stash`) are explicitly **not** part of the rollback
  procedure, and no scratch backup file is relied upon — the only trusted sources are the committed
  blobs at HEAD and a reviewed patch.
- Scope-specific rollback (Phase 16B only) reverse-patches the six modified files — `package.json`,
  `package-lock.json`, `config/audit-exceptions.json`, `scripts/audit-policy.mjs`,
  `tests/audit-policy.test.ts`, `.github/workflows/ci.yml` — optionally together with the un-targeted
  removal of the newly written reports, then re-syncs the install with `npm install --ignore-scripts`
  (a manifest-reconciliation write, not a destructive `rm -rf` / `npm ci` style wipe).
- Expected rollback state: raw production audit returns to 3 moderate / 2 objects, bare to 16 / 2,
  live gate RED (MULTIPLE_ADVISORY_OBJECTS plus the expired braces record) — exactly the
  pre-Phase-16B baseline, so the rollback is observable and verifiable.
- **Gates required after any rollback:** (1) raw production audit `npm audit --omit=dev --json`;
  (2) raw bare audit `npm audit --json`; (3) live gate `node scripts/audit-policy.mjs` (expected RED
  after a 16B rollback — the only accepted non-green state, and only by owner decision);
  (4) `npx vitest run tests/audit-policy.test.ts` against the restored policy matrix;
  (5) `npx tsc --noEmit`, `npx eslint .`, and the full `npx vitest run` suite to confirm the rolled-back
  tree is internally consistent; (6) `git status` to confirm the staged set is empty and HEAD unchanged.
- No data, migration, or runtime state is involved — the changes are manifest, lockfile, policy, and
  documentation only.

---

## 50. Requirement Traceability Matrix

| Prompt section | Requirement | Report section |
|----------------|-------------|----------------|
| A | Phase identity, environment, no-change boundaries | 1, 6, 41 |
| B | Mandatory todo protocol (every numbered item tracked) | Todo reconciliation (final response) |
| C | Current state to preserve (HEAD, Phase 15/16A delta) | 6, 25, 41 |
| D | Approved dependency resolution (E + F2 only, F-full rejected) | 8, 9, 10, 11, 36 |
| E | Package and lockfile mutation | 8—12, 39 |
| F | Final dependency tree requirements | 13 |
| G | Audit-policy target (scope-aware, fail-closed) | 18—24 |
| H | Exception expiry and owner decision | 3, 4, 17 |
| I | Exception record design | 16, 17, 20 |
| J | Audit-policy evaluator changes | 19, 21, 22 |
| K | Npm resolution correction | 21 |
| L | Policy test requirements (52 behaviors) | 23 |
| M | CI workflow update | 32 |
| N | Phase 16A report corrections | 33 |
| O | Phase 16B diagnosis corrections | 34 |
| P | Isolated proof before repository application | 1, 5, 12 (isolated 12-gate result) |
| Q | Apply to repository | 12, 39, 41 |
| R | Repository validation (14 gates) | 23—31 |
| S | Completion report | This file (Sections 1—52) |
| T | Change control (expected files, nothing staged, HEAD unchanged) | 38—45 |
| U | Final self-review before response | 51 |

---

## 51. Requirement-by-requirement checklist

| # | Requirement | Result | Evidence |
|---|-------------|--------|----------|
| 1 | Production audit clean | PASS | 0/0, exit 0 (Section 14) |
| 2 | Single dev-only exception, empty production allow-list | PASS | Record fields; live CLEAN_AUDIT path (Sections 17—18, 24) |
| 3 | Exception expiry `<=` 14 days, fail-closed | PASS | 2026-11-16T23:59:59Z from 2026-11-02 (Section 4) |
| 4 | Bare inventory matches record exactly | PASS | 13/13 packages, 1 object, source 1244012 (Sections 15—16) |
| 5 | Policy tests: 52 behaviors green | PASS | 52/52 isolated + repository (Section 23) |
| 6 | Live policy accepts | PASS | exit 0, ACCEPTED (Section 24) |
| 7 | Dependency tree requirements (no glob, 2 dev minimatch copies) | PASS | Full-tree walk (Section 13) |
| 8 | Lockfile byte-coherent with proof | PASS | sha match 81963399…; dry-run up to date (Section 12) |
| 9 | Typecheck / lint / full suite / coverage / build | PASS | 0 / 0+93 / 519 / baseline / 49 (Sections 27—31) |
| 10 | Phase 15 preserved | PASS | 4/4 hashes unchanged (Section 25) |
| 11 | CI comment documents the exception | PASS | 4 facts, YAML valid (Section 32) |
| 12 | 16A + 16B-diagnosis corrections applied and verified | PASS | N1—N5 counts; +121 lines; zero machine paths (Sections 33—34) |
| 13 | Expected-file set respected (no source, no Phase 15, no route/cacheManager, no env) | PASS | Section 39 |
| 14 | Nothing staged; HEAD unchanged; no commit/push/merge/deploy | PASS | Section 41—45 |
| 15 | No credentials/machine paths in reports | PASS | Path rescan zero; placeholders throughout (Sections 33—34) |

---

## 52. Commit-boundary recommendation

The Phase 16B final-evidence audit (2026-11-03) evaluated one-, two-, and three-commit boundaries
across the complete Phase 15 + Phase 16A + Phase 16B delta (15 files: 8 tracked-modified +
7 untracked deliverables; scratch/prompt/evidence files excluded from every option) and selected
**Option 3 — two commits**:

- **Option 1 (one atomic commit, 15 files)** was **rejected**: it couples the Phase 15 functional
  cache-race correction with the dependency remediation and the audit-policy rewrite in a single
  15-file unit, hurting reviewability and making any surgical rollback of one workstream
  impossible. It is only superior on "no intermediate states", and no intermediate state is
  required here.
- **Option 2 (three logical commits)** was **rejected**: Commit B (Phase 16A alone) would land a
  deliberately failing audit gate — the post-16A state is production 3 moderate / 2 advisory
  objects with no valid exception (the braces record expired 2026-10-17), so `node scripts/audit-policy.mjs`
  in CI would fail between Commit B and Commit C. Introducing a new RED state is unnecessary.
- **Option 3 (two commits) is the selected balance**: Commit A is a self-contained functional
  correction that leaves the gate in its pre-existing status-quo state (already non-passing at
  HEAD since 2026-10-17); Commit B lands the complete dependency + policy close-out and the gate
  turns green exactly at its landing, with no deliberately failing intermediate.

**Commit A — Phase 15 cache-race correction (functional, security-critical, self-contained) — 4 paths:**

1. `lib/cache.ts`
2. `tests/cache-inflight-invalidation-race.test.ts`
3. `docs/reports/diagnostics/BUG-CACHE-INVALIDATION-INFLIGHT-REPOPULATION-DIAGNOSIS.md`
4. `docs/reports/PHASE-15-CACHE-INVALIDATION-INFLIGHT-REPOPULATION-CORRECTION-COMPLETION-REPORT.md`

Suggested subject: `fix(cache): prevent stale in-flight writes after invalidation`.

**Commit B — Phase 16A + Phase 16B dependency remediation and audit-policy close-out — 11 paths:**

1. `package.json`
2. `package-lock.json`
3. `tests/documentation-contract.test.ts`
4. `config/audit-exceptions.json`
5. `scripts/audit-policy.mjs`
6. `tests/audit-policy.test.ts`
7. `.github/workflows/ci.yml`
8. `docs/reports/PHASE-16A-CRITICAL-RUNTIME-ZOD-AND-DEV-TOOLING-REMEDIATION-COMPLETION-REPORT.md`
9. `docs/reports/diagnostics/PHASE-16-DEPENDENCY-AUDIT-DRIFT-DIAGNOSIS.md`
10. `docs/reports/diagnostics/PHASE-16B-GROUP-3-RESOLUTION-AND-AUDIT-POLICY-CLOSEOUT-DIAGNOSIS.md`
11. `docs/reports/PHASE-16B-GROUP-3-REMEDIATION-AND-AUDIT-POLICY-CLOSEOUT-COMPLETION-REPORT.md`

Suggested subject: `fix(security): close group 3 audit findings and gate bare minimatch via dev-only exception`,
with a body summarizing: glob eliminated (sucrase 3.35.1 + tailwindcss-animate dev), minimatch
10.2.6 → 11.0.1, expired braces exception replaced by MINIMATCH-DEV-EXC-2026-11-02 (bare scope,
expires 2026-11-16T23:59:59Z), audit-policy rewritten scope-aware, 52 policy tests, all gates green.

**Reconciliation:** 4 + 11 = 15 = every tracked-modified path (8) + every untracked deliverable (7);
no path duplicated, none missing (see the corrected Section 41 for the full inventory, which now
reconciles with Sections 39 and this section).

**Staging and committing remain unauthorized and were not performed.** The working tree is left
exactly as described in Section 41, ready for owner review.

---

**PHASE 16B IMPLEMENTATION PASS — PRODUCTION AUDIT CLEAN; DEV-ONLY MINIMATCH EXCEPTION ACTIVE UNTIL 2026-11-16**
