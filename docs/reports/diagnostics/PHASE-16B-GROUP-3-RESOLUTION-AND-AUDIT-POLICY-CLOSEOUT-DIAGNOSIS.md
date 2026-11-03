# Phase 16B - Group 3 Dependency Resolution and Audit-Policy Close-Out Diagnosis (Corrected)

**Finding ID:** DEP-AUDIT-005
**Project:** MovieMind
**Branch:** work/phase-12-cache-invalidation-diagnosis @ a89c1fb39df3139c7200fcd172357df3b247c54e
**Phase:** READ-ONLY diagnosis + isolated external experiments only (Experiment E / F / G)
**Output:** `docs/reports/diagnostics/PHASE-16B-GROUP-3-RESOLUTION-AND-AUDIT-POLICY-CLOSEOUT-DIAGNOSIS.md`
**Step 2:** NOT implemented in this diagnosis pass. No exception record was
created or modified by this pass.
**Step 2 final state (post-implementation correction):** Step 2 has since been
implemented in a separate authorized pass. The historical record of this pass
(Sections 1-13) is unchanged; the implemented final facts are appended in
Section 14.
**Commit / Push / Merge / Deployment:** NOT AUTHORIZED, NOT PERFORMED.

**Status: READY WITH DEV-ONLY RISK DECISION REQUIRED.** The production closure is fully
cleared and Glob is eliminated by a proven, validated change (Experiment E). The remaining
bare-audit finding is a single dev-only Minimatch advisory for which no compatible patched
version exists for the whole ESLint chain (Experiment F). The final policy target is therefore
the DEV-ONLY TEMPORARY EXCEPTION design of Experiment G, which requires an owner risk decision
plus two evaluator changes before Step 2 can be authorized. No complete, all-gates-green
clean-only solution exists today, so the stabilization target is NOT declared reachable in the
clean-only sense.

---

## 1. Executive Summary

Three questions were posed. All three are answered from isolated experiments executed under
exactly Node 22.13.1 and npm 11.19.0 (the runtime the CI uses):

1. **Does `tailwindcss-animate` reclassification + `sucrase 3.35.1` remove Glob from both
   trees?** YES. Proven in a clean isolated tree (Experiment E): the production audit drops to
   0 vulnerabilities / 0 advisory objects / exit 0, the bare audit loses the Glob advisory
   entirely, and the `glob` package is absent from the whole dependency tree (0 copies).
   `sucrase@3.35.1` resolves through `tinyglobby@0.2.17` instead. All gates pass in isolation:
   typecheck 0, lint 0 errors / 93 warnings, 45 test files / 499 tests, coverage unchanged
   from baseline, production build exit 0.

2. **Can `minimatch 11.0.1` be installed and validated on Node 22.13.1 / npm 11.19.0 in a clean
   isolated tree?** The INSTALL succeeds (no npm arborist failure - the crash seen earlier under
   npm 11.5.2 / Node 24 does not reproduce here), and forcing both remaining dev copies to
   11.0.1 drives BOTH raw audits to 0/0. **But validation fails**: ESLint crashes at startup
   with `SyntaxError: The requested module 'minimatch' does not provide an export named
   'default'` inside `@eslint/eslintrc` (Experiment F). minimatch@11 removed the default export
   that `@eslint/eslintrc@3.3.6` imports. The full override is therefore REJECTED.

3. **Is a narrow dev-only, time-limited risk exception the safer final policy?** YES. With
   Experiment E applied (and optionally the partially-compatible override of Experiment F2),
   the only remaining finding is exactly one advisory object - `minimatch@3.1.5` (dev-only,
   hoisted, ESLint chain) - for which no API-compatible patched release exists. This is the
   Experiment G design. It is DESIGNED ONLY in this report; it is not implemented, and it
   cannot be implemented as-is: the current evaluator hard-requires `high` severity and a
   non-empty CVSS vector, while this advisory is `moderate` and carries no CVSS vector in the
   npm audit feed. Two evaluator changes are required first (Section 9.4).

**Final policy target: DEV-ONLY TEMPORARY EXCEPTION** (per the task's Section G criteria:
production audit zero, Glob removed, only dev-only Minimatch advisory remaining, forced
Minimatch 11 not safely installable across the remaining chain). CLEAN-ONLY is explicitly NOT
recommended while the bare audit remains non-zero.

---

## 2. Scope, Constraints, and Method

- Read-only with respect to the repository working tree. The only repository artifact produced
  by this pass is this corrected diagnosis file.
- Step 2 was not implemented. No package.json, lockfile, exception record, policy script, CI
  file, or test file was modified. No staging, commit, push, merge, or deployment occurred.
- All experiments ran in an isolated copy of the source tree placed in external scratch
  (`<external-scratch>/p16b2/copy`), containing the full working tree (source + `package.json`
  + `package-lock.json` + `scripts/` + `config/`) minus `.git`, `node_modules`, `.next`, and
  `coverage`. Each experiment rebuilt its own `node_modules`.
