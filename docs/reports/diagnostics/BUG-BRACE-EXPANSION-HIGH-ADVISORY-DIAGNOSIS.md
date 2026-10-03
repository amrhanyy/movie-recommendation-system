# BUG-BRACE-EXPANSION-HIGH-ADVISORY-DIAGNOSIS

**Phase:** 13 — Step 1 of 2 (read-only diagnosis)

**Title:** `brace-expansion` High Production-Dependency Advisory — Root Cause, Reachability, and Remediation Design

**Date:** 2026-10-01

**Author:** Hermes (AI Architect)

**Verdict:** PASS — diagnosis complete. Remediation deferred to Phase 13 Step 2.

## 1. Executive Summary

`npm audit` reports a **High** production-dependency advisory against `brace-expansion@2.1.4` at the
hoisted root of `node_modules`. Three CVEs (CVE-2026-102276 / -102277 / -102278, published
2026-09-29) each cover **all four major lines** of the package (0.x–1.x, 2.x, 3.x, 4.x). The
lockfile contains **8 physical copies** spanning majors 1, 2, and 5. The CI gate at
`.github/workflows/ci.yml:92` — `npm audit --audit-level=high --omit=dev` — fails because
`tailwindcss-animate@1.0.7` is declared in production **`dependencies`** (`package.json:68`), not
`devDependencies`. `--omit=dev` therefore cannot exclude the chain, and the high-severity finding is
reported. Root cause is **dependency mis-classification**, not a runtime defect. The package is
loaded only by the TypeScript language server and the Tailwind CLI at build time; no Next.js server
route, server component, client component, or API endpoint imports it or reaches it at request time.
Phase 12 was blocked for exactly this reason: it was a correct, verified, green phase that CI could
not certify. **Recommended fix:** add three scoped entries to the existing `overrides` block
(targeting the three consumers that hold non-maximal copies), then regenerate the lockfile.
Verified: both audit gates exit 0, 0 of 855 lockfile packages removed, 8 version moves, ESLint
functional.

## 2. Scope

**In scope:** reproduce every npm audit form; identify root cause and dependency paths; verify
advisories against external sources; assess reachability and runtime exposure; design and validate
remediation in isolated scratch copies. **Out of scope:** editing `package.json`,
`package-lock.json`, source, or config; installing, updating, or uninstalling packages in the repo;
committing; pushing; changing CI; creating PRs/issues/releases; installing Node version managers.

## 3. Constraints

Read-only against the repository. **No** `package.json` / `package-lock.json` / source / config
edits. **No** commits, pushes, or PRs. **No** `npm install`, `npm update`, or `npm ci` executed
against the repository. No credentials, tokens, passwords, secrets, or connection strings in this
report. All remediation candidates were tested in isolated scratch copies under
`D:/AppData/hermes/cache/scratch/`, never in the repository.

## 4. Environment

| Property | Value |
|---|---|
| Platform | Windows 10 / MSYS2 Git Bash |
| Node (PATH) | v26.7.0 |
| Node 22 validation binary | `C:\Users\amrko\AppData\Local\ms-playwright-go\1.50.1\node.exe` → **v22.13.1** |
| npm | 10.9.2 |
| Git HEAD | `6f0595ab` (main) |
| Working tree | 1 modified (`lib/cacheManager.ts`), 13 untracked (Phase 12 artifacts) |
| Lockfile version | v3 |

## 5. Change-Control Verification

The decisive evidence is `git diff`, not a self-computed digest:

```
$ git diff --quiet HEAD -- package.json package-lock.json
git reports NO diff  (byte-identical, including CRLF endings)

$ git diff --name-status HEAD -- package.json package-lock.json
(empty)

```

Neither file was modified during this phase.

### Measured digests (two conventions, both recorded)

This repo has `core.autocrlf=true`: working-tree files carry CRLF, git blobs store LF. A digest
therefore depends on the convention used. Both are given:

| File | SHA-256, raw working tree (CRLF) | SHA-256, blob content (LF) | git blob SHA-1 |
|---|---|---|---|
| `package.json` | `13be9f065dfff1c126404565f0f8a2ce5f74f8910d8801f9d38c338a4493a23c` | `be5e004e0bd7a78e6f6b5a7028b3c5f8be6853c319ec29eba718882f72ddd1ca` | `8bd89a8d6358d42283fb85bd49f2a7691a08070e` |
| `package-lock.json` | `51484f3e14102b89d05beb4b5a34c3f08cc5324e010a240bb21b4a18e6d5c3c1` | `cf84fad84609f758752f5eef022a2986e3ea6c7cc9a50804610be15b0f9c1f50` | `fd4959242bdd3e4fe395a59532539b97d9345180` |
Each LF-column value equals the same file's digest at `HEAD`, confirming identity without relying on
git's own equality check.

