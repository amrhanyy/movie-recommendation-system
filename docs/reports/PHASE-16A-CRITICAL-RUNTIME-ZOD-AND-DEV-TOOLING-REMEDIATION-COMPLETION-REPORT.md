# Phase 16A — Critical, Runtime, Zod, and Dev-Tooling Dependency Remediation (Completion Report)

- **Workitem**: Phase 16A (DEP-AUDIT-004-remediation)
- **Branch**: `work/phase-12-cache-invalidation-diagnosis` @ HEAD `a89c1fb` (UNCHANGED)
- **Runtime**: Node `v22.13.1` (`<node-22-runtime>`) + system co-located npm `11.19.0` (`<system-npm>`), `--ignore-scripts`
- **Final classification**: **PHASE 16A IMPLEMENTATION PASS — RELEASE GATE BLOCKED ONLY ON DEFERRED GROUP 3**
- **No commit / no push / no merge / no deploy performed.**

---

## 1. Executive summary

Phase 16A remediated the three dependency groups whose patched targets and compatibility boundaries were established in the Phase 16 diagnosis:

- **Group 1 (critical runtime/build)**: `next` 15.5.24 → 15.5.28, `sharp` 0.35.4 → 0.35.5, `source-map-js` 1.2.1 → 1.2.2.
- **Group 2 (schema runtime, major)**: `zod` 3.24.2 → 4.6.7.
- **Group 4 (dev tooling)**: `vitest` 4.1.11 → ^4.1.12, `@vitest/coverage-v8` 4.1.11 → ^4.1.12, `@vitest/mocker` 4.1.11 → 4.1.12 (transitive), `vite` 8.3.1 → 8.3.3.

**Group 3 (glob / minimatch / sucrase / ESLint chain / brace-expansion scoped-override cleanup) was explicitly DEFERRED** and left byte-identical.

All changes were first proven in an isolated copy (fresh install + full validation), then applied to the repository, where the full validation sequence passed. The Zod 4 migration required **zero application-source changes** (typecheck clean under 4.6.7); the only test change was a one-line mechanical manifest guardrail (`tests/documentation-contract.test.ts`).

**Result**: all Group 1/2/4 advisory objects are cleared from both the production and bare audits. The remaining findings belong **only** to the deferred Group 3. The live `audit-policy.mjs` gate remains RED (blocked on deferred Group 3 + the stale Phase 14 exception), as expected and explicitly out of scope for this pass.

---

## 2. Baseline (Phase 16A start)

Recorded under Node 22.13.1 + system npm:

| Item | Value |
|------|-------|
| Branch | `work/phase-12-cache-invalidation-diagnosis` |
| HEAD | `a89c1fb` (Phase 14) |
| Staged | empty |
| Tracked diff | `lib/cache.ts` (Phase 15 delta, pre-existing) |
| Untracked | `tests/cache-inflight-invalidation-race.test.ts`, 2 Phase 15 reports, scratch files |
| Node | `v22.13.1` |
| npm | `11.19.0` (system, co-located) |
| `package.json` SHA-256 | `1b8775d9f463…` (pre-mutation baseline `b1-manifest`) |
| `package-lock.json` SHA-256 | `1a2402e1705e…` (pre-mutation baseline `b1-lockfile`) |

**Phase 15 preservation hashes** (re-verified after every dependency stage, all UNCHANGED):

| File | SHA-256 (first 16) |
|------|-------------------|
| `lib/cache.ts` | `f90db789d3fe3ade` |
| `tests/cache-inflight-invalidation-race.test.ts` | `f659a660ef32b03a` |
| `docs/reports/PHASE-15-…-COMPLETION-REPORT.md` | `76e370b7f42d753e` |
| `docs/reports/diagnostics/BUG-CACHE-INVALIDATION-INFLIGHT-REPOPULATION-DIAGNOSIS.md` | `82df7682221c4352` |

**Audit reproduced at baseline** (no drift vs Phase 16 Step 1): production **7** vulnerabilities (3 moderate / 3 high / 1 critical, **9** advisory objects); bare **24** (19 moderate / 4 high / 1 critical, **17** advisory objects).

---

## 3. Isolated plan proof

A copy was constructed outside the repository (`<external-scratch>/p16a-isolated`) from `git archive HEAD` (the intended final tracked tree) with the uncommitted Phase 15 delta overlaid (`lib/cache.ts`, the Phase 15 test + reports). **No `node_modules` copied** (a fresh `npm install --ignore-scripts` was run in the isolated copy). Only Group 1 / 2 / 4 changes were applied there before any repository mutation.