- Isolated runtime, exactly as required: Node `v22.13.1` and npm `11.19.0`. npm 11.19.0 was
  copied as a self-contained package into external scratch
  (`<external-scratch>/p16b2/runtime/npm/bin/npm-cli.js`) and executed through the Node 22
  executable; no system runtime was installed or modified. (npm 11.19.0 declares engines
  `^20.17.0 || >=22.9.0`, so Node 22.13.1 is a supported runtime.)
- The isolated copy initially lacked the build-time environment files; `next build` failed on
  page-data collection for `/api/admin/cache` until the repository's gitignored `.env` /
  `.env.local` were copied in. This is an environment artifact of the isolated copy, not a
  dependency effect, and both files remained untouched in the repository.
- Preserve-target hashes were recorded before any experiment and re-verified after all
  experiments (Section 12): all 12 targets byte-identical.

**Counts are reported in two dimensions everywhere in this document** (this corrects the
conflation present in the earlier draft):

- **vulnerable package entries** - the number of package keys in the audit `vulnerabilities`
  map (parents propagate; one advisory fans out to many entries).
- **distinct advisory objects** - the number of unique concrete advisory objects found across
  all `via` arrays. The policy counts advisory objects, not package entries.

---

## 3. Validated Baseline (isolated copy, unmodified tree, Node 22 + npm 11.19.0)

Clean install of the current working tree (Phase 15 + Phase 16A deltas included):

- Install: exit 0, 770 packages added, no npm arborist error, no peer failures.
- Repository lockfile (unchanged): 855 lockfile entries, 1 `glob` copy, 8 `minimatch` copies.
- Production audit (`npm audit --omit=dev`): **3 vulnerable package entries / 2 distinct
  advisory objects**, 3 moderate, 0 high, exit 1.
  - Advisory object 1: `glob`, range `>=9.0.0 <=14.0.1`, source 1244013, moderate
    (GHSA-3g3m-2fjr-6pw4), reached via `sucrase@3.35.0 -> glob@10.5.0` (production chain).
  - Advisory object 2: `minimatch`, range `<11.0.1`, source 1244012, moderate
    (GHSA-g3hv-75wg-m249), reached via `glob@10.5.0 -> minimatch@9.0.9` and via the dev-side
    ESLint chain.
- Bare audit (`npm audit`): **16 vulnerable package entries / 2 distinct advisory objects**,
  16 moderate, 0 high, exit 1. Same two advisory objects; the extra entries are the dev-side
  parents (`eslint`, `eslint-config-next`, `@typescript-eslint/*`, plugins).
- Live policy on this baseline (Node 22, npm 11.19.0): both scopes rejected
  (`MULTIPLE_ADVISORY_OBJECTS`: 2 objects vs the one approved exception), exit 1. The approved
  Braces exception (GHSA-vfj7-8cjw-p6xm) is additionally expired (`expiryDate`
  2026-10-17T23:59:59Z; today is 2026-11-02), so it cannot accept anything.

Production chain to the two production-scope advisories (root cause, re-verified):

```
tailwindcss-animate@1.0.7  (declared in dependencies = production scope)
  -> tailwindcss@3.4.17    (peer resolution, production)
     -> sucrase@3.35.0     (production)
        -> glob@10.5.0     (production, GHSA-3g3m-2fjr-6pw4)
           -> minimatch@9.0.9 (production, GHSA-g3hv-75wg-m249)
```

Dev-side minimatch copies (all `dev=true` in the lockfile): `minimatch@3.1.5` hoisted plus 7
nested copies (`eslint`, `@eslint/eslintrc`, `@eslint/config-array`, `eslint-plugin-import`,
`eslint-plugin-jsx-a11y`, `eslint-plugin-react`, and one `10.2.6` under
`@typescript-eslint/typescript-estree`).

---

## 4. Advisory Verification

| Advisory | Package | Range | Severity | CVSS (npm feed) | Status in tree | Patched version |
|---|---|---|---|---|---|---|
| GHSA-3g3m-2fjr-6pw4 (source 1244013) | glob | `>=9.0.0 <=14.0.1` | moderate | not reported | production (via sucrase 3.35.0), eliminated by Experiment E | glob 14.0.2 (not needed: glob itself is removed) |
| GHSA-g3hv-75wg-m249 (source 1244012) | minimatch | `<11.0.1` | moderate | score 0, vector null | dev-only after Experiment E | minimatch 11.0.1 (API-incompatible with part of the ESLint chain) |
| GHSA-vfj7-8cjw-p6xm | braces | `<=3.0.3` | high | 7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H) | dev-side; exception record EXPIRED 2026-10-17T23:59:59Z | none published |

GHSA-g3hv-75wg-m249 cross-verified against the GitHub advisory database: CVE-2026-118764,
Moderate, CVSS v4 base score 6.9, vector
`CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N`, CWE-405, patched in
11.0.1. Note that npm's audit feed reports `cvss.score = 0` and no `vectorString` for this
advisory; the evaluator's identity checks consume the npm feed values, which is why the
Experiment G design records npm-feed values and treats the GitHub/NVD numbers as informational
(Section 9.4).

All versions of minimatch (3.1.5, 9.0.9, 10.2.6) map to the same advisory object key
(`minimatch <11.0.1`); identical advisory JSON deduplicates to one object.