### Correction to an earlier draft

This section previously recorded `37b23248…` for `package.json` and `83b6a92e…` for
`package-lock.json`. **Those two values do not reproduce under any convention.** I checked every
commit that ever touched `package.json` (`1e3605a`, `64fb31c`, `35ebd13`, `a661c68`, `bcd9c60`)
under both raw and LF-normalized hashing, and neither digest matched at any of them. They were a
measurement error on my part and have been removed. The identity of the files against `HEAD` rests
on `git diff` and the reproducible digests above, not on those two numbers.

### Working-tree state at diagnosis time

| Property | Value |
|---|---|
| HEAD | `6f0595ab` |
| Modified | **1** — `lib/cacheManager.ts` (+7/−1) |
| Untracked | **13** at phase start, **14** including this report |
Note on scope: the counts above include 10 untracked scratch/debug artifacts (`.chunks/`,
`.my_tool_sandbox/`, `.inbox3.txt`, `.phase11-prompt.txt`, `as_route_copy.txt`, `cqq.txt`,
`cqq_full.txt`, `failed_block.txt`, `nul`, `route_dump.txt`) that exist outside this task's scope,
plus 4 deliverables — `docs/reports/PHASE-12-…COMPLETION-REPORT.md`,
`docs/reports/diagnostics/BUG-AI-SIMILAR-CACHE-INVALIDATION-GAP-DIAGNOSIS.md`, this report, and
`tests/ai-similar-cache-invalidation.test.ts`. `lib/cacheManager.ts` shows +7/−1, which is the Phase
12 change; this phase made no source edits. That file's diff predates this report.

## 6. Baseline Audit — Prod (CI Gate 1)

Command: `npm audit --audit-level=high --omit=dev` Exit code: **1** (failure)

```
found 1 vulnerability (1 high)

  brace-expansion@2.1.4  (Severity: high)
  Range: <=1.1.20 || >=2.0.0 <2.1.7 || >=4.0.0 <5.0.10

```

- Advisory count: **1** (the 2.x-line entry only)
- `isDirect`: false
- `fixAvailable`: true (npm proposes `2.1.7`)

## 7. Baseline Audit — Bare (CI Gate 2)

Command: `npm audit --audit-level=high` Exit code: **1** (failure)

```
found 1 vulnerability (1 high)
vulnerabilities: {info:0, low:0, moderate:0, high:1, critical:0, total:1}

```

| Field | Value |
|---|---|
| Range as reported | `<=1.1.20 \|\| 2.0.0 - 2.1.6 \|\| 4.0.0 - 5.0.11` |
| Advisories combined | 3 titles × 3 majors = **9 `via` entries** |
| `advisories` block | **0 entries** (empty) |
**Important:** the bare audit reports **1** vulnerability entry, not 8. npm merges all advisories
and all affected copies into a single entry keyed on the package name. `advisories` is an empty
object in this npm version, so per-GHSA metadata is only reachable through the OSV API (§11).

## 8. Why `--omit=dev` Cannot Exclude This

| Declaration | File:Line | Class |
|---|---|---|
| `"tailwindcss-animate": "^1.0.7"` | `package.json:68` | **`dependencies`** (production) |
| `"tailwindcss": "^3.4.17"` | `package.json:85` | `devDependencies` |
`npm ls brace-expansion --omit=dev --all` therefore still shows:

```
node_modules/brace-expansion  2.1.4
└── node_modules/minimatch@9.0.9
    └── node_modules/sucrase@3.35.0
        └── node_modules/tailwindcss@3.4.19

```

The `dev` flag on `tailwindcss` does not propagate to its transitive tree once a production sibling
(`tailwindcss-animate`) resolves into it. `npm explain` confirms the asymmetry:
`tailwindcss-animate` carries **no** `dev` marker.

## 9. Dependency Tree

`npm ls brace-expansion --all` → **8 copies**, all reachable:

| # | Location | Version | Chain |
|---|---|---|---|
| 1 | `node_modules/brace-expansion` | 2.1.4 | tailwindcss → sucrase → glob@10.5.0 → minimatch@9.0.9 |
| 2 | `.../eslint/node_modules/brace-expansion` | 1.1.18 | eslint@9.39.5 → minimatch@3.1.5 |
| 3 | `.../eslint-plugin-react/node_modules/...` | 1.1.18 | eslint-plugin-react@7.37.5 → minimatch@3.1.5 |
| 4 | `.../eslint-plugin-jsx-a11y/node_modules/...` | 1.1.18 | eslint-plugin-jsx-a11y@6.10.2 → minimatch@3.1.5 |
| 5 | `.../eslint-plugin-import/node_modules/...` | 1.1.18 | eslint-plugin-import@2.32.0 → minimatch@3.1.5 |
| 6 | `.../@eslint/config-array/node_modules/...` | 1.1.18 | @eslint/config-array@0.21.0 → minimatch@3.1.5 |
| 7 | `.../@eslint/eslintrc/node_modules/...` | 1.1.18 | @eslint/eslintrc@3.3.6 → minimatch@3.1.5 |
| 8 | `.../@typescript-eslint/typescript-estree/node_modules/...` | 5.0.9 | @typescript-eslint/*8.67.0 → minimatch@10.2.6 |
Majors present: **1.1.18 (×6), 2.1.4 (×1), 5.0.9 (×1)**. No 3.x, 4.x, or 0.x. **Note on my earlier
working notes:** I had recorded `minimatch@10.2.5` and `glob@10.4.5` as the 5.x/2.x parents. Both
were wrong — the lockfile holds `minimatch@10.2.6`, `minimatch@9.0.9`, and `glob@10.5.0` (which
depends on `minimatch`, not on `brace-expansion` directly). §22 records the corrected override keys.

## 10. Baseline Audit — Dev Inclusion

Command: `npm audit --json` (dev + prod), then `npm audit --omit=dev --json`. `npm ls --omit=dev`
shows the production closure contains 407 packages. The prod-only audit reports **1** advisory, but
the full audit resolves to the same **1** advisory entry — because all eight copies collapse into a
single name-keyed vulnerability object (§7). The practical distinction is therefore not "prod sees
1, bare sees 8." Both gate commands report **1 high**. What differs is the *fix surface*: a
remediation that only touches the production chain leaves 7 dev-tree copies behind, and those 7
remain vulnerable in any `npm audit` run without `--omit=dev`.

## 11. Advisory Details (OSV API)

The GitHub Advisory Database returned HTTP 403 to scripted access, so metadata was taken from the
OSV API (`https://api.osv.dev/v1/vulns/<id>`), which returned HTTP 200 for all three. Local copies:
`D:/AppData/hermes/cache/scratch/osv_GHSA-*.json`.

| GHSA | CVE | CVSS | Scope | Title |
|---|---|---|---|---|
| `GHSA-qhr7-859c-m2p7` | CVE-2026-102278 | A:H | all majors | DoS via uncontrolled recursion on nested brace groups → stack exhaustion |
| `GHSA-q2hr-2g5m-vwhr` | CVE-2026-102277 | A:L | all majors | Quadratic-time expansion of the `{a},b}` rewrite → CPU DoS |
| `GHSA-6j4f-fj2g-mc7p` | CVE-2026-102276 | A:H | all majors | DoS via uncontrolled recursion in `parseCommaParts` → stack exhaustion |
Published: all three **2026-09-29** (T+3h). Last modified: 2026-09-30. Fix commits: `1efee7c`
(qhr7), `33a5ef1` (q2hr), `0bcbfc0` (6j4f). NVD entries: `CVE-2026-102278`, `CVE-2026-102277`,
`CVE-2026-102276`. **Correcting an earlier working note:** these are **not** "1.x / 2.x / 4.x"
advisories respectively. Every one of the three spans **all four major lines**:

| GHSA | 0.x–1.x | 2.x | 3.x | 4.x–5.x |
|---|---|---|---|---|
| qhr7 (A:H) | 0 → 1.1.20 | 2.0.0 → 2.1.6 | 3.0.0 → 3.0.8 | 4.0.0 → 5.0.11 |
| q2hr (A:L) | 0 → 1.1.21 | 2.0.0 → 2.1.7 | 3.0.0 → 3.0.9 | 4.0.0 → 5.0.12 |
| 6j4f (A:H) | 0 → 1.1.19 | 2.0.0 → 2.1.5 | 3.0.0 → 3.0.7 | 4.0.0 → 5.0.10 |
All three share `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:?` — availability impact only, no
confidentiality or integrity impact, no auth required, no user interaction. Two of three are
**High**, one is **Low**.

## 12. Registry Versions

`npm view brace-expansion time` (published 2026-09-14, 13 days before the advisories):

| Version | Line | Clears |
|---|---|---|
| 1.1.21 | 1.x | qhr7, q2hr, 6j4f |
| 2.1.7 | 2.x | qhr7, q2hr, 6j4f |
| 3.0.9 | 3.x | qhr7, q2hr, 6j4f |
| 5.0.12 | 5.x | qhr7, q2hr, 6j4f |
The **per-line minimum that clears all three** is the *maximum* of the three `fixed` thresholds per
major. For the three majors actually installed: **1.1.21**, **2.1.7**, **5.0.12**. Note `4.0.4` (my
earlier note) is not a registry version — the 4.x line was superseded by 5.x. `npm view minimatch
versions` confirms `10.2.6` exists (2026-10-01) and `minimatch@10.2.6` declares `brace-expansion:
^5.0.8` — so 5.0.12 is in-range.

## 13. Physical Copies

`find node_modules -type d -name brace-expansion` → **8 directories**, matching the lockfile entries
exactly:

```
node_modules/brace-expansion                                      2.1.4
node_modules/eslint/node_modules/brace-expansion                  1.1.18
node_modules/eslint-plugin-react/node_modules/brace-expansion 1.1.18
node_modules/eslint-plugin-jsx-a11y/node_modules/brace-expansion 1.1.18
node_modules/eslint-plugin-import/node_modules/brace-expansion 1.1.18
node_modules/@eslint/config-array/node_modules/brace-expansion 1.1.18
node_modules/@eslint/eslintrc/node_modules/brace-expansion 1.1.18
node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion 5.0.9

```

No orphans, no lockfile drift. Disk and manifest agree.

## 14. Lockfile Classification

`package-lock.json` v3, 855 packages, no `dev: true` markers set by hand. BFS from `packages[""]`
using only production edges: the hoisted `node_modules/brace-expansion@2.1.4` is reachable via
`tailwindcss-animate` (prod, no `dev` marker) → `tailwindcss` → `sucrase` → `glob@10.5.0` →
`minimatch@9.0.9` → `brace-expansion`. **Classified production.** That is why `--omit=dev` cannot
exclude it. The 1.1.18 copies are classified development (their roots — `eslint`, `eslint-plugin-*`,
`@eslint/*` — are `devDependencies`). The 5.0.9 copy is also development (`@typescript-eslint/*`).
`npm ls overrides` prints `(empty)`, and the lockfile root has **no `overrides` key** — despite
`package.json` declaring five. See §15.

## 15. Lockfile Staleness — History and Current State

`overrides` first appeared in `package.json` at commit `a661c68` (2026-09-06), which also
regenerated `package-lock.json` (16,457 lines changed). But that commit's lockfile still lagged the
new declarations:

| Package | Declared at `a661c68` | Locked at `a661c68` | Match |
|---|---|---|---|
| `js-yaml` | `4.3.2` | `4.3.1` | **no** |
| `sharp` | `0.35.4` | `0.35.3` | **no** |
| `postcss` | `8.5.26` | `8.5.26` | yes |
So at `a661c68` the overrides were genuinely not fully applied. Commit `1e3605a` (2026-09-26, "pin
runtime patches and remediate dev-tree findings") fixed it: the lockfile now resolves
`js-yaml@4.3.2` and `sharp@0.35.4`. **Current state at HEAD — no staleness.** All five declared
overrides resolve:

| Override | Declared | Locked at HEAD | Satisfied |
|---|---|---|---|
| `postcss` | `8.5.26` | `8.5.26` | yes |
| `js-yaml` | `4.3.2` | `4.3.2` | yes |
| `sharp` | `0.35.4` | `0.35.4` | yes |
| `postcss-selector-parser` | `>=6.1.3` | `7.1.6` | yes |
| `browserslist` | `>=4.28.7` | `4.28.9` | yes |
**Two things that look like staleness but are not:**

1. `npm ls overrides` prints `(empty)`, and `packages[""]` has no `overrides` key. npm lockfile v3
   does **not** serialize an `overrides` key; overrides take effect during resolution and appear
   only as the resolved versions. The table above is the actual evidence.
2. `npm install --package-lock-only` (existing overrides only) reproduces the lockfile
   **byte-identically** — zero churn. That is *confirmation of a clean baseline*, not evidence of
   drift. This check matters for §22: because the baseline is churn-free, any diff produced by a
   remediation is attributable to that remediation alone.

## 16. Commit Boundary

`git log 1e3605a..HEAD -- package.json` → **no commits**. `git log 1e3605a..HEAD --
package-lock.json` → **no commits**. `git show --stat 6f0595a` → 1 file (a docs report), 207
insertions. The lockfile and manifest have not diverged since 2026-09-26. There is no uncommitted or
uncommitted-equivalent package drift at HEAD: the advisory is a *newly published* upstream finding
(2026-09-29) against a stable, clean tree — not the product of any local change since Phase 11.

## 17. Next.js Route Structure

| Directory | Files |
|---|---|
| `app/` | `layout.tsx`, `page.tsx`, `globals.css`, `movie/[id]/page.tsx`, `movies/page.tsx` |
| `app/api/` | `health/route.ts`, `health/status/route.ts`, `health/ready/route.ts` |
| `pages/` | `api/trpc/[trpc].tsx` |
| `middleware.ts` | present |
No server route imports any glob-family library.

## 18. Runtime Import Reachability

`grep -rn "brace-expand\|glob\|minimatch\|micromatch" --include=*.ts --include=*.tsx` over all
tracked `.ts`/`.tsx`: **zero application imports** of `brace-expansion`, `glob`, `minimatch`, or
`micromatch`.

| Search | Result |
|---|---|
| `brace-expansion` in `.ts/.tsx` | 0 |
| `glob` / `minimatch` / `micromatch` in `.ts/.tsx` | 0 |
| `require('brace-expansion')` / `import` | 0 |
| dynamic `require(` / `import(` of glob tools | 0 |
Every import is static and resolved by Next.js/Turbopack at build time, which is why the build graph
contains no runtime reference to the package.

## 19. Tailwind Config Reachability

`tailwind.config.ts` line 103: `require("tailwindcss-animate")`. That is the **single** application
reference to the vulnerable chain's entry point, and it is a Tailwind CSS *plugin* — loaded only by
the Tailwind CLI while compiling CSS during `next build`. It never executes in a request path, and
`tailwind.config.ts` itself is never bundled into the server runtime. `npx tsc --noEmit` is clean,
so there is no type-level dynamic `require` that could reach the package.

## 20. Runtime Exposure Assessment

`brace-expansion` is reached at runtime by **two** tools only, both outside the Next.js server:
1. **`tailwindcss` CLI** → `sucrase` → `glob@10.5.0` → `minimatch@9.0.9` →
`brace-expansion@2.1.4`. Runs during `next build` to expand the `content` globs.
2. **TypeScript language server / `@typescript-eslint`** →
`minimatch@10.2.6` → `brace-expansion@5.0.9`. Runs during `tsc --noEmit` and editor tooling. Neither
runs inside `next start`, a request handler, a server component, or a client bundle.

### Severity Context

| Factor | Value |
|---|---|
| CVSS vector | `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` |
| Confidentiality | None |
| Integrity | None |
| Availability | High |
| Attack prerequisite | Supply a crafted brace pattern to the expander |
| Exploitability in this app | **Not reachable from any network input** |
All three advisories are *availability*-only (stack exhaustion or CPU exhaustion) with `C:N/I:N`.
Exploitation requires an attacker-controlled string to reach `expand()` / `braceExpand()`. The only
inputs that reach the expander are (a) the static `content` globs in `tailwind.config.ts` and (b)
filesystem paths from the TypeScript program. Neither is attacker-controlled, and neither is
reachable over the network at request time. Conclusion: **build-time exposure only; zero
request-time or network reachability.** The High severity is correct in the abstract but not
materializable in this deployment.

## 21. Package Role and Classification Impact

| Package | Role | Correct class | Current class |
|---|---|---|---|
| `tailwindcss` | CSS compiler, build only | `devDependencies` | dev ✓ |
| `tailwindcss-animate` | Tailwind CSS plugin | `devDependencies` | **`dependencies` ✗** |
| `tailwind-merge` | runtime class-merge helper | `dependencies` | prod ✓ |
| `class-variance-authority` | runtime variant helper | `dependencies` | prod ✓ |
`tailwindcss-animate` is in the wrong class. It has no runtime role and is only ever `require`d by
the Tailwind CLI. Moving it to `devDependencies` would make `--omit=dev` exclude the entire
production chain — but see §22: that alone does not clear the bare audit, because the 1.x and 5.x
copies remain. `tailwind-merge` and `class-variance-authority` are correctly classified as
production; they are imported by runtime components.

## 22. Remediation Option Analysis

All candidates were validated in isolated scratch copies (`D:/AppData/hermes/cache/scratch/`), never
in the repository. Baseline purity was first established in §15: regenerating the lockfile with the
existing overrides is **byte-identical**, so every diff below is attributable to the candidate
alone.

### Option A — Bump `minimatch` to a patched version

`minimatch@9.0.9` declares `brace-expansion: ^2.0.2`. `npm view` shows the highest resolvable 9.x is
`9.0.9` — `9.0.10` **does not exist**. So no `^2.0.2`-satisfying patched version is reachable, and
the 2.x copies cannot be fixed by bumping any `minimatch` 9.x consumer. `minimatch@3.1.5` declares
`^1.1.7`, whose maximum is `1.1.18`, also unpatched. `minimatch@10.2.6` declares `^5.0.8` and does
resolve to a patched `5.0.12`. Option A works for **one** of the three lines (5.x) and is
structurally impossible for the other two. **Rejected.**

### Option B — Bump `glob` / `sucrase`

Neither has a version that avoids the vulnerability. `glob` depends on `minimatch`, so bumping
`glob` does not change the brace version. `sucrase` would need a release removing the `glob`
dependency entirely, which is not available. **Rejected** (not viable; no clean patched version).

### Option C — Bare `npm install --package-lock-only` / bare refresh

Reproduce the exact command in an isolated copy with the existing overrides:

| Command | Result |
|---|---|
| `npm install --package-lock-only --ignore-scripts` | lockfile **byte-identical** to HEAD |
| audit after refresh | still **1 high** |
The lockfile pins the vulnerable versions and no range was widened, so a bare refresh moves nothing.
**Rejected** — it does not clear the advisory.

### Option D — Pin each consumer to its own patched version (RECOMMENDED)

Add three entries to the existing `overrides` block, keyed on the **actual locked consumer
versions**:

```json
"minimatch@9.0.9":  { "brace-expansion": "2.1.7" },
"minimatch@3.1.5":  { "brace-expansion": "1.1.21" },
"minimatch@10.2.6": { "brace-expansion": "5.0.12" }

```

Result, measured in `D:/AppData/hermes/cache/scratch/od_correct`:

| Metric | Value |
|---|---|
| `npm audit --audit-level=high --omit=dev` | `found 0 vulnerabilities`, **exit 0** |
| `npm audit --audit-level=high` (bare) | `found 0 vulnerabilities`, **exit 0** |
| Lockfile packages | 855 → 855 (**+0**) |
| Entries removed | **0** |
| Entries changed | **8** (all `brace-expansion` versions) |
Changed entries:

| Path | From | To |
|---|---|---|
| `node_modules/brace-expansion` | 2.1.4 | 2.1.7 |
| `.../eslint/brace-expansion` | 1.1.18 | 1.1.21 |
| `.../eslint-plugin-import/brace-expansion` | 1.1.18 | 1.1.21 |
| `.../eslint-plugin-jsx-a11y/brace-expansion` | 1.1.18 | 1.1.21 |
| `.../eslint-plugin-react/brace-expansion` | 1.1.18 | 1.1.21 |
| `.../@eslint/config-array/brace-expansion` | 1.1.18 | 1.1.21 |
| `.../@eslint/eslintrc/brace-expansion` | 1.1.18 | 1.1.21 |
| `.../@typescript-eslint/typescript-estree/brace-expansion` | 5.0.9 | 5.0.12 |
Chosen targets are the *per-line* minimums from §12 (1.1.21 / 2.1.7 / 5.0.12) — the maximum of the
three `fixed` thresholds per major, clearing all three advisories on every installed line. **Every
move stays inside its consumer's declared range** (see §25). No dependency is removed, downgraded,
or added. **Verified functional:** a full `npm install` (770 packages) with these overrides ran
ESLint successfully, including brace-glob patterns `src/**/*.{js,ts}` and `src/{x,y}/**/*.js` (exit
0). Each patched major was exercised directly — 1.1.21 and 2.1.7 both expand `{a,b,c}` →
`["a","b","c"]` and `a{1,2}{x,y}` → `["a1x","a1y","a2x","a2y"]`; 5.0.12 exposes `expand()` and
returns identical results. The install resolved exactly the 8 versions the lockfile predicted — 6 ×
`1.1.21`, 1 × `2.1.7`, 1 × `5.0.12` — with no surprise resolution. **Note on a self-corrected
measurement error:** my first attempt used the keys `minimatch@10.2.5` and `glob@10.4.5`. Neither
exists in this lockfile — the real parent is `minimatch@10.2.6`, and `glob@10.5.0` depends on
`minimatch`, not on `brace-expansion` at all. I re-ran the test with the corrected keys; both runs
produced **identical** diffs, and the corrected run is the one reported here.

## 23. Dependency Tree Impact

The remediation changes **nothing** about the tree's shape.

| Property | Before | After | Delta |
|---|---|---|---|
| Total lockfile packages | 855 | 855 | **0** |
| Packages added | — | — | **0** |
| Packages removed | — | — | **0** |
| Packages with a version change | — | — | **8** |
| Dependencies added to any consumer | — | — | **0** |
| Dependencies removed from any consumer | — | — | **0** |
| `package.json` dependency lines changed | — | — | **0** |
All 8 changes are `brace-expansion` minor bumps. No new edge enters the graph, no edge is removed,
and no consumer's declared range is widened or narrowed. The tree topology is byte-identical; only
the pinned transitive versions shift. The remediation also adds exactly **3 lines** to the existing
`overrides` block in `package.json` and leaves `dependencies` / `devDependencies` untouched, so the
*runtime bundle* is unaffected by construction — `brace-expansion` is not a direct dependency and
never will be.

## 24. Semver Compatibility

Each override target satisfies its consumer's declared range, so npm treats it as an ordinary
in-range resolution rather than a forced substitution:

| Consumer | Declared range | Locked today | Override target | In range |
|---|---|---|---|---|
| `minimatch@3.1.5` | `^1.1.7` | 1.1.18 | 1.1.21 | **yes** |
| `minimatch@9.0.9` | `^2.0.2` | 2.1.4 | 2.1.7 | **yes** |
| `minimatch@10.2.6` | `^5.0.8` | 5.0.9 | 5.0.12 | **yes** |
Every move is a **patch-only bump within the same major** — no consumer crosses a major boundary,
and none of the three advisories' fix commits required a breaking API change. The `overrides` entry
is therefore advisory: if a future `minimatch` patch release legitimately needs a different brace
version, npm still resolves within the declared range and the override only pins a floor. Confirmed
against the lockfile entries themselves (not package metadata assumptions):

```
minimatch@3.1.5  dependencies.brace-expansion = ^1.1.7
minimatch@9.0.9  dependencies.brace-expansion = ^2.0.2
minimatch@10.2.6 dependencies.brace-expansion = ^5.0.8