### 3.1 Isolated install

- Package count **before 854 → after 854** (net-zero; 0 added, 0 removed).
- **52 version bumps**, all within the G1/G2/G4 families.
- Peer/engine warnings: one informational `ERESOLVE overriding peer dependency` (pre-existing, non-blocking, identical before/after). No invalid/extraneous state.
- No unrelated lockfile movement (verified by lockfile diff — only the 52 G1/G2/G4 `node_modules` version entries changed).

### 3.2 Isolated validation (all under Node 22.13.1)

| # | Check | Result |
|---|-------|--------|
| 1 | Dependency-tree verification (`npm ls`) | PASS — all targets at intended versions |
| 2 | Production audit | PASS — G1/G2/G4 findings absent; 3 moderate remain (G3 only) |
| 3 | Bare audit | PASS — G1/G2/G4 findings absent; 16 moderate remain (G3 + ESLint chain) |
| 4 | Phase 15 focused suite (`tests/cache-inflight-invalidation-race.test.ts`) | PASS |
| 5 | Canonical 8-file cache suite | PASS |
| 6 | Zod-focused suites (operational-security, ratelimit-ip-security, user/admin route validation, schema suites) | PASS |
| 7 | Typecheck (`tsc --noEmit`) | PASS — **0 errors under zod 4.6.7** |
| 8 | Lint (`eslint .`) | PASS — 0 errors / 93 warnings (baseline) |
| 9 | Full suite (`vitest run`) | PASS — 499/499 (after the one doc-contract line fix) |
| 10 | Coverage (`vitest run --coverage`) | PASS — 58.76 / 49.53 / 69.19 / 60.06 (= baseline) |
| 11 | Production build (`next build`, CI placeholder env) | PASS — exit 0 |

Isolated artifacts: `p16a_iso_typecheck.txt`, `p16a_iso_full_suite.txt`, `p16a_iso_build.log`.

---

## 4. Selected versions

| Package | From | To | Group | Mechanism |
|---------|------|----|-------|-----------|
| `next` | 15.5.24 | **15.5.28** | G1 | direct dependency |
| `zod` | 3.24.2 | **4.6.7** | G2 | direct dependency (major) |
| `vitest` | 4.1.11 | **^4.1.12** | G4 | dev dependency |
| `@vitest/coverage-v8` | 4.1.11 | **^4.1.12** | G4 | dev dependency |
| `@vitest/mocker` | 4.1.11 | **4.1.12** | G4 | transitive under `vitest` |
| `vite` | 8.3.1 | **8.3.3** | G4 | scoped override (lowest V8 clearing all six advisories, preserving Vitest 4 compatibility) |
| `sharp` | 0.35.4 | **0.35.5** | G1 | scoped override |
| `source-map-js` | 1.2.1 | **1.2.2** | G1 | scoped override |

**Vite rationale**: `8.3.3` is the lowest patched V8 that clears all six Vite advisories while remaining within Vitest 4's compatible Vite range.

**Zod rationale**: `4.6.7` (latest 4.x) selected over 4.6.6 for maximum stability; both clear the advisory.

**G3 preserved**: the scoped `minimatch@3.1.5 / 9.0.9 / 10.2.6` and all `brace-expansion` overrides, plus `glob` (10.5.0) and `sucrase` (3.35.0), remain byte-identical.

---

## 5. Zod 4 migration audit

**Finding: no application-source change was required.**

Before editing any source, a typecheck was run under `zod@4.6.7` — **0 errors**. The codebase's Zod usage is already Zod-4-stable:

- `safeParse()` still returns a `ZodError` in Zod 4; **`.error.issues` is the supported issue collection** (retained, not removed). The user correction was confirmed: `safeParseResult.error.issues` is NOT broken.
- The app's `validateEnv()` custom `.errors` return type is application-built and unaffected.
- No use of the Zod-3-only removed fields (`required_error`, `invalid_type_error`, the old two-arg `errorMap`, one-argument `z.record()`) was found.

**Zod compiler findings: none.** No `lib/env.ts`, no `lib/security/schemas.ts`, and no API validator required modification. The Zod migration was a **clean typecheck pass with zero source edits.**

---

## 6. Exact source / test changes

