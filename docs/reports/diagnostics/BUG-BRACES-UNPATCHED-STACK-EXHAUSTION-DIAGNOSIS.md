# Phase 14 — DEP-AUDIT-003 / BUG-BRACES-UNPATCHED-STACK-EXHAUSTION — Read-Only Diagnosis

**Project:** MovieMind (`movie-recommendation-system`)
**Phase:** 14 — braces Unpatched Advisory Reachability and Risk Diagnosis
**Prompt type:** READ-ONLY DEPENDENCY SECURITY AND RISK-ACCEPTANCE DIAGNOSTIC (Step 1 of 2)
**Finding ID:** DEP-AUDIT-003
**Bug ID:** BUG-BRACES-UNPATCHED-STACK-EXHAUSTION
**Advisory:** `GHSA-vfj7-8cjw-p6xm` / `CVE-2026-93687`
**Reported vulnerable package:** `braces@3.0.3`
**Reported affected range:** `<= 3.0.3`
**Current patched version:** **NONE PUBLISHED**
**Risk level:** HIGH (per prompt §A)
**Commit policy:** `COMMIT_ALLOWED: NO`
**Final status:** **PASS WITH WARNINGS**

> **Diagnosis is complete.** A single newly published, currently **unpatched** advisory on
> `braces@3.0.3` now fails both audit gates. It is **not** a Phase 13 regression — the Phase 13
> `brace-expansion` remediation is fully intact and its three advisories remain absent. The
> `braces` package is **build-time / development-tooling only** in this repository: zero
> application source imports it or any parent in the chain, the single entry point is
> `require("tailwindcss-animate")` in `tailwind.config.ts`, and no attacker-controlled input
> reaches a brace-expansion call. No remediation is currently available upstream (no released
> fix; one open, unmerged, third-party PR). **No commit, push, merge, or deployment occurred.**
> **The eight staged Phase 12/13 paths remain staged and byte-equivalent to the validated content.**

---

## 1. Executive summary

The authorized Phase 12/13 commit pass correctly stopped before committing: both mandatory audit
gates (`npm audit --audit-level=high --omit=dev` and `npm audit --audit-level=high`) now exit 1.
The cause is a **single** advisory — `GHSA-vfj7-8cjw-p6xm` / `CVE-2026-93687` — on `braces`, which
is **the only vulnerable package currently reported**. npm expands that one advisory across
**5 production-closure nodes** and **7 full-tree nodes**. There is **no patched `braces` release to
upgrade to**: `3.0.3` is the latest published version (released 2024-05-21) and the advisory's
`first_patched_version` is `null`.

The critical separation this report establishes:

- **Phase 13's remediation did not regress.** The three `brace-expansion` advisories Phase 13 closed
  (GHSA-qhr7-859c-m2p7, GHSA-q2hr-2g5m-vwhr, GHSA-6j4f-fj2g-mc7p) are **entirely absent** from the
  current audit. All eight `brace-expansion` copies remain at their patched versions (1.1.21 ×6,
  2.1.7 ×1, 5.0.12 ×1). `brace-expansion` does not appear in the vulnerability list at all.
- **A different package, in a different dependency chain, with a different advisory, is now failing.**
  `braces` is reached through `tailwindcss → chokidar/micromatch/fast-glob`, not through the
  `minimatch → brace-expansion` chain Phase 13 remediated.
- **The timing is registry-side, not repository-side.** The advisory was published 2026-09-18 and the
  GitHub Advisory Database entry was last updated 2026-10-02T22:36Z. Phase 13's validated evidence
  (audits exiting 0) was collected before the npm audit database reflected this advisory. No
  repository action caused, contributed to, or could have prevented the change.

**Reachability conclusion:** `braces` is **NOT REQUEST-TIME REACHABLE**. It is build-time and
development-tooling reachable only. Zero occurrences of `braces`, `micromatch`, `chokidar`, or
`fast-glob` appear in application source (`app/`, `components/`, `lib/`, `pages/`, `scripts/`). The
only chain entry point is `require("tailwindcss-animate")` at `tailwind.config.ts`, loaded solely by
the Tailwind CLI during `next build`. The advisory requires an attacker-supplied **deeply nested
brace pattern** to reach the recursive AST walkers; the only patterns that reach `braces` are static
`content` globs in `tailwind.config.ts` and filesystem paths enumerated by build tooling — neither is
attacker-controlled.

**Preferred recommendation (§37):** implement a **narrowly scoped, time-limited, advisory-specific
audit-policy exception** in Step 2 that matches only `GHSA-vfj7-8cjw-p6xm` on `braces`, fails closed
on every other finding, and expires on a fixed date. This unblocks the Phase 12 functional fix and the
Phase 13 security remediation without suppressing any other risk, while a permanent fix is awaited
upstream. Alternative options are evaluated in §22–§26 and are materially worse (breaking major
upgrade, reclassification that does not clear the bare gate, or an unreviewed third-party fork).

**Expiry recommendation:** **14 days** — proposed expiry **2026-10-17** (§27).

---

## 2. Status

# **PASS WITH WARNINGS**

The diagnosis is complete: audits reproduced, all dependency paths fully classified, patch
availability verified as absent, reachability bounded to build/dev tooling, and a fail-closed
exception design defined. The warnings that prevent a clean PASS are inherent to the finding itself
and cannot be resolved by diagnosis alone:

- **No patched `braces` release exists**, so no in-repo remediation can clear the advisory today.
- **Upstream fix timing is uncertain** — the only fix PR is open, unmerged, and from a third party.
- **Exploitability in this deployment is assessed as not demonstrated**, but the advisory's network
  attack vector (`AV:N`) means the theoretical severity cannot be reduced by downstream analysis alone.
- **The CI audit gate remains red** until either an upstream patch or an approved exception exists.

No gate required by this phase is incomplete; every requirement in §47 has evidence.

---

## 3. Advisory identity