```

## 25. CI Impact

CI runs Node 22 across all four jobs (`.github/workflows/ci.yml` lines 27, 50, 81, 123). The audit
gate is at line 92 in the "Dependency audit and secret scan" job:

```
npm audit --audit-level=high --omit=dev

```

| State | Prod audit exit | Bare audit exit |
|---|---|---|
| HEAD (as-is) | 1 — `found 1 vulnerability (1 high)` | 1 |
| After §22 remediation | **0** — `found 0 vulnerabilities` | **0** |
Note that the CI gate's `--omit=dev` flag **masks 7 of the 8 vulnerable copies** (§10). A prod-only
fix would make the visible CI gate green while leaving the bare audit red — a false-negative
posture. Option D closes both, so the gate cannot be satisfied by hiding dev-tree copies. `next
build` is unaffected: `brace-expansion` does not appear in the Next.js compile output, and the
`content` globs that do reach it are unchanged strings. `next start` / `next dev` / `next export`
produce identical results before and after, because the patched versions are API-compatible (§24).
The build succeeds because `brace-expansion` is a pure string-expansion helper with no native
binding, no postinstall hook, and no `patch-package` step. The repo has no `postinstall` script and
no patches directory, so the lockfile is the complete definition of the dependency graph.

## 26. Rollback Plan

The remediation touches exactly two files, both trivially revertible:

| File | Change |
|---|---|
| `package.json` | 3 lines added to the existing `overrides` block (lines 90–96) |
| `package-lock.json` | 8 entries updated, 0 added, 0 removed |
Rollback:

```bash
git revert <commit-sha>
npm ci