- **Application source: NONE** (Zod 4 required no source change — see §5).
- **Tests: exactly one line** — `tests/documentation-contract.test.ts` line 176:
  - `expect(pkg.overrides?.sharp).toBe('0.35.4')` → `expect(pkg.overrides?.sharp).toBe('0.35.5')`
  - This is a mechanical manifest guardrail: the test asserts the manifest's `sharp` override. The override changed to `0.35.5` (Group 1), so the guardrail constant updated to match. It is a required consequence of the manifest change, not an independent behavior change. It failed in the isolated full suite (1/499) and passed after the update (499/499).

Change-control diff (repository tracked delta for Phase 16A):
- `package.json`: 7 insertions / 5 deletions (the 7 G1/G2/G4 manifest changes).
- `package-lock.json`: 291 / 231 (lockfile regeneration).
- `tests/documentation-contract.test.ts`: 1 / 1.
- `lib/cache.ts` (138/40) is the **pre-existing Phase 15 delta**, NOT modified by this pass (hash `f90db789` unchanged).

---

## 7. Lockfile movement

| Metric | Value |
|--------|-------|
| Package count before → after | 854 → 854 (net-zero) |
| Added packages | 0 |
| Removed packages | 0 |
| Changed packages | 52 (all within G1/G2/G4) |
| Unrelated movement | none |

The 52 changed entries are the `next` internals, `sharp` platform binaries, `zod`, `vite` family, `vitest` family (`vitest`, `@vitest/coverage-v8`, `@vitest/mocker`, `vite`), and `source-map-js`. The repository lockfile was regenerated under the same runtime (Node 22.13.1 + system npm) and **verified byte-coherent with the isolated proof** (854 packages, 0 version mismatches, all target versions correct, G3 intact).

---

## 8. Before / after audit inventory

| Scope | Before (7 / 24) | After (3 / 16) | Cleared objects |
|-------|-----------------|----------------|-----------------|
| Production | 7 vulns (3 mod / 3 high / 1 crit) — **9** advisory objects | 3 vulns (all moderate) — **2** advisory objects | 7 (next×4, sharp, source-map-js, zod) |
| Bare | 24 vulns (19 mod / 4 high / 1 crit) — **17** advisory objects | 16 vulns (all moderate) — **2** advisory objects | 15 (next×4, sharp, source-map-js, zod, vite×6, @vitest/mocker×2) |

- **High/Critical: 0 remain in both scopes** (before: 3 high + 1 critical in prod; 4 high + 1 critical in bare).
- All cleared objects belong to Groups 1, 2, and 4.

---

## 9. Remaining Group 3 advisories (deferred, out of scope)

The post-remediation audits show **only** these remaining advisory objects (both scopes: `glob` + `minimatch`):

| Advisory | Package | Installed | Affected range | Patched | Severity | Scope |
|----------|---------|-----------|----------------|---------|----------|-------|
| (glob DoS advisory) | `glob` | 10.5.0 | <14.0.2 | 14.0.2 / 14.0.3 | moderate | dev (build/test) |
| (minimatch ReDoS advisory) | `minimatch` | 3.1.5 / 9.0.9 / 10.2.6 | <11.0.1 | 11.0.1 / 11.0.3 | moderate | dev |
| (sucrase, transitive via glob) | `sucrase` | 3.35.0 | — | — | moderate | dev |

These are **deliberately deferred to Phase 16B / Group 3** (glob / minimatch / sucrase / the ESLint dependency chain / the brace-expansion scoped-override cleanup). Remediating them requires the major upgrades `glob → 14` and `minimatch → 11` plus reconciliation of the existing scoped overrides, which is a separate, larger compatibility pass. Group 3 is build/tooling-oriented but partly production-classified by npm before Phase 16B remediation.

---

## 10. Repository validation (Node 22.13.1)

All of the following were run on the actual repository after applying the manifest + lockfile + one-line test change:

| # | Check | Result |
|---|-------|--------|
| 1 | Dependency tree (`npm ls`) | PASS — next 15.5.28, zod 4.6.7, vitest 4.1.12, @vitest/coverage-v8 4.1.12, nested vite 8.3.3, @vitest/mocker 4.1.12 |
| 2 | Production audit (fresh) | PHASE-16A TARGET PASS; REPOSITORY AUDIT REMAINS NONZERO — 3 moderate (G3: glob, minimatch, sucrase); **0 high / 0 critical** |
| 3 | Bare audit (fresh) | PHASE-16A TARGET PASS; REPOSITORY AUDIT REMAINS NONZERO — 16 moderate (G3 + ESLint chain); **0 high / 0 critical** |
| 4 | Phase 15 focused suite | PASS (subsumed by full suite; 499/499) |
| 5 | Canonical cache suite | PASS (subsumed by full suite) |
| 6 | Zod-focused suites | PASS (subsumed by full suite) |
| 7 | Typecheck (`tsc --noEmit`) | PASS — 0 errors under zod 4.6.7 |
| 8 | Lint | PASS — 0 errors / 93 warnings |
| 9 | Full suite | PASS — 45 files, **499/499 tests**, 0 failures |
| 10 | Coverage | PASS — **58.76 / 49.53 / 69.19 / 60.06** (= baseline) |
| 11 | Production build | PASS — `.next/BUILD_ID` `mR5QiM4mxDW9_xix4EMTj` written; complete route + shared-chunk table; no build errors |
| 12 | Audit-policy unit tests | PASS — 32/32 |
| 13 | Live audit policy gate | **RED (expected)** — `MULTIPLE_ADVISORY_OBJECTS` (2 prod / 2 bare: glob + minimatch); "2 of 2 scope(s) rejected. This gate fails closed." |

**Live-gate note**: under Node 22.13.1 (no co-located npm) the gate reports "npm audit produced no output" (environmental); under the system Node (co-located npm) the true policy verdict is `MULTIPLE_ADVISORY_OBJECTS` (2 advisory objects vs the gate's "exactly one" invariant) plus the stale Phase 14 exception. The policy remains miscalibrated until Group 3 and policy close-out are complete — **the live policy is NOT expected to pass in this pass.** Node 22 live-policy npm resolution required durable handling, resolved in Phase 16B.

---

## 11. Phase 15 preservation (final)

After all dependency stages, the four Phase 15 targets are byte-identical to the recorded baseline:

- `lib/cache.ts` = `f90db789d3fe3ade` ✓
- `tests/cache-inflight-invalidation-race.test.ts` = `f659a660ef32b03a` ✓
- `docs/reports/PHASE-15-…-COMPLETION-REPORT.md` = `76e370b7f42d753e` ✓
- `docs/reports/diagnostics/BUG-…-DIAGNOSIS.md` = `82df7682221c4352` ✓

No Phase 15 source, test, or report was modified.

---

## 12. Git state

- **HEAD**: `a89c1fb` — **unchanged.**
- **Staged**: empty — **nothing staged.**
- **No commit / push / merge / deploy.**
- **Tracked modifications (vs HEAD)**:
  - `package.json` (Phase 16A, G1/G2/G4)
  - `package-lock.json` (Phase 16A, regenerated)
  - `tests/documentation-contract.test.ts` (Phase 16A, 1 line)
  - `lib/cache.ts` (**pre-existing Phase 15 delta**, preserved, not this pass)
- **Untracked (Phase 16A)**: this report.
- **Untracked (pre-existing)**: `tests/cache-inflight-invalidation-race.test.ts`, both Phase 15 reports, `docs/reports/diagnostics/PHASE-16-DEPENDENCY-AUDIT-DRIFT-DIAGNOSIS.md`, and scratch files.

No `node_modules`, logs, caches, or scratch artifacts were brought into the repository.

---

## 13. Change control (final)

| Item | Status |
|------|--------|
| `package.json` changed (G1/G2/G4 only) | ✅ expected |
| `package-lock.json` regenerated (same runtime) | ✅ expected |
| `tests/documentation-contract.test.ts` (1-line manifest guardrail) | ✅ proven necessary |
| Application source changed | ✅ none required (Zod 4 clean) |
| Phase 16A completion report created | ✅ this file |
| glob / minimatch / sucrase / ESLint changed | ❌ none (deferred to G3) |
| Audit exception / audit-policy / CI changed | ❌ none |
| Phase 15 files changed | ❌ none (byte-preserved) |
| Anything staged | ❌ none |
| HEAD / commits / push / merge / deploy | ❌ none |

---

## 14. Follow-up (next phase, not this pass)

**Phase 16B / Group 3**: remediate `glob` → 14, `minimatch` → 11, `sucrase`, the ESLint dependency chain, and clean up the `brace-expansion` scoped overrides. Then re-calibrate `audit-policy.mjs` (remove the expired Phase 14 `braces` exception; the gate invariant is currently "exactly one advisory object" but will be 0 after full remediation). Only after Group 3 + policy close-out will the live audit-policy gate be expected to pass.