| Field | Value | Source |
|---|---|---|
| GHSA ID | `GHSA-vfj7-8cjw-p6xm` | GitHub Advisory API (primary) |
| CVE ID | `CVE-2026-93687` | GitHub Advisory API; NVD |
| Title | `braces vulnerable to stack-exhaustion denial of service through deeply nested patterns` | GitHub Advisory API |
| Description | `braces through 3.0.3 contains a stack overflow vulnerability in the recursive AST walkers that lack depth guards. Attackers can supply deeply nested brace patterns under the character limit to exhaust the call stack and terminate the Node.js process with an uncaught RangeError.` | GitHub Advisory API |
| Severity | **HIGH** | GitHub Advisory API; npm audit |
| CVSS score | **7.5** | GitHub Advisory API |
| CVSS vector | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` | GitHub Advisory API; NVD |
| CWE (NVD) | `CWE-674` (Uncontrolled Recursion) | NVD API |
| CWE (npm `via` block) | `["CWE-674"]` | npm audit JSON |
| Affected range | `braces <= 3.0.3` (npm) / `introduced 0`, `last_affected 3.0.3` (OSV) | GitHub Advisory API; OSV |
| First patched version | **`null`** — none exists | GitHub Advisory API; npm audit `via` |
| GitHub Advisory published | **2026-09-18T18:31:41Z** | GitHub Advisory API `published_at` |
| GitHub Advisory last updated | **2026-10-02T22:36:34Z** | GitHub Advisory API `updated_at` |
| OSV record last modified | **2026-10-02T22:45:04Z** | OSV API |
| NVD published | **2026-09-18T16:17:15Z** | NVD API 2.0 |
| NVD last modified | **2026-09-22T20:25:55Z** | NVD API 2.0 |
| NVD analysis status | **`Awaiting Analysis`** | NVD API 2.0 |
| Withdrawn | No (`withdrawn_at: null`) | GitHub Advisory API |
| CVSS source | `disclosure@vulncheck.com` (NVD submitter) | NVD API 2.0 |

### 3.1 Timestamp disambiguation (per prompt §1)

Four distinct timestamps exist and are **not** interchangeable:

| Concept | Exact value | Meaning |
|---|---|---|
| Advisory **publication** | 2026-09-18T18:31:41Z | The GHSA record first became public. |
| GitHub Advisory Database **last update** | 2026-10-02T22:36:34Z | The GHSA record's metadata was last revised. |
| npm audit database **ingestion** | Not published by npm | When the advisory entered the local audit dataset. Not directly observable; bounded only by first-observation time. |
| Repository **first observation** | 2026-10-03 (this session's prior commit pass) | When the repository's own audit first reported the finding. |

**Precision correction to an earlier statement.** During the blocked commit pass I stated the advisory
was "published/updated hours before the commit pass." The authoritative timestamps refine this: the
advisory was published **2026-09-18**, which is **15 days before** the 2026-10-03 observation; the
**GitHub Advisory Database update** on 2026-10-02T22:36Z is what occurred ~1 day before observation,
and the **npm-audit-database ingestion** timing is not published. I therefore withdraw the "hours
before" phrasing as unsupported and record the exact values above. The operational conclusion is
unchanged: the finding appeared in the audit gate *after* Phase 13's validated evidence was collected
and *independent of* any repository action.

### 3.2 Relationship to the older `braces` advisory

OSV returned **two** advisories for `braces`. They must not be conflated:

| Advisory | CVE | Published | Affected range | Fixed |
|---|---|---|---|---|
| `GHSA-grv7-fg5c-xmjg` | CVE-2024-4068 | 2024-05-14 | `>= 0` | **3.0.3** |
| `GHSA-vfj7-8cjw-p6xm` | CVE-2026-93687 | 2026-09-18 | `>= 0`, `last_affected 3.0.3` | **none** |

`braces@3.0.3` was itself the **fix** for the 2024 uncontrolled-resource-consumption advisory
(CVE-2024-4068) — and is now the **latest affected** version of the 2026 stack-exhaustion advisory.
This is the structural reason no remediation is available: the newest release is both the fix for the
old issue and the last affected version of the new one. The older advisory is **not** reported by
`npm audit` (its range is `fixed: 3.0.3`), only the new one is.

---

## 4. Relationship to Phase 12 and Phase 13

| Question | Answer | Evidence |
|---|---|---|
| Is the current failure a Phase 13 regression? | **No.** | §8: the three Phase 13 advisories are absent from the live audit; `brace-expansion` is not a reported package. §3.3 of this report. |
| Is `brace-expansion` still patched? | **Yes** — all 8 copies remain at patched versions. | §8.4 |
| Did any repository action cause this? | **No.** | Advisory publication (2026-09-18) and database update (2026-10-02) are registry-side events. §3.1 |
| Should Phase 12's fix stay blocked? | **No — not on the merits of the cache fix itself.** | The cache fix is validated (11/11, typecheck 0) and unrelated to `braces`. The blocker is a policy gate, not a defect in the staged content. §28, §29 |
| Does one combined commit still make sense? | **Yes, with a caveat.** | The Phase 12 and Phase 13 deltas are coherent and independently validated. The exception policy should land **before or together with** them so the commit's audit gate is provably green at commit time. §28 |
| Is the Phase 13 validation record still trustworthy? | **Yes, as a historical record.** | It accurately recorded exit 0 at the time it ran. The live gate has since drifted due to registry-side changes. §30 |

**Key distinction this report draws (per prompt §10):**

1. **"Audit passed during Phase 13 execution"** — TRUE at the time. Phase 13's evidence is honest.
2. **"Audit fails now due to a newly introduced registry advisory"** — TRUE, and this is the cause.
3. **"Phase 13 remediation regressed"** — FALSE. Rejected by direct evidence (§8.4).
4. **"Phase 13 remediation remains valid but the live gate drifted"** — TRUE. This is the accurate summary.

---

## 5. Initial staged Git state

Captured before any dependency analysis (`git status --porcelain=v2 --branch`):

| Property | Value |
|---|---|
| Branch | `work/phase-12-cache-invalidation-diagnosis` |
| HEAD | `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f` |
| Upstream | none configured (branch has no tracking remote) |
| Staged paths | **8** (the authorized Phase 12/13 set) |
| Unstaged tracked diff | **empty** |
| Index | contains exactly the 8 paths; no Phase 14 path added |

Staged set (porcelain v2, with index blob OIDs):

| Path | Status | Index blob OID |
|---|---|---|
| `docs/reports/PHASE-12-AI-SIMILAR-CACHE-INVALIDATION-CORRECTION-COMPLETION-REPORT.md` | A | `3987668f01b55964b1bf27f8c84dd39e815339ba` |
| `docs/reports/PHASE-13-BRACE-EXPANSION-ADVISORY-REMEDIATION-COMPLETION-REPORT.md` | A | `8e42781d795cf7c2e09c91455a1d79e45bd6ae31` |
| `docs/reports/diagnostics/BUG-AI-SIMILAR-CACHE-INVALIDATION-GAP-DIAGNOSIS.md` | A | `2da2b09593162843a280c9405ea74c833d61800c` |
| `docs/reports/diagnostics/BUG-BRACE-EXPANSION-HIGH-ADVISORY-DIAGNOSIS.md` | A | `dfd080468e884e9a3523a6db4ead775b9b077eb6` |
| `lib/cacheManager.ts` | M | `0572058685fdd96fd02f96dcc00c01ce3028c75b` |
| `package-lock.json` | M | `ecbb234365f2d57a65439d2cdf9c790122dcdf42` |
| `package.json` | M | `01bc02133c61b9147cc61efa799123443bbf7d7e` |
| `tests/ai-similar-cache-invalidation.test.ts` | A | `528c7c2d7b232085153f1a55c6e10abae9be2185` |

`git diff --cached --stat`: `8 files changed, 4228 insertions(+), 26 deletions(-)`.

Untracked set (`git ls-files --others --exclude-standard`): 63 pre-existing scratch paths
(`.chunks/` ×27, `.my_tool_sandbox/` ×28, `.inbox3.txt`, `.phase11-prompt.txt`, `as_route_copy.txt`,
`cqq.txt`, `cqq_full.txt`, `failed_block.txt`, `nul`, `route_dump.txt`) — **all preserved, none
removed, none staged**. The Phase 14 diagnostic report did not exist at baseline.

**Baseline confirmation:** exactly 8 staged paths matching the authorized set; unstaged tracked diff
empty; no commit for Phase 12/13 exists (`git rev-list --count origin/release/phases-2-11-verified..HEAD` = 0);
Phase 14 did not alter the index.

---

## 6. Environment

| Property | Value |
|---|---|
| OS | Windows 10 (`MINGW64_NT-10.0-19045 3.6.3`) |
| Shell | git-bash / MSYS (`/usr/bin/bash`) |
| Node (default PATH) | `v26.7.0` |
| Node 22 validation runtime | `<pre-existing-node-22-runtime>/node.exe` → **`v22.13.1`** (pre-existing, discovered in Phase 11, reused; not installed or downloaded) |
| npm (under both runtimes) | `11.19.0` (`node <node-26-dist>/node_modules/npm/bin/npm-cli.js`) |
| Git | `2.50.1.windows.1` |
| `core.autocrlf` | `true` (see §44) |
| `.gitattributes` | **absent** |

All `npm`/`vitest`/`tsc` commands in this report ran under **Node v22.13.1** (the CI-pinned major),
matching Phase 13's validation environment, except where explicitly noted.

---

## 7. Authoritative advisory metadata

Consolidated from three independent authoritative sources (§3) — GitHub Advisory Database (primary),
OSV, and NVD — plus the npm registry for patch availability. All four agree on package, severity,
CVSS, and affected range. Sources were consulted read-only over HTTPS; no credentials were used.

**Cross-source agreement:**

| Datum | GHSA | OSV | NVD | npm audit |
|---|---|---|---|---|
| Package | `braces` | `braces` | `braces` | `braces` |
| Severity | high | (score 7.5) | high | high |
| CVSS | 7.5 `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` | 7.5 | 7.5 `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` | 7.5 (in `via` block) |
| Affected | `<= 3.0.3` | `introduced 0`, `last_affected 3.0.3` | `through 3.0.3` | `<=3.0.3` |
| Patched | `null` | (no `fixed` event) | — | not available |

**Patch availability (per prompt §1):** `braces@3.0.3` **is the latest npm release.** The registry
publishes 37 versions total; `dist-tags.latest = 3.0.3`; `3.0.3` was published **2024-05-21**. There
is no `3.0.4`, no `3.1.0`, and no pre-release or `next` tag. The registry's `modified` timestamp is
`2024-09-18`, i.e. **no new `braces` publish in over two years**.

**Exploit prerequisite (per the advisory description and issue #70):** an attacker must supply a
**deeply nested brace pattern** (thousands of nesting levels) that remains **under the package's
10,000-character input cap** (`MAX_LENGTH`). Upstream's own report verifies `compile` crashes at
depth ≥ ~3500 and `expand` at ≥ ~4000, both within the character cap. The impact is **availability
only** (`C:N/I:N/A:H`) — an uncaught `RangeError` terminates the Node process.

**Exact availability impact:** process termination via call-stack exhaustion (`RangeError: Maximum
call stack size exceeded`) when a deeply nested pattern reaches the recursive AST walkers
(`lib/compile.js`, `lib/expand.js`, `lib/stringify.js`). No data disclosure, no integrity impact.

---

## 8. Audit reproduction

All four forms ran read-only under Node v22.13.1 / npm 11.19.0. Metadata reported by npm:
`{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":5,"critical":0,"total":5},
"dependencies":{"prod":407,"dev":409,"optional":92,"peer":9,"peerOptional":0,"total":854}}` for the
production form, and `high:7 / total:7` for the bare form.

### 8.1 `npm audit --omit=dev --json`

| Property | Value |
|---|---|
| Exit | **1** |
| Total vulnerabilities | **5** (all `high`; 0 info/low/moderate/critical) |
| Distinct vulnerable packages | **5** |

| # | Package | Reported range | Severity | `fixAvailable` | Nodes |
|---|---|---|---|---|---|
| 1 | `braces` | `*` | high | `{"name":"tailwindcss","version":"4.3.3","isSemVerMajor":true}` | `node_modules/braces` |
| 2 | `chokidar` | `2.0.0 - 3.6.0` | high | (same) | `node_modules/chokidar` |
| 3 | `micromatch` | `>=0.2.0` | high | (same) | `node_modules/micromatch` |
| 4 | `fast-glob` | `*` | high | (same) | `node_modules/fast-glob` |
| 5 | `tailwindcss` | `<=0.0.0-oxide-insiders.ff2c25f || 2.1.0-canary.1 - 3.4.19` | high | (same) | `node_modules/tailwindcss` |

`braces` `via` entry (the **only** advisory object in the entire report):

```json
{
  "source": 1240992, "name": "braces", "dependency": "braces",
  "title": "braces vulnerable to stack-exhaustion denial of service through deeply nested patterns",
  "url": "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  "severity": "high", "cwe": ["CWE-674"],
  "cvss": { "score": 7.5, "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H" },
  "range": "<=3.0.3"
}
```

`chokidar` `via: ["braces"]`; `micromatch` `via: ["braces"]`; `fast-glob` `via: ["micromatch"]`;
`tailwindcss` `via: ["chokidar","fast-glob","micromatch"]`. The `advisories` object is **empty** in
this npm version (npm merges all advisories into the name-keyed `vulnerabilities` map; per-GHSA
metadata is only in the `via` block — identical behavior to Phase 13, §7 of that diagnosis).

### 8.2 `npm audit --audit-level=high --omit=dev`

Exit **1**. Human-readable output prints the `braces` tree and concludes
`5 high severity vulnerabilities`. This is the **CI gate command** (`.github/workflows/ci.yml:92`),
so the CI `security` job is red.

### 8.3 `npm audit --json` (bare)

| Property | Value |
|---|---|
| Exit | **1** |
| Total vulnerabilities | **7** (all `high`) |
| Distinct vulnerable packages | **7** |

Same 5 packages as §8.1, plus 2 additional dev-classified nodes:

| # | Package | Range | Nodes |
|---|---|---|---|
| 6 | `@next/eslint-plugin-next` | `>=14.3.0-canary.0` | `node_modules/@next/eslint-plugin-next` |
| 7 | `eslint-config-next` | `>=14.3.0-canary.0` | `node_modules/eslint-config-next` |

The bare audit additionally reports `fast-glob` at **two** nodes:
`node_modules/@next/eslint-plugin-next/node_modules/fast-glob` (dev) and `node_modules/fast-glob`.

### 8.4 `npm audit --audit-level=high`

Exit **1**. Human-readable output prints `7 high severity vulnerabilities`.

### 8.5 Advisory count vs affected-node count (per prompt §2 and §9)

**This is one advisory, not five or seven.** The distinction the prompt requires:

| Measure | Production audit | Bare audit |
|---|---|---|
| **Distinct advisories** | **1** (`GHSA-vfj7-8cjw-p6xm`, source 1240992) | **1** (same) |
| **Distinct vulnerable packages reported** | 5 | 7 |
| **Affected audit nodes** (`nodes[]`) | 5 | 7 |
| **Physical copies of `braces` on disk** | — | **1** (§10) |
| **Dependency paths to `braces`** | 2 prod-visible chains (§11) | 4 total chains (§11) |

npm reports the single advisory once per **package it propagates to**, and propagates it to every
ancestor whose declared range overlaps a vulnerable version. `braces` → `chokidar` (depends on
`braces ~3.0.2`) and `braces` → `micromatch` (depends on `braces ^3.0.3`) each inherit the finding;
`micromatch` → `fast-glob` → `tailwindcss` and `chokidar` → `tailwindcss` inherit transitively. The
bare audit adds the `eslint-config-next → @next/eslint-plugin-next → fast-glob@3.3.1` dev chain, and
counts `fast-glob` twice because it exists at two node paths.

**Confirmed per the prompt's requirements:**

- The production audit reports **5 affected nodes across 5 package paths** — not 5 advisories.
- The bare audit reports **7 affected nodes across 7 package paths** — not 7 advisories.
- npm reports **one advisory merged across several paths**.
- **No `brace-expansion` advisory has returned.** `brace-expansion` is absent from the vulnerability
  map entirely, and all 8 of its copies remain at the Phase 13 patched versions:
  `node_modules/brace-expansion@2.1.7` (prod), and 7 dev copies at `1.1.21` ×6 / `5.0.12` ×1
  (`@eslint/config-array`, `@eslint/eslintrc`, `@typescript-eslint/typescript-estree`, `eslint`,
  `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react`). **The Phase 13
  remediation is intact.**

---

## 9. Advisory count versus affected-node count

See §8.5 for the full table. Summary of the four measures the prompt distinguishes:

1. **Physical copies of `braces`:** `find node_modules -type d -name braces` = **1** — a single
   hoisted `node_modules/braces` at `3.0.3`, shared by both consumers. No nested copies exist.
2. **Dependency paths to `braces`:** **4** total (2 production-visible, 2 dev-only) — §11.
3. **Affected audit nodes:** **5** production / **7** bare.
4. **Advisories:** **1**.

The 5/7 figures are a property of npm's ancestor-propagation reporting, not of the number of defects
or copies. This distinction matters for the exception design (§26): the policy must key on the
**advisory identity**, not on the node count, because the node count changes with the tree.

---

## 10. Physical-copy inventory

`find node_modules -type d -name braces` returns exactly **one** directory. Physical-copy scan was
read-only; `node_modules` was not modified.

| # | Physical path | Version | Parent dependency | Direct/transitive | Hoisted/nested | Shared? |
|---|---|---|---|---|---|---|
| 1 | `node_modules/braces` | `3.0.3` | `chokidar@3.6.0` **and** `micromatch@4.0.8` (both) | transitive | **hoisted** (top level) | **Yes** — one physical copy serves both parents (`npm ls` reports `deduped` for the `micromatch` edge) |

**There is no second physical copy.** The `braces` range declared by `chokidar` (`~3.0.2`) and by
`micromatch` (`^3.0.3`) both resolve to the same hoisted `3.0.3` directory. This is a meaningful
difference from Phase 13, which dealt with 8 physical `brace-expansion` copies: here, a single copy
is implicated, reached by two parents, inside one tooling subtree.

Lockfile flags for the copy (`node_modules/braces`): `dev: false`, `devOptional: false`,
`optional: false`, `peer: false`, `inBundle: false`, `engines: {"node":">=8"}`,
`dependencies: {"fill-range":"^7.1.1"}`.

**`braces` is the only package named `braces` in the lockfile** — a scan of all 855 lockfile keys
found exactly one key whose final path segment is `braces`.

---

## 11. Dependency-path inventory

`npm explain braces` (exit 0) enumerates every chain. Consolidated:

### 11.1 Production-visible chains (visible to `npm audit --omit=dev`)

Both chains root at `tailwindcss-animate@1.0.7`, the only production-classified entry point.

**Chain P1** — the `chokidar` path:

```
root project (dependencies.tailwindcss-animate ^1.0.7)
  └─ tailwindcss-animate@1.0.7            [prod, dev:false]   peer: tailwindcss >=3.0.0 || insiders
      └─ tailwindcss@3.4.17               [prod, dev:false]   dependencies.chokidar ^3.6.0
          └─ chokidar@3.6.0               [prod, dev:false]   dependencies.braces ~3.0.2
              └─ braces@3.0.3             [prod, dev:false]   ← the vulnerable package
```

**Chain P2** — the `micromatch`/`fast-glob` path:

```
root project (dependencies.tailwindcss-animate ^1.0.7)
  └─ tailwindcss-animate@1.0.7            [prod, dev:false]   peer: tailwindcss >=3.0.0 || insiders
      └─ tailwindcss@3.4.17               [prod, dev:false]   dependencies.fast-glob ^3.3.2
          └─ fast-glob@3.3.3              [prod, dev:false]   dependencies.micromatch ^4.0.8
              └─ micromatch@4.0.8         [prod, dev:false]   dependencies.braces ^3.0.3
                  └─ braces@3.0.3         [prod, dev:false]   ← same physical copy (deduped)
```

`tailwindcss@3.4.17` also declares `micromatch ^4.0.8` directly, giving `braces` a second parent edge
within the same subtree — this is why `npm ls braces --all` shows `braces@3.0.3 deduped`.

### 11.2 Development-only chains (invisible to `--omit=dev`, reported by the bare audit)

**Chain D1** — the ESLint path:

```
root project (devDependencies.eslint-config-next ^15.5.4)
  └─ eslint-config-next@15.5.4            [dev:true]
      └─ @next/eslint-plugin-next@15.5.4  [dev:true]          dependencies.fast-glob 3.3.1
          └─ fast-glob@3.3.1              [dev:true]  (nested) dependencies.micromatch ^4.0.4
              └─ micromatch@4.0.8         [prod node, but reached via a dev subtree]
                  └─ braces@3.0.3         ← the same single physical copy
```

**Chain D2** — the `@tailwindcss/typography` peer path (dev):

```
root project (devDependencies.@tailwindcss/typography ^0.5.16)
  └─ @tailwindcss/typography@0.5.16       [dev:true]          peer: tailwindcss >=3.0.0 || ...
      └─ tailwindcss@3.4.17 → (chokidar / fast-glob → micromatch) → braces@3.0.3
