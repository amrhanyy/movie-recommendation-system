# PHASE-16 — Dependency Audit Drift Diagnosis

- **Phase:** 16 (Step 1 — READ-ONLY DIAGNOSIS)
- **Ticket:** DEP-AUDIT-DRIFT-001 (dependency-audit landscape drift since Phase 14/15 calibration)
- **Branch:** `work/phase-12-cache-invalidation-diagnosis` @ `a89c1fb` (uncommitted Phase 15 delta preserved untouched)
- **Status:** **PASS — diagnosis complete, no repository changes made**
- **Date:** 2026-11-01 (Africa/Cairo, EET / UTC+02:00)
- **Scope guard:** No dependency, `package.json`, `package-lock.json`, source, test, CI, or
  audit-policy file was modified. No staging / commit / push / merge / deploy. The only
  artifact produced is this report.

> **Verdict in one line.** The dependency-audit landscape has drifted materially from the
> Phase 14 calibration point: the single-advisory world the fail-closed gate and the 32 unit
> tests were built for (exactly one `braces` advisory) no longer exists. `braces` is no longer
> flagged (its advisory no longer surfaces in the raw audit), and **nine distinct advisory
> objects** (production) / **seventeen** (bare) now surface across **seven** production and
> **twenty-four** total vulnerable packages, all with `fixVersion: null` ("drift"). The live
> audit-policy gate is therefore RED (`MULTIPLE_ADVISORY_OBJECTS`) and the stale `braces`
> exception (expired 2026-10-17) is dead weight. Step 2 is **ready to execute** as bounded
> version groups; the two highest-risk items are `zod` (required major 3→4) and the
> `glob`/`minimatch` build-only cluster (range-tensioned, candidate for scoped exception).

---

## 1. Environment & methodology (evidence of how every number below was obtained)

| Item | Value | Evidence |
|---|---|---|
| Node runtime used for all audits/tests | **v22.13.1** | `C:/Users/amrko/AppData/Local/ms-playwright-go/1.50.1/node.exe --version` → `v22.13.1` |
| npm version under that runtime | **11.19.0** | node-22 + `C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js` (`--version` → `11.19.0`) |
| Registry reachability | **ONLINE** | `npm ping --registry https://registry.npmjs.org` → `PONG 450ms` |
| lockfileVersion | **3** | `package-lock.json` |
| Dependency-tree entries | **855** | lockfile `packages` length |
| Test runner | **vitest 4.1.11** | `node_modules/vitest/vitest.mjs` |

Commands actually executed (read-only):

```text
node22  npm audit --json                 →  p16_bare_audit.json   (exit 1)
node22  npm audit --omit=dev --json      →  p16_prod_audit.json   (exit 1)
node22  npm view <pkg> dist-tags / <pkg>@<v> version    (9 packages, registry)
node    node_modules/vitest/vitest.mjs run tests/audit-policy.test.ts       (32/32)
node    node_modules/vitest/vitest.mjs run tests/cache-inflight-invalidation-race.test.ts (25/25)
node    scripts/audit-policy.mjs                                                (LIVE GATE, exit 1)
```

All audit/registry JSON captured to `D:/AppData/hermes/cache/scratch/p16_*.json` and re-derived
mechanically (no hand-counting). Every count in this report was produced by parsing the captured
JSON, not by reading the human summary.

---

## 2. Executive summary of the drift

1. **The raw production audit reports 7 vulnerable packages** (3 moderate, 3 high, 1 critical)
   and the **bare audit reports 24** (19 moderate, 4 high, 1 critical). These are reproduced
   exactly (§4).
2. **None of the 24 findings carries a `fixVersion`/`patchedVersions` in the audit payload**
   (all `null`). This is the "drift": the audit metadata no longer encodes a machine-fixable
   target, so the safe targets must come from registry `dist-tags` (§6), not from the audit's
   (absent) suggestion.
3. **`braces` is still present** in the tree at **3.0.3** (PROD, via `chokidar`/`micromatch`),
   **but it no longer appears in either raw audit** — the advisory it was excepted under
   (`GHSA-vfj7-8cjw-p6xm`) has stopped surfacing. The `config/audit-exceptions.json` record that
   guards it **expired on 2026-10-17T23:59:59Z** (15 days ago) and is now **stale on two
   independent grounds** (§10).
4. The **live audit-policy gate** (`node scripts/audit-policy.mjs`) is **RED**: both scopes
   reject with **`MULTIPLE_ADVISORY_OBJECTS`** (9 prod / 17 bare vs. the gate's hard
   "exactly one advisory object" invariant), which fires *before* the expiry check. The **32
   policy unit tests remain GREEN** (they are pure/synthetic and decoupled from the live audit),
   which proves the evaluator logic is intact and the failure is purely audit-landscape drift
   (§11).