---

## 5. Experiment E - Production and Glob Cleanup (SUCCESS)

**Applied to the isolated copy only:**

1. `tailwindcss-animate@^1.0.7` moved from `dependencies` to `devDependencies`.
2. Override added: `"sucrase": "3.35.1"`.
3. `node_modules` and `package-lock.json` deleted; lockfile regenerated with
   `npm install --ignore-scripts` (clean install, no scripts).

**Tree results:**

| Check | Result |
|---|---|
| Production tree contains tailwindcss / sucrase / glob / minimatch? | NO - `npm ls --omit=dev` for all six names returns empty |
| Full tree sucrase version | 3.35.1 (overridden) |
| glob@10.5.0 in the Tailwind/Sucrase chain | ABSENT - `glob` package count in the tree is 0 (glob removed entirely, replaced by tinyglobby 0.2.17) |
| tinyglobby replaces Glob | YES - `sucrase@3.35.1 -> tinyglobby@0.2.17` |
| Lockfile | regenerated, 807 entries, install exit 0, 728 packages |
| Remaining minimatch copies | 2, both dev-only: hoisted `node_modules/minimatch` 3.1.5, and `@typescript-eslint/typescript-estree/node_modules/minimatch` 10.2.6 |
| Remaining brace-expansion copies | 2, both dev-only: 1.1.21 (under the 3.1.5 franchise) and 5.0.12 (under 10.2.6) |

**Audit results (raw, unmodified npm audit):**

- Production audit: **0 vulnerable package entries / 0 distinct advisory objects / 3-tier
  totals all zero / exit 0.**
- Bare audit: **14 vulnerable package entries / 1 distinct advisory object**, 14 moderate,
  0 high, exit 1. The single advisory object is `minimatch <11.0.1` (source 1244012). The
  Glob advisory is absent. The 14 entries are: `minimatch`, `@eslint-community/eslint-utils`,
  `@eslint/config-array`, `@eslint/eslintrc`, `@typescript-eslint/eslint-plugin`,
  `@typescript-eslint/parser`, `@typescript-eslint/type-utils`,
  `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils`, `eslint`,
  `eslint-config-next`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`,
  `eslint-plugin-react`.
- Live policy against this state (with the expired Braces exception still in place):
  production scope = CLEAN_AUDIT accepted ("No exception required"); bare scope rejected at
  `ADVISORY_SOURCE_MISMATCH` (observed source 1244012 minimatch vs recorded 1240992 braces).

**All required gates (isolated copy, Node 22.13.1 / npm 11.19.0):**

| Gate | Result |
|---|---|
| `npm ls` (both scopes) | exit 0; no invalid, extraneous, unmet, or missing entries |
| Production audit | 0 vulnerabilities, exit 0 - PASS |
| Bare audit | 1 advisory object (minimatch, dev-only) - as expected for this stage |
| Typecheck | exit 0 - PASS |
| Lint | 0 errors / 93 warnings (identical to baseline) - PASS |
| Full suite | 45 test files / 499 tests passed - PASS |
| Production build | exit 0 - PASS (requires build-time env files present in the isolated copy) |

**Answer to open question 1: YES.** Reclassification + `sucrase 3.35.1` removes Glob from both
the production and the bare tree (the `glob` package disappears entirely), and zeroes the
production audit. This corrects the earlier draft's incomplete claim: Glob is removed by the
reclassification plus the sucrase override - NOT by minimatch overrides.

---

## 6. Experiment F - Minimatch Override on Node 22 (INSTALL OK, VALIDATION FAILS)

Environment: exactly Node 22.13.1 + npm 11.19.0, clean isolated tree, starting from the
successful Experiment E state. Blanket override was not tried first; the narrowest scoped
overrides for the remaining dev copies were used.

### 6.1 F-full: force both remaining dev copies to 11.0.1

Overrides applied (replacing the nested brace-expansion pins for those two slots):

```json
"minimatch@3.1.5": "11.0.1",
"minimatch@10.2.6": "11.0.1"
```

("minimatch@9.0.9" brace-expansion pin retained - dead in this tree because glob is absent.)

| Recorded item | Value |
|---|---|
| Install exit status | 0 (725 packages added; no arborist error) |
| Lockfile creation | success, 804 entries, lockfileVersion 3 |
| Invalid / extraneous packages | none (`npm ls --all` exit 0) |
| Peer warnings | none (0 peer/conflicting lines in stderr) |
| Arborist error | NONE - the `edgesOut` null crash seen earlier under npm 11.5.2 / Node 24 does NOT reproduce on Node 22.13.1 / npm 11.19.0 |
| Final minimatch versions | single copy `node_modules/minimatch` 11.0.1, dev=true |
| Final brace-expansion versions | single copy `node_modules/brace-expansion` 5.0.12, dev=true |
| glob copies | 0 |
| Raw production audit | 0 vulnerable package entries / 0 advisory objects, exit 0 |
| Raw bare audit | 0 vulnerable package entries / 0 advisory objects, exit 0 |

**Validation gate (the deciding factor):** `npm run lint` FAILS.

```
ESLint: 9.39.5
file://<isolated-copy>/node_modules/@eslint/eslintrc/lib/config-array/override-tester.js:23
import minimatch from "minimatch";
       ^^^^^^^^^^