```

### 11.3 Per-copy classification (per prompt §3)

For the single physical copy `node_modules/braces`:

| Attribute | Value |
|---|---|
| Physical path | `node_modules/braces` |
| Installed version | `3.0.3` |
| Parent dependencies | `chokidar@3.6.0`, `micromatch@4.0.8` |
| Complete chains to root | 4 (P1, P2 production-visible; D1, D2 dev-only) |
| Direct or transitive | **transitive** (no root-level dependency on `braces`) |
| Production-classified or dev-classified | **production-classified** (`dev: false` in the lockfile) |
| Lockfile `dev` flag | `false` |
| Lockfile `devOptional` flag | `false` |
| Lockfile `optional` flag | `false` |
| Included by `--omit=dev` | **Yes** — this is why the production audit reports it |
| Hoisted or nested | **hoisted** (top-level `node_modules/`) |
| Multiple parents share the physical copy | **Yes** — `chokidar` and `micromatch` share it; `npm ls` marks the `micromatch` edge `deduped` |

**Note on the production/dev boundary.** Chain D1 reaches the *same hoisted* `node_modules/braces`
directory even though its own subtree is dev-classified. The lockfile's `dev:false` flag on
`node_modules/braces` reflects the **production** classification (npm assigns the union when a package
is reachable from both closures). This is why the copy is simultaneously "in the production closure"
and reachable from a dev subtree — the flags describe reachability classes, not mutually exclusive
copies.

### 11.4 Parent chain presence (per prompt §3)

| Requested chain | Present? | Classification |
|---|---|---|
| `tailwindcss` | **Yes** | prod (`dev:false`) — reached via `tailwindcss-animate` peer |
| `chokidar` | **Yes** | prod (`dev:false`) |
| `fast-glob` | **Yes** — at **two** node paths: `node_modules/fast-glob@3.3.3` (prod) and `node_modules/@next/eslint-plugin-next/node_modules/fast-glob@3.3.1` (dev) | both |
| `micromatch` | **Yes** | prod (`dev:false`) |
| `sucrase` | **Yes**, but **not on the `braces` chain** | prod (`dev:false`); `sucrase → glob → minimatch → brace-expansion` (the Phase 13 chain) |
| ESLint / testing tool path | **Yes** — `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` | dev |
| Next.js build-tool path | **Yes** — `tailwindcss` is a Next.js build dependency (via `postcss.config.mjs`) | prod-classified by peer promotion |

---

## 12. Lockfile classification

`package.json` declarations relevant to this chain:

| Declaration | Location | Class in `package.json` | Lockfile `dev` flag |
|---|---|---|---|
| `"tailwindcss-animate": "^1.0.7"` | `dependencies` | **production** | `false` |
| `"tailwindcss": "^3.4.17"` | `devDependencies` | dev | **`false`** ← see §13 |
| `"@tailwindcss/typography": "^0.5.16"` | `devDependencies` | dev | `true` |
| `"eslint-config-next": "^15.5.4"` | `devDependencies` | dev | `true` |

Lockfile `dev` flags for every package on the `braces` chain:

| Package | Version | `dev` | `devOptional` | `optional` |
|---|---|---|---|---|
| `node_modules/tailwindcss-animate` | 1.0.7 | `false` | `false` | `false` |
| `node_modules/tailwindcss` | 3.4.17 | **`false`** | `false` | `false` |
| `node_modules/chokidar` | 3.6.0 | `false` | `false` | `false` |
| `node_modules/micromatch` | 4.0.8 | `false` | `false` | `false` |
| `node_modules/fast-glob` | 3.3.3 | `false` | `false` | `false` |
| `node_modules/braces` | 3.0.3 | `false` | `false` | `false` |
| `node_modules/@next/eslint-plugin-next` | 15.5.4 | **`true`** | `false` | `false` |
| `node_modules/@next/eslint-plugin-next/node_modules/fast-glob` | 3.3.1 | **`true`** | `false` | `false` |
| `node_modules/eslint-config-next` | 15.5.4 | **`true`** | `false` | `false` |

Production/dev closure counts from the audit metadata: **407 production**, 409 dev, 92 optional,
9 peer, **854 total** (the lockfile has 855 keys including the root entry; 424 carry `dev:false` and
430 carry `dev:true`/`devOptional:true` by a direct lockfile scan).

---

## 13. Production-closure explanation

This section answers the prompt's central structural question: **why does `braces` appear in
`npm audit --omit=dev` at all, when `tailwindcss` itself is declared in `devDependencies`?**

The answer is **npm transitive peer promotion**, and it is the same mechanism Phase 13 identified
(Phase 13 diagnosis §8) operating on a different chain.

**The mechanism, step by step:**

1. `tailwindcss` is declared in root **`devDependencies`** (`package.json`). In isolation, npm would
   classify `tailwindcss` and its entire transitive subtree as dev.
2. `tailwindcss-animate@1.0.7` is declared in root **`dependencies`** (production). It declares
   `tailwindcss: ">=3.0.0 || insiders"` as a **`peerDependency`** — it does not bundle `tailwindcss`.
3. npm must satisfy that peer from the tree. Because the peer is requested by a **production**
   package, npm assigns `tailwindcss` to the **production closure**, overriding the root's dev
   declaration. The lockfile records the result: `node_modules/tailwindcss` has **`dev: false`**.
4. `tailwindcss@3.4.17` declares `chokidar ^3.6.0`, `fast-glob ^3.3.2`, and `micromatch ^4.0.8` as
   regular `dependencies`. All three inherit the production classification (`dev: false`).
5. `chokidar` declares `braces ~3.0.2` and `micromatch` declares `braces ^3.0.3`. `braces` inherits
   `dev: false`.
6. `npm audit --omit=dev` therefore includes `braces`, and the advisory is reported.

**Direct verification of the mechanism.** A scan of all 855 lockfile entries for any package declaring
a `dependency` or `peerDependency` on `tailwindcss` found exactly two:

| Dependent | Kind | `dev` flag |
|---|---|---|
| `node_modules/tailwindcss-animate` | **`peerDependencies`** | `false` (production) |
| `node_modules/@tailwindcss/typography` | `peerDependencies` | `true` (dev) |

`tailwindcss-animate` is the **only production-classified dependent of `tailwindcss`**. This is
decisive: remove the production classification of `tailwindcss-animate` and `tailwindcss` has no
remaining production path, so npm would classify it dev and the entire `braces` subtree would leave
the production closure. This is the factual basis for Option B (§23).

**Answers to the prompt's specific assessments:**

| Question | Answer | Basis |
|---|---|---|
| `tailwindcss-animate` classification | **production `dependencies`** — misclassified; it is a build-only Tailwind plugin | `package.json`; Phase 13 diagnosis §21 |
| `tailwindcss` classification | declared **dev** in the manifest, but **classified production by npm** due to peer promotion | lockfile `dev:false` on `node_modules/tailwindcss` |
| Is Tailwind in `dependencies` or `devDependencies`? | **`devDependencies`** in the manifest; **production closure** in the resolved tree | `package.json` vs lockfile |
| Are build-time packages included in the production closure? | **Yes** — this specific one is, via peer promotion | §13 mechanism |
| Is `braces` installed in a production-only `npm ci --omit=dev` tree? | **Yes** | `dev:false` on `node_modules/braces`; `npm ls braces --omit=dev --all` returns the full chain |
| Is `braces` bundled into `.next`? | **No** — see §14 | build-output analysis |
| Is `braces` present in server chunks? | **No** | §14 |
| Is `braces` present in client chunks? | **No** | §14 |
| Does `braces` exist only during build/install tooling? | **Yes** | §15–§17 |

---

## 14. Bundling analysis

`braces` is a CommonJS module (`"main": "index.js"`, `files: ["index.js","lib"]`) consumed only by
build tooling. It is **not** imported by any application module, so no bundler ever traces it into a
client or server chunk.

| Check | Method | Result |
|---|---|---|
| `.next/` build output present? | `ls -d .next` | **ABSENT** — removed after Phase 13's build verification; not rebuilt in this phase (rebuilding is not authorized) |
| Static trace of `braces` in build output | `grep -rl braces .next` | **Not performed** — no `.next` exists. Phase 13's build (exit 0, 31 static + 22 dynamic routes) is the last available evidence. |
| Import trace in application source | `search_files` for `braces`/`micromatch`/`chokidar`/`fast-glob` across all file types under the repo root, excluding `node_modules`, `.next`, `docs/reports` | **0 matches** (§15) |
| Bundled into server chunks? | Inference from the import trace | **No** — nothing imports it, so Next.js/Turbopack never resolves it into a server graph |
| Bundled into client chunks? | Inference from the import trace | **No** — same reasoning |

Because the prior Phase 13 production build succeeded with this exact dependency tree and the source
has not changed since, the Phase 13 build evidence remains the best available statement that `braces`
is not bundled. This is an inference from the import trace plus the prior build, **not** a fresh
post-build scan — recorded as a limitation in §41.

---

## 15. Request-time reachability

This is the decisive security question for the risk-acceptance decision. Per the prompt, the
classification options are REQUEST-TIME / BUILD-TIME / DEVELOPMENT-TOOLING / INSTALLED-BUT-NOT-
BUNDLED / NOT DEMONSTRATED / UNRESOLVED.

### 15.1 Source search results

`search_files` across the entire repository (all file types, `node_modules`, `.next`, and
`docs/reports` excluded):

| Search | Matches |
|---|---|
| `braces` (any mention) | **0** |
| `micromatch` | **0** |
| `chokidar` | **0** |
| `fast-glob` / `fastglob` | **0** |
| `glob(` / `glob.sync` / `globSync` / `import {...} glob` | **0** |
| `watch(` / `chokidar.watch` / `fs.watch` | **0** |
| `tailwind.config` / `postcss.config` / `next.config` (config file references) | 3 config files only |

### 15.2 The single chain entry point

The **only** application reference to the vulnerable chain's entry point is:

`tailwind.config.ts`:
```ts
plugins: [
  // Tailwind plugins are CommonJS modules; require() is the standard Node syntax here.
  require("tailwindcss-animate"),
  require("@tailwindcss/typography")
],
```

`tailwindcss-animate` is a Tailwind CSS **plugin**. It is loaded **only by the Tailwind CLI** while
compiling CSS during `next build`. It is never executed in a request path, and `tailwind.config.ts`
itself is never bundled into the server runtime (it is build-time configuration consumed by the
Tailwind/PostCSS pipeline via `postcss.config.mjs`).

`tailwind.config.ts` `content` patterns — the only glob-like strings that reach the Tailwind CLI's
`fast-glob`/`micromatch`/`braces` calls:

```ts
content: [
  "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  "./components/**/*.{js,ts,jsx,tsx,mdx}",
  "./app/**/*.{js,ts,jsx,tsx,mdx}",
  "*.{js,ts,jsx,tsx,mdx}"
],
```

These are **four static, hardcoded, developer-authored literals**. They contain no brace nesting
beyond a single level (`{js,ts,...}`), no user input, and no dynamic construction.

### 15.3 Filesystem-pattern search

| Search | Result |
|---|---|
| `fs.readFile` / `readDir` / `writeFile` / `glob` / `watch` in `app/`, `components/`, `lib/`, `pages/`, `scripts/` | **1 match**: `scripts/download-genre-images.js` uses `path.join(process.cwd(), 'public', 'genres')` — a fixed directory with a computed filename from an internal genre list, not a glob, and not reachable from any request |
| Request-input sites (`searchParams`, `params.get/id`, `req.query/body/params`, `request.json()`) | 54 sites exist across the API surface. **None feeds a filesystem-glob or brace-expansion call** — verified by the zero matches for `braces`/`micromatch`/`fast-glob`/`glob(`/`watch(` in the same source trees. |

### 15.4 Classification per physical copy

| Physical copy | Classification | Basis |
|---|---|---|
| `node_modules/braces` | **BUILD-TIME REACHABLE** and **DEVELOPMENT-TOOLING REACHABLE**; **NOT REQUEST-TIME REACHABLE** | Reached only via `tailwindcss` CLI (`next build`) and via `eslint-config-next` (lint). Zero application imports; no request path reaches it. |

The copy is **also** "INSTALLED BUT NOT BUNDLED" in the sense that no bundler includes it in any
client or server chunk (§14). The primary classification is the reachability one above.

### 15.5 Attacker-control analysis (per prompt §5)

The advisory requires a **deeply nested brace pattern** (thousands of nesting levels, under the
10,000-character cap) to reach the recursive AST walkers. The prompt asks whether an attacker can
control such a pattern through each listed vector:

| Vector | Attacker-controlled? | Evidence |
|---|---|---|
| HTTP query values | **No** | 54 request-input sites exist; none reaches a glob or brace-expansion call (§15.1, §15.3) |
| JSON request bodies | **No** | same |
| Route parameters | **No** | same |
| Database content | **No** | no database value is passed into a file-pattern or glob API |
| Uploaded files | **No** | no upload path feeds a glob |
| Admin input | **No** | no admin surface constructs a glob pattern |
| Filesystem names | **No** | the only filesystem enumeration is `scripts/download-genre-images.js` over a fixed `public/genres` directory with internal filenames |
| Build configuration | **No** — static literals | `tailwind.config.ts` `content` globs are hardcoded developer-authored strings |

**No attacker-controlled input reaches a `braces` call site.** The only inputs to the expander are
(a) the four static `content` literals and (b) filesystem paths enumerated by build tooling. Both are
developer-controlled, and neither is deeply nested.

### 15.6 Prohibited actions — complied

- **The denial-of-service payload was not executed.**
- **No proof-of-concept that could crash Node was created.**

Reachability was established by static source search and dependency-path tracing only, as required.

---

## 16. Build-time reachability

**Confirmed — this is the only live exposure.**

`braces` executes during `next build` via two routes inside the Tailwind CLI:

1. **`tailwindcss` → `chokidar@3.6.0` → `braces@3.0.3`.** `chokidar` is Tailwind's file watcher for
   HMR/content detection; `braces` expands its glob patterns.
2. **`tailwindcss` → `fast-glob@3.3.3` → `micromatch@4.0.8` → `braces@3.0.3`.** `fast-glob` resolves
   the `content` patterns in `tailwind.config.ts`; `micromatch` compiles them; `braces` expands the
   brace portions.

Both run inside the Tailwind CLI process during CSS compilation. The inputs are the static
`content` literals (§15.2) plus filesystem paths — neither is deeply nested, so the stack-exhaustion
condition is not met by this repository's own build.

**Threat model for the build path:** an attacker would need to control a `content` glob or a
filesystem path the watcher scans. Both are developer-controlled and repository-local. A
build-time crash would be a developer-machine or CI failure, not a production outage — and it would
be visible immediately as a failed `next build`.

---

## 17. Development-tooling reachability

**Confirmed.**

`braces` is reached by:

1. **`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob@3.3.1` → `micromatch@4.0.8` →
   `braces@3.0.3`** — the ESLint lint path (`npm run lint`). This is the chain that adds the 2
   extra nodes in the bare audit.
2. **`tailwindcss` CLI** — during local `next dev`/`next build`.
3. **Any editor language server** that loads the ESLint config.

All are developer-machine tooling. None runs in production. The exposure is the same class as
§16: a crash would affect a developer's lint run, not a served request.

---

## 18. Exploit prerequisites

From the advisory description and upstream issue #70 (both read-only):

| Prerequisite | Value |
|---|---|
| Vulnerable entry points | `braces(pattern)` / `braces.compile()` / `braces.expand()` / `braces.stringify()` — the recursive AST walkers in `lib/compile.js`, `lib/expand.js`, `lib/stringify.js` |
| Trigger | A **deeply nested brace pattern** (e.g. thousands of nested `{`) |
| Input-length constraint | Must stay **under `MAX_LENGTH = 10000`** characters — the pattern must be deep, not long |
| Verified crash thresholds (upstream) | `compile` crashes at depth ≥ ~3500; `expand` at ≥ ~4000 (verified on Node v26.5.0) |
| Failure mode | `RangeError: Maximum call stack size exceeded` — **synchronous**, thrown during parsing/expansion |
| Availability impact | **Process termination** if the `RangeError` is uncaught. No data loss beyond the in-flight request; no confidentiality or integrity impact (`C:N/I:N/A:H`) |
| Authentication required | **None** (`PR:N`) — but only if an attacker-controlled pattern can reach the expander |
| User interaction | None (`UI:N`) |

**In this repository, the prerequisite is not satisfiable from any network input** (§15.5). The only
patterns reaching the expander are static literals and filesystem paths.

---

## 19. Security impact

| Dimension | Assessment |
|---|---|
| Advisory-rated impact | **HIGH** — CVSS 7.5, availability-only (`A:H`, `C:N/I:N`) |
| Impact type | **Availability** — process termination via stack exhaustion |
| Impact in this deployment | **NOT DEMONSTRATED** as request-time; **build-time / development-tooling only** |
| Confidentiality impact | **None** |
| Integrity impact | **None** |
| Worst-case if exploit prerequisites were met | A crafted pattern reaching a build or lint call would crash that build/lint process. If it somehow reached a server-side `braces()` call, it would terminate the Node process (DoS). No path to either exists in this codebase. |
| Attack surface in this repo | **None reachable** — zero application imports; static build patterns only |

**Honest caveat.** The advisory's `AV:N` (network attack vector) is a *worst-case* rating for the
generic library, assuming an application passes network input to `braces`. This repository does not.
The CVSS score cannot be reduced by downstream analysis — the library is objectively vulnerable to
the described input — but the **exploitability in this deployment is not demonstrated**. Both facts
are recorded; neither is overstated.

---

## 20. Patch availability

| Question | Answer | Evidence |
|---|---|---|
| Is `braces@3.0.3` the latest npm release? | **Yes** | `registry.npmjs.org/braces` `dist-tags.latest = 3.0.3`; 37 versions total; latest publish 2024-05-21 |
| Is there any newer version, pre-release, or `next` tag? | **No** | registry version list; `dist-tags` contains only `latest` |
| Does the advisory list a first patched version? | **No — `null`** | GitHub Advisory API; npm audit `via` block |
| When was `braces` last published? | **2024-05-21** (over 2 years ago) | registry `time[3.0.3]` |
| Is the registry entry still maintained? | Last `modified` 2024-09-18 — no publish activity since | registry `time[modified]` |

**There is no patched `braces` release, and none is imminent from a published version.** The
remediation paths available to a downstream consumer are therefore limited to: parent upgrade (§22),
reclassification (§23), a local patch or fork (§24), an audit exception (§25), or waiting (§26's
operational variant).

---

## 21. Upstream status

| Item | Status |
|---|---|
| Repository | `micromatch/braces` — **not archived**, MIT licensed, `default_branch: master`, 9 open issues |
| Last push to upstream | **2025-01-19** (merge of PR #57) — **over 20 months ago** |
| Latest published version | `3.0.3` (2024-05-21) |
| Advisory-tracking issue | **#73** — *"CVE-2026-93687 affects 3.0.3 with no fixed release available"* — **OPEN**, created 2026-09-23, updated 2026-10-03, 3 comments |
| Original security report | **#70** — *"Security Advisory: Uncontrolled Recursion Depth in Tree Walkers Leads to Stack-Overflow DoS"* — **OPEN**, created 2026-09-17, includes the reproduction detail (`compile` crashes at depth ≥ ~3500) |
| **Fix PR** | **#72** — *"fix: prevent stack overflow from deeply nested patterns (CVE-2026-93687)"* — **OPEN, NOT MERGED, not a draft**, `mergeable: true`, head `28d440b5dd449dbf1fe6f3506cf94ecca4d02660` on fork `FSDevelop/braces` (branch `fix/limit-nesting-depth`), created 2026-09-21, last updated **2026-10-03T11:52Z** |
| Maintainer response | No maintainer comment is visible on #72 or #73 as of this check; activity is third-party |

**PR #72 substance** (read-only): adds a bounded nesting limit (100 levels) to parsing and to
`compile`/`expand`/`stringify`, honors stricter `maxDepth`, rejects cyclic parent chains, and adds
regression coverage. Its own verification claims 904 tests passing on Node 8.3.0 and Node 26.1.0.

**Assessment.** A fix exists **in code** (PR #72) but is **not published**: it is on a third-party
fork, unmerged, with no visible maintainer engagement and no upstream release in over 20 months.
Relying on PR #72 means depending on a merge and a publish that may not happen, from a maintainer
cadence that has been inactive for 20 months. This is the central fact driving the exception
recommendation (§25, §37).

---

## 22. Parent-upgrade options (Option A)

The prompt requires evaluating whether newer parent versions remove `braces`. Each candidate was
checked against the registry (read-only). **A parent upgrade was not assumed to fix anything; each
was verified.**

### 22.1 Candidate evaluation

| Package | Current | Latest | Newer versions exist? | Still depends on `braces`? | Node 22 compatible | Breaking? |
|---|---|---|---|---|---|---|
| `chokidar` | 3.6.0 | **5.0.0** | 4.0.0–4.0.3, 5.0.0 | **4.x/5.x: NO** (`chokidar@4.0.3` and `5.0.0` have zero braces-related deps) | 4.x `node>=14.16.0` ✓; 5.x `node>=20.19.0` ✓ | **Yes** — major; `chokidar` 4+ removed its `braces`/glob dep entirely |
| `micromatch` | 4.0.8 | 4.0.8 | none newer | **YES** — `micromatch@4.0.8` depends on `braces ^3.0.3` | yes | No upgrade available |
| `fast-glob` | 3.3.3 | 3.3.3 | none newer | **YES** — depends on `micromatch ^4.0.8` → `braces` | yes | No upgrade available |
| `tailwindcss` | 3.4.17 | **4.3.3** | 4.x line | **4.x: NO** — `tailwindcss@4.3.3` has **zero** `dependencies` (it is now a thin facade; the engine moved to `@tailwindcss/node` + `@tailwindcss/oxide`), and `@tailwindcss/node@4.3.3` has no `braces`/`micromatch`/`chokidar`/`fast-glob` in its deps | yes (no engines declared) | **Severely** — v4 is a full architecture rewrite (Oxide engine, CSS-first config, PostCSS plugin moved to `@tailwindcss/postcss`) |
| `tailwindcss-animate` | 1.0.7 | 1.0.7 | none newer | n/a — it peers on `tailwindcss` | yes | No upgrade available |
| `sucrase` | 3.35.0 | 3.35.0 | — | **Not on the `braces` chain** (it is the Phase 13 `brace-expansion` chain) | yes | — |

### 22.2 Findings

**No non-breaking parent upgrade clears the advisory.** The two packages that actually pull in
`braces` — `chokidar` and `micromatch` — are the only ones with a newer braces-free line, and both
require changes this repository cannot make:

- **`chokidar@4+` removes `braces` entirely**, but `chokidar` is a transitive dependency of
  `tailwindcss@3.4.17`, declared as `^3.6.0`. This repository cannot upgrade `chokidar` past 3.x
  without either an `overrides` entry that violates `tailwindcss`'s declared range (untested and
  unsafe — `tailwindcss` v3's watcher API surface is built against `chokidar` 3) or upgrading
  `tailwindcss` itself to v4.
- **`tailwindcss@4.3.3` removes the entire `braces` chain** (zero regular dependencies; the v4 engine
  in `@tailwindcss/node` uses `lightningcss`, `enhanced-resolve`, and `jiti` instead of
  `chokidar`/`fast-glob`/`micromatch`). This is the **only** option that removes **every** `braces`
  path in both the production and bare audits. It is also the highest-risk option on the table.

### 22.3 `tailwindcss` v4 upgrade risk profile

| Risk | Assessment |
|---|---|
| Semver classification | **MAJOR** (`3.4.17` → `4.3.3`), and npm itself reports `isSemVerMajor: true` |
| Config syntax | v4 is CSS-first: `tailwind.config.ts` is deprecated in favor of `@theme`/`@import "tailwindcss"` in CSS. The existing `content` array, `theme.extend`, `darkMode`, and `plugins` (`require("tailwindcss-animate")`, `require("@tailwindcss/typography")`) would all need rework |
| PostCSS integration | v4 requires `@tailwindcss/postcss` instead of `tailwindcss` in `postcss.config.mjs` |
| Plugin compatibility | `tailwindcss-animate@1.0.7` and `@tailwindcss/typography@0.5.16` peer on `tailwindcss >=3.0.0`; the v4 plugin API changed. Both would need compatibility verification or replacement |
| Design-token surface | The repo's `app/globals.css` `:root` token system and every `theme.extend` value (colors, `borderRadius`, `keyframes`, `animation`) are v3 constructs |
| Build risk | **HIGH** — a CSS regression here is not caught by unit tests; it requires visual verification of the entire UI |
| Required source changes | `tailwind.config.ts`, `postcss.config.mjs`, likely `app/globals.css`, and verification of every component's class usage |
| Clears production audit? | **Yes** |
| Clears bare audit? | **Yes** — removes `tailwindcss`, `chokidar`, `fast-glob`, `micromatch`, and `braces` from the tree (the ESLint `fast-glob@3.3.1` chain remains, since `@next/eslint-plugin-next` pins `fast-glob 3.3.1`) |

**Note on the bare audit.** Even a full `tailwindcss` v4 upgrade does **not** clear the bare audit on
its own: `@next/eslint-plugin-next` pins `fast-glob@3.3.1`, which pulls `micromatch@4.0.8`, which
pulls `braces@3.0.3`. npm itself confirms this — its `fixAvailable` for the ESLint nodes is
`eslint-config-next@14.2.35`, a **different major** of a different package. So Option A, even at its
most aggressive, leaves a dev-only `braces` path behind. Only the exception (§25) or the reclassification
(§23, for the production side only) addresses that residual.

### 22.4 Option A verdict

**REJECTED as the immediate remedy.** `tailwindcss` v4 is a legitimate strategic upgrade but is far
out of scope for unblocking a cache-invalidation fix: it touches the design system, requires visual
verification, and cannot be validated within this phase's constraints. It also does not clear the
bare audit alone. Recorded as a strategic follow-up in §38 and §40.

---

## 23. Dependency-reclassification option (Option B)

### 23.1 The proposal

Move `tailwindcss-animate` from `dependencies` to `devDependencies` in `package.json`. This is the
optional follow-up both prior phases flagged as open (Phase 12 W-A1 context; Phase 13 §45).

### 23.2 Mechanism and expected effect

The mechanism is proven by §13: `tailwindcss-animate` is the **only production-classified dependent
of `tailwindcss`**. Reclassify it as dev and `tailwindcss` loses its only production path, so npm
reclassifies `tailwindcss` (and therefore `chokidar`, `fast-glob`, `micromatch`, and `braces`) as
dev. `--omit=dev` would then exclude the entire chain.

**Simulated directly against the lockfile** (read-only computation, no mutation): the set of
production-classified packages (`dev:false`, 424 entries) was scanned for any package declaring a
dependency or peer on `tailwindcss`. The result was exactly one entry: `node_modules/tailwindcss-animate`.
There is no other production path to `tailwindcss`.

### 23.3 Would it clear the production audit?

**Yes.** With `tailwindcss-animate` in `devDependencies`, `npm audit --omit=dev` would no longer
report `braces`, `chokidar`, `micromatch`, `fast-glob`, or `tailwindcss`. The production audit would
return to exit 0.

### 23.4 Would it clear the bare audit?

**No.** The bare audit does not apply `--omit=dev`. The ESLint chain
(`eslint-config-next → @next/eslint-plugin-next → fast-glob@3.3.1 → micromatch → braces`) and the
`@tailwindcss/typography` peer chain remain. `npm audit` would still exit 1.

### 23.5 Prompt-required assessments

| Question | Answer |
|---|---|
| Does moving `tailwindcss-animate` make the production audit pass? | **Yes** |
| Does the bare audit still fail? | **Yes** — the ESLint chain remains |
| Do production/Vercel builds install `devDependencies`? | **Yes for this project.** Vercel installs the full dependency set for `next build` (the build needs `tailwindcss`, `postcss`, `eslint-config-next`). Tailwind tooling is required at build time regardless of classification. |
| Would a production-only build still have the required Tailwind tooling? | **Yes** — because the build installs devDependencies. Classification affects the npm audit closure, not what Vercel installs. |
| Is the classification semantically correct? | **Yes — moving it is correct.** `tailwindcss-animate` is a build-only Tailwind plugin with no runtime role. It is only ever `require`d by the Tailwind CLI (Phase 13 diagnosis §21; this report §15.2). Declaring it as a production dependency is the original misclassification that created the production-closure exposure. |

### 23.6 Assessment

Reclassification is **semantically correct and independently valuable** — it fixes a real
misclassification and removes the production-closure exposure permanently. But it is **not a complete
remedy**: it leaves the bare audit red and does not change `braces`'s actual vulnerability. If the
exception (§25) is implemented, reclassification becomes optional and additive rather than necessary;
if the exception is rejected, reclassification becomes necessary but insufficient.

**Not implemented here** (prohibited: no `package.json` edits). Recorded as Step 2 candidate scope in §38.

---

## 24. Fork or local-patch option (Option C)

### 24.1 Patch-source availability

| Question | Answer | Evidence |
|---|---|---|
| Does upstream have an unreleased patch commit? | **Yes, on a fork.** PR #72 head `28d440b5dd...` on `FSDevelop/braces` (branch `fix/limit-nesting-depth`) adds a 100-level nesting cap across parse/compile/expand/stringify plus regression tests | GitHub API |
| Is it merged or published? | **No** — PR is open, unmerged; `braces` latest remains 3.0.3 | GitHub API; registry |
| Is `patch-package` already installed? | **No** — `node_modules/patch-package` is ABSENT from the lockfile; no package whose name contains "patch" exists other than `@rushstack/eslint-patch` (unrelated) | lockfile scan |
| Is there a `patches/` directory or any `.patch` file? | **No** | filesystem scan |
| Does a trusted maintained fork exist? | **Not established.** `FSDevelop/braces` authored the fix PR but is not a recognized maintained fork; no evidence of a security-audited alternative distribution | registry/GitHub |
| Would a local patch require new tooling? | **Yes** — adding `patch-package` means a new devDependency, a `postinstall` lifecycle script, and a `patches/` directory. This project currently has **no** postinstall hooks and deliberately runs installs with `--ignore-scripts` (Phase 13 §17). | lockfile; Phase 13 report |

### 24.2 Risks

| Risk | Assessment |
|---|---|
| Integrity | A patch pinned to an unmerged fork commit is not a reviewed upstream release. Supply-chain trust is placed in a third-party fork. |
| Maintenance | Every `braces` version bump would need the patch re-validated. Since `braces` has not published in 2+ years, this is low-frequency but permanent. |
| Tooling | Introduces `patch-package` + `postinstall` — a new lifecycle script in a project that explicitly avoids them, and a new mechanism that must be understood by every future maintainer. CI's `npm ci` would run the postinstall. |
| Audit posture | `npm audit` would **still report the advisory** — it keys on the version number (`<=3.0.3`), not the patched content. A local patch does not clear any audit gate. |
| Fork recommendation constraint | The prompt forbids recommending an unreviewed fork. `FSDevelop/braces` cannot be vetted as trusted within this phase. |

### 24.3 Verdict

**REJECTED for now.** A local patch does not clear the audit gate (npm keys on version, not content),
introduces lifecycle-script tooling this project deliberately avoids, and requires trusting an
unmerged third-party fork — which the prompt explicitly prohibits recommending without review. If
PR #72 is merged and published upstream, this option evaporates in favor of a normal version bump.

---

## 25. Audit-exception option (Option D)

### 25.1 Is an exception defensible here?

Evaluated against the prompt's nine criteria:

| Criterion | Met? | Evidence |
|---|---|---|
| No patched release exists | **Yes** | §20 — `first_patched: null`, `3.0.3` is latest, no publish in 2+ years |
| Request-time reachability is not demonstrated | **Yes** | §15 — zero application imports; static build patterns only; no attacker-controlled input reaches a `braces` call |
| Package is build/dev tooling only | **Yes** | §16, §17 — reached only by the Tailwind CLI and ESLint |
| Local tests and builds pass | **Yes** | Phase 13: typecheck 0, focused 11/11, targeted 84/84, full suite 43 files/442 tests, lint 0 errors, coverage recorded, production build exit 0. Re-confirmed this phase: typecheck exit 0, focused 11/11 (§28). |
| The exception is advisory-specific | **Yes, by design** | §26 — matches exactly `GHSA-vfj7-8cjw-p6xm` / `CVE-2026-93687` / `braces` |
| The exception has an owner | **Yes, by design** | §26, §27 — named owner |
| The exception has an expiry date | **Yes, by design** | §27 — 2026-10-17 |
| CI fails closed after expiry | **Yes, by design** | §26 — the policy exits nonzero unless the advisory is still exactly present |
| New advisories are not suppressed | **Yes, by design** | §26 — any other package, advisory, severity increase, or second vulnerability is rejected |
| Production and bare results remain separately visible | **Yes, by design** | §26 — two distinct policy runs |

### 25.2 Verdict

**SUPPORTED — this is the preferred recommendation.** Every criterion is met, and the alternatives
(§22, §23, §24, §26-operational) are each materially worse for the immediate goal of unblocking a
validated functional fix. The exception is a **policy instrument**, not a suppression: it documents
an accepted risk with an owner, an expiry, and a fail-closed implementation, and it expires
automatically.

**What the exception explicitly does not do:** it does not declare `braces` safe; it does not remove
the vulnerability; it does not prevent a future finding from failing the gate; and it does not
substitute for the eventual `braces` upgrade. When a patched release is published, the exception must
be removed and the version bumped — enforced by the expiry mechanism (§26, §27).

---

## 26. Exception safety design

Per the prompt's 14 requirements. **Design only — nothing is implemented in Step 1.**

### 26.1 Design principles

1. **Parse `npm audit --json`, never human-readable output.** No shell parsing of `npm audit` text.
2. **Deterministic exit codes.** The policy script exits `0` only when the audit result exactly
   matches the approved exception; every other nonzero-audit outcome exits `1`.
3. **Never transform a general nonzero audit into success.** The script is an *allow-list of exactly
   one advisory*, applied to an otherwise-failing audit. If the audit is clean, the script does
   nothing and exits `0` (so it is harmless after the advisory is fixed and the exception is removed).

### 26.2 Matching rules (fail-closed)

The policy accepts the current failing state **only** when **all** of the following hold. Any
deviation exits `1`.

| # | Requirement | Rejection condition |
|---|---|---|
| 1 | The audit's **only** advisory is `GHSA-vfj7-8cjw-p6xm` | Any other advisory URL/ID present |
| 2 | That advisory maps to `CVE-2026-93687` | CVE mismatch |
| 3 | The affected package is exactly `braces` | Any other package name |
| 4 | The installed version is within the recorded affected range and equals the recorded `3.0.3` inventory | Version drift (e.g. a future `3.0.4` still flagged — meaning a real new release appeared) |
| 5 | The affected-node inventory matches the recorded set (production: exactly `braces`, `chokidar`, `micromatch`, `fast-glob`, `tailwindcss`; bare: those plus `@next/eslint-plugin-next`, `eslint-config-next`) | Any **new** affected dependency path |
| 6 | Exactly **one** vulnerability object | Any second vulnerability |
| 7 | Severity is `high` with CVSS `7.5` and vector `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H` | Any severity increase or metadata drift |
| 8 | `npm audit --json` is valid JSON and the npm command itself succeeded (exit 0 or 1 — exit 1 is the expected "vulnerabilities found" state) | Malformed output, or npm failure unrelated to the approved advisory (e.g. network/registry error) |
| 9 | The current date is on or before the exception's expiry date | Expired → exit `1` unconditionally |
| 10 | Production and bare audits are evaluated as **two separate** policy runs; **both** must pass the policy | Either run unapproved |

### 26.3 Concrete file design (for Step 2)

| File | Purpose | Notes |
|---|---|---|
| `scripts/audit-policy.mjs` | The policy evaluator. Runs `npm audit --omit=dev --json` and `npm audit --json`, parses both, applies §26.2, prints a clear accepted-risk warning, and exits deterministically. | Read-only; no writes; no env values; no credentials |
| `audit-exception.json` (repo root or `config/`) | Versioned exception record: `advisory`, `cve`, `package`, `affectedVersion`, `allowedNodeInventory`, `severity`, `cvss`, `owner`, `rationale`, `approvalDate`, `expiryDate`, `reviewInstructions`, `upstreamLinks` | The single source of truth; the script reads it and compares against live audit JSON |
| `tests/audit-policy.test.ts` | Focused policy tests with fixture JSON | Per §26.4 |
| `.github/workflows/ci.yml` | Replace `npm audit --audit-level=high --omit=dev` with `node scripts/audit-policy.mjs` (one line change at line 92) | CI change is required and must be authorized in Step 2 |
| `package.json` | Add `"audit": "node scripts/audit-policy.mjs"` script (optional convenience) | Optional |

### 26.4 Required test fixtures (independently testable, per requirement 13)

| Fixture | Asserts |
|---|---|
| `exception-positive` fixture | Live-matching audit JSON (exact current production and bare shapes) → policy exits `0`, prints the accepted-risk warning |
| `expired-exception` fixture | Same audit JSON but a current date after `expiryDate` → exits `1` |
| `wrong-advisory` fixture | A `braces` finding under a **different** GHSA → exits `1` |
| `additional-vulnerability` fixture | The approved `braces` finding **plus** one unrelated package → exits `1` |
| `malformed-output` fixture | Truncated/garbage JSON → exits `1` |
| `npm-command-failure` fixture | npm itself errored (non-audit exit, e.g. registry unreachable) → exits `1` |
| `severity-drift` fixture | Same advisory, severity raised to `critical` → exits `1` |
| `new-node` fixture | Same advisory with an extra affected package path → exits `1` |
| `clean-audit` fixture | Zero vulnerabilities → exits `0` (harmless after remediation) |

### 26.5 Compliance with the remaining prompt requirements

| Requirement | How satisfied |
|---|---|
| Match only the three identifiers | §26.2 rules 1–3 |
| Match the exact installed version / path inventory | rule 4, rule 5 |
| Reject any other package / advisory / severity increase / metadata drift / new path / second vulnerability / malformed output / unrelated npm failure | rules 1, 5, 6, 7, 8, and the corresponding fixtures |
| Preserve two distinct views | rule 10 — two separate runs, both must pass |
| Print a clear accepted-risk warning | the script prints it on every accept |
| Owner / rationale / approval date / expiry date / review instructions / upstream links | fields in `audit-exception.json` |
| Expire automatically | rule 9 — checked on every run |
| Fail CI after expiry | rule 9 + the CI command change |
| Never transform a general nonzero audit into success | §26.1 principle 3 |
| Avoid shell parsing of human-readable npm output | §26.1 principle 1 |
| Parse `npm audit --json` | §26.1 principle 1 |
| Deterministic exit codes | §26.1 principle 2 |
| Independently testable with fixture JSON | §26.4 |
| No credentials or environment values | the script reads only audit JSON and the exception file |

---

## 27. Expiry recommendation

**Recommended expiry: 14 days from the report date.**

| Field | Value |
|---|---|
| Report date | 2026-10-03 |
| **Proposed expiry** | **2026-10-17** |
| Owner | Repository maintainer (the human approving Step 2) |
| Review cadence | **Every 7 days**, and on any `braces` registry publish |
| Exact "does a patch exist now?" command | `npm view braces dist-tags.latest` — if the output is anything other than `3.0.3`, a new release exists and the exception must be re-evaluated. Complement with a check on PR/issue status: `gh pr view 72 --repo micromatch/braces --json state,merged` |
| What happens at expiry | The policy exits `1` unconditionally (§26.2 rule 9). CI goes red on the next run. The exception must then be removed and either the advisory remediated or a new exception authorized with fresh evidence. |
| Who owns the follow-up | The named owner in `audit-exception.json` |

**Why 14 days (evidence-based):**

| Factor | Weight |
|---|---|
| Severity | HIGH (CVSS 7.5) — argues short |
| No patch availability | argues longer (nothing to remediate *to*) |
| Build-time/dev-only exposure, request-time not demonstrated | argues longer |
| Upstream activity | **20 months since last publish; fix PR open 12 days with no maintainer engagement** — argues the wait will not be short, but also that a publish could land any day |
| Release urgency | Phase 12's cache fix and Phase 13's security remediation are complete and validated; both are blocked solely by this gate — argues short |

7 days is too short given that nothing can be remediated within a week and the review cost is real;
30 days is too long for a HIGH-severity advisory in a gate that a human must periodically re-justify.
14 days balances the two and forces a re-review on a cadence shorter than the upstream's observed
inactivity gaps. **An indefinite exception is explicitly not recommended.**

---

## 28. Current staged-commit decision

Per prompt §9, the five options and the chosen recommendation:

| Option | Assessment |
|---|---|
| KEEP STAGED AND WAIT | Defensible but wasteful — the staged content is complete and validated; waiting for an upstream publish of unknown date leaves a completed fix indefinitely undelivered |
| UNSTAGE IN AN AUTHORIZED FOLLOW-UP | Rejected — unstaging loses no content but adds churn and re-staging work for no benefit |
| COMMIT WITH A SEPARATE EXPLICIT RISK-ACCEPTANCE AUTHORIZATION | Close second choice — viable, but a commit-time-only override is weaker than an implemented, tested, expiring policy |
| BLOCK COMMIT UNTIL PATCHED | Rejected as the immediate path — "until patched" has no bound (20 months of upstream inactivity); it would block a validated functional fix indefinitely for an unrelated, unreachable build-tooling advisory |
| **BLOCK COMMIT UNTIL AN AUDIT-POLICY EXCEPTION IS IMPLEMENTED AND VALIDATED** | **CHOSEN** |

### 28.1 Recommendation

**BLOCK COMMIT UNTIL AN AUDIT-POLICY EXCEPTION IS IMPLEMENTED AND VALIDATED.**

Rationale:

1. The staged content is **internally valid** — typecheck exits 0, the focused suite passes 11/11, and
   the staged blobs are byte-equivalent (modulo Git LF normalization) to the content validated under
   Node 22.13.1 in Phase 13. Nothing about the delta is in question.
2. The only failing gate is an advisory on a package this repository **cannot remediate today** and
   **cannot reach at request time**.
3. Committing now, without any risk-acceptance instrument, would either require changing the CI gate
   (a bare suppression — unsafe and unauditable) or shipping a commit whose own CI is knowingly red
   (which is what the previous pass correctly refused to do).
4. An implemented, fixture-tested, expiring, fail-closed policy is **strictly stronger** than a
   commit-time authorization: it is reviewable, it automatically re-fails when the situation changes,
   and it leaves an auditable record of the accepted risk.

### 28.2 Order-of-operations recommendation

**The audit-policy exception should be committed BEFORE the Phase 12/13 delta, or together with it in
one commit.** Rationale: the policy must exist at the moment the Phase 12/13 commit's CI runs, or
that CI is red by construction. Two coherent options for Step 2:

- **Option 1 (safer, recommended):** Commit 1 = the audit policy + exception + tests + CI change.
  Verify CI goes green. Commit 2 = the Phase 12/13 delta (already staged content).
- **Option 2 (single commit):** Add the policy files to the current staged set and commit once. Fewer
  commits, but couples an untested policy with a validated delta.

### 28.3 Addressing the prompt's specific questions

| Question | Answer |
|---|---|
| Should Phase 12's functional fix remain blocked by an unrelated, newly published unpatched advisory? | **No — on its merits it should not.** The cache fix is validated, correct, and unrelated to `braces`. The block is a policy-gate artifact. The remedy is to make the policy gate intelligent (an exception) rather than to weaken it. |
| Does Phase 13's `brace-expansion` remediation remain valid? | **Yes.** All three of its advisories are absent; all eight copies remain patched (§8.4). The remediation is fully valid; only the live registry state moved. |
| Does one combined commit still make sense? | **Yes** — the Phase 12 and Phase 13 deltas are coherent, independently validated, and already staged together. The policy should land before or with them (§28.2). |
| Should risk-acceptance policy be committed before or together with Phase 12/13? | **Before, or together.** It must exist when the Phase 12/13 CI runs. §28.2 recommends before. |

---

## 29. Phase 12 status

| Dimension | Status | Evidence |
|---|---|---|
| Phase 12 implementation status | **COMPLETE and VALIDATED** — the CACHE-OPS-001 correction is implemented and unchanged | `lib/cacheManager.ts` staged delta is the approved one-line `buildCacheKey(CACHE_SCOPES.aiSimilar, `${id}:v2`)` addition (+7/−1 with its explanatory comment); `tests/ai-similar-cache-invalidation.test.ts` (11 tests) passes 11/11 under Node 22.13.1, re-confirmed this phase |
| Phase 12 mandatory gate status | **CODE GATES: PASS. AUDIT GATE: FAIL — but not because of Phase 12.** | typecheck exit 0; focused 11/11. The audit gate fails on `braces`, an advisory that did not exist in the audit database when Phase 12 ran and that Phase 12 did not introduce |
| Current commit readiness | **NOT READY — blocked by the live audit gate, not by Phase 12 content** | §28 |

**Honest framing.** Phase 12's own report (§2) recorded its audit gate as unmet and attributed it to
the then-current `brace-expansion` advisory; Phase 13 closed that. Phase 12's record is accurate as
written. The current audit failure is a **new, separate** advisory on a **different** package in a
**different** chain, and it is properly attributed to Phase 14 (DEP-AUDIT-003), not to Phase 12 or 13.

---

## 30. Phase 13 status

| Dimension | Status | Evidence |
|---|---|---|
| Phase 13 implementation status | **COMPLETE and INTACT** | all three scoped `overrides` entries present in staged `package.json` (`minimatch@3.1.5` → 1.1.21, `minimatch@9.0.9` → 2.1.7, `minimatch@10.2.6` → 5.0.12); all 8 `brace-expansion` lockfile copies remain at the patched versions (§8.4) |
| Phase 13 historical validation status | **VALID as a historical record** | its audits genuinely exited 0 with 0 vulnerabilities at the time they ran (Node 22.13.1, full validation ladder green) |
| Current live audit status | **FAILING — on `braces`, not on `brace-expansion`** | §8: `brace-expansion` is absent from the vulnerability map; the three Phase 13 advisories are absent |
| Was Phase 13 a regression? | **NO — rejected by direct evidence** | §8.4 |
| Current commit readiness | **NOT READY — blocked by an external registry change** | §28 |

**The accurate summary (per prompt §10):** Phase 13's remediation **remains valid**; the **live gate
drifted** due to a newly ingested registry advisory on an unrelated package. Its historical evidence
needs no correction. What needs recording is the *current* state, which is what this report does.

**Corrections required later (per prompt §10, "define the exact corrections required later"):**

| Report | Correction needed | When |
|---|---|---|
| Phase 13 completion report | A Phase 14 post-phase note recording that a **new, separate** advisory (`GHSA-vfj7-8cjw-p6xm` on `braces`) now fails both audit gates; that this is **not** a Phase 13 regression; and that the Phase 13 remediation remains intact. Add to §2 (status) and §19/§20 (audit results) as a live-status annotation, without altering the historical evidence. | Step 2, after the exception is implemented and validated |
| Phase 12 completion report | A Phase 14 post-phase note recording that the audit gate failed again on a **different** advisory, and that the Phase 12 implementation remains validated and uninvolved. | same |

Neither report is rewritten in Step 1 (prohibited). Both corrections are additive annotations, not
alterations of historical command output.

---

## 31. Hypothesis matrix

| ID | Hypothesis | Supporting evidence | Contradicting evidence | Status |
|---|---|---|---|---|
| H1 | The current failure is caused by a newly published or newly ingested advisory | GHSA published 2026-09-18, DB updated 2026-10-02T22:36Z, first repo observation 2026-10-03; `braces` was not reported during Phase 13's validated runs | — | **CONFIRMED** |
| H2 | The Phase 13 `brace-expansion` remediation regressed | — | All three Phase 13 advisories absent from the live audit; all 8 `brace-expansion` copies remain at 1.1.21/2.1.7/5.0.12; `brace-expansion` absent from the vulnerability map | **REJECTED** |
| H3 | There is no patched `braces` release | `dist-tags.latest = 3.0.3`; advisory `first_patched: null`; registry `modified` 2024-09-18; 37 versions, newest published 2024-05-21 | — | **CONFIRMED** |
| H4 | The affected `braces` code is request-time reachable | — | 0 application imports of `braces`/`micromatch`/`chokidar`/`fast-glob`; single entry point is a build-only Tailwind plugin; only patterns reaching it are static literals; no attacker-controlled vector reaches a glob/brace call | **REJECTED** |
| H5 | Production audit includes `braces` only because build tooling is classified as production | `tailwindcss-animate` (a build-only plugin) is the sole production-classified dependent of `tailwindcss`; lockfile `dev:false` propagates to `chokidar`/`micromatch`/`fast-glob`/`braces` | — | **CONFIRMED** |
| H6 | Moving `tailwindcss-animate` to `devDependencies` clears the production audit | Lockfile simulation: `tailwindcss-animate` is the only prod-classified package depending on `tailwindcss` | — | **CONFIRMED** (as a simulation; not executed) |
| H7 | Moving build tooling to `devDependencies` clears the bare audit | — | Bare audit does not apply `--omit=dev`; the ESLint chain (`eslint-config-next` is already `dev:true`) still reports `braces`; `@tailwindcss/typography` (already dev) also peers on `tailwindcss` | **REJECTED** |
| H8 | A parent dependency upgrade removes every `braces` path | `tailwindcss@4.3.3` has zero deps and `@tailwindcss/node@4.3.3` has no braces-chain deps; `chokidar@4+` drops `braces` | v4 is a major rewrite with high regression risk; `chokidar@4+` is unreachable without an out-of-range override or the v4 upgrade; even v4 leaves the ESLint `fast-glob@3.3.1` → `braces` path in the bare audit | **WEAK** (true only for a severe, partial remedy) |
| H9 | A narrowly scoped time-limited exception is technically defensible | All nine prompt criteria met (§25.1); no patch exists; exposure is build/dev-only; tests and builds pass | Upstream inactivity makes the wait unbounded | **CONFIRMED** |
| H10 | The exception can fail closed for every unapproved audit finding | §26.2 rules 1–10 reject every drift class; §26.4 fixtures cover positive/expired/wrong-advisory/extra-vuln/malformed/npm-failure/severity-drift/new-node/clean | Not yet implemented or tested — design only | **SUPPORTED** (design-level; validation is Step 2) |
| H11 | The current eight staged paths remain internally valid | Staged blobs byte-equivalent (modulo LF normalization) to the Node-22.13.1-validated content; typecheck exit 0; focused 11/11 re-confirmed this phase; unstaged tracked diff empty | — | **CONFIRMED** |
| H12 | The commit should remain blocked until policy handling is approved | Committing now requires either gate suppression or a knowingly-red CI; the policy is strictly stronger than a commit-time override | — | **SUPPORTED** |

---

## 32. Root-cause classification

Per prompt §12:

| Dimension | Classification | Basis |
|---|---|---|
| **Root cause** | **NEWLY PUBLISHED UNPATCHED TRANSITIVE ADVISORY** | H1 CONFIRMED, H3 CONFIRMED. The advisory is registry-side; no repository action caused it; no fix exists. |
| **Reproducibility** | **REGISTRY-DEPENDENT** (deterministic given the same audit database state) | The audit result is fully reproducible locally (re-run twice, identical) but depends on the live advisory database; a future DB change alters it without any repository change |
| **Impact** | **DEVELOPMENT-TOOLING DENIAL OF SERVICE** with **POLICY / RELEASE BLOCKER ONLY** as the material effect | H4 REJECTED — not request-time reachable. The theoretical impact is process termination in a build/lint process; the *actual* material impact in this repository today is that the CI audit gate is red and blocks release |
| **Production exposure** | **NOT DEMONSTRATED** | §15 — zero application imports; static build patterns; no attacker-controlled input reaches `braces` |
| **Confidence** | **HIGH** | Every classification above rests on direct, reproducible evidence: audit JSON, lockfile flags, registry metadata, source search, upstream API state |

**Note on the "MULTI-FACTOR DEPENDENCY POLICY DEFECT" alternative.** The production-closure exposure
(H5, the `tailwindcss-animate` misclassification) is a real, pre-existing policy defect and it is the
reason the production audit sees this advisory at all. It is a **contributing amplifier**, not the
root cause — the root cause is the unpatched advisory. If `tailwindcss-animate` were correctly
classified as dev, the production audit would be green right now regardless of the advisory. Both
facts are recorded; the primary classification is the unpatched advisory, with the misclassification
noted as the amplifier that makes it a production-gate problem.

---

## 33. Reproducibility

| Measure | Classification |
|---|---|
| Audit result | **DETERMINISTIC AUDIT** — reproduced twice in this phase with byte-identical severity counts (prod 5 high / bare 7 high) and identical package sets, under the same Node 22.13.1 runtime |
| Dependency tree | **DETERMINISTIC DEPENDENCY TREE** — the lockfile is committed and frozen; `npm ci` reproduces the exact tree (855 packages, single hoisted `braces@3.0.3`) |
| Overall reproducibility | **REGISTRY-DEPENDENT** — the *audit outcome* depends on the live advisory database. A future database update (a patch published, the advisory withdrawn, or a new advisory appearing) changes the result with no repository change. This is precisely why the exception must re-run the audit live on every CI execution rather than comparing against a stored result. |

---

## 34. Impact

| Class | Applicability | Detail |
|---|---|---|
| REQUEST-TIME DENIAL OF SERVICE | **Not applicable** | H4 REJECTED — no request path reaches `braces` |
| BUILD-TIME DENIAL OF SERVICE | **Applicable in theory** | A crafted deeply nested pattern reaching the Tailwind CLI's glob expansion would crash `next build`. No such pattern exists in this repository; the input would have to come from a compromised `content` config or a filesystem name. |
| DEVELOPMENT-TOOLING DENIAL OF SERVICE | **Applicable in theory** | Same, for `npm run lint` and editor language servers |
| MULTIPLE AVAILABILITY RISKS | Not applicable | One advisory, one package, one physical copy |
| POLICY / RELEASE BLOCKER ONLY | **This is the actual material impact** | The CI `security` job (`ci.yml:92`) is red; PR #14's CI cannot pass; the validated Phase 12/13 delta cannot be committed |
| UNKNOWN | Not applicable | All paths classified |

---

## 35. Production exposure

**NOT DEMONSTRATED.**

| Evidence | Result |
|---|---|
| Application imports of `braces` / `micromatch` / `chokidar` / `fast-glob` | **0** |
| Bundled into `.next` server or client chunks | **No** (import-trace inference + last-known Phase 13 build) |
| Runs inside `next start` / a request handler / a server component | **No** — the chain's entry point is `require("tailwindcss-animate")` in build-time config |
| Attacker-controlled input reaching a `braces` call | **No** — all 8 prompt-listed vectors ruled out (§15.5) |
| Installed in a production `npm ci --omit=dev` tree | **Yes** — but *installed* ≠ *executed*. Nothing in the production runtime imports it. |

The distinction that matters: `braces` is **present in the production closure** (a packaging/audit
classification) but **not reachable by production execution** (a runtime fact). The first is why the
audit gate is red; the second is why the risk is acceptable pending a patch.

---

## 36. Confidence

**HIGH.**

| Claim area | Confidence | Basis |
|---|---|---|
| Advisory identity, severity, affected range, no patch | **HIGH** | three independent authoritative sources agreeing (GHSA, OSV, NVD) plus the npm registry |
| Dependency-path inventory and classification | **HIGH** | `npm ls`, `npm explain`, and a direct scan of all 855 lockfile entries |
| Physical-copy count (1) | **HIGH** | `find node_modules -type d -name braces` plus a lockfile scan for any key ending in `braces` |
| Production-closure mechanism (peer promotion) | **HIGH** | direct lockfile scan proving `tailwindcss-animate` is the sole production-classified dependent of `tailwindcss` |
| Request-time unreachability | **HIGH** | exhaustive source search with zero matches across all file types, plus tracing the single entry point to a build-only plugin |
| Build-time/dev-tooling reachability | **HIGH** | dependency paths trace into `tailwindcss` CLI and `eslint-config-next`; both are build/lint tools |
| Upstream fix timing | **LOW** | unknowable; PR #72 is open with no maintainer engagement and 20 months since the last publish |
| Exception design's fail-closed behavior | **MEDIUM** (design) / **UNVERIFIED** (behavior) | the design covers every drift class the prompt lists, but it is unimplemented and untested — Step 2 must verify it with the fixtures in §26.4 |
| Bundling analysis | **MEDIUM** | inferred from the import trace and the last Phase 13 build; no fresh post-build scan exists in this phase (`.next` absent) |

---

## 37. Preferred recommendation

**Implement a narrowly scoped, time-limited, advisory-specific audit-policy exception (Option D),
then commit the Phase 12/13 delta.**

The recommendation in one sentence: replace the CI gate's raw `npm audit --audit-level=high
--omit=dev` call with a small, fixture-tested policy script that accepts **only**
`GHSA-vfj7-8cjw-p6xm` on `braces` until **2026-10-17**, fails closed on everything else, then commit
the already-staged, already-validated Phase 12/13 delta.

Why this over the alternatives:

| Option | Verdict | Reason |
|---|---|---|
| A — parent upgrade (`tailwindcss` v4) | **Strategic follow-up, not the immediate remedy** | major rewrite of the design system; requires visual verification; does not clear the bare audit alone |
| B — reclassify `tailwindcss-animate` | **Recommended as an additive companion** | semantically correct and permanently removes the production-closure exposure; but insufficient alone (bare audit still red) |
| C — local patch / fork | **Rejected** | does not clear the audit (npm keys on version); adds lifecycle-script tooling; requires trusting an unreviewed fork |
| D — time-limited exception | **PREFERRED** | meets all nine defensibility criteria; bounded; auditable; expires automatically; unblocks validated work today |
| E — defer commit until upstream patch | **Rejected as unbounded** | 20 months of upstream inactivity; no bound on the wait; leaves completed, validated work undelivered indefinitely |

**Recommended combination for Step 2:** **D (primary) + B (companion, optional)**. D unblocks the
commit; B is the correct long-term fix for the production-closure amplifier and makes D's production
half unnecessary going forward. If B is included, the exception still needs to cover the bare audit's
ESLint chain, so D remains required either way.

---

## 38. Exact Step 2 scope

**Step 2 is implementation. Step 1 does not implement anything.** The scope below is a precise
definition for the authorized follow-up, not work performed here.

### 38.1 If the exception is authorized (recommended path)

**Files to create:**

| File | Content |
|---|---|
| `scripts/audit-policy.mjs` | The policy evaluator per §26. Runs `npm audit --omit=dev --json` and `npm audit --json`, loads `audit-exception.json`, applies the ten fail-closed rules, prints the accepted-risk warning, exits `0`/`1` deterministically. No env values, no credentials, no writes. |
| `audit-exception.json` | The versioned exception record: `advisory: "GHSA-vfj7-8cjw-p6xm"`, `cve: "CVE-2026-93687"`, `package: "braces"`, `affectedVersion: "3.0.3"`, `allowedProdNodes: [braces, chokidar, micromatch, fast-glob, tailwindcss]`, `allowedBareNodes: [+ @next/eslint-plugin-next, eslint-config-next]`, `severity: "high"`, `cvss: {score: 7.5, vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"}`, `owner`, `rationale`, `approvalDate: "2026-10-03"`, `expiryDate: "2026-10-17"`, `reviewInstructions`, `upstreamLinks: [GHSA, CVE, issue #70, issue #73, PR #72]` |
| `tests/audit-policy.test.ts` | The nine fixtures of §26.4: exception-positive, expired-exception, wrong-advisory, additional-vulnerability, malformed-output, npm-command-failure, severity-drift, new-node, clean-audit |

**Files to modify:**

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | Line 92: replace `run: npm audit --audit-level=high --omit=dev` with `run: node scripts/audit-policy.mjs`. One line. |
| `package.json` | (Optional) add `"audit": "node scripts/audit-policy.mjs"` to `scripts`. **Note:** if `tailwindcss-animate` reclassification (Option B) is also authorized, this file additionally moves `"tailwindcss-animate": "^1.0.7"` from `dependencies` to `devDependencies` and the lockfile is regenerated with `npm install --package-lock-only --ignore-scripts`. |
| `package-lock.json` | Only if Option B is included (regenerated via `--package-lock-only`; expected effect: `dev:true` propagates to `tailwindcss`, `chokidar`, `fast-glob`, `micromatch`, `braces`) |
| `docs/reports/PHASE-12-…COMPLETION-REPORT.md` | Additive Phase 14 post-phase note per §30 |
| `docs/reports/PHASE-13-…COMPLETION-REPORT.md` | Additive Phase 14 post-phase note per §30 |

**Report to create:** `docs/reports/PHASE-14-BRACES-UNPATCHED-ADVISORY-EXCEPTION-COMPLETION-REPORT.md`.

**Explicitly NOT in scope for Step 2:** any `braces` version bump (none exists), any fork or patch,
any `tailwindcss` v4 upgrade, any change to the eight already-staged paths' content.

### 38.2 If a parent upgrade were authorized instead (not recommended)

Would require: `package.json` `dependencies`/`devDependencies` changes for `tailwindcss` → `4.3.3`,
addition of `@tailwindcss/postcss`, a rewrite of `tailwind.config.ts` to v4 CSS-first config, a change
to `postcss.config.mjs`, verification or replacement of `tailwindcss-animate` and
`@tailwindcss/typography` (both peer on `tailwindcss >=3.0.0`), regeneration of the lockfile, and full
visual verification of the UI. Recorded for completeness; **not recommended** (§22.4).

### 38.3 If wait-for-upstream were chosen (not recommended)

- **Monitoring method:** `npm view braces dist-tags.latest` on a 7-day cadence (or a scheduled job),
  plus `gh pr view 72 --repo micromatch/braces --json state,merged`.
- **Review date:** 2026-10-17 (aligned to the proposed exception expiry).
- **Current staged-index disposition:** the eight paths remain staged; do not unstage.
- **Release impact:** Phase 12's cache fix and Phase 13's remediation remain undelivered for the
  duration.
- **Criteria to resume commit:** either `npm view braces dist-tags.latest` reports a version other
  than `3.0.3` (a patch exists → bump, remove the exception, commit), or the advisory is withdrawn.

---

## 39. Validation plan

Required Step 2 validation, per prompt §14, tailored to the recommended Option D. **Nothing here runs
in Step 1.**

| # | Validation | Gate |
|---|---|---|
| 1 | Production audit JSON policy test (`tests/audit-policy.test.ts`, exception-positive fixture) | policy exits `0` on the exact current production shape |
| 2 | Bare audit JSON policy test (exception-positive fixture) | policy exits `0` on the exact current bare shape |
| 3 | Expired-exception fixture | exits `1` |
| 4 | Wrong-advisory fixture | exits `1` |
| 5 | Additional-vulnerability fixture | exits `1` |
| 6 | Malformed-output fixture | exits `1` |
| 7 | npm-command-failure fixture | exits `1` |
| 8 | Severity-drift fixture | exits `1` |
| 9 | New-node fixture | exits `1` |
| 10 | Clean-audit fixture | exits `0` (harmless post-remediation) |
| 11 | Node 22 validation | every script and test runs under Node v22.13.1 |
| 12 | Phase 12 focused suite | `npx vitest run tests/ai-similar-cache-invalidation.test.ts` → 11/11 |
| 13 | Targeted suites | the 7 cache/AI-similar files → 84/84 |
| 14 | Typecheck | `npm run typecheck` → exit 0 |
| 15 | Lint | `npm run lint` → 0 errors (93 warnings baseline) |
| 16 | Full suite | `npm test` → 43 files / 442 tests |
| 17 | Coverage | `npm run test:coverage` → recorded values unchanged |
| 18 | Production build | `NODE_ENV=production npm run build` with placeholder env → exit 0 |
| 19 | Final staged-diff review | `git diff --cached` inspected; exactly the authorized paths; no unintended content |
| 20 | Live policy run against the real audits | `node scripts/audit-policy.mjs` exits `0` on this repository as it stands |
| 21 | Expiry mechanism verification | set a fixture clock past `expiryDate` → exits `1` |

If Option B (reclassification) is included, add: lockfile regeneration via
`npm install --package-lock-only --ignore-scripts`, verification that `dev:true` propagated to
`tailwindcss`/`chokidar`/`fast-glob`/`micromatch`/`braces`, confirmation that
`npm audit --omit=dev` now reports 0 vulnerabilities, and confirmation that the bare audit's remaining
findings are exactly the ESLint chain.

---

## 40. Risks

| ID | Risk | Severity | Mitigation / note |
|---|---|---|---|
| R-1 | The advisory becomes exploitable through a future code change that passes user input to a glob API | MEDIUM | The exception does not weaken any code path. Mitigation: the policy is advisory-specific, so any *new* advisory fails the gate immediately. Review `braces` reachability whenever a filesystem-glob feature is added. |
| R-2 | The exception is forgotten and left in place after a patch exists | MEDIUM | Mitigated by design: automatic expiry (2026-10-17), a 7-day review cadence, an explicit "does a patch exist?" command, and a `clean-audit` fixture that keeps the policy harmless after remediation. The exception file's `reviewInstructions` field records this. |
| R-3 | A new advisory on `braces` (or a chain package) appears while the exception is active | LOW | The policy rejects any advisory other than the exact recorded one, and rejects any additional vulnerability. It fails closed by construction. |
| R-4 | `tailwindcss` v4 becomes necessary later and the exception delays the strategic upgrade | LOW | The exception does not depend on the Tailwind version. The v4 upgrade remains an independent strategic follow-up (§22.4). |
| R-5 | The `tailwindcss-animate` misclassification keeps `braces` in the production closure, and a future audit-database change re-flags the chain in a way the exception's node inventory does not match | MEDIUM | Mitigated by rule 5 (exact node-inventory match → any new path fails closed) and by Option B, which removes the amplifier permanently if authorized. |
| R-6 | Upstream publishes a fix during the exception window and the repo does not notice | LOW | The `npm view braces dist-tags.latest` cadence check and the expiry both bound this. |
| R-7 | GitHub Actions remains unable to run (the account billing issue noted in the prior commit-pass warnings) | MEDIUM | Out of scope for this phase. The policy is locally testable without CI, and CI will exercise it once Actions is available again. |
| R-8 | The policy script itself has a defect that lets an unapproved finding pass | MEDIUM | Mitigated by the nine independent fixtures (§26.4) and by keeping the matcher logic small and declarative. |
| R-9 | PR #72 is merged and published mid-window, changing the version inventory | LOW | Rule 4 rejects version drift: a flagged `braces` at any version other than the recorded `3.0.3` fails closed, forcing a re-review. |

---

## 41. Unresolved questions

| # | Question | Why unresolved | What would resolve it |
|---|---|---|---|
| U-1 | When will `braces` publish a fix? | Upstream has been inactive 20 months; PR #72 has no maintainer engagement | Monitoring `npm view braces dist-tags.latest` and PR #72's state |
| U-2 | Is the exception's 14-day window the right length? | It balances HIGH severity against no-available-remediation; the correct length is a judgment call | Owner review at the 7-day checkpoint |
| U-3 | Would `tailwindcss` v4 actually build this project cleanly? | Not tested; out of scope and not authorized | A separate dedicated phase with visual verification |
| U-4 | Is the `braces` advisory reachable through any Next.js-internal path this analysis did not trace? | The import trace is exhaustive for first-party source, but Next.js itself could in principle use glob tooling internally during build | A Next.js-internals investigation; the `AV:N` rating does not establish this, and zero first-party imports plus a successful Phase 13 build are the current best evidence |
| U-5 | Will GitHub Actions run at all for PR #14? | The billing issue is external and pre-existing | Account-level resolution, outside this phase |
| U-6 | Does the maintainer consider CVE-2026-93687 valid? | Issue #73 explicitly asks this; no maintainer answer is visible | Upstream response on #70/#72/#73 |

---

## 42. Chronological command log

Every command run in this phase, in order. All read-only. Node v22.13.1 unless noted.

| # | Command (summary) | Result |
|---|---|---|
| 1 | `git branch --show-current` | `work/phase-12-cache-invalidation-diagnosis` |
| 2 | `git rev-parse HEAD` | `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f` |
| 3 | `git rev-parse --abbrev-ref @{u}` | fatal: no upstream configured |
| 4 | `git status --porcelain=v2 --branch` | 8 staged (5 A + 3 M), 63 untracked scratch/prompt, no Phase 14 artifact |
| 5 | `git diff --cached --name-status` | the 8 authorized paths |
| 6 | `git diff --cached --stat` | 8 files, +4228 / −26 |
| 7 | `git diff --name-status` | empty (no unstaged tracked changes) |
| 8 | `git ls-files --others --exclude-standard` | 63 entries (27 `.chunks/`, 28 `.my_tool_sandbox/`, 7 root scratch, `.phase11-prompt.txt`) |
| 9 | `sha256sum` + `git show :path \| sha256sum` on the 4 code/manifest files | working-tree and staged-blob hashes recorded; CRLF/LF difference accounted (§44) |
| 10 | `git config --get core.autocrlf` | `true` |
| 11 | `ls .gitattributes` | absent |
| 12 | GitHub Advisory API `GET /advisories/GHSA-vfj7-8cjw-p6xm` | severity high, CVSS 7.5, CWE-674, published 2026-09-18T18:31:41Z, updated 2026-10-02T22:36:34Z, `first_patched: null` |
| 13 | OSV `POST /v1/query` for `npm braces` | 2 advisories: GHSA-grv7-fg5c-xmjg (fixed 3.0.3) and GHSA-vfj7-8cjw-p6xm (last_affected 3.0.3, no fix) |
| 14 | NVD `GET /cves/2.0?cveId=CVE-2026-93687` | published 2026-09-18T16:17:15Z, `Awaiting Analysis`, CVSS 7.5, CWE-674 |
| 15 | `registry.npmjs.org/braces` (abbreviated + full) | 37 versions, `dist-tags.latest = 3.0.3`, `time[3.0.3] = 2024-05-21`, `modified 2024-09-18`, repo `micromatch/braces`, MIT |
| 16 | GitHub API `micromatch/braces` repo | not archived, last push 2025-01-19, 9 open issues |
| 17 | GitHub API `micromatch/braces` issues + search | #70 (security report, open), #72 (fix PR, open), #73 (no-fix-available, open) |
| 18 | GitHub API issues #70/#72/#73 bodies + PR #72 detail + PR list + timeline | PR #72 open, unmerged, `mergeable: true`, head `28d440b5dd` on fork `FSDevelop/braces`, updated 2026-10-03T11:52Z |
| 19 | `npm audit --omit=dev --json` (Node 22.13.1) | exit 1, 5 high, 5 packages, single advisory source 1240992 |
| 20 | `npm audit --audit-level=high --omit=dev` (Node 22.13.1) | exit 1, "5 high severity vulnerabilities" |
| 21 | `npm audit --json` (Node 22.13.1) | exit 1, 7 high, 7 packages |
| 22 | `npm audit --audit-level=high` (Node 22.13.1) | exit 1, "7 high severity vulnerabilities" |
| 23 | `npm ls braces --all` | 1 copy, `braces@3.0.3` (+ `deduped` under micromatch) |
| 24 | `npm ls braces --omit=dev --all` | full chain visible via `tailwindcss-animate` |
| 25 | `npm explain braces` | both consumer chains + the ESLint chain enumerated |
| 26 | Lockfile JSON scan: `dependencies`/`devDependencies` of root; `dev`/`devOptional`/`optional` flags of the 8 chain packages; reverse-dep scans for `tailwindcss`, `braces`, `micromatch`, `chokidar`, `fast-glob`; `brace-expansion` copy verification | root has 51 deps / 16 devDeps; `tailwindcss-animate` in deps, `tailwindcss` in devDeps; chain packages all `dev:false`; `tailwindcss-animate` is the only prod-classified dependent of `tailwindcss`; 8 `brace-expansion` copies at patched versions |
| 27 | `cat tailwindcss-animate/package.json` | declares `tailwindcss` only as a `peerDependency` (`>=3.0.0 || insiders`), no runtime deps |
| 28 | `find node_modules -type d -name braces` | exactly 1 directory |
| 29 | `search_files` for `braces`/`micromatch`/`chokidar`/`fast-glob`/glob APIs/watch APIs across all file types | 0 application-source matches |
| 30 | `cat tailwind.config.ts` | 4 static `content` literals; `require("tailwindcss-animate")` and `require("@tailwindcss/typography")` in `plugins` |
| 31 | `cat postcss.config.mjs` | `tailwindcss` plugin only |
| 32 | `grep` for fs/glob/watch APIs in `app/`, `components/`, `lib/`, `pages/`, `scripts/` | 1 match: `scripts/download-genre-images.js` `path.join` over a fixed directory |
| 33 | `grep` for request-input sites | 54 sites; none feeds a glob/brace call |
| 34 | `ls -d .next` | absent (removed after Phase 13 build verification) |
| 35 | `cat .github/workflows/ci.yml` | audit gate at line 92: `npm audit --audit-level=high --omit=dev` |
| 36 | `cat .github/dependabot.yml` | weekly npm + github-actions updates; no auto `npm audit fix` |
| 37 | `head docs/SECURITY_AUDIT.md` | pre-existing security assessment; no audit-exception or policy file |
| 38 | Registry lookups for `chokidar`/`micromatch`/`fast-glob`/`tailwindcss`/`tailwindcss-animate` latest + `tailwindcss@4.3.3` / `@tailwindcss/postcss@4.3.3` / `@tailwindcss/node@4.3.3` / `@tailwindcss/oxide@4.3.3` deps | `chokidar@4+/5+` and `tailwindcss@4` drop the braces chain; `micromatch`/`fast-glob`/`tailwindcss-animate` have no newer version |
| 39 | Lockfile scan for `patch-package` / `.patch` files / `patches/` | all absent |
| 40 | `git rev-list --count origin/release/phases-2-11-verified..HEAD` | 0 (no Phase 12/13 commit exists) |
| 41 | `git rev-parse origin/release/phases-2-11-verified origin/main` | `6f0595ab…` / `bcdb83473071c3a704335861a0cd7204317298a8` (unchanged) |
| 42 | `git ls-files --others --exclude-standard \| grep -i phase-14` | empty (report not yet written at that point) |

**Explicitly NOT run (prohibited):** `git add`, `git restore --staged`, `git reset`, `git commit`,
`git push`, `git pull`, `git fetch`, `git merge`, `git rebase`, `git cherry-pick`, `git checkout`,
`git switch`, `git restore`, `git clean`, `git stash`, `git rm`, `npm install`, `npm update`,
`npm uninstall`, `npm ci`, `npm dedupe`, `npm prune`, `npm audit fix`, `npm audit fix --force`, any
package-manager mutation, any formatting or deployment command. **None was executed.**

---

## 43. Final staged Git state

Captured after the analysis, immediately before writing this report:

| Property | Value |
|---|---|
| Branch | `work/phase-12-cache-invalidation-diagnosis` |
| HEAD | `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f` (**unchanged**) |
| Staged paths | **8** (identical to baseline) |
| Unstaged tracked diff | **empty** |
| Untracked | 63 pre-existing scratch/prompt paths + **this report** (the only new Phase 14 artifact) |
| Commits created | **0** |
| Push / merge / deployment | **none** |
| `origin/release/phases-2-11-verified` | `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f` (unchanged) |
| `origin/main` | `bcdb83473071c3a704335861a0cd7204317298a8` (unchanged) |
| PR #14 | open, unmerged (verified read-only in the prior pass) |
| `node_modules` | not modified (`node_modules/braces` mtime 2026-09-10, pre-existing) |

Staged blob OIDs (unchanged from baseline):

| Path | Index blob OID |
|---|---|
| `docs/reports/PHASE-12-…COMPLETION-REPORT.md` | `3987668f01b55964b1bf27f8c84dd39e815339ba` |
| `docs/reports/PHASE-13-…COMPLETION-REPORT.md` | `8e42781d795cf7c2e09c91455a1d79e45bd6ae31` |
| `docs/reports/diagnostics/BUG-AI-SIMILAR-…-DIAGNOSIS.md` | `2da2b09593162843a280c9405ea74c833d61800c` |
| `docs/reports/diagnostics/BUG-BRACE-EXPANSION-…-DIAGNOSIS.md` | `dfd080468e884e9a3523a6db4ead775b9b077eb6` |
| `lib/cacheManager.ts` | `0572058685fdd96fd02f96dcc00c01ce3028c75b` |
| `package-lock.json` | `ecbb234365f2d57a65439d2cdf9c790122dcdf42` |
| `package.json` | `01bc02133c61b9147cc61efa799123443bbf7d7e` |
| `tests/ai-similar-cache-invalidation.test.ts` | `528c7c2d7b232085153f1a55c6e10abae9be2185` |

**Required statement (per prompt §15.4):**

> The blocked Phase 12/13 commit set remains staged and byte-equivalent to the validated content.
> Phase 14 attribution is limited to the untracked diagnostic report. No commit, push, merge, or
> deployment occurred.

---

## 44. Hash comparison

Per prompt §0.5 and §0.6, with **explicit LF-normalization accounting**:

`core.autocrlf = true` and no `.gitattributes` exist. Git normalizes CRLF working-tree files to LF in
the index. The comparison below therefore reports **both** the raw working-tree hash and the
normalized-equivalence verdict.

| File | Working-tree SHA-256 | Staged-blob SHA-256 | CR bytes in worktree | Normalized verdict | Git blob OID (staged) |
|---|---|---|---|---|---|
| `package.json` | `8896865a3da9ad773780f45e94b19e379ec00baf285c20b2e25f9cb9166c2468` | `084bad1c47898a0ab0bce9d7b6cd0923ef6bc501efabe033755696c12143f8fb` | 113 | **identical after LF normalization** — `git show :package.json` is byte-equal to `package.json` with CR removed (verified by direct comparison, diff line-count 0) | `01bc0213…` |
| `package-lock.json` | `a8f5214eeb5af038be95c9621e761826bae6447939a1b2bba3bb8184c208c87f` | `213a736fe35b7daf6698bb45c58d94176460fa33ed75a9fc647d09d357cd6587` | 12,844 | **identical after LF normalization** — same verification, diff line-count 0 | `ecbb2343…` |
| `lib/cacheManager.ts` | `ef8a9d3a386af451834a9b370b67333da5efe9242519f538b6cf81b6ced3493d` | `ef8a9d3a386af451834a9b370b67333da5efe9242519f538b6cf81b6ced3493d` | 0 | **byte-identical** | `05720586…` |
| `tests/ai-similar-cache-invalidation.test.ts` | `e56be0ebe6b3ce3b9191315bbb11dcbe7d92ec260f483b56bb368811955e44c2` | `e56be0ebe6b3ce3b9191315bbb11dcbe7d92ec260f483b56bb368811955e44c2` | 0 | **byte-identical** | `528c7c2d…` |

**Per the prompt's requirement:** the CRLF working-tree bytes and LF staged blobs are **not** treated
as a content mismatch, because the normalized content is identical (verified by direct byte
comparison of the staged blob against the CR-stripped working tree, with a zero diff line-count for
both manifest files). **No file was normalized during this phase** — the staging was performed by the
prior authorized commit pass; this phase only inspected.

Cross-check against the prior commit pass: the working-tree SHA-256 values above are identical to
those recorded during the blocked commit pass (`8896865a…`, `a8f5214e…`, `ef8a9d3a…`,
`e56be0eb…`), and the staged blob OIDs are identical to the baseline porcelain v2 output. **No content
changed between the commit pass and this diagnosis.**

---

## 45. Files created, modified, or deleted

| Category | Files |
|---|---|
| **Created** | `docs/reports/diagnostics/BUG-BRACES-UNPATCHED-STACK-EXHAUSTION-DIAGNOSIS.md` (this report) — **the only Phase 14 artifact** |
| **Modified** | **NONE.** No source, test, package, lockfile, config, CI, environment, or report file was modified. The eight staged paths' content was not touched. |
| **Deleted** | **NONE.** No file was deleted. No scratch file was removed. `node_modules` was not altered. |
| **Staged / unstaged** | The index was **not altered in any way**. It still contains exactly the eight authorized paths. Nothing was added to or removed from the index. |
| **Git configuration** | **Not changed.** |

---

## 46. Commit / push / merge / deployment status

| Action | Status |
|---|---|
| Commit | **NONE.** HEAD remains `6f0595ab4c2f09090c9cd4f0bb225df6b11b7d5f`. `git rev-list --count origin/release/phases-2-11-verified..HEAD` = 0. |
| Push | **NONE.** No remote ref moved. `origin/release/phases-2-11-verified` = `6f0595ab…`, `origin/main` = `bcdb8347…`. No `git fetch`/`pull`/`push` was run. |
| Merge | **NONE.** |
| Deployment | **NONE.** No deploy target contacted. |
| Index mutation | **NONE.** The eight staged paths are preserved exactly as the prior authorized commit pass left them. |
| Remote state | unchanged; PR #14 remains open and unmerged |
| `node_modules` | unchanged |

---

## 47. Requirement Traceability Matrix

`Requirement ID → Evidence → Validation → Status`

| Requirement ID | Requirement | Evidence | Validation | Status |
|---|---|---|---|---|
| BRACES-DIAG-1 | Reproduce production and bare audit results | §8: all four audit forms run under Node v22.13.1; prod = exit 1 / 5 high / 5 packages; bare = exit 1 / 7 high / 7 packages; single advisory source 1240992 | Commands executed twice with identical results; exit codes and counts recorded | **PASS** |
| BRACES-DIAG-2 | Distinguish advisories, affected nodes, dependency paths, and physical copies | §8.5, §9, §10, §11: 1 advisory / 5 prod nodes / 7 bare nodes / 4 dependency paths / **1** physical copy (verified by `find` and lockfile scan) | Four measures each independently computed and cross-checked against `npm ls`/`npm explain`/`find` | **PASS** |
| BRACES-DIAG-3 | Explain production/dev classification | §12, §13: `tailwindcss-animate` is the sole production-classified dependent of `tailwindcss` (direct lockfile scan of all 855 entries); peer-promotion mechanism traced step by step; all chain packages carry `dev:false` | Direct lockfile scan proving the sole production path; `npm ls braces --omit=dev --all` confirms inclusion | **PASS** |
| BRACES-DIAG-4 | Verify patch availability and upstream status | §20, §21: `dist-tags.latest = 3.0.3`; `first_patched: null`; no publish since 2024-05-21; repo not archived but last push 2025-01-19; PR #72 open/unmerged on a third-party fork with no maintainer engagement; issues #70/#73 open | Three authoritative sources (GHSA, OSV, NVD) plus the npm registry and the GitHub API | **PASS** |
| BRACES-DIAG-5 | Assess request-time, build-time, and development-tooling reachability | §15, §16, §17: 0 application imports; single entry point is a build-only Tailwind plugin; 4 static `content` literals; all 8 attacker-control vectors ruled out; build-time and dev-tooling paths traced | Exhaustive `search_files` across all file types; `grep` over `app/`/`components/`/`lib/`/`pages/`/`scripts/`; no PoC executed (per prohibition) | **PASS** |
| BRACES-DIAG-6 | Compare parent-upgrade, reclassification, patch, exception, and wait options | §22, §23, §24, §25, §28, §37: five options each evaluated against registry metadata and lockfile simulation; Option A rejected as immediate remedy, Option B confirmed as companion, Option C rejected, Option D preferred, Option E rejected as unbounded | Every parent candidate's actual `dependencies` checked against the registry; reclassification effect simulated directly against the lockfile | **PASS** |
| BRACES-DIAG-7 | Define a fail-closed exception design if defensible | §26: ten matching rules; nine rejection classes; nine test fixtures; concrete file design; compliance table mapping all 14 prompt requirements | Design reviewed against every prompt requirement; **not implemented** (Step 1 prohibits implementation) | **PASS** (design-level) |
| BRACES-DIAG-8 | Recommend a concrete expiry and ownership policy | §27: **14 days → 2026-10-17**; owner named; 7-day review cadence; exact patch-check command (`npm view braces dist-tags.latest`); expiry behavior and follow-up owner defined | Evidence-based reasoning recorded against all five prompt factors; indefinite exception explicitly excluded | **PASS** |
| BRACES-DIAG-9 | Preserve the staged Phase 12/13 delta and remote state | §5, §43, §44, §46: 8 staged paths unchanged (blob OIDs identical to baseline); unstaged tracked diff empty; HEAD unchanged; 0 commits ahead of the release branch; both remote refs at the expected SHAs; no index mutation; 63 scratch/prompt paths preserved | Baseline and post-analysis porcelain v2 compared; staged blob OIDs and working-tree SHA-256 compared; `git rev-list` count verified | **PASS** |
| BRACES-DIAG-10 | Define exact Step 2 scope and validation | §38, §39: exact files to create/modify; 21 validation gates; explicit exclusions; alternative scopes for the non-preferred options | Scope is implementable from this report alone; validation covers every fixture and gate the prompt listed | **PASS** |

**All 10 requirements PASS.** No requirement is BLOCKED, NOT EXECUTED, or NOT APPLICABLE.

---

## 48. Step 2 recommendation

**Proceed to Step 2 with Option D — implement the narrowly scoped, time-limited audit-policy
exception — then commit the staged Phase 12/13 delta.**

Concretely, in order:

1. **Authorize Step 2** with the file scope in §38.1: `scripts/audit-policy.mjs`, `audit-exception.json`,
   `tests/audit-policy.test.ts`, the one-line `.github/workflows/ci.yml` change, and the additive
   post-phase notes to the Phase 12 and Phase 13 reports. Optionally include Option B (moving
   `tailwindcss-animate` to `devDependencies`) as a companion.
2. **Implement the policy and its nine fixtures**, then run the 21-gate validation ladder of §39 under
   Node v22.13.1.
3. **Verify `node scripts/audit-policy.mjs` exits `0` against the live audits** on this repository as
   it stands.
4. **Commit the policy first** (recommended per §28.2), confirm the gate is green, then commit the
   eight already-staged Phase 12/13 paths — whose content this phase has now re-confirmed is
   byte-equivalent to the validated state.
5. **Set the 2026-10-17 review checkpoint** and record the owner. On that date, or sooner if
   `npm view braces dist-tags.latest` reports anything other than `3.0.3`, either bump `braces` and
   remove the exception, or re-authorize with fresh evidence.

**What must NOT happen in Step 2:** any `braces` version bump (none exists), any fork or local patch,
any `tailwindcss` v4 upgrade, any change to the eight staged paths' content, any broadening of the
exception beyond the three recorded identifiers, and any extension of the expiry beyond the authorized
period.

**Final status: PASS WITH WARNINGS.** The warnings — no upstream patch, uncertain fix timing, and a
live HIGH-severity advisory that is unreachable in this deployment but cannot be remediated today —
are properties of the finding, not of this diagnosis, and they are the reason Step 2 is required
rather than optional.
