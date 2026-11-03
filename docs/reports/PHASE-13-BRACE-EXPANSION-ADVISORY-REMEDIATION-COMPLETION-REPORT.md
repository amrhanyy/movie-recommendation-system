# Phase 13 — brace-expansion Advisory Remediation — Step 2 Completion Report

**Finding ID:** DEP-AUDIT-002
**Bug ID:** BUG-BRACE-EXPANSION-HIGH-ADVISORY
**Phase:** 13 — brace-expansion Advisory Remediation
**Prompt type:** TARGETED TRANSITIVE DEPENDENCY SECURITY REMEDIATION (Step 2 of the mandatory two-step protocol)
**Diagnostic reference:** `docs/reports/diagnostics/BUG-BRACE-EXPANSION-HIGH-ADVISORY-DIAGNOSIS.md`
**Final status:** **PASS WITH WARNINGS**

> **The bounded remediation was implemented.** Three scoped `overrides` entries were added to `package.json`,
> the lockfile was regenerated, and all eight physical copies of `brace-expansion` moved to their
> per-line patched minimums (1.1.21 / 2.1.7 / 5.0.12). The production audit and the bare audit both
> returned to **exit 0 with zero vulnerabilities**. The Phase 12 source/test delta was preserved
> byte-for-byte. No application source, test, config, CI, or environment file changed in this phase.
> **No commit, push, merge, or deployment occurred.**

---

## 1. Executive summary

Phase 12 closed CACHE-OPS-001 but could not clear its mandatory `npm audit` gate: `tailwindcss-animate@1.0.7`
sits in production `dependencies`, pulling the `tailwindcss → sucrase → glob → minimatch → brace-expansion@2.1.4`
chain out of dev scope, so `npm audit --audit-level=high --omit=dev` (CI gate, `.github/workflows/ci.yml:92`)
reported one High finding. That production-classification is the *production-audit exposure* factor; the
*full-tree defect* is that the newly published `brace-expansion` advisories affect all eight pinned transitive
copies across production-classified and development-tooling paths. The overall classification is therefore a
**MULTI-FACTOR TRANSITIVE DEPENDENCY DEFECT**. The Phase 13 read-only diagnosis
(`BUG-BRACE-EXPANSION-HIGH-ADVISORY-DIAGNOSIS.md`)
validated that three scoped `overrides` entries — keyed on the actual locked `minimatch` consumer versions —
clear every current advisory on all three installed major lines while keeping every move inside its consumer's
declared semver range and touching nothing else in the 855-package lockfile.

Step 2 applied exactly that remediation:

- `package.json`: +3 scoped override entries (nothing else).
- `package-lock.json`: 8 `brace-expansion` version bumps (6 × 1.1.18 → 1.1.21, 1 × 2.1.4 → 2.1.7, 1 × 5.0.9 → 5.0.12); 0 packages added, 0 removed, 0 dependency-edge changes.
- Local `node_modules` synced to the lockfile.
- Production audit and bare audit: **exit 0, 0 vulnerabilities** (both pre- and post-verified).
- Focused Phase 12 suite, 7-file targeted suite, typecheck, lint (93 warnings / 0 errors baseline), full suite
  (43 files / 442 tests), coverage, and the CI-placeholder production build all **re-confirmed green under the
  CI-pinned Node v22.13.1 runtime** discovered during Phase 11.
- The Phase 12 completion report's two standing warnings (W-A1 advisory, W-1 Node) were corrected to record
  their closure by Phase 13; no Phase 12 source or test behavior changed.

**Remediation classification:** BOUNDED TRANSITIVE-DEPENDENCY REMEDIATION (Option D of the diagnosis).
**Risk level:** MEDIUM (per prompt §A).
**Production impact:** NONE at request time — `brace-expansion` is a build-time string-expansion helper
reachable only by the Tailwind CLI and TypeScript language server (§18 of the diagnosis).

---

## 2. Final status

# **PASS WITH WARNINGS**

All dependency, audit, test, coverage, and build gates pass. Node 22.13.1 validation passes. No unrelated
dependency drift occurred. Production metrics and deployment verification remain pending (out of scope —
no deployment was authorized). No mandatory gate remains blocked. The "warnings" are:
(a) production metrics remain unavailable,
(b) deployment verification remains pending,
(c) the optional `tailwindcss-animate` reclassification follow-up remains open, and
(d) the exact transitive overrides require future maintenance review when `minimatch` or
`brace-expansion` changes.

---

## 3. Finding and advisory IDs

| Field | Value |
|---|---|
| Finding ID | `DEP-AUDIT-002` |
| Bug ID | `BUG-BRACE-EXPANSION-HIGH-ADVISORY` |
| Advisories (all three span every installed major line) | `GHSA-qhr7-859c-m2p7` / CVE-2026-102278; `GHSA-q2hr-2g5m-vwhr` / CVE-2026-102277; `GHSA-6j4f-fj2g-mc7p` / CVE-2026-102276 |
| Published | 2026-09-29 |
| Root cause (overall classification) | **MULTI-FACTOR TRANSITIVE DEPENDENCY DEFECT** — (1) production-audit exposure: `tailwindcss-animate` is classified under production dependencies, which pulls the Tailwind build-tool chain into npm's production closure; (2) full-tree dependency defect: newly published `brace-expansion` advisories affect eight pinned transitive copies across production-classified and development-tooling paths |