SyntaxError: The requested module 'minimatch' does not provide an export named 'default'
```

Root cause confirmed by source inspection: `@eslint/eslintrc@3.3.6` does an ESM default import
(`import minimatch from "minimatch"; const { Minimatch } = minimatch;`), while minimatch@11
publishes only named exports (its `exports` map has `import`/`require` subpaths, no default
export). Forcing 11.0.1 into the `^3.1.5` slot breaks ESLint at startup. minimatch@11.0.1 also
requires `node 18 || 20 || >=22`, which Node 22.13.1 satisfies, so this is an API
incompatibility, not a runtime-engine problem.

**VERDICT: REJECTED.** Per the task's condition ("Do not accept the override unless every gate
passes"), the ESLint failure disqualifies the full override even though both raw audits reach
zero. No further gates were run for F-full after the ESLint failure.

### 6.2 F2-partial: only the compatible dev slot forced to 11.0.1

Overrides: `minimatch@10.2.6` -> `11.0.1`; the `minimatch@3.1.5` slot keeps its
brace-expansion 1.1.21 pin.

| Recorded item | Value |
|---|---|
| Install exit status | 0 (729 packages; lockfile 808 entries) |
| Invalid / extraneous / peer issues | none (`npm ls --all` exit 0) |
| Final minimatch copies | hoisted `node_modules/minimatch` 3.1.5 (dev) + `@typescript-eslint/typescript-estree/node_modules/minimatch` 11.0.1 (dev) |
| Final brace-expansion copies | `node_modules/brace-expansion` 1.1.21 (dev) + typescript-estree-nested 5.0.12 (dev) |
| glob copies | 0 |
| Raw production audit | 0 entries / 0 objects, exit 0 |
| Raw bare audit | 13 entries / 1 object (minimatch <11.0.1), 13 moderate, exit 1 |

`@typescript-eslint/typescript-estree` consumes minimatch through CJS
(`const minimatch_1 = require("minimatch")`), which the 11.0.1 commonjs export supports - so
the narrow override is compatible. All gates pass:

| Gate | Result |
|---|---|
| ESLint | 0 errors / 93 warnings - PASS |
| Typecheck | exit 0 - PASS |
| Policy tests (`tests/audit-policy.test.ts`) | 32 / 32 - PASS |
| Phase 15 focused suite + canonical cache suites (4 files) | 70 / 70 - PASS |
| Full suite | 45 files / 499 tests - PASS |
| Coverage | 58.76 / 49.53 / 69.19 / 60.06 (identical to baseline) - PASS |
| Production build | exit 0 - PASS |

**Answer to open question 2:** minimatch 11.0.1 IS installable under Node 22.13.1 / npm
11.19.0 in a clean isolated tree without arborist failure, and IS compatible with the
typescript-estree (CJS) dev slot - but it is NOT validation-compatible with the whole ESLint
chain, because `@eslint/eslintrc` (ESM default import) breaks. Upgrading the ESLint chain
itself does not fix this at any released version tried: `eslint@10` still declares
`minimatch@^10.2.6`, and no current `@eslint/eslintrc` release removes the default import.

**Answer to open question 3:** YES - the narrowest dev-only, time-limited risk exception
(Experiment G) is the safer final policy, because no installable + validated complete solution
exists for the remaining dev-only Minimatch advisory.

---

## 7. Experiment G - Dev-Only Exception Fallback Design (DESIGN ONLY, NOT IMPLEMENTED)

Triggered because Experiment F's full override fails validation and no alternative patched
path exists for the ESLint-chain minimatch@3.1.5 franchise. Nothing in this section was
written to the repository; this is the exact design for an owner decision.

### 7.1 Preconditions that must hold (all proven above)

- Production audit remains zero (Experiment E/F2: 0 entries / 0 objects / exit 0).
- The Glob advisory is absent (glob package count 0).
- Minimatch is absent from the production closure (all copies `dev=true`).
- Exactly one distinct advisory object remains in the bare audit: `minimatch <11.0.1`
  (source 1244012), reachable only from dev-side tooling.

### 7.2 Exact exception record shape (for the recommended E + F2 target state)

- `advisory`: `GHSA-g3hv-75wg-m249`; `cve`: `CVE-2026-118764` (from the GitHub Advisory
  Database; the npm audit feed carries no CVE for this object).
- `npmAuditSource`: `1244012` (npm feed - the value the evaluator compares against).
- `package`: `minimatch`; `affectedVersion`: `3.1.5` (the exact installed version of the hoisted
  `node_modules/minimatch` copy, dev-only). Any other hoisted version (drift) must be rejected.
- `severity`: `moderate`; `cvssScore`: `0` and `cvssVector`: nullable (npm feed reports
  score 0 and no vector; GitHub/NVD report 6.9 / CVSS:4.0 - informational only, see 7.4).
- `allowedProductionPackages`: `["minimatch"]` as a narrow sentinel - production must remain
  clean, so any production-scope vulnerability surface beyond that is rejected.
- `allowedBarePackages`: the EXACT observed vulnerable package set of the target state (13
  entries in the E+F2 state): `@eslint-community/eslint-utils`, `@eslint/config-array`,
  `@eslint/eslintrc`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`,
  `@typescript-eslint/type-utils`, `@typescript-eslint/utils`, `eslint`, `eslint-config-next`,
  `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react`, `minimatch`. Any
  additional or missing entry is rejected (`UNEXPECTED_VULNERABLE_PACKAGE` /
  `MISSING_EXPECTED_PACKAGE`). If the owner chooses the E-only state instead, add
  `@typescript-eslint/typescript-estree` to this list (14 entries).