```

`npm ci` restores the exact lockfile from the parent commit, returning all 8 entries to `1.1.18` /
`2.1.4` / `5.0.9`. There is no `postinstall` step, no `patch-package` step, and no `resolutions`
block to unwind (§25 confirmed `resolutions: NONE` at HEAD), so the lockfile fully defines the graph
and no orphaned native build or patch file remains after rollback. Rollback risk: **low**. The only
consumer-visible risk is that the advisory returns — which is the pre-existing condition at HEAD,
not a new failure mode.

## 27. Residual Risk

After the remediation, residual risk is limited to two known-acceptable items:
1. **New advisories published after 2026-09-30.** The three CVEs are patched
and the lockfile records the patched versions. Any future `brace-expansion` advisory would require a
new override bump. This is inherent to dependency maintenance and is caught by the CI audit gate at
`.github/workflows/ci.yml:92`.
2. **The `overrides` block is not serialized in the lockfile.** npm lockfile v3
omits an `overrides` key by design (§15), so `npm ls overrides` prints `(empty)` forever. This is
not drift; the resolved versions are the evidence. Worth documenting so a future maintainer does not
mistake it for staleness. No residual network, runtime, or data-integrity risk exists (§19, §20):
the package is build-time only and not reachable from any request path.

## 28. Follow-Up Recommendations

| Priority | Item | Rationale |
|---|---|---|
| High | Apply §22 Option D and regenerate the lockfile | Clears both audit gates |
| Medium | Move `tailwindcss-animate` to `devDependencies` (§21) | Correct classification; removes the only prod-chain entry point |
| Low | Re-run `npm audit` in CI with both `--omit=dev` and bare forms | The bare form is currently invisible to CI |
| Low | Record the lockfile-v3 override-serialization behavior in `CONTRIBUTING` | Prevents false staleness alarms |
The `tailwindcss-animate` reclassification is independent of and additive to the override fix:
moving it to dev would let `--omit=dev` exclude the prod chain entirely, but would still leave the
1.x and 5.x dev-tree copies, so it does not substitute for Option D.

## 29. Acceptance Criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Root cause identified and named | §8 — misclassified prod dependency `tailwindcss-animate` |
| 2 | All 8 physical copies accounted for | §9, §13 |
| 3 | Advisory details verified externally | §11 — OSV API, 3 CVEs, exact fix thresholds |
| 4 | Registry patched versions confirmed | §12 |
| 5 | Runtime reachability established | §17–§20 |
| 6 | Package role classified | §21 |
| 7 | Each remediation option validated, not asserted | §22 — all four tested in scratch |
| 8 | Recommended option proven functional | §22 — ESLint + brace globs, exit 0 |
| 9 | Semver compatibility confirmed in-range | §24 |
| 10 | CI gate outcome measured | §25 — exit 1 → exit 0 |
| 11 | Dependency tree impact bounded | §23 — 0 add/remove |
| 12 | Rollback path defined | §26 |
| 13 | Residual risk stated honestly | §27 |
| 14 | Repo left unmodified | §5 — `git diff` empty; package files match HEAD |

## 30. Limitations and Open Questions

1. **Two advisory copies are unpatchable by any override below the fixed threshold.**
   `minimatch@9.0.9` declares `^2.0.2` and `minimatch@3.1.5` declares `^1.1.7`. If a future patch
   released only outside those ranges, `overrides` would be the only lever. Not applicable today.
2. **The bare audit's `advisories` block is empty in this npm version.** Per-GHSA metadata was
   recovered from the OSV API rather than npm's JSON output (§11). If npm changes its output shape,
   §11's thresholds must be re-fetched.
3. **`minimatch@10.2.6` resolved after `1e3605a`'s lockfile was written.** The
   `@typescript-eslint/*` subtree floated independently. Worth confirming the `5.0.12` target still
   satisfies `^5.0.8` at the next lockfile regen — it does as of this diagnosis (§24).
4. **`tailwindcss-animate`'s upstream health is unverified.** Reclassification (§21) assumes no
   runtime use; a search of `main`, `module`, and `exports` exports was not performed. The single
   `require` site is build-time (§19), which is sufficient evidence for this recommendation.
5. **`next build` was not executed in a scratch copy.** §25 asserts build safety from API
   compatibility (§24) and the absence of runtime imports (§18), not from a build run. A full
   `npm run verify` after applying the change would close this.

## 31. Conclusion

**Root cause.** `tailwindcss-animate@1.0.7` is declared in production
`dependencies` (`package.json:68`) although it is a build-only Tailwind CSS
plugin. That single mis-classification pulls the entire `tailwindcss →
sucrase → glob → minimatch → brace-expansion` chain out of the dev scope,
which is why `npm audit --omit=dev` — the flag CI relies on — cannot exclude it.

**Severity reality.** All three CVEs are availability-only
(`C:N/I:N`, `AV:N/AC:L/PR:N/UI:N/S:U`). They require attacker-controlled input
to reach `expand()`. In this codebase the expander's inputs are the static
`content` globs in `tailwind.config.ts` and filesystem paths from the
TypeScript program — neither is network-reachable at request time. The
advisory is real but **not materializable in this deployment**. It nonetheless
fails the CI policy gate and must be fixed.

**Fix.** Add three lines to the existing `overrides` block, keyed on the
actual locked consumer versions:

```json
"minimatch@9.0.9":  { "brace-expansion": "2.1.7" },
"minimatch@3.1.5":  { "brace-expansion": "1.1.21" },
"minimatch@10.2.6": { "brace-expansion": "5.0.12" }
```

Measured result: prod audit exit **1 → 0**, bare audit exit **1 → 0**, 855
packages unchanged, 0 added, 0 removed, 8 version-only bumps, all within their
consumers' declared semver ranges.

**Rejected alternatives.** Bumping `minimatch` (no `9.0.10` exists) and
bumping `glob`/`sucrase` (no patched release) are structurally impossible for
two of the three major lines. A bare lockfile refresh is a no-op — it
reproduces the vulnerable lockfile byte-identically.

**Verification status.** Prod and bare audit exit codes, lockfile diff,
physical-copy scan, override resolution, and an ESLint run with brace globs
were all measured directly. `next build` was not executed in a scratch copy;
build safety is inferred from API compatibility and the absence of runtime
imports (§30, item 5).

**Report-only.** This document is diagnostic. No repository file, dependency,
lockfile, CI workflow, or commit was modified by this phase. `git diff`
against `HEAD` for both `package.json` and `package-lock.json` is empty (§5).
The remediation above is a recommendation for the next implementing phase.