## 4. Diagnostic reference

Step 1 (read-only) report, read in full before any edit:
`docs/reports/diagnostics/BUG-BRACE-EXPANSION-HIGH-ADVISORY-DIAGNOSIS.md`.
Sections relied on: §9 (8-copy inventory), §11/§12 (advisory fix thresholds and registry versions), §22
(Option D validated in scratch), §24 (in-range semver compatibility), §25 (CI impact 1 → 0).

## 5. Relationship to Phase 12

Phase 12 (CACHE-OPS-001) is **blocked on exactly this audit gate.** Its implementation passed all code gates;
only the dependency-security gate was red. Phase 13 closes that gate **without touching any Phase 12 source or
test** — the one-line `invalidateMovieCache` addition in `lib/cacheManager.ts` and the new
`tests/ai-similar-cache-invalidation.test.ts` are preserved byte-for-byte. Phase 13 additionally re-ran the
Phase 12 focused/targeted suites to prove the dependency movement did not regress them, and corrected the Phase 12
report's standing warnings to reflect closure (§30 of this report).

## 6. Initial Git state (before mutation)

Recorded with `git status --porcelain=v2 --branch`, `git rev-parse HEAD`, and the untracked inventory:

| Property | Value |
|---|---|
| Branch | `work/phase-12-cache-invalidation-diagnosis` |
| HEAD | `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f` (matches expected start) |
| Staged | none (index empty) |
| Tracked diff | `lib/cacheManager.ts` modified (Phase 12 delta, +7/−1) |
| Untracked deliverables | `docs/reports/PHASE-12-…COMPLETION-REPORT.md`, `docs/reports/diagnostics/BUG-AI-SIMILAR-CACHE-INVALIDATION-GAP-DIAGNOSIS.md`, `docs/reports/diagnostics/BUG-BRACE-EXPANSION-HIGH-ADVISORY-DIAGNOSIS.md`, `tests/ai-similar-cache-invalidation.test.ts` |
| Untracked scratch/debug artifacts | `.chunks/`, `.inbox3.txt`, `.my_tool_sandbox/`, `.phase11-prompt.txt`, `as_route_copy.txt`, `cqq.txt`, `cqq_full.txt`, `failed_block.txt`, `nul`, `route_dump.txt` — pre-existing, outside this phase's scope |
| `package.json` / `package-lock.json` at start | **byte-identical to HEAD** (verified: `git diff --quiet HEAD` empty; SHA-256 raw = `13be9f06…` / `51484f3e…`, LF-blob = `be5e004e…` / `cf84fad8…`, git blob SHA-1 = `8bd89a8d` / `fd495924` — all matching the diagnosis §5 table) |

Branch and HEAD confirmed to match the prompt §0 expectations. The Phase 12 source/test/report delta was
present. No registry or audit drift: the live audit reproduced the diagnosis baseline exactly (1 High, 8 copies).

## 7. Environment versions

| Property | Value |
|---|---|
| OS | Windows 10 |
| Shell | git-bash / MSYS (`/usr/bin/bash`) |
| Node (default on PATH) | `v26.7.0` |
| npm (paired to Node 26) | `11.19.0` |
| Git | `2.50.1.windows.1` |
| Node 22 validation runtime | `C:\Users\amrko\AppData\Local\ms-playwright-go\1.50.1\node.exe` → **v22.13.1** (pre-existing; discovered in Phase 11; reused here; not installed or downloaded) |
| npm run under Node 22 | `11.19.0` (the paired npm CLI, `node <26-dist>/node_modules/npm/bin/npm-cli.js`, executed under the v22.13.1 binary) |

## 8. Pre-change audit reproduction (read-only)

All four forms ran **before** any edit, on the default runtime:

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `npm audit --omit=dev --json` | **1** | 1 vulnerability, `{high:1}` — single `brace-expansion` entry (3 merged `via` = the 3 GHSAs) |
| 2 | `npm audit --audit-level=high --omit=dev` | **1** | `found 1 vulnerability (1 high)` |
| 3 | `npm audit --json` | **1** | same single merged entry, 1 high |
| 4 | `npm audit --audit-level=high` | **1** | `found 1 vulnerability (1 high)` |
| 5 | `npm ls brace-expansion --all` | 0 | 8 copies: 6 × 1.1.18, 1 × 2.1.4, 1 × 5.0.9 |
| 6 | `npm ls brace-expansion --omit=dev --all` | 0 | 1 prod copy at 2.1.4 (the `tailwindcss-animate` chain) |
| 7 | `npm explain brace-expansion` | 0 | confirmed every chain; prod copy flagged dev-absent |

Values match the diagnosis §6/§7/§9 baseline **exactly**. No registry drift — the diagnosis's selected
versions (1.1.21 / 2.1.7 / 5.0.12) remained valid and were applied.