- `expiryDate`: at most 14 days after the approval date; `reviewCadenceDays`: 7 or less.
- `owner`: role-based (repository maintainer / human risk approver), no personal data.
- Rationale fields must state: the vulnerable copies are dev-only build tooling with no
  application imports; the patched release 11.0.1 exists but is API-incompatible with
  `@eslint/eslintrc`'s ESM default import (Section 6.1), so remediation requires an upstream
  ESLint change or a major ESLint migration that is out of scope.

### 7.3 Required fail-closed properties (already provided by the evaluator)

- Any additional advisory object: rejected (`MULTIPLE_ADVISORY_OBJECTS`).
- Any package, path, installed-version, severity, source, or URL drift: rejected
  (`UNEXPECTED_VULNERABLE_PACKAGE`, `INSTALLED_VERSION_DRIFT`, `ADVISORY_SOURCE_MISMATCH`,
  `ADVISORY_PACKAGE_MISMATCH`, `ADVISORY_URL_MISMATCH`, `SEVERITY_MISMATCH`).
- Automatic rejection after expiry: `EXCEPTION_EXPIRED` (strictly after `expiryDate`); the
  gate goes red without human action.
- The raw audits remain the source of truth: the policy runs `npm audit --omit=dev --json`
  and `npm audit --json` itself and reports the raw metadata; CI keeps the raw-audit
  reference comment as documentation.

### 7.4 Required evaluator changes BEFORE this exception can be accepted (recommendations only)

The current `scripts/audit-policy.mjs` cannot accept a moderate-severity advisory with a null
CVSS vector. Two changes are required (design only; not implemented here):

1. `checkSeverityTotals` hard-codes `high` as the only permitted composition: it rejects any
   non-zero non-high severity (`SEVERITY_TOTALS_NONHIGH`) and requires
   `severityTotals.high === total`. For a moderate exception, this check must be parameterized
   on the exception's recorded `severity` (and the accepted severity ceiling should be
   recorded explicitly so `high` remains the default and the maximum accepted severity does
   not silently widen).
2. `validateExceptionSchema` requires `cvssVector` to be a non-empty string, but
   `extractCvssVector` returns `null` for this advisory, so `checkAdvisoryIdentity` can never
   match. `cvssVector` must become optional/nullable, with the recorded `cvssScore` compared
   against the npm-feed value (0) as-is.

Until both are made, the exception design cannot be applied. This is why the phase status is
READY WITH DEV-ONLY RISK DECISION REQUIRED rather than READY FOR STEP 2.

---

## 8. Node 22 npm Resolution Proof (Section H)

Live `scripts/audit-policy.mjs` runs below use Node 22.13.1 and the copied npm 11.19.0.

| Check | Result |
|---|---|
| H1 - explicit `NPM_PATH` to the copied npm-cli.js, repository working directory (path contains spaces) | PASS - npm runs without a shell, output is captured, audits evaluated; the gate returns a genuine policy rejection (exit 1) with per-scope advisory summaries |
| H2 - no `NPM_PATH` (resolution fallback on Node 22) | FAIL - `resolveNpmPath()` returns the final default `<node22-dir>/node_modules/npm/bin/npm-cli.js`, which does not exist in the bundled Node 22 distribution |
| H3 - `NPM_PATH` containing spaces | The guard correctly skips it (no interpolation into a command) and falls through to the same failing search |
| H4 - `NPM_PATH` pointing at a non-existent file | Boundary works but is not cleanly distinguishable: the CLI reports "npm audit produced no output" plus the captured child-process stderr |

Additional evidence recorded during H2 debugging: the bounded `findNpmCli` walk (1000-directory
budget, depth-first via `stack.pop()`) starting from the `ProgramFiles` root visits 1000
directories without reaching the npm tree (measured: `visited: 1000, found: null`), even though
a usable npm exists a few levels below that root. The budget is consumed by large subtrees
before shallow candidates are reached.

**Recommended source changes (NOT implemented, per instructions):**

1. Make `findNpmCli` check direct candidate locations first - `path.join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')`, the standard Windows prefix layouts, and common sibling tool-tree layouts - before any filesystem walk; and switch the walk to breadth-first ordering so shallow candidates are reached before deep subtrees consume the budget.
2. Map CLI-boundary failures (spawn failure, empty output, non-JSON output) to the existing `EXIT_CONFIG_OR_INTERNAL` (2) instead of `EXIT_POLICY_REJECT` (1), so infrastructure failure is distinguishable from a policy rejection by exit code as well as by message.
3. If the repository moves to a Node 22 runtime for local validation, keep `NPM_PATH` as the documented override (this is the proven, zero-change path demonstrated by H1).