5. Step 2 is **readiness: GO** for bounded version groups. The two items that are not trivial
   patch-bumps are **`zod` (required major 3.24.2 → 4.6.6+; no 3.x patch exists)** and the
   **`glob`/`minimatch` build-only DoS cluster (major overrides that collide with the Phase 13
   brace-expansion scoped overrides and `sucrase`'s `^10.3.10` pin)**.

---

## 3. Priority — critical / high production findings

The production audit carries one **critical** and three **high** package findings. Prioritized:

| Rank | Advisory | Package (installed) | Severity | Why it matters |
|---|---|---|---|---|
| **P0-1** | **`GHSA-2464-fhr4-w9xw`** | `next@15.5.24` | **critical** | **Unauthenticated RCE via the Image Optimization API when SVG files are used** (CWE-1395). Served-request reachable. This is the single most serious finding. |
| **P0-2** | **`GHSA-wq5f-xc86-pv6w`** (CVE-2026-96889) | `sharp@0.35.4` | **high** | RCE/heap issues in bundled **librsvg**. Reached through `next`'s optional image-optimization dependency — i.e. served-request reachable via Next image optimization. |
| **P0-3** | `GHSA-mrhx-c7xc-m3w5` | `zod@3.24.2` | **high** | Memory exhaustion validating oversized constrained collections (CVSS 7.5). Reached **at runtime** by API-route request-body validation (`app/api/*/route.ts`, `lib/security/schemas.ts`). |
| P1 | `GHSA-p3m5-59mp-jv5r` | `next@15.5.24` | high | DoS in App Router via Server Actions. |
| P1 | `GHSA-68fv-2mgg-jv7q` | `source-map-js@1.2.1` | high | Event-loop DoS via indexed source-map section offsets (CVSS 7.5). Mostly build/dev reachability (sourcemaps are stripped from a prod build). |

**Note on "the current Next.js rollup advisories."** `rollup` is **absent from the lockfile**
(verified). The phrase is interpreted as *the current Next.js advisory batch*: **four**
`next` advisory objects (§8) — `GHSA-4jqv-mc3x-m676`, `GHSA-mcj8-r9mp-w47p` (both SSG/ISR
cache-poisoning, moderate), `GHSA-2464-fhr4-w9xw` (RCE, **critical**), and
`GHSA-p3m5-59mp-jv5r` (Server-Actions DoS, high). All four are cleared by a single bump
`next → 15.5.28`.

---

## 4. Reproduction — exact current audit counts (verified)

### 4.1 Raw production audit (`npm audit --omit=dev`)
```text
metadata.vulnerabilities = { info:0, low:0, moderate:3, high:3, critical:1, total:7 }
flagged packages (7): next, sharp, source-map-js, zod, glob, minimatch, sucrase
```
| severity | packages |
|---|---|
| critical (1) | `next` |
| high (3) | `sharp`, `source-map-js`, `zod` |
| moderate (3) | `glob`, `minimatch`, `sucrase` |

### 4.2 Raw bare audit (`npm audit`)
```text
metadata.vulnerabilities = { info:0, low:0, moderate:19, high:4, critical:1, total:24 }
flagged packages (24): the 7 production ones + 17 dev-only
```
| severity | packages |
|---|---|
| critical (1) | `next` |
| high (4) | `sharp`, `source-map-js`, `zod`, **`vite`** |
| moderate (19) | `glob`, `minimatch`, `sucrase`, `@eslint-community/eslint-utils`, `@eslint/config-array`, `@eslint/eslintrc`, `@typescript-eslint/{eslint-plugin,parser,type-utils,typescript-estree,utils}`, `@vitest/coverage-v8`, `@vitest/mocker`, `eslint`, `eslint-config-next`, `eslint-plugin-{import,jsx-a11y,react}`, `vitest` |

### 4.3 Why these are the counts (mechanism)

- **Production vs. bare.** `--omit=dev` removes the devDependency subtree. The 17
  dev-only packages are the **ESLint 9 toolchain** (`@eslint/*`, `@typescript-eslint/*`,
  `eslint`, `eslint-config-next`, `eslint-plugin-*`) and the **Vitest toolchain**
  (`vitest`, `@vitest/coverage-v8`, `@vitest/mocker`, `vite`). None of these is reachable in a
  built/served app; they only exist to lint and test.
- **Severity of a package = the maximum severity of any advisory object on its `via` array.**
  `next` is *critical* only because it carries the critical `GHSA-2464-fhr4-w9xw`; the same
  `next` entry also carries one high and two moderate objects. `vite` is *high* only in the bare
  view because its high object (`GHSA-587h-7wmj-h5pm`) is dev-only.
- **Transitive-only packages carry no advisory object of their own.** `sucrase` (prod) is
  flagged *solely* because it depends on a vulnerable `glob` (string `via: "glob"`). The 16
  ESLint-chain packages are flagged *solely* via vulnerable `minimatch`/`glob`/`eslint`
  (string `via`). This is what separates "package-level vulnerability count" from
  "advisory-object count" (§5).

---

## 5. Reconciliation — 9 production / 17 bare advisory objects vs. 7 / 24 package counts

npm's audit payload has two distinct objects:

- `vulnerabilities` — keyed by **package** (the *package-level* count: 7 prod / 24 bare).
- Each entry's `via` array mixes two kinds of references:
  - **object `via`** = a concrete advisory that belongs to *that package* (the *advisory-object*
    count), and
  - **string `via`** = "this package is flagged because it *depends on* a vulnerable package"
    (transitive propagation; it is **not** a new advisory object).

Counting only the **object** `via` references across all flagged packages:

```text
production : 7 flagged packages,  9 object-via advisory objects,  3 string-via (transitive)
bare       : 24 flagged packages, 17 object-via advisory objects, 35 string-via (transitive)
```

| Package (object-via advisory objects) | Count | Why it can exceed the package count |
|---|---|---|
| `next` | 4 | one package carries four distinct advisories (mod×2, critical×1, high×1) |
| `vite` | 6 | one package carries six launch-editor/server advisories (mod×4, high×1, low×1) |
| `@vitest/mocker` | 2 | two mock-injection advisories |
| `sharp` / `source-map-js` / `glob` / `minimatch` / `zod` | 1 each | six more |
| **Total (bare)** | **17** | = 4+6+2+1+1+1+1+1 |
| **Total (prod)** | **9** | = the 17 minus the 8 dev-only (vite×6, @vitest/mocker×2) |

- **Production: 7 packages → 9 advisory objects** because `next` alone contributes **4**
  objects (7 + 3 extra = 9; `sucrase` contributes 0).
- **Bare: 24 packages → 17 advisory objects** because **16 of the 24** packages (the whole
  ESLint chain + `sucrase` + `vitest`) are flagged **transitively only** (string `via`) and
  therefore add *package* count but **zero** advisory objects; the 8 packages that carry real
  advisory objects contribute 17 total.

This is fully consistent and was verified by parsing the captured JSON (`p16_parse_audit2.js`).

---

## 6. Exact installed versions, dependency paths, and registry-verified patched versions

All versions below are read from the **committed lockfile** (authoritative for "installed");
the "patched (registry)" column is from `npm view` against `registry.npmjs.org` (PONG 450 ms).

| Package | Installed | Scope | Direct/Transitive | Dependency path (from lockfile) | Registry latest / backport | Advisory floor (from audit range) | Named target | Target exists? |
|---|---|---|---|---|---|---|---|---|
| `next` | **15.5.24** | PROD | **direct** | root → `next` | latest `16.4.3`; **backport `15.5.28`** | `<=15.5.27` (4 objects) | **`15.5.28`** | ✅ (=`backport` tag) |
| `sharp` | **0.35.4** | PROD | transitive (optional, via `next`) | `next` → `sharp` | latest **`0.35.5`** | `<0.35.5` | **`0.35.5`** | ✅ |
| `source-map-js` | **1.2.1** | PROD | transitive (via `magicast` `^1.2.1`, `postcss` `^1.2.1`) | `magicast`/`postcss` → `source-map-js` | latest **`1.2.2`** | `1.0.0–1.2.1` | **`1.2.2`** | ✅ |
| `zod` | **3.24.2** | PROD | **direct** (used by 8 app files) | root → `zod` (0 transitive parents) | latest **`4.6.7`**; highest stable 3.x **`3.25.76`** | `<4.6.6` | **`4.6.6` / `4.6.7`** (major) | ✅ both exist; **no 3.x fix** |
| `glob` | **10.5.0** | PROD (+dev) | transitive (via `sucrase` `^10.3.10`) | `tailwindcss` → `sucrase` → `glob` | latest **`14.0.3`**; `legacy-v10 = 10.5.0` | `3.0.0–14.0.1` (adv. `>=9.0.0 <=14.0.1`) | **`14.0.2`** | ✅ |
| `minimatch` | **9.0.9** (PROD); **3.1.5** (DEV×6); **10.2.6** (DEV×1) | PROD + DEV | transitive (prod via `glob` `^9.0.4`; dev via `@eslint/*`/`eslint-plugin-*` `^3.1.x`, `@typescript-eslint/typescript-estree` `^10.2.2`) | `glob` → `minimatch@9.0.9`; `@eslint/*` → `minimatch@3.1.5`; … | latest **`11.0.3`** | `<11.0.1` | **`11.0.1` / `11.0.3`** (major) | ✅ |
| `vite` | **8.3.1** | DEV | transitive (via `vitest` `^6\|\|^7\|\|^8`) | `vitest` → `vite@8.3.1` (nested) | latest **`8.3.5`** | `8.3.0–8.3.2` | **`8.3.3` / `8.3.5`** | ✅ |
| `vitest` | **4.1.11** | DEV | **direct** (devDep `^4.1.11`) | root → `vitest` | **V4 tag `4.1.12`**; latest `5.0.5` | `2.1.0-beta.1–4.1.11` | **`4.1.12`** | ✅ |
| `@vitest/mocker` | **4.1.11** | DEV | transitive (via `vitest`) | `vitest` → `@vitest/mocker@4.1.11` (nested) | **V4 tag `4.1.12`**; latest `5.0.5` | `<=4.1.11` (2 objects) | **`4.1.12`** | ✅ |

> `@vitest/mocker` (the "file not found" context item) is **not a standalone package you can
> resolve on disk** — it is a sub-package of `vitest`, installed nested at
> `node_modules/vitest/node_modules/@vitest/mocker@4.1.11`. It versions **lockstep with
> `vitest`** (both at `4.1.12` under the `V4` tag).

### 6.1 zod: no 3.x patch exists — a major upgrade is required
The advisory range is `<4.6.6`. The registry's highest **stable 3.x is `3.25.76`**, which is
still inside `<4.6.6`. Therefore **every 3.x release remains vulnerable**; the only registry fix
is the 4.x line. A 3→4 major upgrade **is required** (zod 4 changed `safeParse().error` from a
`ZodError` (with `.issues`) to a **plain issue array**, among other breaking changes).

### 6.2 Blast radius of `zod` 3→4 (verified in-app)
`zod` is imported (`import { z }`) in **8 source files**: `app/api/{user,admin/users,admin/settings,admin/cache,user/account}/route.ts`, `lib/security/schemas.ts`, `lib/env.ts`,
`lib/ai-security.ts`. The migration-sensitive call sites:
- `parseResult.error.issues` in **~6 route files** (`watchlist`, `user`, `favorites`,
  `admin/users`, `admin/settings`, …) — becomes `undefined` under zod 4 (where `error` *is* the
  array).
- `validateEnv(...).errors` in `lib/env.ts` + `instrumentation.ts` + `tests/operational-security.test.ts`
  and `tests/ratelimit-ip-security.test.ts` (both assert on `r.errors`).

This is a **bounded but real** migration: it is the single highest-implementation-risk item in
Step 2 and must be gated by typecheck + the operational/ratelimit test suites.

---

## 7. Per-advisory detail (every advisory object, separately)

Fields per the requirement: advisory ID, CVE, severity, installed version, affected range,
patched version (registry), prod/dev scope, direct/transitive, dependency path, reachability,
fix availability, semver/compat impact. **No advisory object carries a `cve` field** (the only
CVE string anywhere is `CVE-2026-96889`, embedded in the `sharp` advisory *title*); and **every
`fixVersion` is `null`** (fix is available in the registry but not encoded in the audit payload).

### 7.1 Production-scope advisory objects (9)

| Advisory | CVE | Sev | Pkg @ installed | Affected range | Patched (registry) | Direct/Trans | Reachability | Fix? | Semver/compat impact |
|---|---|---|---|---|---|---|---|---|---|
| `GHSA-2464-fhr4-w9xw` | (none) | **critical** | next @15.5.24 | `>=10.0.0 <=15.5.27` | next **15.5.28** | direct | runtime/served (image-opt RCE) | registry yes | **patch within 15.5.x** (low) |
| `GHSA-p3m5-59mp-jv5r` | (none) | high | next @15.5.24 | `>=13.0.0 <=15.5.27` | next 15.5.28 | direct | runtime (Server Actions DoS) | yes | patch |
| `GHSA-4jqv-mc3x-m676` | (none) | moderate | next @15.5.24 | `>=15.0.0 <15.5.27` | next 15.5.28 | direct | runtime (self-hosted SSG/ISR cache poisoning) | yes | patch |
| `GHSA-mcj8-r9mp-w47p` | (none) | moderate | next @15.5.24 | `>=15.0.0 <15.5.28` | next 15.5.28 | direct | runtime (cross-user content substitution + DoS) | yes | patch |
| `GHSA-wq5f-xc86-pv6w` | CVE-2026-96889 | high | sharp @0.35.4 | `<0.35.5` | sharp **0.35.5** | transitive (via next, optional) | runtime (next image-opt → librsvg) | yes | **patch** (override; next wants `^0.34.3 \|\| ^0.35.3`) |
| `GHSA-68fv-2mgg-jv7q` | (none) | high | source-map-js @1.2.1 | `1.0.0–1.2.1` | source-map-js **1.2.2** | transitive (via `magicast`/`postcss`) | build/dev (sourcemaps stripped in prod) | yes | **patch** (override; parents want `^1.2.1`) |
| `GHSA-mrhx-c7xc-m3w5` | (none) | high | zod @3.24.2 | `<4.6.6` | zod **4.6.6/4.6.7** | **direct** | runtime (API-route body validation) | yes | **MAJOR 3→4, breaking** (zod 4 API changes) |
| `GHSA-3g3m-2fjr-6pw4` | (none) | moderate | glob @10.5.0 | `3.0.0–14.0.1` (adv. `>=9.0.0 <=14.0.1`) | glob **14.0.2/14.0.3** | transitive (via `sucrase`/`tailwindcss`) | build/dev (tailwind build) | yes | **MAJOR 10→14** (collides with `sucrase ^10.3.10`) |
| `GHSA-g3hv-75wg-m249` | (none) | moderate | minimatch @9.0.9/3.1.5/10.2.6 | `<11.0.1` | minimatch **11.0.1/11.0.3** | transitive (via `glob` prod; `@eslint/*` dev) | build/dev (lint/build) | yes | **MAJOR** (collides with Phase-13 brace-expansion scoped overrides + `@eslint/* ^3.1.x`) |

### 7.2 Dev-only advisory objects (8, bare-only)

| Advisory | CVE | Sev | Pkg @ installed | Affected range | Patched (registry) | Reachability | Fix? | Impact |
|---|---|---|---|---|---|---|---|---|
| `GHSA-698v-4r3x-3vcv` | (none) | moderate | vite @8.3.1 | `8.3.0–8.3.2` | vite 8.3.3 | dev (launch-editor `%` escaping on Windows) | yes | patch |
| `GHSA-r825-w8mm-5pxw` | (none) | moderate | vite @8.3.1 | `8.3.0–8.3.2` | vite 8.3.3 | dev (launch-editor flag misinterpretation → cmd exec) | yes | patch |
| `GHSA-587h-7wmj-h5pm` | (none) | **high** | vite @8.3.1 | `8.3.0–8.3.2` | vite 8.3.3 | dev (launch-editor `fs.existsSync` bypass on Windows) | yes | patch |
| `GHSA-9jrq-w75r-8gcw` | (none) | low | vite @8.3.1 | `8.3.0–8.3.2` | vite 8.3.3 | dev (cross-origin script via custom middleware) | yes | patch |
| `GHSA-rq7h-c2jc-7f22` | (none) | moderate | vite @8.3.1 | `8.3.0–8.3.2` | vite 8.3.3 | dev (files outside `server.fs.allow` served) | yes | patch |
| `GHSA-vfpm-58rq-9qcg` | (none) | moderate | vite @8.3.1 | `8.3.0–8.3.2` | vite 8.3.3 | dev (first 4 bytes leaked via `?vite-wasm-instance`) | yes | patch |
| `GHSA-qxg6-89mg-rqv8` | (none) | moderate | @vitest/mocker @4.1.11 | `>=2.1.0-beta.7 <4.1.12` | @vitest/mocker 4.1.12 | dev (code injection via unauthenticated manual mock registration) | yes | patch (lockstep with vitest) |
| `GHSA-xp26-3454-mjgp` | (none) | moderate | @vitest/mocker @4.1.11 | `>=4.1.11 <4.1.12` | @vitest/mocker 4.1.12 | dev (Windows backslash traversal bypasses redirect allowlist) | yes | patch |

---

## 8. The nine production / seventeen bare advisory objects (complete inventory)

- **9 production advisory objects:** `next`×4 (`GHSA-4jqv-mc3x-m676`, `GHSA-mcj8-r9mp-w47p`,
  `GHSA-2464-fhr4-w9xw`, `GHSA-p3m5-59mp-jv5r`), `sharp`×1, `source-map-js`×1, `glob`×1,
  `minimatch`×1, `zod`×1.
- **17 bare advisory objects:** the 9 above **+** `vite`×6 **+** `@vitest/mocker`×2.

No other advisory objects exist. The remaining flagged packages (`sucrase`, the ESLint chain,
`vitest`) contribute **package count only**, via string `via` (§5).

---

## 9. Why the raw production audit is exactly 7 / 3 / 3 / 1

`npm audit --omit=dev` resolves **only the production subtree** (direct deps + their
non-dev transitive deps). The 7 packages that remain flagged are precisely the ones reachable
without devDependencies:

1. `next` (direct) — its max advisory severity is **critical** → the 1 critical.
2. `sharp` (optional, via `next`) — **high** → 1 high.
3. `source-map-js` (via `magicast`/`postcss`) — **high** → 1 high.
4. `zod` (direct) — **high** → 1 high.
5. `glob` (via `sucrase` → `tailwindcss`) — **moderate** → 1 moderate.
6. `minimatch` `9.0.9` (prod instance, via `glob`) — **moderate** → 1 moderate.
7. `sucrase` (via `tailwindcss`) — flagged **only transitively** through `glob` (string
   `via`), so it carries the **moderate** severity of that propagation → 1 moderate.

→ **3 moderate + 3 high + 1 critical = 7**. The dev-only packages (ESLint + Vitest toolchains)
are excluded by `--omit=dev`, which is why `vite` (high) and the ESLint chain do not appear here.

## 10. Why the bare audit is exactly 24 / 19 / 4 / 1

`npm audit` (no omit) adds the **17 dev-only packages** to the 7 production ones = 24. The
severity distribution shifts because the dev packages are overwhelmingly **moderate** (ESLint
chain, `sucrase`, `vitest`, `@vitest/*`, `vite`'s moderate objects) and `vite` adds **one** new
**high** (its `GHSA-587h` object), while the critical stays `next` only. Result:
**19 moderate + 4 high + 1 critical = 24**. (19 = 3 prod-moderate + 16 dev-moderate;
4 high = 3 prod-high + `vite`.)

---

## 11. `braces` absence & the stale Phase 14 exception

| Fact | Evidence |
|---|---|
| `braces@3.0.3` is **still present** in the tree | lockfile: `node_modules/braces` @ **3.0.3**, PROD, via `chokidar`(`~3.0.2`) + `micromatch`(`^3.0.3`) |
| `braces` is **ABSENT from both raw audits** | substring `braces` not present in `p16_prod_audit.json` **nor** `p16_bare_audit.json`; not in the 7 or 24 flagged sets |
| The guarded advisory no longer surfaces | the raw audit (authoritative "what is currently flagged") no longer reports `braces@3.0.3` as vulnerable — consistent with `GHSA-vfj7-8cjw-p6xm` being retracted/closed in the registry |
| The exception is **expired** | `config/audit-exceptions.json` → `expiryDate: 2026-10-17T23:59:59Z`; today is **2026-11-01** → **15 days past** |

**Conclusion.** The Phase 14 `braces` exception is **stale on two independent grounds**:
(a) its `expiryDate` has passed, and (b) the advisory it was created to guard no longer appears in
the live audit. It provides no current coverage. **Verification path for the retraction claim:**
confirm `GHSA-vfj7-8cjw-p6xm` status (open/retracted/closed) via the upstream advisory URL;
the *operational* fact that matters for the gate is that the raw audit no longer flags `braces`,
which is verified above.

---

## 12. Live audit-policy gate & the 32 unit tests

**Live gate** (`node scripts/audit-policy.mjs`, the `security` CI step; the raw audit commands are
documented but **not** executed in CI):

```text
Audit policy (production scope): … rejected — 9 distinct advisory objects were found across the "via"
  arrays; the approved exception covers exactly one.
Audit policy (bare scope):       … rejected — 17 distinct advisory objects … covers exactly one.
Audit policy: 2 of 2 scope(s) rejected. This gate fails closed.     (exit 1)
```

- Both scopes reject with **`MULTIPLE_ADVISORY_OBJECTS`**. This check fires at step 7 of
  `evaluateAuditPolicy` — **before** the step-15 expiry check — so `EXCEPTION_EXPIRED` is a
  redundant (secondary) rejection. Even re-dating the exception would **not** green the gate:
  the gate's core invariant ("exactly **one** advisory object, and it must be the approved
  `braces` one") is fundamentally incompatible with the current **multi**-advisory reality.
- (Run under the default Node with co-located npm; the ms-playwright Node 22.13.1 ships without
  co-located npm so its bounded npm-search fails to locate one — an environmental note, not a
  policy result. The evaluator is pure and the audit is version-agnostic, so the verdict is
  node-version-independent.)

**32 unit tests** (`tests/audit-policy.test.ts`) — **32/32 PASS** under Node 22.13.1. They are
**synthetic** (they call the pure `evaluateAuditPolicy` with hard-coded braces-world fixtures and
an injected `now`), so they stay green *regardless* of the live audit. This is the key contrast:
**logic is sound (tests green) but the live gate is miscalibrated (drift → red).**

**Phase 15 focused suite** (`tests/cache-inflight-invalidation-race.test.ts`) — **25/25 PASS**
under Node 22.13.1. The uncommitted Phase 15 delta (`lib/cache.ts` + this test) is in a green
state and is preserved untouched (§16).

---

## 13. Smallest safe remediation — bounded groups (and why the audit's "fix" is not to be trusted)

**Do NOT rely on `npm audit`'s suggested fix.** Every `fixVersion` in the payload is `null`, so
`npm audit --fix` has **no fix to apply** to the production tree (it would be a no-op) — a false
safety signal. A blanket `npm update` would instead pull each package's **latest** tag, which
pulls in unnecessary **major** jumps (`next` → `16.4.3`, `vitest` → `5.0.5`, `zod` → `4.6.7`,
`glob` → `14.0.3`, `minimatch` → `11.0.3`) far beyond the minimal patched floors — high
regression risk. The safe approach is **targeted bumps to the minimal advisory floors** (+
scoped overrides where a package is transitive), grouped so each change is independently
verifiable:

### Group 1 — runtime, clean/patch (do first, lowest risk)
| Change | Mechanism |
|---|---|
| `next` `15.5.24 → 15.5.28` | edit `package.json` dep to `"next": "15.5.28"` (the `backport` tag; `next-auth` peer `^15` still satisfied) |
| `sharp` `0.35.4 → 0.35.5` | edit existing override `"sharp": "0.35.4"` → `"0.35.5"` |
| `source-map-js` `1.2.1 → 1.2.2` | add override `"source-map-js": "1.2.2"` (parents `magicast`/`postcss` want `^1.2.1`) |

### Group 2 — runtime, **MAJOR, breaking** (highest implementation risk)
| Change | Mechanism / risk |
|---|---|
| `zod` `3.24.2 → 4.6.6` (or `4.6.7`) | edit `package.json` dep to `"zod": "^4.6.6"`. **No 3.x patch exists.** Requires the app-code migration in §6.2 (`error.issues → error`, `validateEnv().errors`). Gate: typecheck + operational/ratelimit suites. |

### Group 3 — build-only DoS cluster, range-tensioned (decide: force-or-exception)
| Change | Mechanism / risk |
|---|---|
| `glob` `10.5.0 → 14.0.2` and `minimatch` `3.1.5/9.0.9/10.2.6 → 11.0.1` (or latest `14.0.3`/`11.0.3`) | Add top-level overrides. **Risks:** (a) `sucrase` pins `glob ^10.3.10` (14.x violates it); (b) `@eslint/*`/`eslint-plugin-*` pin `minimatch ^3.1.x` (11.x likely breaks the lint toolchain); (c) the **Phase 13 scoped `brace-expansion` overrides key on `minimatch@3.1.5/9.0.9/10.2.6`**, which vanish once those versions are gone — they must be dropped/re-keyed. **Recommendation:** these are **moderate, build/dev-only** (no served-request reachability). Prefer a **scoped exception / documented deferral** (as Phase 13/14 did) over a global override, **unless** a full `npm ci` + lint + build + test pass proves the forced versions are safe. |

### Group 4 — dev-only tooling (clean patches, lockstep)
| Change | Mechanism |
|---|---|
| `vitest` `4.1.11 → 4.1.12`, `@vitest/coverage-v8` `4.1.11 → 4.1.12`, `@vitest/mocker` `→ 4.1.12` (auto), `vite` `8.3.1 → 8.3.3` | bump the two devDeps to `^4.1.12`; add override `"vite": "8.3.3"` (or `8.3.5`). `@vitest/coverage-v8`'s peer `vitest 4.1.11` must move to `4.1.12` (lockstep). All **dev-only**, clear the 8 dev advisory objects. |

### Policy close-out (post-repair, part of Step 2)
Once Groups 1/2/4 (and either forced-Group-3 or a Group-3 exception) are in, the raw audit
becomes **clean (0 vulns)**. At that point:
- **delete** `config/audit-exceptions.json` (expired + retracted-advisory + now unused);
- **rework** `scripts/audit-policy.mjs` to a **clean-only sentinel** (accept `CLEAN_AUDIT`,
  reject any >0 vuln) — its braces-specific Layer-A branches (`checkInstalledVersion` expects
  `braces`, `checkAdvisoryIdentity` expects the single advisory) become dead;
- **retire/update** `tests/audit-policy.test.ts` (the 32 braces fixtures) to clean/reject
  fixtures;
- update the `security` CI step comment (currently hard-codes "until 2026-10-17").

> **Smallest safe answer to requirement #5:** it is **multiple bounded dependency groups**, not a
> single bump: **Groups 1+4 are clean/patch and low-risk; Group 2 (`zod`) is a required major;
> Group 3 (`glob`/`minimatch`) is best handled as a scoped exception or a validated forced
> override.** `zod` is definitively a **required major upgrade** (no 3.x patch exists).

---

## 14. Phase 14 exception & audit-policy config — should they be removed?

**Yes, but as a post-repair close-out, not as an independent action now.**

- **Now (this phase):** the exception is already **stale/expired** (§11) and the gate is red
  because of the *multi-advisory* drift, not because of the exception. Removing the exception
  alone does **not** green the gate (the 9/17 advisory objects still trigger
  `MULTIPLE_ADVISORY_OBJECTS`).
- **After Step 2 repair:** the audit is clean → the gate accepts via `CLEAN_AUDIT` with **no
  exception at all** → the exception + the braces-specific gate logic are pure dead weight and
  should be removed (§13 close-out). Leaving an expired, retracted-advisory exception in
  `config/` and a single-advisory gate in CI is a latent foot-gun: it misleads future readers into
  thinking `braces` is still a tracked risk.

---

## 15. Exact Phase 16 Step 2 — package & lockfile changes (definition only; NOT executed here)

`package.json` `dependencies`:
```diff
-    "next": "15.5.24",
+    "next": "15.5.28",
-    "zod": "^3.24.1"
+    "zod": "^4.6.6"
```
`package.json` `devDependencies`:
```diff
-    "@vitest/coverage-v8": "^4.1.11",
+    "@vitest/coverage-v8": "^4.1.12",
-    "vitest": "^4.1.11"
+    "vitest": "^4.1.12"
```
`package.json` `overrides`:
```diff
-    "sharp": "0.35.4",
+    "sharp": "0.35.5",
+    "source-map-js": "1.2.2",
+    "vite": "8.3.3",
     "postcss": "8.5.26",
     "js-yaml": "4.3.2",
     "browserslist": ">=4.28.7",
     "postcss-selector-parser": ">=6.1.3",
-    "minimatch@3.1.5":  { "brace-expansion": "1.1.21" },   // drop unless Group-3 forced
-    "minimatch@9.0.9":  { "brace-expansion": "2.1.7" },    // drop unless Group-3 forced
-    "minimatch@10.2.6": { "brace-expansion": "5.0.12" }    // drop unless Group-3 forced
+    // Group-3 (only if forcing, not deferring via exception):
+    "glob": "14.0.2",
+    "minimatch": "11.0.1",
```
Then `npm install` to regenerate `package-lock.json` (frozen → re-resolve), plus the §6.2
`zod` app-code migration, plus the §13 policy close-out. **None of this was performed in this
phase.**

---

## 16. Ordered validation plan (Node 22.13.1), for Step 2 execution

Sequence is chosen so each step has a clear pass/fail boundary and earlier steps de-risk later
ones. All audit/gate steps use the Node 22.13.1 runtime.

| # | Step | Command | Pass criterion |
|---|---|---|---|
| 1 | **Dependency tree** | `node22 npm ls --all next sharp source-map-js zod glob minimatch vite vitest @vitest/mocker` (after install) | installed versions match §6 targets; `braces` path present but unflagged |
| 2 | **Production audit** | `node22 npm audit --omit=dev` | **0 vulnerabilities** (or exactly the Group-3 exception set if deferring) |
| 3 | **Bare audit** | `node22 npm audit` | **0 vulnerabilities** (or the documented dev-set if deferring) |
| 4 | **Phase 15 focused suite** | `node22 node_modules/vitest/vitest.mjs run tests/cache-inflight-invalidation-race.test.ts` | 25/25 (regression guard: the cache-race fix still holds after dep changes) |
| 5 | **Targeted cache suite** | `node22 node_modules/vitest/vitest.mjs run tests/{cache-inflight-invalidation-race,ai-similar-cache-invalidation,cache-key-normalization,cache-personalization,redis-cache-security,redis-queue-calibration}.test.ts` | all pass |
| 6 | **Typecheck** | `node22` → `npm run typecheck` | 0 errors (catches the zod 3→4 API breaks) |
| 7 | **Lint** | `npm run lint` | 0 errors (baseline 0 errors / 93 pre-existing warnings) |
| 8 | **Full suite** | `npm test` | all 43+ files / 442+ tests pass (baseline) |
| 9 | **Coverage** | `npm run test:coverage` | no regression vs. 58.76/49.53/69.19/60.06 |
| 10 | **Production build** | `npm run build` (placeholder env, as in CI `build` job) | build succeeds |
| 11 | **Audit-policy tests** | `node22 node_modules/vitest/vitest.mjs run tests/audit-policy.test.ts` | passes (updated fixtures post-close-out) |
| 12 | **Live audit policy** | `node22 node scripts/audit-policy.mjs` | exit 0 via **`CLEAN_AUDIT`** (both scopes) — no exception file present |
| — | **Preservation check** | re-hash the four preserve-targets (§16 below) | all unchanged |

Ordering notes: steps 4/5 (cache suites) run **before** the full suite to catch any interaction
between the dependency bumps and the in-flight cache-race fix early; typecheck (6) is before the
full suite (8) because a zod major break will show first there; the live gate (12) is **last**
because it is the integration point that proves the exception was correctly removed and the audit
is clean.

---

## 17. Preservation evidence (byte-for-byte, per requirement #15)

The four preserve-targets were hashed at diagnosis start and **re-hashed at completion** — all
identical (no drift from this read-only phase):

| File | SHA-256 | Size | Status |
|---|---|---|---|
| `lib/cache.ts` | `f90db789d3fe3adeb5995494832362a25ce41097c54cb7bb8c50e53d21a18f20` | 16 623 B | **unchanged** |
| `tests/cache-inflight-invalidation-race.test.ts` | `f659a660ef32b03af704a20e54f28601584b98394c74b20897a890ef900af9c1` | 25 150 B | **unchanged** |
| `docs/reports/PHASE-15-…-CORRECTION-COMPLETION-REPORT.md` | `76e370b7f42d753ea40d0c4a5816530558ebdbca6c86e936bb9e3df51c466c94` | 43 757 B | **unchanged** |
| `docs/reports/diagnostics/BUG-CACHE-INVALIDATION-INFLIGHT-REPOPULATION-DIAGNOSIS.md` | `82df7682221c43521e197c1ff76fb5a02a5baa0eb8b11907ab479aefdcd07a82` | 91 808 B | **unchanged** |

The complete uncommitted Phase 15 delta (`M lib/cache.ts` + untracked `tests/cache-inflight-…test.ts`
+ the two Phase 15 reports) was left intact; this phase added **only** this report. No `git add`,
commit, push, merge, or deploy was performed.

---

## 18. Final classification

- **Root cause.** The dependency-audit **landscape drifted** from the Phase 14 calibration point
  (single `braces` advisory, clean otherwise). Between then and now: (a) the `braces` advisory
  (`GHSA-vfj7-8cjw-p6xm`) **stopped surfacing** in the raw audit (retracted/closed — `braces@3.0.3`
  is still installed but no longer flagged), and (b) a **new batch of advisories** was published
  across `next` (incl. a critical image-optimization RCE), `sharp` (librsvg), `source-map-js`,
  `glob`/`minimatch` (DoS), `zod` (memory exhaustion), `vite`/`launch-editor`, and
  `@vitest/mocker` (mock injection). Because the audit payload now carries **9 / 17 advisory
  objects** (all `fixVersion: null`) instead of the single one the gate was calibrated for, the
  fail-closed gate rejects with `MULTIPLE_ADVISORY_OBJECTS`.

- **Production exposure.** **1 critical** (`next` image-optimization RCE,
  `GHSA-2464-fhr4-w9xw`, unauthenticated, served-request reachable), **3 high**
  (`sharp` librsvg via next image-opt; `source-map-js` event-loop DoS — build/dev;
  `zod` memory-exhaustion — served-request via API-route validation), **3 moderate**
  (`glob`, `minimatch`, `sucrase` — build/dev-only, low reachability). Dev-only: `vite`
  (launch-editor cmd-injection/fs-bypass) and `@vitest/mocker` (mock-injection) — **no
  served-request reachability**.

- **Implementation risk.** **Low** for Groups 1 & 4 (patch/override within the same minor,
  parent ranges still satisfied). **High** for Group 2 (`zod` 3→4 major: breaking API change,
  ~8 source files + 2 test files, gated by typecheck + operational/ratelimit suites).
  **Medium/elevated** for Group 3 (`glob` 10→14 / `minimatch` →11 collide with `sucrase`'s
  `^10.3.10` pin, `@eslint/*`'s `^3.1.x` pins, and the Phase 13 scoped `brace-expansion`
  overrides).

- **Exact patched versions.** `next` **15.5.28** (backport); `sharp` **0.35.5**;
  `source-map-js` **1.2.2**; `zod` **4.6.6** (floor) / **4.6.7** (latest) — **major, no 3.x fix**;
  `glob` **14.0.2** / **14.0.3**; `minimatch` **11.0.1** / **11.0.3**; `vite` **8.3.3** / **8.3.5**;
  `vitest` **4.1.12**; `@vitest/coverage-v8` **4.1.12**; `@vitest/mocker` **4.1.12**.

- **Safe remediation groups.** Group 1 (next, sharp, source-map-js) → Group 2 (zod, major) →
  Group 4 (vitest/coverage-v8/@vitest-mocker/vite, dev lockstep) → Group 3 (glob/minimatch,
  force-or-scope-exception, build-only) → Policy close-out (delete stale `braces` exception,
  reduce gate to clean-only sentinel, update tests + CI comment).

- **Step 2 readiness.** **READY (GO).** All named targets exist in the registry (verified via
  `dist-tags`), the uncommitted Phase 15 delta is green and untouched, and the remediation is
  well-bounded. The two items requiring judgment are (a) the `zod` major migration scope and
  (b) whether to force or exception the `glob`/`minimatch` cluster — both are called out above
  with their validation gates. The stale `braces` exception and single-advisory gate should be
  retired as part of Step 2's close-out.

---

## 19. Evidence artifacts (scratch, read-only)
- `D:/AppData/hermes/cache/scratch/p16_bare_audit.json` / `p16_prod_audit.json` (raw audit payloads)
- `D:/AppData/hermes/cache/scratch/p16_registry.txt` (registry `dist-tags` + target existence)
- `D:/AppData/hermes/cache/scratch/p16_zod_versions.json` (zod version inventory)
- `D:/AppData/hermes/cache/scratch/p16_live_gate_defaultnode.txt` (live gate output, RED)
- `D:/AppData/hermes/cache/scratch/p16_parse_audit{,2}.js` (count/reconciliation parsers)
- `D:/AppData/hermes/cache/scratch/p16_lockfile_tree.js` (installed-version/path extractor)