## 9. Initial installed-copy inventory

| # | Location | Before version | After version |
|---|---|---|---|
| 1 | `node_modules/brace-expansion` | 2.1.4 | **2.1.7** |
| 2 | `.../eslint/node_modules/brace-expansion` | 1.1.18 | **1.1.21** |
| 3 | `.../eslint-plugin-import/node_modules/...` | 1.1.18 | **1.1.21** |
| 4 | `.../eslint-plugin-jsx-a11y/node_modules/...` | 1.1.18 | **1.1.21** |
| 5 | `.../eslint-plugin-react/node_modules/...` | 1.1.18 | **1.1.21** |
| 6 | `.../@eslint/config-array/node_modules/...` | 1.1.18 | **1.1.21** |
| 7 | `.../@eslint/eslintrc/node_modules/...` | 1.1.18 | **1.1.21** |
| 8 | `.../@typescript-eslint/typescript-estree/node_modules/...` | 5.0.9 | **5.0.12** |

Physical-copy scan (`find node_modules -type d -name brace-expansion`) = 8 before and after.

## 10. Approved remediation

Option D (diagnosis §22): add three scoped entries to the existing `overrides` block, each pinning the per-line
patched minimum that clears all three current advisories:

```json
"minimatch@3.1.5":  { "brace-expansion": "1.1.21" }
"minimatch@9.0.9":  { "brace-expansion": "2.1.7"  }
"minimatch@10.2.6": { "brace-expansion": "5.0.12" }
```

These are the *maximum* of the three advisory `fixed` thresholds per installed major (diagnosis §11–§12),
so no installed line remains vulnerable. `1.1.20`/`2.1.6`/`5.0.11` were explicitly not used (they do not
clear every advisory).

## 11. `package.json` changes

Only the `overrides` object changed. The diff (`git diff HEAD -- package.json`) is **10 insertions / 1
deletion** and contains exactly the three scoped entries plus the closing-comma on the previous last key.
No `dependencies`, `devDependencies`, `scripts`, or metadata changed. `tailwindcss-animate` remains in
`dependencies` (reclassification is the separate optional follow-up, not done here). Verified: `git diff --name-status`
for `package.json` shows `M`; byte-level diff confirmed the three entries are the only delta.

## 12. `package-lock.json` changes

Regenerated with `npm install --package-lock-only --ignore-scripts`. `lockfileVersion` stayed `3`.
Complete diff inspected — `git diff --numstat HEAD -- package-lock.json` = **24 insertions / 24 deletions**,
i.e. exactly 8 × (version + resolved + integrity). No package added, removed, or moved (verified by a
machine-level before/after lockfile comparison: 855 → 855 keys, 0 added, 0 removed, 8 version changes,
0 dependency/dev/peer/optional-edge changes, root entry unchanged).

## 13. Packages added

**0.**

## 14. Packages removed

**0.**

## 15. Version changes

Exactly 8, all `brace-expansion` (table in §9). No other package version moved.

## 16. Dependency-edge result

Zero dependency-edge changes. A programmatic diff of every consumer's `dependencies`, `devDependencies`,
`peerDependencies`, and `optionalDependencies` maps between the HEAD lockfile and the regenerated lockfile
returned **0 changes**. The graph topology is byte-identical; only the pinned transitive `brace-expansion`
versions shifted. No consumer's declared range was widened or narrowed.

## 17. Installation result

`npm install --package-lock-only --ignore-scripts` (manifest + lockfile step) and then `npm install
--ignore-scripts` (tree sync) both exited 0. Observed:

- No lifecycle scripts ran (`--ignore-scripts` on both; confirmed by the "added N packages" / "up to date"
  lines with no script output).
- No peer or engine errors — only the **pre-existing** `ERESOLVE overriding peer dependency` warning for
  `@types/node` (vite `8.3.1` peerOptional `^20.19.0 || >=22.12.0` vs the locked `@types/node@20.17.19`).
  This warning is present identically at HEAD (verified in the pre-change `npm install --package-lock-only`
  baseline run); it is **not** introduced by Phase 13.
- Tree-sync step reported **"added 8 packages, and audited 771 packages in 6s"** — these are the 8
  `brace-expansion` copies re-materialized from cache at their new pinned versions. The 771 audited is the
  full tree; no unrelated package count changed.
- `found 0 vulnerabilities` printed after install.

Post-sync physical-copy verification confirmed all 8 directories now report `1.1.21` (×6), `2.1.7` (×1),
`5.0.12` (×1) on disk — matching the lockfile.

## 18. Final dependency tree

`npm ls brace-expansion --all` (post) → 8 copies, all `overridden`:

| # | Location | Final version | Chain |
|---|---|---|---|
| 1 | `node_modules/brace-expansion` | **2.1.7** | tailwindcss → sucrase → glob@10.5.0 → minimatch@9.0.9 |
| 2 | `.../eslint/...` | **1.1.21** | eslint@9.39.5 → minimatch@3.1.5 |
| 3 | `.../eslint-plugin-react/...` | **1.1.21** | eslint-plugin-react@7.37.5 → minimatch@3.1.5 |
| 4 | `.../eslint-plugin-jsx-a11y/...` | **1.1.21** | eslint-plugin-jsx-a11y@6.10.2 → minimatch@3.1.5 |
| 5 | `.../eslint-plugin-import/...` | **1.1.21** | eslint-plugin-import@2.32.0 → minimatch@3.1.5 |
| 6 | `.../@eslint/config-array/...` | **1.1.21** | @eslint/config-array@0.21.2 → minimatch@3.1.5 |
| 7 | `.../@eslint/eslintrc/...` | **1.1.21** | @eslint/eslintrc@3.3.6 → minimatch@3.1.5 |
| 8 | `.../@typescript-eslint/typescript-estree/...` | **5.0.12** | @typescript-eslint/*@8.67.0 → minimatch@10.2.6 |

No vulnerable `1.1.18`, `2.1.4`, or `5.0.9` copy remains. `npm ls brace-expansion --omit=dev --all` shows the
single prod copy at `2.1.7`. No invalid or extraneous dependency.

## 19. Final production audit

`npm audit --audit-level=high --omit=dev` → **exit 0**, `found 0 vulnerabilities`.
`npm audit --omit=dev --json` → exit 0, `{info:0, low:0, moderate:0, high:0, critical:0, total:0}`, zero advisory keys.

## 20. Final bare audit

`npm audit --audit-level=high` → **exit 0**. `npm audit --json` → exit 0, `{total:0}`. No low, moderate,
high, or critical finding remains in either form.

## 21. Node 22 result

The v22.13.1 runtime (`C:\Users\amrko\AppData\Local\ms-playwright-go\1.50.1\node.exe`) was confirmed available
(`node --version` → `v22.13.1`; `npm` under it → `11.19.0`). **All of §22–§28 below ran under Node 22.13.1.**
No Node 22 was installed or downloaded; the runtime was pre-existing and reused.

## 22. Phase 12 focused result (under Node 22.13.1)

`npx vitest run tests/ai-similar-cache-invalidation.test.ts` → **1 file / 11 tests, all passed**, exit 0.
Zero unhandled errors. No test source changed.

## 23. Targeted result (under Node 22.13.1)

`npx vitest run` over the 7 cache/AI-similar files (`ai-similar-cache-invalidation`,
`redis-cache-security`, `cache-key-normalization`, `performance-phase2`, `admin-chat-ai-security`,
`strict-validation`, `ai-similar-enrichment-concurrency`) → **7 files / 84 tests, all passed**, exit 0.
No `--reporter=basic` used. No real Redis/DB/Gemini/TMDB contact (suites mock their dependencies).

## 24. Typecheck result (under Node 22.13.1)

`npm run typecheck` (`tsc --noEmit`) → **exit 0, zero errors**.

## 25. Lint result (under Node 22.13.1)

`npm run lint` → **exit 0, 0 errors, 93 warnings** — identical to the recorded baseline. **No new warning**
is attributable to Phase 12 or Phase 13 (the 93 are the pre-existing `no-unused-vars` warnings in test files).

## 26. Full-suite result (under Node 22.13.1)

`npm test` (`vitest run`) → **exit 0, 43 files / 442 tests, all passed**. Zero failures, zero unhandled
errors. Matches the expected counts from the prompt. Confirmed under Node 22.13.1 (run `proc_c275db2e9b8d`,
duration 77.34s, `FULLSUITE_N22_EXIT=0`); an independent Node 26.7.0 run produced identical 43/442 results,
so the gate is runtime-stable across both majors.

## 27. Coverage result (under Node 22.13.1)

`npm run test:coverage` → exit 0, V8 provider loaded. Recorded:

| Metric | Value |
|---|---|
| Statements | 58.76% (1257/2139) |
| Branches | 49.53% (636/1284) |
| Functions | 69.19% (164/237) |
| Lines | 60.06% (1202/2001) |

These match the Phase 11 recorded coverage exactly (58.76 / 49.53 / 69.19 / 60.06), confirming the dependency
movement did not alter test coverage. No coverage-configuration change was made. Confirmed under Node
22.13.1 (run `proc_a787509a0857`, `COVERAGE_N22_EXIT=0`).

## 28. Production-build result (under Node 22.13.1)

CI-placeholder production build (`NODE_ENV=production npm run build` with non-production placeholder env
vars, `NEXT_TELEMETRY_DISABLED=1`) → **exit 0**. All routes compiled (31 static `○` pages + 22 dynamic `ƒ`
API routes + middleware). No new Phase 13 warning. No environment file was created. No placeholder value was
printed into the build output (verified: `grep -rc "placeholder-*" .next/` returned 0 across all manifest files).
The `.next/` build directory was removed after verification (it is gitignored and is not part of the deliverable).

## 29. Unrelated dependency-drift check

A before/after programmatic comparison of the HEAD lockfile against the regenerated lockfile:
- Total packages: **855 → 855** (delta 0).
- Packages added: **0**.
- Packages removed: **0**.
- Version changes: **8** (all `brace-expansion`).
- Dependency/dev/peer/optional-edge changes: **0**.
- Root entry changed: **false**.

No unrelated package moved. The 855-package count was confirmed identical to the diagnosis baseline.

## 30. Phase 12 report corrections

`docs/reports/PHASE-12-AI-SIMILAR-CACHE-INVALIDATION-CORRECTION-COMPLETION-REPORT.md` was updated with
factual corrections only — no historical command output was altered:

1. **Final status block (§2):** the existing `PASS WITH WARNINGS` is preserved, but a post-phase note was
   added stating that CACHE-OPS-001 implementation passed, the mandatory audit blocker was closed by Phase 13,
   both audits now exit 0, and no Phase 12 source/test behavior changed.
2. **Executive summary (§1):** the two standing warnings were reworded as *subsequently closed by Phase 13*
   (advisory via the scoped overrides; Node 22 via the Phase 11-discovered v22.13.1 runtime).
3. **Test-typing sequence (§33):** corrected from "found and fixed *before* any production edit" to "found
   and fixed *after* the production edit, the focused behavioral GREEN, and targeted validation" — the 7 TS7006
   defects were test-only typing defects discovered when `tsc` was first run post-edit, and did **not**
   invalidate the canonical pre-edit behavioral RED.
4. **Node wording (§7, §45, §47):** corrected to record that Phase 12 originally validated under Node 26.7.0,
   Node 22.13.1 had previously been discovered during Phase 11, and Phase 13 reused it for final validation.
   W-A1 and W-1 in §47 are now marked **CLOSED by Phase 13**.

All original RED, GREEN, cache-tier, Git, and implementation evidence was preserved. The Phase 12 report does
not claim its original audit gates passed during its own run — that is stated accurately as a post-phase closure.

## 31. Failures and bounded corrections

| # | Failure | Classification | Bounded correction | Result |
|---|---|---|---|---|
| 1 | Tree-sync install reported "up to date" but disk still held the old `brace-expansion` versions (the hidden `node_modules/.package-lock.json` marker indicated the tree was already in sync with the *regenerated* lockfile, so npm skipped re-extraction even though the physical payload dirs predated the lock change) | **npm tree-sync staleness** — not a remediation defect | Removed the 8 stale `brace-expansion` payload dirs, re-ran `npm install --ignore-scripts` → "added 8 packages"; verified all 8 dirs now report the new versions on disk | **CLOSED** — disk and lockfile agree |

This was a *materialization* issue (npm trusting its stale in-tree marker), not a correctness issue: the
manifest, lockfile, and audit were all already correct before it. No source, test, config, CI, or environment
file was touched; no `npm audit fix` was run.

Classification of the bounded local action:

- **No tracked file was deleted.** No repository deliverable was deleted.
- The **eight gitignored `brace-expansion` payload directories under `node_modules`** were removed because npm's
  in-tree marker (`node_modules/.package-lock.json`) incorrectly treated the old payloads as synchronized with
  the regenerated lockfile.
- `npm install --ignore-scripts` **re-materialized exactly those eight copies at the patched versions**
  (1.1.21 ×6, 2.1.7 ×1, 5.0.12 ×1) — verified on disk in §17/§18.
- This was **local dependency-tree synchronization only**. It is **not** a general cleanup recommendation.
- It did not modify source, tests, config, CI, environment files, or Git history.

## 32. Scope-change proposals

**None.** The remediation stayed entirely within the approved file scope (`package.json`,
`package-lock.json`, the Phase 12 report correction, and the new Phase 13 report). No application source,
test, config, CI, or environment file required a change. No registry drift forced a version re-selection.

## 33. External-registry access

- **npm registry** (read-only metadata): `npm view brace-expansion@{1.1.21,2.1.7,5.0.12} dist.integrity`
  and `npm cache ls brace-expansion` were used to confirm the target tarballs were already present in the
  local cache and that their integrity hashes matched the lockfile. No packages were published; no install
  fetched from the network beyond the already-cached tarballs.
- **OSV API** (read-only, in Step 1): advisory metadata was fetched in the diagnosis, not re-fetched here.
- No credentials, tokens, or secrets were used or printed.

## 34. Files created

| File | Purpose |
|---|---|
| `docs/reports/PHASE-13-BRACE-EXPANSION-ADVISORY-REMEDIATION-COMPLETION-REPORT.md` | This report |
| `node_modules/.package-lock.json` (hidden, gitignored) | Regenerated npm in-tree marker (not a deliverable) |

## 35. Files modified

| File | Change |
|---|---|
| `package.json` | +3 scoped `overrides` entries (10 insertions / 1 deletion) |
| `package-lock.json` | 8 `brace-expansion` version bumps (24 insertions / 24 deletions) |
| `docs/reports/PHASE-12-AI-SIMILAR-CACHE-INVALIDATION-CORRECTION-COMPLETION-REPORT.md` | Factual corrections only (§30) |

## 36. Files deleted

None. No tracked file was deleted. The 8 stale `node_modules/**/brace-expansion` payload directories were
removed as an in-tree sync step (gitignored `node_modules`), and `node_modules` was not reinstalled from empty.
No repository deliverable was deleted; `node_modules` is not a deliverable.

## 37. Final Git state

Captured with the §13 change-control commands:

| Property | Value |
|---|---|
| Branch | `work/phase-12-cache-invalidation-diagnosis` |
| HEAD | `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f` (**unchanged** from start) |
| Staged | none (`git diff --cached` empty) |
| Tracked modified | `lib/cacheManager.ts` (Phase 12 delta, byte-identical to its pre-Phase-13 state), `package.json` (+3 overrides), `package-lock.json` (8 version bumps) |
| Untracked deliverables | `docs/reports/PHASE-12-…COMPLETION-REPORT.md` (corrected), `docs/reports/diagnostics/BUG-AI-SIMILAR-CACHE-INVALIDATION-GAP-DIAGNOSIS.md`, `docs/reports/diagnostics/BUG-BRACE-EXPANSION-HIGH-ADVISORY-DIAGNOSIS.md` (unchanged), `tests/ai-similar-cache-invalidation.test.ts` (unchanged), **`docs/reports/PHASE-13-…COMPLETION-REPORT.md` (this report, new)** |
| Untracked pre-existing scratch/debug | `.chunks/`, `.inbox3.txt`, `.my_tool_sandbox/`, `.phase11-prompt.txt`, `as_route_copy.txt`, `cqq.txt`, `cqq_full.txt`, `failed_block.txt`, `nul`, `route_dump.txt` — **not** created by this phase |

- `lib/cacheManager.ts` and `tests/ai-similar-cache-invalidation.test.ts` (Phase 12 delta) are **unchanged**
  by Phase 13.
- No application source changed in Phase 13.
- No existing test changed in Phase 13.
- No config, CI, or environment file changed.
- Diagnostic reports unchanged.
- Nothing staged.
- HEAD unchanged.
- No commit, no push, no merge, no deployment.
- No registry output or temporary install artifact remains in the repository (the `.next/` build dir was
  removed after the build; `node_modules` and the hidden `.package-lock.json` marker are gitignored).

Remote refs (no remote ref moved during Phase 13):

- `origin/release/phases-2-11-verified` remained at `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f` — this is also
  the local branch HEAD, unchanged since the start.
- `origin/main` remained at `bcdb83473071c3a704335861a0cd7204317298a8`.
- Pull Request #14 remained open and unmerged.

No fetch, pull, push, merge, or rebase was performed; no remote ref moved.

## 38. Phase attribution

Every change in this phase is attributable to the approved Option D remediation. Because the Phase 11
diagnosis established that the pre-change lockfile was byte-identical on a clean regen (§15), the entire
`package-lock.json` delta is attributable to the three overrides alone. The Phase 12 delta
(`lib/cacheManager.ts`, `tests/ai-similar-cache-invalidation.test.ts`, and its two reports) predates this
phase and is not touched by it.

## 39. Commit status

**No commit was made.** HEAD is unchanged at `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f`.

## 40. Push status

**No push occurred.** No remote ref moved. `origin/release/phases-2-11-verified` remained at
`6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f` and `origin/main` remained at
`bcdb83473071c3a704335861a0cd7204317298a8`. PR #14 remained open and unmerged.

## 41. Merge status

**No merge occurred.** The working branch `work/phase-12-cache-invalidation-diagnosis` was not merged into
any other branch.

## 42. Deployment status

**No deployment occurred.** No Vercel / other deploy target was contacted. No deployment environment file
was created.

## 43. External systems and state changes

| System | Change |
|---|---|
| `node_modules` (gitignored) | 8 `brace-expansion` payload dirs re-materialized at 1.1.21 / 2.1.7 / 5.0.12 |
| `node_modules/.package-lock.json` (hidden, gitignored) | Regenerated to match the new lockfile |
| `.next/` (gitignored) | Built, verified, then removed |
| `coverage/` (gitignored) | Regenerated by `npm run test:coverage` |
| npm cache | 3 target tarballs already present (no network fetch required) |
| GitHub (PR #14, release branch) | **Untouched** |
| Vercel / deployment | **Untouched** |
| Redis / MongoDB / Gemini / TMDB | **No live contact** — all test suites mock their external dependencies |

## 44. Rollback considerations

The remediation is a bounded reverse patch limited to: the 3 `overrides` entries, the 8 lockfile version
movements, the Phase 12 report correction, and this Phase 13 report. Rollback is either:
1. **Before an authorized commit exists:** a reviewed reverse patch removing the three override entries and
   restoring the 8 lockfile `brace-expansion` entries to 1.1.18 / 2.1.4 / 5.0.9, then re-running
   `npm install --ignore-scripts` and both audits to re-confirm the pre-existing advisory state.
2. **After an authorized commit exists:** `git revert <commit-sha>` followed by `npm install --ignore-scripts`
   and both audits.

No destructive Git commands are used or recommended (`git checkout` / `git restore` / `git reset` / `git clean`
/ `git stash` are all out of scope). After rollback, re-run the dependency install, both audits, the Phase 12
focused/targeted suites, typecheck, lint, full suite, coverage, and build to re-confirm the restored state.
Rollback risk is **low**: `brace-expansion` is a pure string-expansion helper with no native binding and no
postinstall hook; the lockfile fully defines the graph.

## 45. Remaining findings

| ID | Finding | Severity | Status |
|---|---|---|---|
| `tailwindcss-animate` reclassification | Build-only Tailwind plugin still declared in production `dependencies` | LOW | **OPEN, optional follow-up** — moving it to `devDependencies` would let `--omit=dev` exclude the prod chain; independent of and additive to this override fix (diagnosis §21/§28). Not done here (out of scope, §E). |
| New `brace-expansion` advisories after 2026-09-30 | Any future advisory would require a new override bump | LOW | **OPEN, inherent to dependency maintenance** — caught by the CI audit gate (diagnosis §27). |
| Production metrics / deployment verification | No real-world staleness metrics collected | LOW | **PENDING** — out of scope; no deployment authorized. |

## 46. Risks

| ID | Risk | Severity | Mitigation / note |
|---|---|---|---|
| D-1 | A future `minimatch` patch release legitimately needs a different brace version | LOW | The scoped overrides currently pin exact patched versions for their matching minimatch consumers. This deterministic pin is intentional. Future minimatch or brace-expansion upgrades may require reviewing, updating, or removing the overrides (diagnosis §24). Re-run the audit gate after any lockfile regen. |
| D-2 | The lockfile does not serialize the `overrides` key (npm lockfile v3) | LOW | Documented (diagnosis §15/§27): `npm ls overrides` prints `(empty)` forever; the resolved versions are the evidence. Not drift. |
| D-3 | npm tree-sync staleness (the §31 failure) | LOW | **Resolved** this phase: the 8 payload dirs were re-materialized and verified on disk. |
| D-4 | Unrelated dependency movement | — | **Verified absent**: 0 added / 0 removed / 0 edge changes (§29). |

## 47. Manual verification required

None required for correctness — the audits, dependency-tree scan, and full validation ladder under Node 22
all confirm the remediation. Optional operational checks if a deployment is later authorized:
(a) re-run `npm audit --audit-level=high --omit=dev` and `npm audit` in CI (Node 22) to confirm the gate is
green; (b) if the optional `tailwindcss-animate` reclassification is performed in a future phase, re-run the
same two audit forms to confirm `--omit=dev` now excludes the prod chain entirely.

## 48. Requirement Traceability Matrix

| Requirement ID | Requirement | Implementation evidence | Validation evidence | Status |
|---|---|---|---|---|
| BRACE-FIX-1 | Upgrade every installed vulnerable brace-expansion major line | 3 scoped `overrides` entries in `package.json` (§11); 8 lockfile bumps (§12/§15) | Final tree §18: 6 × 1.1.21, 1 × 2.1.7, 1 × 5.0.12; no vulnerable copy | **PASS** |
| BRACE-FIX-2 | Use the minimum versions clearing all current advisories | Targets 1.1.21 / 2.1.7 / 5.0.12 (max of 3 `fixed` thresholds per major, diagnosis §12) | §19/§20 audits exit 0, 0 vulnerabilities | **PASS** |
| BRACE-FIX-3 | Preserve consumer semver compatibility | Each target in-range for its consumer's declared range (diagnosis §24: `^1.1.7`/`^2.0.2`/`^5.0.8`) | §16: 0 edge changes; §17: install exit 0 | **PASS** |
| BRACE-FIX-4 | Prevent unrelated dependency movement | §29 machine diff: 855 → 855, 0 added, 0 removed, 8 version-only changes, 0 edge changes | §12/§29 before/after lockfile comparison | **PASS** |
| BRACE-FIX-5 | Preserve the Phase 12 cache-invalidation implementation | `lib/cacheManager.ts` and `tests/ai-similar-cache-invalidation.test.ts` untouched by Phase 13 | §22 focused 11/11 + §23 targeted 84/84 under Node 22; §26 full suite 442/442 | **PASS** |
| BRACE-FIX-6 | Return production and bare audit gates to zero | §10/§11/§12 remediation applied | §19 prod audit exit 0 / 0 vulns; §20 bare audit exit 0 / 0 vulns | **PASS** |
| BRACE-FIX-7 | Validate on Node 22.13.1 | Reused the Phase 11-discovered runtime; no Node installed (§7, §21) | §22–§28 all ran under v22.13.1; §21 runtime confirmed | **PASS** |
| BRACE-FIX-8 | Pass focused, targeted, typecheck, lint, full-suite, coverage, audit, and build gates | §22–§28, §19/§20 | §22 11/11; §23 84/84; §24 exit 0; §25 0 err/93 warn; §26 442/442; §27 coverage recorded; §19/§20 0/0; §28 build exit 0 | **PASS** |
| BRACE-FIX-9 | Correct the Phase 12 completion status and factual record | §30: status preserved + closure note; §1/§2 summary; §7/§45 Node wording; §33 typing sequence; §47 W-A1/W-1 closed | Phase 12 report diff inspected; no historical command output altered; audit-closure stated accurately | **PASS** |
| BRACE-FIX-10 | Preserve release branch, Pull Request #14, and remote state | No merge, no push (§40/§41); no fetch/pull/push/merge/rebase performed | §37/§40: `origin/release/phases-2-11-verified` remained at `6f0595ab…`, `origin/main` remained at `bcdb8347…`, PR #14 open and unmerged; no remote ref moved | **PASS** |
| BRACE-FIX-11 | Make no commit, push, merge, or deployment | No Git-mutating command run (§39–§42) | §37/§39/§40/§41/§42: HEAD unchanged, nothing staged, no commit/push/merge/deploy | **PASS** |
| BRACE-FIX-12 | Produce complete dependency and validation evidence | This report (§1–§50) with pre/post audit, tree, lockfile diff, install, and full validation ladder | Every claim backed by a measured command output (§8, §17–§28, §29) | **PASS** |

All 12 requirements **PASS**. No requirement is BLOCKED, NOT EXECUTED, or NOT APPLICABLE.

## 49. Entry recommendation for commit planning

**Recommended for commit.** The working tree now contains exactly the approved Phase 13 delta on top of the
preserved Phase 12 delta:

- `package.json` (+3 scoped overrides)
- `package-lock.json` (8 `brace-expansion` version bumps)
- `docs/reports/PHASE-12-AI-SIMILAR-CACHE-INVALIDATION-CORRECTION-COMPLETION-REPORT.md` (factual corrections)
- `docs/reports/PHASE-13-BRACE-EXPANSION-ADVISORY-REMEDIATION-COMPLETION-REPORT.md` (this report, new)

plus the pre-existing Phase 12 deliverables (`lib/cacheManager.ts`,
`tests/ai-similar-cache-invalidation.test.ts`, and the two diagnostic reports). A single coherent commit
covering the Phase 12 + Phase 13 deltas is ready for the authorized commit step (out of scope here — commit
policy is `COMMIT_ALLOWED: NO`). The optional `tailwindcss-animate` reclassification should be tracked as a
separate follow-up, not bundled into this commit.

## 50. Requirement-by-requirement checklist

- [x] **BRACE-FIX-1** — All vulnerable major lines upgraded (§18).
- [x] **BRACE-FIX-2** — Per-line minimums that clear every current advisory used (§10/§12/§15).
- [x] **BRACE-FIX-3** — Consumer semver compatibility preserved (§16/§17).
- [x] **BRACE-FIX-4** — No unrelated dependency movement (§29: 0/0/8/0).
- [x] **BRACE-FIX-5** — Phase 12 implementation preserved (§22/§23/§26/§37).
- [x] **BRACE-FIX-6** — Both audit gates back to zero (§19/§20).
- [x] **BRACE-FIX-7** — Validated on Node 22.13.1 (§21–§28).
- [x] **BRACE-FIX-8** — All eight gates pass (§22–§28).
- [x] **BRACE-FIX-9** — Phase 12 report status/factual record corrected (§30).
- [x] **BRACE-FIX-10** — Release branch, PR #14, and remote state preserved (§37/§40/§41).
- [x] **BRACE-FIX-11** — No commit, push, merge, or deployment (§39–§42).
- [x] **BRACE-FIX-12** — Complete dependency and validation evidence produced (§1–§50).

---

---

## Phase 14 annotation (additive, non-destructive) — BRACES-EXC

Appended by Phase 14 (DEP-AUDIT-003 / BUG-BRACES-UNPATCHED-STACK-EXHAUSTION).
No text above this separator was altered.

1. **The brace-expansion remediation remains intact.** The three scoped `overrides` entries (minimatch@3.1.5 to brace-expansion@1.1.21; minimatch@9.0.9 to @2.1.7; minimatch@10.2.6 to @5.0.12) and the regenerated lockfile are untouched and were re-verified: all four audit forms report zero brace-expansion vulnerabilities, and all eight copies remain at 1.1.21x6 / 2.1.7 / 5.0.12.
2. **All three Phase 13 advisories remain absent.** The `brace-expansion` findings Phase 13 closed have not reappeared. The `braces` advisory addressed by Phase 14 is a separate, later advisory on a different package.
3. **A separate `braces` advisory subsequently entered the audit database.** GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 (stack-exhaustion DoS, CVSS 7.5) on `braces` 3.0.3, published 2026-09-18, first observed in this repository 2026-10-03. No patched release exists; upstream fix PR micromatch/braces#72 is open and unmerged.
4. **The live raw audit now fails.** `npm audit --audit-level=high --omit=dev` and `npm audit --audit-level=high` both exit 1 on account of the `braces` advisory. The policy gate (`node scripts/audit-policy.mjs`) exits 0 only because the exact, time-limited, human-reviewed exception is applied.
5. **Phase 14 policy handles only that exact advisory temporarily.** The exception expires 2026-10-17T23:59:59Z and fails closed on every other state. It does not declare the package safe.
6. **Historical Phase 13 zero-audit evidence remains accurate for the time it ran.** Every audit-zero, tree-sync, and validation record in this report is preserved verbatim and was correct when recorded. Nothing was rewritten or retracted.