**Security notes:** no shell is used (`spawn` with `shell: false`); `NPM_PATH` is validated
(non-empty, no spaces) and passed as a spawn argument, never interpolated; the `.js` entry
point is executed through the current Node executable. All proven by the H1 run against a
working directory whose path contains spaces.

---

## 9. Audit-Policy Decision

**Chosen final policy target: DEV-ONLY TEMPORARY EXCEPTION.**

Decision matrix against the task's criteria:

| CLEAN-ONLY criterion | Met? |
|---|---|
| Both raw audits reach zero with proven-compatible dependencies | NO - F-full reaches 0/0 but breaks ESLint (unsupported behavior) |
| => CLEAN-ONLY is not recommended while the bare audit remains non-zero | confirmed |

| DEV-ONLY TEMPORARY EXCEPTION criterion | Met? |
|---|---|
| Production audit is zero | YES (Experiment E / F2) |
| Glob is removed | YES (glob package absent from the tree) |
| Only dev-only Minimatch advisory remains | YES (1 advisory object, all copies dev=true) |
| Forced Minimatch 11 is not safely installable or compatible | YES (SyntaxError in @eslint/eslintrc; no released ESLint chain removes the default import) |

Consequences for Step 2 (whenever authorized):

- Apply the Experiment E changes (reclassify `tailwindcss-animate` to devDependencies; add the
  `sucrase: 3.35.1` override; regenerate the lockfile).
- Optionally apply the F2 partial override (`minimatch@10.2.6` -> `11.0.1`) to shrink the
  exception surface from two vulnerable dev copies to one - proven gate-green in isolation.
- Delete the expired Braces exception record (`config/audit-exceptions.json`): it is expired
  and covers an advisory that no longer appears in either audit.
- Make the two evaluator changes of Section 7.4, then create the Section 7.2 exception record
  with an owner-approved expiry of at most 14 days.
- Keep the policy as a fail-closed sentinel: clean audits accept without the exception; the
  exception is the single, narrow, time-limited accept path; everything else rejects.
- CI (`ci.yml` security job) stays gated on `node scripts/audit-policy.mjs`, with its stale
  Braces-exception comments replaced by the current design.
- Do NOT implement the blanket `minimatch: 11.0.1` override (rejected by Experiment F).

**Rejected alternatives, with evidence:**

- Blanket / full scoped `minimatch -> 11.0.1`: ESLint SyntaxError (Section 6.1).
- `tailwindcss@4.3.3` parent upgrade: `EOVERRIDE` against the root declaration; requires a
  major-version config migration (`tailwind.config.ts`, `@tailwindcss/typography` v4
  compatibility) - out of scope and unjustified for an audit-resolution goal.
- Reclassification alone (no sucrase override): leaves `sucrase@3.35.0 -> glob@10.5.0` in the
  dev tree, so the bare audit keeps the Glob advisory. Not sufficient.
- `sucrase: 3.35.1` alone (no reclassification): clears the production audit but leaves the
  chain production-classified; the reclassification is the correct intent fix.

---

## 10. Report Corrections Applied to This Document

The earlier draft of this diagnosis is superseded. Corrections applied:

1. Vulnerable package counts and distinct advisory-object counts are now reported separately
   everywhere (Sections 3, 5, 6).
2. The incomplete recommendation "reclassification + scoped minimatch overrides clears Glob
   and both audits" is removed and replaced with the proven resolution: the reclassification
   + the `sucrase 3.35.1` override removes Glob and zeroes the production audit; the
   minimatch@11 override is proven INCOMPATIBLE with the ESLint chain.
3. Experiment E / F / G outcomes are recorded with exact measured values (Sections 5-7).
4. All machine-specific paths are replaced with generic placeholders (`<external-scratch>`,
   `<isolated-copy>`, `<node22-dir>`). No user names or machine paths appear.
5. Remote-state wording corrected: no claims of remote reachability are made. No push, merge,
   or deployment was performed or planned in this phase; the repository has no configured
   upstream action from this session, and any upstream CI state is pre-existing and unchanged
   by this work.
6. Malformed Markdown tables and headings from the earlier draft (truncated table rows,
   broken heading levels, stray prose inside tables) are repaired.
7. Destructive rollback commands (`git checkout HEAD -- package.json package-lock.json` and
   similar) are removed. Rollback guidance is limited to reversible configuration changes
   (moving a dependency key back, removing an override, regenerating the lockfile on a branch).
8. The final status is set from actual evidence: `READY WITH DEV-ONLY RISK DECISION REQUIRED`
   (was `PASS - stabilization target reachable`). The earlier "stabilization target is
   reachable" claim applied only to the production closure; the full clean-only target is NOT
   reachable with proven-compatible dependencies, so it is not claimed.
9. The npm 11.5.2 / Node 24 arborist crash is no longer treated as an environment quirk needing
   a CI tie-breaker: on the required Node 22.13.1 / npm 11.19.0 runtime the install succeeds,
   and the disqualifying failure is a genuine API incompatibility.

---

## 11. Risks

- **Dev-only Minimatch advisory remains open until an owner decision.** The vulnerability is
  real (DoS via globparts amplification, moderate, CVE-2026-118764). Exposure is limited to
  build/development tooling: all vulnerable copies are dev-only, with no application imports.
- **Evaluator changes are a precondition.** Without the severity/CVSS changes of Section 7.4,
  the exception cannot be created, so Step 2 would start with the policy gate red on the bare
  scope.
- **NPM resolution on bundled Node 22 runtimes is incomplete** (Section 8, H2): without
  `NPM_PATH`, the policy cannot find npm. CI (setup-node) is unaffected because npm is
  co-located there.
- **Lockfile regeneration will change package counts** (855 -> ~807-808 entries in the
  isolated runs) as the glob/minimatch franchise is removed; the number of installed packages
  drops from 770 to ~728. Step 2 must compare trees structurally, not by raw count alone.
- **Build-time environment files** are required for `next build` in any isolated copy; a clean
  source-only copy fails page-data collection for `/api/admin/cache` until they are provided.
- **Phase 15 / 16A deltas remain uncommitted** in the working tree; their byte-identity was
  re-verified after this pass (Section 12).

---

## 12. Change Control (Section J)

- Repository files unchanged: verified by re-hashing all 12 preserve targets
  (`package.json`, `package-lock.json`, `lib/cache.ts`,
  `tests/cache-inflight-invalidation-race.test.ts`, `tests/documentation-contract.test.ts`,
  `scripts/audit-policy.mjs`, `config/audit-exceptions.json`,
  `.github/workflows/ci.yml`, the Phase 15 / 16A reports, and the Phase 15 / Phase 16
  diagnostics) - 12/12 byte-identical.
- Package and lockfile unchanged: `package.json` 8dc239f4..., `package-lock.json`
  243a11cd... (855 entries, 1 glob copy, 8 minimatch copies - unchanged).
- Phase 15 and Phase 16A artifacts unchanged (hashes above); audit-policy / exception / CI
  files unchanged.
- Git index: empty (nothing staged).
- HEAD: `a89c1fb39df3139c7200fcd172357df3b247c54e` (unchanged).
- No commit, no push, no merge, no deployment occurred or was attempted.
- Working tree status is identical to the session start: 4 modified files (the pre-existing
  Phase 15 / 16A delta) and the same untracked set, plus this corrected diagnosis file, which
  is the only repository artifact produced by this pass.

---

## 13. Final Verdict

*(Diagnosis-time verdict; the implemented final state is
recorded in Section 14.)*

**Status: READY WITH DEV-ONLY RISK DECISION REQUIRED**

- Open question 1 (Glob removal): ANSWERED YES and validated (Experiment E, all gates).
- Open question 2 (Minimatch 11 on Node 22): ANSWERED - installable and audits reach zero,
  but ESLint validation fails, so it is not an acceptable resolution.
- Open question 3 (dev-only exception as the safer final policy): ANSWERED YES.
- The production closure is fully solved and proven. The bare-audit closure needs the
  owner-approved, time-limited, dev-only Minimatch exception of Experiment G, which first
  requires the two evaluator changes of Section 7.4.
- The stabilization target is NOT declared reachable in the clean-only sense: no installable
  and validated complete clean-only solution exists at the dependency versions available on
  this date.

---

## 14. Step 2 Final Facts (post-implementation documentation correction)

This section was appended after Step 2 was implemented and validated in a separate
authorized pass. Per that pass instruction, only final facts are corrected in this
document; the historical evidence of Experiments E / F / G (Sections 1-13) is
preserved unchanged except for the pointer notes in the header and Section 13.
Every value below was measured from the final repository state under Node 22.13.1 /
npm 11.19.0.

### 14.1 Final list of vulnerable packages (raw audits)

- Production audit (`npm audit --production --json`): 0 vulnerable package entries /
  0 distinct advisory objects; tier totals info 0, low 0, moderate 0, high 0,
  critical 0; exit 0.
- Bare audit (`npm audit --json`): 13 vulnerable package entries / 1 distinct advisory
  object; 13 moderate, 0 high; exit 1. The single advisory object is `minimatch <11.0.1`
  (GHSA-g3hv-75wg-m249, npm audit source 1244012). The exact 13 vulnerable package
  entries are: `@eslint-community/eslint-utils`, `@eslint/config-array`,
  `@eslint/eslintrc`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`,
  `@typescript-eslint/type-utils`, `@typescript-eslint/utils`, `eslint`,
  `eslint-config-next`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`,
  `eslint-plugin-react`, `minimatch`.
- Tree: `glob` absent (0 copies). Exactly 2 `minimatch` copies, both dev-only: hoisted
  `node_modules/minimatch` 3.1.5 and
  `node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch` 11.0.1.

### 14.2 Final exception record (`config/audit-exceptions.json`)

The expired Braces exception was replaced by a single dev-only exception record:

- id `MINIMATCH-DEV-EXC-2026-11-02`; scope `bare`; advisory `GHSA-g3hv-75wg-m249`;
  cve `CVE-2026-118764`; `npmAuditSource` 1244012; package `minimatch`;
  `affectedVersion` 3.1.5; severity `moderate`; `cvssScore` 0; `cvssVector` null
  (npm-feed values, per Section 4).
- `approvalDate` 2026-11-02; `expiryDate` 2026-11-16T23:59:59Z (14 days - the Section
  7.2 maximum); `reviewCadenceDays` 7; owner `repository-maintainer`.
- `allowedBarePackages`: exactly the 13 packages listed in 14.1; any additional or
  missing entry is rejected.
- `allowedProductionPackages`: `[]` (empty). The Section 7.2 design proposed
  ["minimatch"] as a narrow sentinel; the implemented record is stricter - the
  exception can never accept a production-scope finding.
- The record also carries rationale, reviewInstructions (no in-place expiry extension;
  fail-closed after expiry or any drift), and two upstream links.

### 14.3 Final lockfile / package counts

- Lockfile: 808 entries, lockfileVersion 3 (855 at the Section 3 baseline). The final
  repository lockfile is byte-identical to the proven isolated-copy lockfile used for
  all Step 2 validation.
- A clean install of the final state reports 729 packages added (Section 3 baseline
  clean install: 770). The Section 11 prediction "855 -> ~807-808 entries" resolves to
  exactly 808 entries / 729 packages for the E + F2 target state.

### 14.4 Final policy behavior (`scripts/audit-policy.mjs`)

The evaluator was rewritten to implement both Section 7.4 preconditions:

- Scope-aware classification: each audit scope is classified independently as
  `CLEAN_AUDIT` (a clean audit is accepted without ever consulting the exception) or
  `EXCEPTION_APPLIED` (accepted against the approved exception); anything else rejects.
- Severity checks are parameterized on the exception's recorded severity with an
  explicit ceiling; `cvssVector` is nullable and the recorded `cvssScore` is compared
  against the npm-feed value.
- Fail-closed behavior on every drift (advisory identity, source, package, installed
  version, severity, inventory, expiry) is retained.
- Policy test suite: 52 / 52 tests pass.

  Composition:
  - 42 core behaviors
  - 4 additive behaviors
  - 6 preserved behaviors

  Total:
  42 + 4 + 6 = 52.

  One declaration is platform-conditional:
  L28 uses `it.skipIf(process.platform !== 'win32')`.
  It executed on the Windows validation host; on a non-Windows host it would be
  reported as skipped.
- Live gate, final state: production scope `CLEAN_AUDIT` (0 vulnerable packages, 0
  advisory objects); bare scope `EXCEPTION_APPLIED` against
  `MINIMATCH-DEV-EXC-2026-11-02` (GHSA-g3hv-75wg-m249, minimatch 3.1.5, severity
  moderate); result ACCEPTED, exit 0.

### 14.5 Final npm resolution behavior (Section 8 recommendations implemented)

- Resolution order: (1) validated `NPM_PATH` (spaces allowed, no shell); (2) validated
  `npm_execpath` (Windows only); (3) npm adjacent to the Node executable (Windows
  only); (4) common direct prefix candidates (Windows only); (5) bounded
  breadth-first filesystem search (Windows only, final fallback). Non-Windows
  platforms resolve `npm` from PATH.
- The fallback walk is breadth-first with only `.git` skipped, replacing the
  depth-first walk measured in Section 8 (visited 1000, found null).
- CLI-boundary failures (missing executable, spawn failure, empty or non-JSON
  output) exit with `EXIT_CONFIG_OR_INTERNAL` = 2, distinguishable from a policy
  rejection (exit 1).
- `NPM_PATH` remains the documented override.

### 14.6 Final selected F2 design (applied)

- The F2 partial override was APPLIED (Section 9 phrased it as optional):
  `minimatch@10.2.6` -> `11.0.1`, compatible via the CJS consumption in
  `@typescript-eslint/typescript-estree`.
- The Experiment E changes were applied: `tailwindcss-animate` reclassified to
  devDependencies; `sucrase` pinned to 3.35.1 (glob removed from the entire tree).
- The dead `minimatch@9.0.9` brace-expansion pin was removed (inert once glob left the
  tree).
- Final `overrides` block (10 keys): `postcss` 8.5.26, `js-yaml` 4.3.2, `sharp`
  0.35.5, `source-map-js` 1.2.2, `vite` 8.3.3, `browserslist` >=4.28.7,
  `postcss-selector-parser` >=6.1.3, `sucrase` 3.35.1, `minimatch@3.1.5` -> nested
  `brace-expansion` 1.1.21, `minimatch@10.2.6` -> `11.0.1`.

### 14.7 Machine-specific paths

Re-scanned during this correction: zero occurrences of raw machine paths, user names,
or local runtime locations in this document; all locations remain generic
placeholders.

Related post-implementation documentation (outside this document): the CI workflow
security-job comment was updated to document the current dev-only exception design,
and the Phase 16A completion report received its approved corrections in the same
pass.
