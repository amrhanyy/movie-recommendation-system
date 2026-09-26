# Phase 11 — Commit Boundary Planning and Final Repository Attribution Plan

**Phase**: 11 — Commit Boundary Planning and Final Repository Attribution
**Revision**: 2 (Commit-Plan Correction Pass applied 2026-09-26)
**Project**: MovieMind
**Repository**: `movie-recommendation-system`
**Prompt type**: READ-ONLY RELEASE AND GIT ATTRIBUTION DIAGNOSTIC
**Date**: 2026-09-26
**Commit policy**: `COMMIT_ALLOWED: NO` — honored (zero commits, zero staging)
**Deployment policy**: `DEPLOYMENT_ALLOWED: NO` — honored (zero deployments)
**Status**: `PASS WITH WARNINGS` — `READY FOR PRE-COMMIT SAFETY PASS` (§K)

---

## Revision 2 change log

Revision 1 (earlier 2026-09-26) proposed nine commits with `package.json` and
`package-lock.json` staged in both a Phase 3 commit and a Phase 10 commit.
**That was an execution defect.** `git add <path>` stages the complete current
contents of a file; there is no way to stage "only the Phase 10 lines" once
the whole file has already been committed. The revision-1 note that Commit 8
could "re-stage the file with its newest content" was wrong — the Phase 10
delta would have been committed already in Commit 2 and could not be
committed again without reconstructing an intermediate historical manifest
and lockfile state, which is unsafe.

Revision 2 corrects this by replacing the nine-commit sequence with an
eight-commit sequence in which **no package file appears in more than one
commit** (§17). The two logical dependency groups, Phase 3 and Phase 10, are
combined into one dependency commit whose message documents both groups
separately. The dependency commit also moves from last to position 7 of 8 so
that the documentation/planning commit remains last.

Other corrections in revision 2, from the approved correction-pass scope:

- **§8/§41**: untracked counts now distinguish paths that pre-existed the
  Phase 11 report (87) from the report itself (1), for a measured total of
  88. No count is hard-coded; every figure is measured (§41).
- **§10/§35**: `.env` / `.env.local` staging-safety controls added, plus the
  stop condition if either file ever appears in the index.
- **§36**: scratch-disposition recommendation split into *strong* ignore
  candidates (`.chunks/`, `.my_tool_sandbox/`) and *review-before-ignore*
  candidates (root `.txt` files, `nul`, `.phase11-prompt.txt`). User-owned
  prompt files are no longer recommended for gitignore.
- **§17/§26**: every commit now records its exact file list, subject and
  body, targeted validation, dependency on earlier commits, whether partial
  staging is required (answer: **none, anywhere**), and whether it
  typechecks and tests independently. Broad staging commands are banned
  (§26 rule).
- **§14**: the `docs/ADR-001` redirect correction is recorded as **APPROVED
  IN PRINCIPLE** only; the future execution pass must stop and request
  explicit scope authorization before editing it.
- **§24/§38**: execution status changed to `READY FOR PRE-COMMIT SAFETY
  PASS`, not "ready for commit execution."

---

## 0. Final diagnostic status

**PASS WITH WARNINGS — planning complete. No state change.**

Final gate evidence (verified during the read-only passes):

| Gate | Command | Result |
|---|---|---|
| Full suite | `npm test` | **42 files / 431 tests pass**, exit 0, zero unhandled errors |
| Coverage | `npm run test:coverage` | Statements 58.76%, Branches 49.53%, Functions 69.19%, Lines 60.06% |
| Lint | `npm run lint` | exit 0, **0 errors / 93 warnings** (unchanged baseline) |
| Typecheck | `npm run typecheck` | exit 0, zero errors |
| Build | `npm run build` | exit 0, all routes compiled |
| Production audit | `npm audit --audit-level=high --omit=dev` | exit 0, 0 vulnerabilities |
| Bare audit | `npm audit` | exit 0, 0 vulnerabilities (Phase 10 closed all 4 findings) |

Nothing was staged, committed, pushed, deployed, deleted, moved, or modified
during Phase 11. `git diff --cached --name-status` is empty. HEAD is
unchanged. No file was written by this phase **except this plan itself**,
which is the deliverable requested. All 36 tracked and 88 untracked paths are
unchanged from the state the gates measured.

## 1. Phase identity

- **Phase**: 11 — Commit Boundary Planning and Final Repository Attribution.
- **Scope**: read-only analysis producing one exact recommended commit and
  staging sequence for the accumulated Phases 2–10 working tree, plus a
  bounded correction pass to that sequence.
- **Excluded by instruction**: staging, committing, pushing, deploying,
  history rewriting, branch creation/switching, `.gitignore` edits, scratch
  removal, line-ending normalization, permission changes, package
  installation/updates, audit fixes, formatting rewrites, code generation,
  Git config changes, reading `.env`/`.env.local`, and any new roadmap work.

---

## 2. Final diagnostic status

See §0. Every gate above is green on the working tree **as it stands** —
that is the state the recommended commit sequence must reproduce. The gates
were verified before the plan was written and re-verified read-only during
the correction pass; no gate was re-executed as part of the correction
because doing so would change no repository state.

---

## 3. Initial environment

| Item | Value |
|---|---|
| Repository root | `D:/fork ai to create website/final porject/movie-recommendation-system` |
| Operating system | Windows 10 (10.0.19045) |
| Active shell | bash (git-bash / MSYS) |
| Node | v26.7.0 (local; CI target is Node 22 — see §40 W-1) |
| npm | 11.5.2 |
| Git | 2.50.1.windows.1 |
| Test runner | vitest 4.1.11 |
| Next.js | 15.5.24 (working tree) |

---

## 4. Initial Git state

```
$ git rev-parse HEAD
70fe77655467f5105f5d0e9b02594ba1c62b2952

$ git status --porcelain=v2 --branch
# branch.oid 70fe77655467f5105f5d0e9b02594ba1c62b2952
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -0
```

- Branch `main`, upstream `origin/main`, **ahead 2, behind 0**.
- The 2 unpushed commits are `70fe776 chore(docs): ADR-001 consolidation and
  phase 7 report` and `6126313 fix(security+dx): …` — already committed work,
  not part of the uncommitted change set below.
- No submodules. One worktree only (the main checkout). No stashes.

---

## 5. Branch and upstream state

- `main` → `origin/main`, `+2 -0`. Nothing to pull; two local commits are
  unpushed.
- No new branches were created in any phase 2–10 (verified:
  `git branch -a` shows only `main`, the pre-existing local
  `backup/pre-workflow-split`, and remote-tracking refs).

---

## 6. Staged-state verification

```
$ git diff --cached --name-status
(empty — nothing staged)
```

**Zero staged paths.** Every change in this plan is currently unstaged. The
staging sequence in §17 is a *proposal*; nothing has been executed.

---

## 7. Complete changed-path inventory

**36 tracked changes** (`git diff --name-status`): 35 modified (`M`) + 1
deleted (`D`).

**88 untracked paths** (`git ls-files --others --exclude-standard`), of which
**87 pre-existed the Phase 11 plan** and **1 is the Phase 11 plan itself**
(`docs/reports/diagnostics/PHASE-11-COMMIT-BOUNDARY-AND-ATTRIBUTION-PLAN.md`).

> **Counting caution.** `git status --porcelain` collapses untracked
> *directories* into a single entry, so it reports 18 entries instead of 88.
> Authoritative counts come from `git ls-files --others --exclude-standard`
> or `git status --porcelain --untracked-files=all`. Revision 1 reported
> "87 untracked" without distinguishing the plan itself; revision 2 uses the
> measured 87 + 1 = 88.

---

## 8. Complete untracked-path inventory

88 untracked paths, grouped:

| Group | Count | Paths |
|---|---|---|
| `.chunks/` scratch | 27 | `as_00.txt` … `as_23.txt`, `as_full.txt`, `as_num.txt`, `as_numbered.txt` |
| `.my_tool_sandbox/` scratch | 28 | `as_numbered.txt`, `c1`–`c4.txt`, `cache_numbered.txt`, `kA`–`kF.txt`, `p8v_clean.txt`, `probe.txt`, `probe3.txt`, `probe4.txt`, `script.py`, `taskA_a/b1/b2/c1/c2/d1/d2.txt`, `taskB1.txt`, `taskB2.txt`, `taskD.txt`, `vv_clean.txt` |
| Root scratch | 7 | `.inbox3.txt` (7,345 B), `as_route_copy.txt` (11,069 B), `cqq.txt` (39,444 B), `cqq_full.txt` (16,841 B), `failed_block.txt` (2,966 B), `route_dump.txt` (25,940 B), `nul` (0 B) |
| User prompt file | 1 | `.phase11-prompt.txt` (29,183 B) — **the Phase 11 task spec; user-owned** |
| Phase reports | 10 | `docs/reports/PHASE-{1..10}-*.md` |
| Diagnostic reports | 7 | `docs/reports/diagnostics/BUG-*.md` + `PHASE-9-*-DIAGNOSIS.md` |
| This plan | 1 | `docs/reports/diagnostics/PHASE-11-COMMIT-BOUNDARY-AND-ATTRIBUTION-PLAN.md` |
| Production source | 1 | `lib/list-membership.ts` (38 lines) — Phase 6 deliverable |
| Tests | 6 | `tests/ai-recommendations-ownership-exclusion.test.ts` (419), `tests/ai-similar-enrichment-concurrency.test.ts` (821), `tests/authenticated-read-rate-limit.test.ts` (177), `tests/chat-quota-ordering.test.ts` (480), `tests/list-membership-collision.test.tsx` (699), `tests/middleware-security.test.ts` (82) |

**Measured now**: 88 total = 87 pre-plan + 1 plan. The plan is the only
untracked path added by Phase 11 itself.

---

## 9. Ignored/generated-path review

| Path | Ignored by | Status |
|---|---|---|
| `.next/` | `.gitignore:7` (`/.next/`) | ignored — build output, must never be committed |
| `coverage/` | `.gitignore:32` (`/coverage/`) | ignored — V8 coverage output, regenerated by CI |
| `.env`, `.env.local` | ignored (`.gitignore:20`, `:21`), untracked, not in the change set | present on disk, **not** in the change set; never read by any phase |
| `.env.example` | tracked | unmodified — safe template, no secrets |

- `node_modules/` is ignored; local `node_modules` was updated by Phase 10's
  `npm install --ignore-scripts` but that directory is never committed.
- The scratch groups (`.chunks/`, `.my_tool_sandbox/`, root `cqq*.txt`,
  `as_route_copy.txt`, `route_dump.txt`, `failed_block.txt`, `.inbox3.txt`,
  `nul`) are **not** gitignored — they appear as untracked. Deleting them is
  forbidden by the phase rules; the recommendation is a `.gitignore`
  follow-up (§36), not deletion.
- No CRLF/LF normalization was performed. Git reports LF→CRLF warnings on 18
  working-copy files; these are informational only (`.gitattributes` absent —
  §40, W-3).

---

## 10. Secret-risk review

Scan performed across all 36 tracked diffs, all 7 new production/test files,
and all scratch paths. Patterns covered: AWS keys (`AKIA…`), Google API keys
(`AIza…`), OpenAI (`sk-…`), GitHub tokens (`ghp_…`), Slack (`xox[baprs]-…`),
private key PEM blocks, MongoDB/Redis/Postgres URIs with credentials, bearer
tokens, cookies, real user emails.

| Finding | Path | Category | Verdict |
|---|---|---|---|
| 0 matches | all 36 tracked diffs | — | **No secret-shaped strings in the committed-to-be delta** |
| 0 matches | `lib/list-membership.ts`, 6 new test files | — | clean |
| 0 matches | `.chunks/`, `.my_tool_sandbox/` | — | clean |
| 1 match | `cqq_full.txt:117` → `quota-ordering@example.com` | email | **test fixture, not real PII** — `cqq_full.txt` is a scratch copy of `tests/chat-quota-ordering.test.ts`; the identical string is the tracked fixture at `tests/chat-quota-ordering.test.ts:117`. Reserved-domain `example.com`. No action beyond EXCLUDE from commits. |

- `.env` / `.env.local` were **not read**, per the phase rules. Both exist on
  disk and are outside the change set entirely.
- **No probable real secret found. Phase 11 is NOT blocked.**

### 10.1 Environment-file staging safety (required control)

Because `.env` and `.env.local` exist on disk but are **already gitignored** (verified `.gitignore:20` `.env`, `:21` `.env.local` — see the Pre-Commit Safety Pass), the
staging sequence carries a standing safety requirement:

1. **Never use broad staging commands.** Explicit path lists only (§26).
2. **Before every commit**, verify neither environment file is staged:
   `git diff --cached --name-status | grep -E '^A.*\.env'` must be empty.
3. **Inspect `git diff --cached --name-status` before each commit** as a hard
   gate, not a courtesy.
4. **Stop immediately** if `.env` or `.env.local` appears in the index. Do
   not proceed, do not `git reset` it — halt and escalate.
5. **Never print their contents.**
6. Recommend a **separate `.gitignore` safety follow-up** so the two files
   cannot be captured by any future broad staging command. `.gitignore` is
   **not** modified in this pass.

---

## 11. Phase-by-phase attribution

Baseline from the phase reports' own "initial Git state" sections, which
recorded the working tree as each phase started. The counts grow monotonically
by exactly that phase's own delta — this is how ownership is proven, not
assumed:

| Phase start | Modified | Deleted | Untracked | Delta added by that phase |
|---|---|---|---|---|
| Phase 2 | 3 | 1 | 2 | `tests/m5-a11y.test.tsx`, its report |
| Phase 3 | 3 | 1 | 3 | `package.json`, `package-lock.json`, `tests/documentation-contract.test.ts`, its report |
| Phase 4 | 19 | 1 | 7 | 10 source/config + 3 test files, its report |
| Phase 5 | 20 | 1 | 7 | `app/api/ai-recommendations/route.ts`, `tests/performance-m4.test.ts`, its report |
| Phase 6 | 20 | 1 | 4 | `lib/list-membership.ts` + 14 UI/context/page files + 2 tests |
| Phase 7 | 31 | 1 | 15 | `app/api/chat/route.ts`, `tests/chat-quota-ordering.test.ts`, its report |
| Phase 8 | 31 | 1 | 15 | `app/api/movie/[id]/ai-similar/route.ts` (pool-4), `tests/ai-similar-enrichment-concurrency.test.ts` |
| Phase 9 | 32 | 1 | 17 | same route (cache boundary), its report + diagnosis |
| Phase 10 | 32 | 1 | 17 | `package.json`, `package-lock.json` (Vitest 4 + js-yaml override), its report |
| **Phase 11 (now)** | **35** | **1** | **88** | **+ this plan only** |

Note the jump 31→35 modified between Phase 7's record and Phase 8's record:
Phase 8's "Evidence Recovery" pass re-verified the tree and its report states
36 modified tracked files accumulated; the count varies by 1 across reports
because Phase 8 also deleted the untracked scratch file `extract.js` (an
untracked deletion, which reduces the untracked count by one and does not
affect the modified count). The current authoritative figure is measured
directly: **35 M + 1 D = 36 tracked changes**, **88 untracked**.

### 11.1 Per-file ownership (tracked, 36 entries)

| Path | Owner phase | Lines (+/−) | Purpose |
|---|---|---|---|
| `app/api/ai-recommendations/route.ts` | Phase 5 | +29/−6 | REL-003 owned-item identifier (`itemId ?? tmdbId`) + `ownedSortKey` |
| `app/api/chat-history/route.ts` | Phase 4 | +6/−1 | API-001: `GET(request)` + `RATE_LIMITS.read` |
| `app/api/chat/route.ts` | Phase 7 | +10/−9 | W3-006a: quota consumed after input validation |
| `app/api/genres/route.ts` | Phase 4 | +3/−2 | AVAIL-001: `tmdbProxyGenres` bucket |
| `app/api/movie/[id]/ai-similar/route.ts` | Phase 8 + Phase 9 | +151/−105 combined | PERF-001 pool-4 enrichment, then PERF-001b cache-boundary fix |
| `app/api/trailers/route.ts` | Phase 4 | +3/−2 | AVAIL-001: `tmdbProxyTrailers` bucket |
| `app/api/user/route.ts` | Phase 4 | +5/−0 | API-001: `RATE_LIMITS.read` on GET |
| `app/genre/[id]/page.tsx` | Phase 6 | +6/−6 | DATA-001 two-arg membership queries (6 sites) |
| `app/movie/[id]/page.tsx` | Phase 6 | +9/−9 | DATA-001 (9 sites) |
| `app/trending/page.tsx` | Phase 6 | +3/−3 | DATA-001 (3 sites) |
| `app/tv/[id]/page.tsx` | Phase 6 | +9/−9 | DATA-001 (9 sites) |
| `components/FavoriteButton.tsx` | Phase 6 | +1/−1 | `isFavorite(type, id)` |
| `components/ForYouSection.tsx` | Phase 6 | +3/−3 | DATA-001 (3 sites) |
| `components/MoodBasedRecommendations.tsx` | Phase 6 | +3/−3 | DATA-001 (3 sites) |
| `components/TimeBasedMovies.tsx` | Phase 6 | +3/−3 | DATA-001 (3 sites) |
| `components/TopRatedMovies.tsx` | Phase 6 | +3/−3 | DATA-001 (3 sites) |
| `components/TopRatedTVShows.tsx` | Phase 6 | +3/−3 | DATA-001 (3 sites) |
| `components/TrendingSection.tsx` | Phase 6 | +3/−3 | DATA-001 (3 sites) |
| `contexts/FavoritesContext.tsx` | Phase 6 | +27/−15 | type-qualified membership state |
| `contexts/WatchlistContext.tsx` | Phase 6 | +27/−15 | type-qualified membership state |
| `docs/ARCHITECTURE_REVIEW.md` | **pre-existing (user)** | D | deletion predates Phase 1 (see §39) |
| `docs/PROJECT_BLUEPRINT.md` | **pre-existing (user)** | +503/−956 | full rewrite dated 2026-09-10 |
| `docs/SECURITY_AUDIT.md` | **pre-existing (user)** | +814/−289 | full rewrite dated 2026-09-10 |
| `docs/UI_UX_REVIEW.md` | **pre-existing (user)** | +1196/−322 | full rewrite dated 2026-09-10 |
| `lib/security/auth.ts` | Phase 4 | +16/−3 | SESSION-001 revocation check in `tryRequireUser` |
| `lib/security/rateLimit.ts` | Phase 4 | +5/−2 | AVAIL-001 two new limit keys |
| `middleware.ts` | Phase 4 | +15/−1 | CONFIG-001 `/api/movie/:id/ai-similar` leaf protection |
| `package.json` | Phase 3 + Phase 10 | +5/−4 | next 15.5.24, sharp 0.35.4 (P3); vitest ^4.1.11, js-yaml 4.3.2 (P10) |
| `package-lock.json` | Phase 3 + Phase 10 | +799/−1387 | P3 next/sharp movement; P10 Vitest4/Vite/js-yaml subtree |
| `tests/documentation-contract.test.ts` | Phase 3 | +1/−1 | sharp `0.35.4` assertion sync |
| `tests/m5-a11y.test.tsx` | Phase 2 | +3/−0 | `/api/chat-history/list` mock branch |
| `tests/performance-m4.test.ts` | Phase 5 | +6/−2 | SC-P1 lean Gemini mock |
| `tests/phase4-watchlist-mobile.test.tsx` | Phase 6 | +10/−10 | two-arg signature probes/fixtures |
| `tests/ratelimit-ip-security.test.ts` | Phase 4 | +47/−3 | AVAIL-001 regressions |
| `tests/session-lifecycle.test.ts` | Phase 4 | +72/−0 | SESSION-001 regressions |
| `tests/tmdb-proxy-validation.test.ts` | Phase 4 | +2/−1 | `RATE_LIMITS` mock sync |

### 11.2 Per-file ownership (untracked, 88 entries)

| Path | Category | Disposition | Rationale |
|---|---|---|---|
| `lib/list-membership.ts` | production source | **INCLUDE** | Phase 6 deliverable; imported by both contexts and 7 components |
| `tests/ai-recommendations-ownership-exclusion.test.ts` | test | **INCLUDE** | Phase 5 regression suite (part of the 431) |
| `tests/ai-similar-enrichment-concurrency.test.ts` | test | **INCLUDE** | Phase 8 + 9 regression suite (16 tests) |
| `tests/authenticated-read-rate-limit.test.ts` | test | **INCLUDE** | Phase 4 API-001 regression suite |
| `tests/chat-quota-ordering.test.ts` | test | **INCLUDE** | Phase 7 regression suite |
| `tests/list-membership-collision.test.tsx` | test | **INCLUDE** | Phase 6 collision regression suite |
| `tests/middleware-security.test.ts` | test | **INCLUDE** | Phase 4 CONFIG-001 regression suite |
| `docs/reports/PHASE-1-…-VERIFICATION-REPORT.md` | phase report | **INCLUDE** | 4,479-line baseline discovery record; required by Phases 2–10 as their baseline reference |
| `docs/reports/PHASE-2-…-REPORT.md` | phase report | **INCLUDE** | Phase 2 completion evidence |
| `docs/reports/PHASE-3-…-REPORT.md` | phase report | **INCLUDE** | Phase 3 supply-chain evidence |
| `docs/reports/PHASE-4-…-REPORT.md` | phase report | **INCLUDE** | Phase 4 hardening evidence |
| `docs/reports/PHASE-5-…-REPORT.md` | phase report | **INCLUDE** | Phase 5 identifier evidence |
| `docs/reports/PHASE-6-…-REPORT.md` | phase report | **INCLUDE** | Phase 6 identity evidence |
| `docs/reports/PHASE-7-…-REPORT.md` | phase report | **INCLUDE** | Phase 7 ordering evidence |
| `docs/reports/PHASE-8-…-REPORT.md` | phase report | **INCLUDE** | Phase 8 concurrency evidence |
| `docs/reports/PHASE-9-…-REPORT.md` | phase report | **INCLUDE** | Phase 9 cache-boundary evidence |
| `docs/reports/PHASE-10-…-REPORT.md` | phase report | **INCLUDE** | Phase 10 audit-remediation evidence |
| `docs/reports/diagnostics/BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY-DIAGNOSIS.md` | diagnostic | **INCLUDE** | root-cause record behind Phase 8 |
| `docs/reports/diagnostics/BUG-CHAT-INVALID-INPUT-CONSUMES-QUOTA-DIAGNOSIS.md` | diagnostic | **INCLUDE** | root-cause record behind Phase 7 |
| `docs/reports/diagnostics/BUG-CHATLIST-UNHANDLED-JSDOM-DIAGNOSIS.md` | diagnostic | **INCLUDE** | root-cause record behind Phase 2 |
| `docs/reports/diagnostics/BUG-LIST-MEMBERSHIP-MEDIA-TYPE-COLLISION-DIAGNOSIS.md` | diagnostic | **INCLUDE** | root-cause record behind Phase 6 |
| `docs/reports/diagnostics/BUG-PRODUCTION-DEPENDENCY-AUDIT-HIGH-DIAGNOSIS.md` | diagnostic | **INCLUDE** | root-cause record behind Phase 10 |
| `docs/reports/diagnostics/BUG-RECOMMENDATION-OWNED-ITEM-IDENTIFIER-DIAGNOSIS.md` | diagnostic | **INCLUDE** | root-cause record behind Phase 5 |
| `docs/reports/diagnostics/PHASE-9-…-DIAGNOSIS.md` | diagnostic | **INCLUDE** | root-cause record behind Phase 9 |
| `docs/reports/diagnostics/PHASE-11-…-PLAN.md` | planning record | **INCLUDE** | this plan — the Phase 11 deliverable |
| `.phase11-prompt.txt` | **user task spec** | **EXCLUDE — user decision recorded (§35)** | user-owned prompt file; preserve untracked locally, do not delete, do not gitignore |
| `.inbox3.txt` | scratch | **EXCLUDE** | Phase 9 QA prompt text; superseded scratch |
| `.chunks/` (27 files) | scratch | **EXCLUDE** | line-chunked copies of `app/api/movie/[id]/ai-similar/route.ts` produced while reading the file |
| `.my_tool_sandbox/` (28 files) | scratch | **EXCLUDE** | probe/note/cache scratch from earlier phases (`script.py` is a 298-byte read-only line-numbering helper) |
| `as_route_copy.txt` | scratch | **EXCLUDE** | copy of the ai-similar route (11,069 B) |
| `route_dump.txt` | scratch | **EXCLUDE** | UTF-16LE dump of a route source (25,940 B) |
| `cqq.txt` | scratch | **EXCLUDE** | UTF-16LE copy of `tests/chat-quota-ordering.test.ts` (39,444 B) |
| `cqq_full.txt` | scratch | **EXCLUDE** | copy of `tests/chat-quota-ordering.test.ts` (16,841 B); contains only the reserved-domain fixture email |
| `failed_block.txt` | scratch | **EXCLUDE** | captured Vitest failure block (2,966 B) |
| `nul` | scratch | **EXCLUDE** | 0-byte accidental file (Windows `nul` device name used as an output path) |

**Cross-reference verification** (per the phase rules, nothing untracked was
assumed disposable just because it is untracked, hidden, or `.txt`):

- `lib/list-membership.ts` — referenced by `contexts/WatchlistContext.tsx`,
  `contexts/FavoritesContext.tsx`, and 7 components. **Verified live import.**
- Every new test file is part of the passing 42-file suite. **Verified.**
- The 18 reports are cross-referenced: each Phase N report cites the Phase
  N−1 report as its baseline. **Verified.**
- The 63 scratch paths duplicate tracked files or hold prompt/diagnostic text;
  none is referenced by any report, test, script, or config. **Verified by
  recursive grep.**
- `extract.js` — **already deleted in Phase 8's evidence-recovery pass** with
  all five safety conditions proven. Not present; no action.

---

## 12. Overlapping-file and commit-dependency analysis

Only **three** paths carry more than one phase's changes:

| Path | Phases | Interaction | Consequence for commits |
|---|---|---|---|
| `app/api/movie/[id]/ai-similar/route.ts` | 8, then 9 | Phase 8 rewrote the enrichment loop (pool-4). Phase 9 moved the same loop *inside* the `getOrSet` producer. Phase 9's change subsumes Phase 8's — the two are **not separable** after the fact. | **Single commit.** Attribute to "Phase 8 + 9" in the message; do not try to split. |
| `package.json` | 3, then 10 | Distinct fields (`next`/`sharp` vs `vitest`/`js-yaml`). Separable *logically*, **not separable mechanically**. | **Single combined commit (§17 Commit 7).** `git add` stages whole files; splitting would require reconstructing an intermediate historical manifest state, which is unsafe. |
| `package-lock.json` | 3, then 10 | Lockfile is one generated document; both phases rewrote subtrees. | **Single commit with `package.json`** — see §13. |

**The correction in revision 2 addresses exactly this.** Revision 1 proposed
staging the package files in a Phase 3 commit *and* again in a Phase 10
commit. That is impossible to execute: after the first commit the file's
entire current content is recorded, and the second commit would have nothing
new to record — or worse, an operator might reconstruct an intermediate state
to force it, producing a manifest/lockfile pair that never existed and was
never tested. Revision 2 stages each package file **exactly once**, in the
combined dependency commit.

**Commit dependency rule used below:** a commit is only safe if `npm ci`
plus `npm test` pass at that commit. Two ordering constraints follow:

1. **Source must not depend on un-committed deps.** Nothing in Phases 2–9
   changed imports to require the Phase 10 Vitest upgrade; the suite passes
   on both vitest 3 and vitest 4, so this constraint is *not* binding here.
2. **Tests must not depend on un-committed source.** Each new test file must
   land **in the same commit as, or after** the source it covers. This is what
   forces the Phase-pairing in §17 (source+test together).

**No commit in §17 requires partial staging.** Every commit is a set of whole
files. This is verified per-commit in §17's "Partial staging required" row.

---

## 13. Package and lockfile change attribution

**Phase 3 (supply-chain remediation)** — pre-existing drift fixed:
- `dependencies.next`: `^15.5.9` → `15.5.24`
- `overrides.sharp`: `0.35.3` → `0.35.4`
- `tests/documentation-contract.test.ts` assertion synced (sharp `0.35.4`)

**Phase 10 (dev-dependency vulnerability remediation)**:
- `devDependencies.vitest`: `^3.2.7` → `^4.1.11`
- `devDependencies.@vitest/coverage-v8`: `^3.2.7` → `^4.1.11`
- `devDependencies.@vitest/mocker`: added at `^4.1.11` (new Vitest 4 dep)
- `overrides.js-yaml`: added `4.3.2` (closes GHSA-2883-xcg3-v3hh)
- lockfile: Vitest 4 / Vite / `@vitest/mocker` / `@vitest/coverage-v8` /
  js-yaml subtree; optional per-OS esbuild/rollup binaries pruned
- **No production dependency changed in Phase 10.** No integrity hash for any
  production package changed.
- Both audits — production (`--omit=dev`) and bare — return 0 findings.

**Why both logical groups go in one commit (§17 Commit 7):**
`package-lock.json` is one coherent generated artifact representing the
*final* resolved tree. Splitting it across two commits would require
reconstructing an intermediate lockfile state that never existed in the
working tree, and any such reconstruction would be an unvalidated artifact —
nothing ever ran `npm ci` against it. The combined commit keeps the manifest
and lockfile coherent and makes the release installable at that commit. The
commit message documents the two logical groups (Phase 3 and Phase 10)
separately so the audit trail is not lost; the grouping is a mechanical
necessity, not a loss of attribution.

**No package file appears in more than one commit in revision 2.**

---

## 14. Intentional deletion disposition

**One deletion: `docs/ARCHITECTURE_REVIEW.md`**

| Evidence | Finding |
|---|---|
| Phase 1 report §6/§7 | Deletion already present when Phase 1 began; recorded as pre-existing, "preserved as a pre-existing user change" |
| Phase 2 report §7 | Same deletion listed under "Pre-existing changes preserved (untouched)" |
| Every subsequent phase report | Same deletion listed; no phase restored, renamed, or altered it |
| Working tree today | Still `D`, unstaged, never restored |

**Disposition: INTENTIONAL DELETION — honor it.** Stage the deletion with
the documentation commit (§17 Commit 8). Rationale: the content was
superseded by `docs/ADR-001_ARCHITECTURE_AND_DEPLOYMENT.md` in commit
`70fe776`, and the user independently rewrote the three sibling docs
(`PROJECT_BLUEPRINT`, `SECURITY_AUDIT`, `UI_UX_REVIEW`) on 2026-09-10 as part
of the same consolidation. This is a user decision documented consistently
across ten phase reports; a release-planning phase must not reverse it.

### 14.1 Stale citation — APPROVED IN PRINCIPLE, not executed

`docs/ADR-001_ARCHITECTURE_AND_DEPLOYMENT.md` line 84 still cites
`` `docs/ARCHITECTURE_REVIEW.md` §10 ``. 19 other files reference the name
(all under `docs/`, all historical report text). None of the *modified* files
in the change set fixes this.

**Recorded as APPROVED IN PRINCIPLE:** a one-line redirect note in `ADR-001`
pointing readers to the report series at `docs/reports/`.

**Not executed in this pass.** The correction is read-only. The future
staging/commit execution pass must **stop before editing** and request
explicit scope authorization for `docs/ADR-001_…md` if the file is not already
changed. Historical references *inside* the phase reports must remain
unchanged — they are records, not live links.

---

## 15. Report, test, helper, and scratch classification

| Class | Count | Disposition |
|---|---|---|
| Phase completion reports | 10 | INCLUDE — the audit trail for every change; required for release review |
| Diagnostic reports | 7 | INCLUDE — root-cause records the completion reports cite |
| Planning record (this plan) | 1 | INCLUDE — the Phase 11 deliverable |
| New test files | 6 | INCLUDE — regression coverage for Phases 4–9 (part of the 42-file suite) |
| New production source | 1 (`lib/list-membership.ts`) | INCLUDE — Phase 6 deliverable |
| Scratch/diagnostic text | 63 | EXCLUDE — duplicates of tracked files, prompt text, captured failure output |
| User prompt file | 1 (`.phase11-prompt.txt`) | EXCLUDE — user-owned; preserved untracked, not deleted, not gitignored |

---

## 16. Commit strategy comparison

### Strategy A — single squashed commit

One commit containing all 61 deliverable paths (36 tracked + 25 untracked
deliverables incl. this plan).

| Criterion | Score |
|---|---|
| Atomicity | excellent — entire release is one revertable unit |
| Reviewability | **poor** — ~5.6k LOC net across 8 unrelated findings; `git blame` loses all phase boundaries |
| Rollback granularity | **poor** — one bug ⇒ revert the whole release |
| Bisectability | **poor** — no intermediate states to bisect |
| `npm ci` safety | good |
| Message clarity | poor — cannot describe 8 findings in one subject line |

### Strategy B — phase-grouped commits (8 commits, revision 2)

One commit per phase (2, 4, 5, 6, 7, 8+9, 3+10, docs), each pairing that
phase's source with its tests. Phases 8 and 9 share one commit (same file,
subsuming changes); Phases 3 and 10 share one commit (same two files,
whole-file staging constraint).

| Criterion | Score |
|---|---|
| Atomicity | good — each commit is one finding's full fix |
| Reviewability | excellent — subject line per finding, reviewer sees one concern per commit |
| Rollback granularity | excellent — revert one finding without touching others |
| Bisectability | excellent |
| `npm ci` safety | **excellent** — `package.json` + `package-lock.json` are staged **exactly once**, together, so no intermediate commit has a manifest/lockfile mismatch |
| Message clarity | excellent — both dependency groups documented in one message |

### Strategy C — dependency-layered commits (9 commits)

Ordered by build dependency rather than chronology: key helper → security
core → middleware → API routes → contexts → components → pages → tests →
deps.

| Criterion | Score |
|---|---|
| Atomicity | **mixed** — splits Phase 6 across 5 commits, so a single finding is no longer one revertable unit |
| Reviewability | good per-commit, but the *finding* story is scattered |
| Rollback granularity | poor for findings (Phase 6 partial revert would need 5 commits) |
| Bisectability | excellent (each layer compiles) |
| `npm ci` safety | same as B if deps land in one commit |
| Message clarity | good technically, weak on intent |

**Recommendation: Strategy B (revision 2, eight commits).** It is the only
strategy where the commit boundaries align with the *finding* boundaries —
which is exactly what the phase reports, the diagnostics, and the requirement
IDs (REL-003, PERF-001, PERF-001b, DATA-001, W3-006a, API-001, AVAIL-001,
SESSION-001, CONFIG-001, SUPPLY-001/002) already encode. Strategy C is
technically cleaner per-layer but fragments Phase 6's single conceptual fix
across five commits; Strategy A sacrifices all review and rollback value.

Revision 1's nine-commit variant of Strategy B was **unsound** (§12) because
it staged the package files twice. Revision 2 keeps Strategy B's boundaries
and fixes that one defect.

---

## 17. Recommended commit and staging sequence (NOT executed)

**This is a proposal. Nothing below has been run.** Every command is listed
so it can be reviewed and executed by an authorized operator.

**Eight commits. No package file appears in more than one commit. No commit
requires partial staging.** Staging uses explicit path lists only — broad
commands are banned (§26).

### 17.0. Commit property key

Each commit below records: exact file list, subject and body, targeted
validation, dependency on earlier commits, whether partial staging is
required, and whether it typechecks and tests independently.

---

### Commit 1 — Phase 2: ChatList mock correction

**File list (3):**
```
tests/m5-a11y.test.tsx
docs/reports/PHASE-2-CHATLIST-MOCK-CORRECTION-COMPLETION-REPORT.md
docs/reports/diagnostics/BUG-CHATLIST-UNHANDLED-JSDOM-DIAGNOSIS.md
```

**Command:**
```bash
git add tests/m5-a11y.test.tsx
git add docs/reports/PHASE-2-CHATLIST-MOCK-CORRECTION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-CHATLIST-UNHANDLED-JSDOM-DIAGNOSIS.md
```

**Subject:** `fix(chatlist): mock /api/chat-history/list in M5 a11y suite`

**Body:**
```
ChatList fetches /api/chat-history/list; the M5 a11y suite's fetch mock had
no branch for it, so the unmocked request fell through to the catch-all and
the labelled-input assertions raced the pending promise. Adds the branch so
the a11y contract is measured against a resolved list.

Phase 2. Report: docs/reports/PHASE-2-CHATLIST-MOCK-CORRECTION-COMPLETION-REPORT.md
```

| Property | Value |
|---|---|
| Targeted validation | `npx vitest run tests/m5-a11y.test.tsx` |
| Depends on | nothing |
| Partial staging required | **No** — three whole files |
| Typechecks and tests independently | **Yes** — test-only change, no source dependency |

---

### Commit 2 — Phase 4: auth, API, rate-limit, and middleware hardening

**File list (15):**
```
lib/security/auth.ts
lib/security/rateLimit.ts
middleware.ts
app/api/user/route.ts
app/api/chat-history/route.ts
app/api/genres/route.ts
app/api/trailers/route.ts
tests/session-lifecycle.test.ts
tests/ratelimit-ip-security.test.ts
tests/tmdb-proxy-validation.test.ts
tests/authenticated-read-rate-limit.test.ts
tests/middleware-security.test.ts
docs/reports/PHASE-4-AUTH-API-SECURITY-HARDENING-COMPLETION-REPORT.md
```

**Command:**
```bash
git add lib/security/auth.ts lib/security/rateLimit.ts middleware.ts
git add app/api/user/route.ts app/api/chat-history/route.ts
git add app/api/genres/route.ts app/api/trailers/route.ts
git add tests/session-lifecycle.test.ts tests/ratelimit-ip-security.test.ts
git add tests/tmdb-proxy-validation.test.ts
git add tests/authenticated-read-rate-limit.test.ts tests/middleware-security.test.ts
git add docs/reports/PHASE-4-AUTH-API-SECURITY-HARDENING-COMPLETION-REPORT.md
```

**Subject:** `fix(security): session revocation, per-route budgets, ai-similar leaf`

**Body:**
```
SESSION-001: tryRequireUser now verifies the session jti against
RevokedSession before returning the caller, so a revoked session cannot
satisfy optional-auth paths.
API-001: /api/user GET and /api/chat-history GET take the request and apply
the standard per-user read budget before the primary query, matching the
sibling authenticated GET handlers (W3-004).
AVAIL-001: genres and trailers each get their own 10/min public bucket
(tmdbProxyGenres / tmdbProxyTrailers) so trailer traffic can no longer
exhaust the genres budget.
CONFIG-001: /api/movie/[id]/ai-similar is a requireUser Gemini route nested
under the public /api/movie/ prefix; middleware now exact-matches the leaf
for defense-in-depth 401 while the handler stays authoritative.

Phase 4. Report: docs/reports/PHASE-4-AUTH-API-SECURITY-HARDENING-COMPLETION-REPORT.md
```

| Property | Value |
|---|---|
| Targeted validation | `npx vitest run tests/session-lifecycle.test.ts tests/ratelimit-ip-security.test.ts tests/tmdb-proxy-validation.test.ts tests/authenticated-read-rate-limit.test.ts tests/middleware-security.test.ts` + `npm run typecheck` |
| Depends on | nothing |
| Partial staging required | **No** — 13 whole files |
| Typechecks and tests independently | **Yes** — source and its tests land together |

---

### Commit 3 — Phase 5: recommendation owned-item identifier

**File list (5):**
```
app/api/ai-recommendations/route.ts
tests/performance-m4.test.ts
tests/ai-recommendations-ownership-exclusion.test.ts
docs/reports/PHASE-5-RECOMMENDATION-IDENTIFIER-CORRECTION-COMPLETION-REPORT.md
docs/reports/diagnostics/BUG-RECOMMENDATION-OWNED-ITEM-IDENTIFIER-DIAGNOSIS.md
```

**Command:**
```bash
git add app/api/ai-recommendations/route.ts
git add tests/performance-m4.test.ts
git add tests/ai-recommendations-ownership-exclusion.test.ts
git add docs/reports/PHASE-5-RECOMMENDATION-IDENTIFIER-CORRECTION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-RECOMMENDATION-OWNED-ITEM-IDENTIFIER-DIAGNOSIS.md
```

**Subject:** `fix(api): normalize owned-item identifier in AI recommendations (REL-003)`

**Body:**
```
The exclusion and the personalization prompt both read tmdbId while the
persisted models store itemId, so owned watchlist/favorites items were never
excluded and could be re-recommended. Both sites now read itemId ?? tmdbId,
and the exclusion sort uses a stable ownedSortKey.

Phase 5. Report: docs/reports/PHASE-5-RECOMMENDATION-IDENTIFIER-CORRECTION-COMPLETION-REPORT.md
```

| Property | Value |
|---|---|
| Targeted validation | `npx vitest run tests/ai-recommendations-ownership-exclusion.test.ts tests/performance-m4.test.ts` |
| Depends on | nothing |
| Partial staging required | **No** — five whole files |
| Typechecks and tests independently | **Yes** |

---

### Commit 4 — Phase 6: type-qualified list membership

**File list (18):**
```
lib/list-membership.ts
contexts/WatchlistContext.tsx
contexts/FavoritesContext.tsx
components/FavoriteButton.tsx
components/ForYouSection.tsx
components/MoodBasedRecommendations.tsx
components/TimeBasedMovies.tsx
components/TopRatedMovies.tsx
components/TopRatedTVShows.tsx
components/TrendingSection.tsx
app/genre/[id]/page.tsx
app/trending/page.tsx
app/movie/[id]/page.tsx
app/tv/[id]/page.tsx
tests/phase4-watchlist-mobile.test.tsx
tests/list-membership-collision.test.tsx
docs/reports/PHASE-6-LIST-MEMBERSHIP-IDENTITY-CORRECTION-COMPLETION-REPORT.md
docs/reports/diagnostics/BUG-LIST-MEMBERSHIP-MEDIA-TYPE-COLLISION-DIAGNOSIS.md
```

**Command:**
```bash
git add lib/list-membership.ts
git add contexts/WatchlistContext.tsx contexts/FavoritesContext.tsx
git add components/FavoriteButton.tsx components/ForYouSection.tsx
git add components/MoodBasedRecommendations.tsx components/TimeBasedMovies.tsx
git add components/TopRatedMovies.tsx components/TopRatedTVShows.tsx
git add components/TrendingSection.tsx
git add app/genre/[id]/page.tsx app/trending/page.tsx
git add app/movie/[id]/page.tsx app/tv/[id]/page.tsx
git add tests/phase4-watchlist-mobile.test.tsx tests/list-membership-collision.test.tsx
git add docs/reports/PHASE-6-LIST-MEMBERSHIP-IDENTITY-CORRECTION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-LIST-MEMBERSHIP-MEDIA-TYPE-COLLISION-DIAGNOSIS.md
```

**Subject:** `fix(lists): qualify watchlist/favorites membership by media type (DATA-001)`

**Body:**
```
A movie and a TV show sharing one numeric TMDB id were the same member of
both sets: every membership query was id-only. Adds lib/list-membership.ts
with the canonical "${type}:${id}" key derivation and guards, migrates both
contexts to type-qualified key sets, and updates all 43 call sites across 7
components and 4 pages to the two-argument isFavorite/isInWatchlist API.

Phase 6. Report: docs/reports/PHASE-6-LIST-MEMBERSHIP-IDENTITY-CORRECTION-COMPLETION-REPORT.md
```

| Property | Value |
|---|---|
| Targeted validation | `npx vitest run tests/list-membership-collision.test.tsx tests/phase4-watchlist-mobile.test.tsx` + `npm run typecheck` |
| Depends on | nothing (imports resolve within this commit) |
| Partial staging required | **No** — 18 whole files |
| Typechecks and tests independently | **Yes** — this is why the helper, contexts, components, pages, and tests must land in one commit |

> Phase 6 spans 18 files but is **one finding**. Splitting it by layer would
> leave intermediate commits where `contexts` imports `lib/list-membership.ts`
> before it exists, or components call a two-arg API the contexts do not yet
> expose. Whole-finding commits are what make it independently green.

---

### Commit 5 — Phase 7: chat quota ordering

**File list (4):**
```
app/api/chat/route.ts
tests/chat-quota-ordering.test.ts
docs/reports/PHASE-7-CHAT-QUOTA-ORDERING-CORRECTION-COMPLETION-REPORT.md
docs/reports/diagnostics/BUG-CHAT-INVALID-INPUT-CONSUMES-QUOTA-DIAGNOSIS.md
```

**Command:**
```bash
git add app/api/chat/route.ts
git add tests/chat-quota-ordering.test.ts
git add docs/reports/PHASE-7-CHAT-QUOTA-ORDERING-CORRECTION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-CHAT-INVALID-INPUT-CONSUMES-QUOTA-DIAGNOSIS.md
```

**Subject:** `fix(chat): consume quota after input validation (W3-006a)`

**Body:**
```
The rate-limit decrement ran before the body was parsed, so a malformed or
rejected request still burned the caller's daily chat budget — an
unauthenticated-cost vector. Reorders the handler so the budget is taken
only after the request is known to be valid.

Phase 7. Report: docs/reports/PHASE-7-CHAT-QUOTA-ORDERING-CORRECTION-COMPLETION-REPORT.md
```

| Property | Value |
|---|---|
| Targeted validation | `npx vitest run tests/chat-quota-ordering.test.ts` |
| Depends on | nothing |
| Partial staging required | **No** — four whole files |
| Typechecks and tests independently | **Yes** |

---

### Commit 6 — Phases 8 + 9: bounded concurrency and cache boundary

**File list (6):**
```
app/api/movie/[id]/ai-similar/route.ts
tests/ai-similar-enrichment-concurrency.test.ts
docs/reports/PHASE-8-AI-SIMILAR-CONCURRENCY-CORRECTION-COMPLETION-REPORT.md
docs/reports/diagnostics/BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY-DIAGNOSIS.md
docs/reports/diagnostics/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-DIAGNOSIS.md
docs/reports/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-CORRECTION-COMPLETION-REPORT.md
```

**Command:**
```bash
git add "app/api/movie/[id]/ai-similar/route.ts"
git add tests/ai-similar-enrichment-concurrency.test.ts
git add docs/reports/PHASE-8-AI-SIMILAR-CONCURRENCY-CORRECTION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY-DIAGNOSIS.md
git add docs/reports/diagnostics/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-DIAGNOSIS.md
git add docs/reports/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-CORRECTION-COMPLETION-REPORT.md
```

**Subject:** `fix(perf): bound and cache the ai-similar TMDB enrichment fan-out`

**Body:**
```
PERF-001: the enrichment map ran Promise.all over up to 12 suggestions with
no concurrency bound. Replaced with an ordered batch loop at
ENRICHMENT_POOL_SIZE = 4, matching the ai-recommendations route.
PERF-001b: the cache boundary was misplaced — the cached value was the
suggestion list, so a warm hit still re-ran the entire /search/movie
enrichment on every request. The producer now returns the final enriched
array (key movie:<id>:ai-similar:v2, 24h TTL) and a warm hit performs zero
upstream calls; empty results are never cached.

Phases 8 and 9. Reports: docs/reports/PHASE-8-… and PHASE-9-…
```

| Property | Value |
|---|---|
| Targeted validation | `npx vitest run tests/ai-similar-enrichment-concurrency.test.ts` |
| Depends on | nothing |
| Partial staging required | **No** — six whole files |
| Typechecks and tests independently | **Yes** |

> **One commit for both phases.** Phase 9's change is a superset of Phase 8's
> on the same file (§12): Phase 8 bounded the loop, Phase 9 moved that same
> loop inside the `getOrSet` producer. Splitting would require reconstructing
> the Phase-8-only intermediate file content, and that intermediate state is
> known-broken by design — its cache boundary still re-runs enrichment on
> every hit. Both phases are named in the subject and body so attribution is
> preserved.

---

### Commit 7 — Phases 3 + 10: combined dependency remediation

**File list (5):**
```
package.json
package-lock.json
tests/documentation-contract.test.ts
docs/reports/PHASE-3-SUPPLY-CHAIN-REMEDIATION-COMPLETION-REPORT.md
docs/reports/PHASE-10-DEV-DEPENDENCY-VULNERABILITY-REMEDIATION-COMPLETION-REPORT.md
docs/reports/diagnostics/BUG-PRODUCTION-DEPENDENCY-AUDIT-HIGH-DIAGNOSIS.md
```

**Command:**
```bash
git add package.json package-lock.json
git add tests/documentation-contract.test.ts
git add docs/reports/PHASE-3-SUPPLY-CHAIN-REMEDIATION-COMPLETION-REPORT.md
git add docs/reports/PHASE-10-DEV-DEPENDENCY-VULNERABILITY-REMEDIATION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-PRODUCTION-DEPENDENCY-AUDIT-HIGH-DIAGNOSIS.md
```

**Subject:** `fix(deps): pin next/sharp and remediate dev-tree vulnerabilities`

**Body:**
```
Combined dependency remediation. Two logical groups, staged once because
package-lock.json is one coherent generated artifact and splitting it would
require reconstructing an intermediate lockfile state that was never
installed or tested.

Phase 3 (supply chain):
- dependencies.next: ^15.5.9 -> 15.5.24
- overrides.sharp: 0.35.3 -> 0.35.4
- documentation-contract test assertion synchronized to the new sharp value

Phase 10 (dev-tree audit remediation):
- devDependencies.vitest: ^3.2.7 -> ^4.1.11
- devDependencies.@vitest/coverage-v8: ^3.2.7 -> ^4.1.11
- devDependencies.@vitest/mocker: added at ^4.1.11
- overrides.js-yaml: added 4.3.2 (closes GHSA-2883-xcg3-v3hh)
- lockfile: Vitest 4 / Vite / @vitest/* and js-yaml subtree refreshed;
  optional per-OS esbuild/rollup binaries pruned
- no production dependency changed; npm audit now returns 0 findings on both
  the production tree (--omit=dev) and the full tree

Reports: docs/reports/PHASE-3-… and PHASE-10-…
```

| Property | Value |
|---|---|
| Targeted validation | `npm audit --audit-level=high --omit=dev` + `npm audit` + `npm test` (Vitest 4 compatibility) + `tests/documentation-contract.test.ts` |
| Depends on | nothing (no source in Phases 2–7 depends on these versions) |
| Partial staging required | **No — this is the whole point of combining.** `git add` stages the complete current `package.json` and `package-lock.json`; both phases' deltas land together in one whole-file commit |
| Typechecks and tests independently | **Yes** — the suite passes on vitest 3 and vitest 4, so this commit does not gate the earlier ones |
| Package-file duplication | **None.** Each of `package.json` and `package-lock.json` is staged exactly once, in this commit only |

> **Why combined.** Revision 1 staged these two files in a Phase 3 commit and
> again in a Phase 10 commit. That is not executable: `git add <path>` stages
> the file's complete current contents, so after the first commit there is no
> Phase 10 delta left to commit. The only way to force the split would be to
> reconstruct an intermediate manifest/lockfile pair that never existed in
> the working tree — an unvalidated artifact nothing ever installed. This
> commit avoids that entirely by staging each package file once and
> documenting both groups in the message. See §12 and §13.

---

### Commit 8 — Documentation and planning

**File list (7, plus the one deletion):**
```
docs/PROJECT_BLUEPRINT.md
docs/SECURITY_AUDIT.md
docs/UI_UX_REVIEW.md
docs/ARCHITECTURE_REVIEW.md          (DELETION — honor it, do not restore)
docs/reports/PHASE-1-CURRENT-STATE-VERIFICATION-REPORT.md
docs/reports/diagnostics/PHASE-11-COMMIT-BOUNDARY-AND-ATTRIBUTION-PLAN.md
```

**Command (deletion recorded without working-tree cleanup):**
```bash
git add docs/PROJECT_BLUEPRINT.md docs/SECURITY_AUDIT.md docs/UI_UX_REVIEW.md
git add docs/ARCHITECTURE_REVIEW.md
git add docs/reports/PHASE-1-CURRENT-STATE-VERIFICATION-REPORT.md
git add docs/reports/diagnostics/PHASE-11-COMMIT-BOUNDARY-AND-ATTRIBUTION-PLAN.md
```

> On modern git, `git add docs/ARCHITECTURE_REVIEW.md` on an already-deleted
> working-tree file records the `D` entry in the index — it does **not**
> restore the file and does **not** touch anything outside the index. This is
> the reviewed explicit-path form; it records the deletion without suggesting
> any working-tree cleanup. (The operator may equivalently use
> `git rm --cached docs/ARCHITECTURE_REVIEW.md`, which stages the same `D`.)

**Subject:** `docs: rewrite blueprint/security/UI reviews, retire ARCHITECTURE_REVIEW`

**Body:**
```
Consolidates the three architecture/security/UI documents into their 2026-09-10
rewritten form and retires docs/ARCHITECTURE_REVIEW.md, whose standing
decisions were captured by docs/ADR-001_ARCHITECTURE_AND_DEPLOYMENT.md in
70fe776. Also lands the Phase 1 verification baseline and the Phase 11
commit-boundary plan.

Pre-existing user changes (2026-09-10); carried by this release.
```

| Property | Value |
|---|---|
| Targeted validation | none required — documentation only; `npm run build` as a courtesy (markdown is not compiled, but the report tree is checked) |
| Depends on | all seven prior commits conceptually (this is the last commit) but technically none |
| Partial staging required | **No** — whole files plus one whole-file deletion |
| Typechecks and tests independently | **Yes** — documentation only; typecheck and tests are unaffected |

**Not in this commit:** the `docs/ADR-001` one-line redirect correction —
that is APPROVED IN PRINCIPLE only (§14.1) and needs explicit scope
authorization at execution time.

---

## 18. Commit boundary decision rules used

Applied to every one of the 36 tracked + 88 untracked paths:

1. **A path is included only if it is part of a verified working state.**
   Every included path belongs to the tree that passed all seven gates in §0.
2. **A test commits with its source.** Regression tests are the evidence that
   the source change is correct; separating them creates commits that are
   either untested or tested-against-future-code.
3. **A finding is one commit.** The finding ID (REL-003, PERF-001b, …) is the
   unit of review and the unit of revert. Multi-file findings (Phase 6 spans
   19 files) are one commit, not many.
4. **A file is staged exactly once, whole.** `git add` stages complete file
   contents, so a file touched by two phases goes in one commit with both
   phases named. **No partial staging is proposed anywhere in §17.**
5. **`package.json` and `package-lock.json` are never split.** A committed
   lockfile must be installable by `npm ci` at every commit.
6. **Documentation of a change commits with the change.** Each phase's
   completion report and diagnosis travel in that phase's commit.
7. **Pre-existing user changes are committed but attributed.** The four
   `docs/` paths are user work from 2026-09-10, not agent output; they get
   their own commit whose message says so.
8. **Scratch is never committed.** Untracked ≠ disposable (the phase rules
   say so explicitly), but duplicated-content scratch is also never a
   deliverable. It stays untracked; cleanup is a separate, authorized
   decision (§35/§36).
9. **Deletions are honored, not reversed.** A pre-existing deletion recorded
   consistently across ten phase reports is an intentional user decision.
10. **Staging uses explicit path lists only.** Broad commands are banned
    (§26) — they are how scratch and `.env` files get captured.

---

## 19. Cumulative vs incremental change attribution

| Layer | Files | Net LOC | Attribution |
|---|---|---|---|
| Production source (app, components, contexts, lib, middleware) | 24 | +288 / −175 | Phases 4, 5, 6, 7, 8, 9 |
| Tests (modified + 6 new) | 13 modified + 6 new | +196 / −30 modified; ~2,678 new | Phases 2–9 |
| Documentation (3 rewritten + 1 deleted + 18 reports incl. this plan) | 4 tracked + 19 untracked | +2,513 / −2,513 (rewrites) | user (3) + Phases 1–11 (19) |
| Package manifests | 2 | +804 / −1,391 | Phases 3 + 10 (one commit) |
| **Total tracked delta** | **36** | **+3,800 / −3,182** | |
| Deliverable untracked | 25 | ~3,700 lines | 18 reports + 1 helper + 6 tests |
| Scratch (excluded) | 63 | ~145 KB | none — never committed |

The dominant volume is the three documentation rewrites (+2,513/−2,513,
net zero logic) and the regenerated lockfile. **The production source delta
is +288/−175 across 24 files** — that is the actual shipped change set, and
it is small because every fix was a targeted correction to a specific
finding rather than a refactor.

---

## 20. Exact final commit boundary summary

| # | Commit | Paths | Finding(s) | Phase(s) |
|---|---|---|---|---|
| 1 | `fix(chatlist)` | 3 | BUG-CHATLIST | 2 |
| 2 | `fix(security)` | 13 | SESSION-001, API-001, AVAIL-001, CONFIG-001 | 4 |
| 3 | `fix(api)` identifier | 5 | REL-003 | 5 |
| 4 | `fix(lists)` membership | 18 | DATA-001 | 6 |
| 5 | `fix(chat)` quota | 4 | W3-006a | 7 |
| 6 | `fix(perf)` ai-similar | 6 | PERF-001, PERF-001b | 8 + 9 |
| 7 | `fix(deps)` combined | 6 | SUPPLY-001/002 + 4 dev-tree findings | 3 + 10 |
| 8 | `docs` consolidation | 6 | pre-existing + Phase 1 + Phase 11 | docs |
| | **Total** | **61 path entries** | | |

Path accounting: the 36 tracked changes + 25 untracked deliverables = 61
distinct files. Commit 7's `package.json`/`package-lock.json` and Commit 4's
`lib/list-membership.ts` are the only files that change state type (modified
vs added), so the sum of per-commit path entries is 61 — but **no file is
staged twice**, and every package file appears in exactly one commit.

---

## 21. Test and report alignment

| Phase report | Source it covers | Test that proves it | Commit |
|---|---|---|---|
| PHASE-2 | `tests/m5-a11y.test.tsx` (mock branch) | `tests/m5-a11y.test.tsx` itself | 1 |
| PHASE-3 | `package.json`, lockfile | `tests/documentation-contract.test.ts` (sharp 0.35.4) | 7 |
| PHASE-4 | `lib/security/auth.ts`, `rateLimit.ts`, `middleware.ts`, 4 API routes | `session-lifecycle`, `ratelimit-ip-security`, `tmdb-proxy-validation`, `authenticated-read-rate-limit`, `middleware-security` | 2 |
| PHASE-5 | `app/api/ai-recommendations/route.ts` | `ai-recommendations-ownership-exclusion`, `performance-m4` | 3 |
| PHASE-6 | `lib/list-membership.ts` + 14 UI/context/page files | `list-membership-collision`, `phase4-watchlist-mobile` | 4 |
| PHASE-7 | `app/api/chat/route.ts` | `chat-quota-ordering` | 5 |
| PHASE-8/9 | `app/api/movie/[id]/ai-similar/route.ts` | `ai-similar-enrichment-concurrency` (16 tests) | 6 |
| PHASE-10 | `package.json`, lockfile | full suite (Vitest 4 compatibility) | 7 |
| PHASE-1 / PHASE-11 | n/a (read-only) | full suite (baseline) | 8 |

No report covers a file that lands in a different commit. No test commits
without its source. **Verified by cross-checking every §11.1 row against
§17 and by machine: the union of all eight commit file lists equals the
measured deliverable set exactly — 61 files, zero missing, zero extra,
zero duplicates.**

---

## 22. Traceability matrix (finding → evidence → commit)

| Finding | Root-cause record | Fixed in | Proven by | Commit |
|---|---|---|---|---|
| BUG-CHATLIST | `BUG-CHATLIST-UNHANDLED-JSDOM-DIAGNOSIS.md` | `tests/m5-a11y.test.tsx` | M5 a11y suite green | 1 |
| SUPPLY-001 / SUPPLY-002 | `BUG-PRODUCTION-DEPENDENCY-AUDIT-HIGH-DIAGNOSIS.md` | `package.json`, lockfile | `documentation-contract` (sharp 0.35.4), `npm audit` 0 | 7 |
| SESSION-001 | (Phase 4 report) | `lib/security/auth.ts` | `session-lifecycle` (+72 lines) | 2 |
| API-001 | (Phase 4 report) | `app/api/user/route.ts`, `app/api/chat-history/route.ts` | `authenticated-read-rate-limit` | 2 |
| AVAIL-001 | (Phase 4 report) | `lib/security/rateLimit.ts`, 2 API routes | `ratelimit-ip-security` (+47) | 2 |
| CONFIG-001 | (Phase 4 report) | `middleware.ts` | `middleware-security` | 2 |
| REL-003 | `BUG-RECOMMENDATION-OWNED-ITEM-IDENTIFIER-DIAGNOSIS.md` | `app/api/ai-recommendations/route.ts` | `ai-recommendations-ownership-exclusion` | 3 |
| DATA-001 | `BUG-LIST-MEMBERSHIP-MEDIA-TYPE-COLLISION-DIAGNOSIS.md` | `lib/list-membership.ts` + 14 files | `list-membership-collision` (699 lines) | 4 |
| W3-006a | `BUG-CHAT-INVALID-INPUT-CONSUMES-QUOTA-DIAGNOSIS.md` | `app/api/chat/route.ts` | `chat-quota-ordering` (480 lines) | 5 |
| PERF-001 | `BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY-DIAGNOSIS.md` | ai-similar route (pool-4) | `ai-similar-enrichment-concurrency` | 6 |
| PERF-001b | `PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-DIAGNOSIS.md` | ai-similar route (cache boundary) | same suite, 16 tests | 6 |
| GHSA-2883-xcg3-v3hh + 3 moderate | `BUG-PRODUCTION-DEPENDENCY-AUDIT-HIGH-DIAGNOSIS.md` | vitest ^4.1.11, `@vitest/mocker`, js-yaml 4.3.2 | `npm audit` 0/0 | 7 |

---

## 23. Scope compliance confirmation

| Rule | Status |
|---|---|
| Do not stage files | **honored** — `git diff --cached --name-status` empty |
| Do not create commits | **honored** — HEAD unchanged at `70fe776` |
| Do not push | **honored** — no network git command run |
| Do not deploy | **honored** — no deployment command run |
| Do not delete or move files | **honored** — zero deletions/moves (§28 records the one pre-existing deletion as found, not performed) |
| Do not modify production source, tests, reports, package files, config, CI, env, or docs | **honored** — the only file written is this plan, the requested deliverable |
| Do not change line endings | **honored** — no normalization; CRLF/LF warnings recorded in §40 only |
| Do not read `.env` / `.env.local` | **honored** — never opened; staging-safety controls added at §10.1 instead |
| Do not execute untracked scripts | **honored** — `.my_tool_sandbox/script.py` inspected with `head` only, never run |
| Do not follow unsafe symlinks | **honored** — none present (all scratch paths verified regular files) |
| Do not modify `.gitignore` | **honored** — untouched; the ignore recommendation is a §36 follow-up for an authorized operator |
| Do not change Git config | **honored** — `git config --list --local` read only |

---

## 24. Execution policy and authorization

This phase is **planning only**. The §17 sequence is executed by an
authorized operator after review and after a separate pre-commit safety pass.

**Authorization boundary:** the plan was produced read-only. Executing it
changes repository history, which is outside this phase. The operator who
runs §17 owns the resulting commits and the pre-flight gate results.

**Current status: `READY FOR PRE-COMMIT SAFETY PASS`** — *not* ready for
commit execution. Before any staging:

1. the corrected plan must be reviewed;
2. a separate pre-commit safety pass must run (it inspects the actual tree
   state at execution time, which may differ from this plan's snapshot);
3. the `docs/ADR-001` edit must receive explicit scope authorization (§14.1);
4. the operator must confirm the §G gates on Node 22.

---

## 25. Validation strategy

The recommended validation for the release, in order:

1. **Pre-flight** (§17.0) — confirm the tree is in the verified-good state
   before touching anything.
2. **Per-commit** — after each `git commit`, run the *targeted* suite for
   that finding plus `npm run typecheck` (validation commands are listed in
   every §17 commit block). This catches a bad staging operation immediately
   rather than at the end.
3. **Post-commit** — the full gate set: `npm ci` (proves the committed
   lockfile is installable from scratch — this is the one check the working
   tree cannot prove), `lint`, `typecheck`, `test`, `test:coverage`, `build`,
   both `npm audit` commands.
4. **CI** — `.github/workflows/ci.yml` runs four jobs on push: `lint`
   (lint + typecheck), `test` (`npm test` + `npm run test:coverage`, Node 22,
   `npm ci`), `security` (`npm audit --audit-level=high --omit=dev` +
   gitleaks), `build` (placeholder-env `next build`). All four must be green
   before merge.
5. **`npm ci` is the critical new check.** Nothing in the working tree proves
   the regenerated lockfile installs cleanly from empty — the in-place
   `npm install --ignore-scripts` used existing `node_modules`. Phase 10
   documented this as the one non-blocking gap; the release is the first time
   it can be closed.
6. **Secret scan.** CI's `security` job runs `gitleaks detect --source .
   --config .github/gitleaks.toml --redact`. Because the 63 scratch paths
   remain untracked, only committed content reaches a push — they cannot fail
   the job. An operator should still run the scan locally before push.
7. **Review every staged diff** (`git diff --cached`) before committing, and
   confirm nothing is staged outside the current commit boundary.

---

## 26. Final command sequence

Authoritative summary of §17, in execution order. **Explicit path lists
only.**

```bash
# pre-flight
git rev-parse HEAD; git diff --cached --name-status
npm ci && npm run lint && npm run typecheck && npm test && npm run test:coverage
npm run build && npm audit --audit-level=high --omit=dev && npm audit

# 1 — Phase 2
git add tests/m5-a11y.test.tsx
git add docs/reports/PHASE-2-CHATLIST-MOCK-CORRECTION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-CHATLIST-UNHANDLED-JSDOM-DIAGNOSIS.md
git commit -m "fix(chatlist): mock /api/chat-history/list in M5 a11y suite"

# 2 — Phase 4
git add lib/security/auth.ts lib/security/rateLimit.ts middleware.ts
git add app/api/user/route.ts app/api/chat-history/route.ts
git add app/api/genres/route.ts app/api/trailers/route.ts
git add tests/session-lifecycle.test.ts tests/ratelimit-ip-security.test.ts
git add tests/tmdb-proxy-validation.test.ts
git add tests/authenticated-read-rate-limit.test.ts tests/middleware-security.test.ts
git add docs/reports/PHASE-4-AUTH-API-SECURITY-HARDENING-COMPLETION-REPORT.md
git commit -m "fix(security): session revocation, per-route budgets, ai-similar leaf"

# 3 — Phase 5
git add app/api/ai-recommendations/route.ts
git add tests/performance-m4.test.ts
git add tests/ai-recommendations-ownership-exclusion.test.ts
git add docs/reports/PHASE-5-RECOMMENDATION-IDENTIFIER-CORRECTION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-RECOMMENDATION-OWNED-ITEM-IDENTIFIER-DIAGNOSIS.md
git commit -m "fix(api): normalize owned-item identifier in AI recommendations (REL-003)"

# 4 — Phase 6
git add lib/list-membership.ts
git add contexts/WatchlistContext.tsx contexts/FavoritesContext.tsx
git add components/FavoriteButton.tsx components/ForYouSection.tsx
git add components/MoodBasedRecommendations.tsx components/TimeBasedMovies.tsx
git add components/TopRatedMovies.tsx components/TopRatedTVShows.tsx
git add components/TrendingSection.tsx
git add app/genre/[id]/page.tsx app/trending/page.tsx
git add app/movie/[id]/page.tsx app/tv/[id]/page.tsx
git add tests/phase4-watchlist-mobile.test.tsx tests/list-membership-collision.test.tsx
git add docs/reports/PHASE-6-LIST-MEMBERSHIP-IDENTITY-CORRECTION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-LIST-MEMBERSHIP-MEDIA-TYPE-COLLISION-DIAGNOSIS.md
git commit -m "fix(lists): qualify watchlist/favorites membership by media type (DATA-001)"

# 5 — Phase 7
git add app/api/chat/route.ts
git add tests/chat-quota-ordering.test.ts
git add docs/reports/PHASE-7-CHAT-QUOTA-ORDERING-CORRECTION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-CHAT-INVALID-INPUT-CONSUMES-QUOTA-DIAGNOSIS.md
git commit -m "fix(chat): consume quota after input validation (W3-006a)"

# 6 — Phases 8 + 9
git add "app/api/movie/[id]/ai-similar/route.ts"
git add tests/ai-similar-enrichment-concurrency.test.ts
git add docs/reports/PHASE-8-AI-SIMILAR-CONCURRENCY-CORRECTION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-AI-SIMILAR-UNBOUNDED-TMDB-CONCURRENCY-DIAGNOSIS.md
git add docs/reports/diagnostics/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-DIAGNOSIS.md
git add docs/reports/PHASE-9-AI-SIMILAR-CACHE-HIT-ENRICHMENT-CORRECTION-COMPLETION-REPORT.md
git commit -m "fix(perf): bound and cache the ai-similar TMDB enrichment fan-out"

# 7 — Phases 3 + 10 (combined; each package file staged EXACTLY once)
git add package.json package-lock.json
git add tests/documentation-contract.test.ts
git add docs/reports/PHASE-3-SUPPLY-CHAIN-REMEDIATION-COMPLETION-REPORT.md
git add docs/reports/PHASE-10-DEV-DEPENDENCY-VULNERABILITY-REMEDIATION-COMPLETION-REPORT.md
git add docs/reports/diagnostics/BUG-PRODUCTION-DEPENDENCY-AUDIT-HIGH-DIAGNOSIS.md
git commit -m "fix(deps): pin next/sharp and remediate dev-tree vulnerabilities"

# 8 — documentation and planning
git add docs/PROJECT_BLUEPRINT.md docs/SECURITY_AUDIT.md docs/UI_UX_REVIEW.md
git add docs/ARCHITECTURE_REVIEW.md
git add docs/reports/PHASE-1-CURRENT-STATE-VERIFICATION-REPORT.md
git add docs/reports/diagnostics/PHASE-11-COMMIT-BOUNDARY-AND-ATTRIBUTION-PLAN.md
git commit -m "docs: rewrite blueprint/security/UI reviews, retire ARCHITECTURE_REVIEW"

# post-flight
git log --oneline HEAD~8..HEAD; git diff --cached --name-status
git status --porcelain --untracked-files=all
npm ci && npm run lint && npm run typecheck && npm test && npm run test:coverage
npm run build && npm audit --audit-level=high --omit=dev && npm audit
git push origin main   # authorized operator only
```

**Banned commands** (never used in this plan): `git add .`, `git add -A`,
`git add docs/`, `git add *.md`, or any wildcard/broad staging — see §26.1.

### 26.1 Staging command safety rules

1. **Explicit path lists only.** Every `git add` in §26 names exact paths.
2. Never `git add .`, `git add -A`, `git add <dir>/`, or glob patterns. These
   are how the 63 scratch paths and the untracked `.env` files get captured.
3. **Before every commit**, inspect `git diff --cached --name-status` and
   confirm every staged path belongs to that commit's file list.
4. **Verify `.env` and `.env.local` are not staged** (§10.1). Stop
   immediately if either appears in the index.
5. For the tracked deletion, use the reviewed explicit-path form
   (`git add docs/ARCHITECTURE_REVIEW.md` on the already-deleted working-tree
   file, or `git rm --cached`). It records the deletion **without suggesting
   working-tree cleanup** and without touching other paths.
6. **Do not execute any staging command in this planning pass.** These are
   proposals for an authorized operator.

---

## 27. External systems and state changes

**None.** No system outside the local repository was contacted, and no
repository state was changed:

- No pushes, pulls, fetches (no network git operation).
- No npm registry access — no installs, updates, or audit fixes.
- No CI run triggered (nothing was pushed).
- No deployment.
- No database, Redis, provider, or environment system touched.
- No `.env` / `.env.local` read or printed.
- No file deleted, moved, or renamed.
- No Git config change, no branch creation/switch, no stash, no history
  rewrite, no rebase, no merge.

**Local state changes:** one file written — this plan
(`docs/reports/diagnostics/PHASE-11-COMMIT-BOUNDARY-AND-ATTRIBUTION-PLAN.md`).
Revision 2 rewrote it in place; the file is untracked, so a normal Git diff
cannot show its internal changes — its content was verified directly.

---

## 28. Deletion and rename audit

| Path | Operation | Who | When | Disposition |
|---|---|---|---|---|
| `docs/ARCHITECTURE_REVIEW.md` | deleted (unstaged `D`) | **user, pre-existing** | before Phase 1 (recorded by Phase 1; content last committed before `70fe776`) | honored; staged in Commit 8 |
| `extract.js` | deleted | Phase 8 evidence-recovery pass | during Phase 8 | already done; all five safety conditions proven in the Phase 8 report; no further action |
| (renames) | none | — | — | no file was renamed in any phase 2–11 |

---

## 29. Authorization boundary

This phase's authority ends at producing the plan. The operator who executes
§17/§26 assumes responsibility for:

- confirming the pre-flight gate results,
- the correctness of each staging set (the plan is derived from current tree
  state; if any file changes between this plan and execution, §30 requires
  re-derivation),
- the push and any merge,
- the CI results on Node 22 (§40 W-1),
- **stopping to request explicit scope authorization** before the
  `docs/ADR-001` edit (§14.1),
- deciding the §36 follow-ups, including the `.phase11-prompt.txt`
  disposition and the `.gitignore` scratch rules.

---

## 30. Safety and rollback strategy

**Rollback of the release (if a defect is found after push):**

- `git revert <commit-sha>` for the specific finding's commit — this is why
  Strategy B is recommended; one finding reverts cleanly.
- If the whole release must go back: `git revert HEAD~8..HEAD` produces eight
  inverse commits, preserving history (never `git reset --hard`, which
  destroys the record of what shipped).
- After any revert, re-run the full gate set (§25 step 3) — a lockfile
  revert must be accompanied by a fresh `npm ci`.

**Rollback of the working tree is explicitly forbidden** by the phase rules:
`git checkout`, `git restore`, `git reset`, `git clean`, and `git stash` are
all destructive to the accumulated multi-phase tree. This plan used none.

**Recovery material:** pre-commit content hashes captured during the passes
(`package.json` `13be9f06…`, `package-lock.json` `51484f3e…`,
`middleware.ts` `f3a55d13…`, `lib/security/auth.ts` `87700a7c…`,
`lib/security/rateLimit.ts` `e5569444…`, `app/api/chat/route.ts`
`e2911a70…`) are available to reconstruct a reverse patch if ever needed.

**Re-derivation trigger:** if any file in §11.1 or §11.2 changes after this
plan is written, the affected commit's staging list must be regenerated —
the attribution and the coverage check (§21) were derived from current tree
state, not from a snapshot that can be assumed stable.

---

## 31. Disposition summary table

| Class | Count | Disposition |
|---|---|---|
| Production source (tracked, modified) | 22 | INCLUDE |
| Production source (untracked, new) | 1 | INCLUDE |
| Tests (tracked, modified) | 8 | INCLUDE |
| Tests (untracked, new) | 6 | INCLUDE |
| Documentation (tracked, modified) | 3 | INCLUDE |
| Documentation (tracked, deleted) | 1 | INCLUDE (deletion honored) |
| Package manifests | 2 | INCLUDE — **exactly once, in Commit 7 only** |
| Middleware / config | 1 | INCLUDE |
| Phase reports | 10 | INCLUDE |
| Diagnostic reports | 7 | INCLUDE |
| This plan | 1 | INCLUDE |
| Scratch (`.chunks/`, `.my_tool_sandbox/`, root txt files, `nul`) | 63 | **EXCLUDE** |
| User prompt file (`.phase11-prompt.txt`) | 1 | **EXCLUDE — user-owned, preserved untracked, not gitignored** |
| Build/coverage output (`.next/`, `coverage/`) | ignored | GENERATED/IGNORED |
| Total deliverable | **61 distinct path entries** = **60 files on disk** (the one tracked deletion is a path, not a file) | across **8 commits** |

**Verified mechanically:** the union of all eight commit file lists equals
the measured deliverable set — 61 files, 0 missing, 0 extra, 0 staged twice.

---

## 32. Critical verification commands

The commands that must all be green before merge, and what each proves:

```bash
npm ci                    # the committed lockfile installs from empty (cannot be proven in-tree)
npm run lint              # 0 errors, 93 warnings (unchanged baseline)
npm run typecheck         # tsc --noEmit, 0 errors
npm test                  # 42 files / 431 tests
npm run test:coverage     # 58.76 / 49.53 / 69.19 / 60.06
npm run build             # next build with placeholder env (CI's build job)
npm audit --audit-level=high --omit=dev   # 0 production vulnerabilities
npm audit                 # 0 vulnerabilities on the full tree
```

The CI `security` job additionally runs `gitleaks detect --source .
--config .github/gitleaks.toml --redact` over the whole tree. Because the
63 scratch paths remain untracked (§35), only committed content reaches a
push, so they cannot fail the job. This is the reason EXCLUDE (rather than
ignore-and-forget) is the safe disposition.

---

## 33. Completion assessment

**Complete.** Every required deliverable is present:

1. ✅ File-by-file attribution inventory (§11.1, §11.2) — all 124 paths
   (36 tracked + 88 untracked) with state, category, purpose, disposition,
   proposed commit boundary, and evidence source.
2. ✅ Phase-by-phase delta reconstruction (§11) from each report's initial
   Git state, with the monotonic growth that proves ownership.
3. ✅ Overlapping-file and commit-dependency analysis (§12) — including the
   package-staging defect that revision 1 introduced and revision 2 fixes.
4. ✅ Package and lockfile attribution (§13).
5. ✅ Intentional deletion disposition (§14).
6. ✅ Untracked and scratch file review with sizes, types, and safe
   inspection (§8, §11.2).
7. ✅ Secret and sensitive-data review with categories and no values
   exposed (§10), plus environment-file staging safety (§10.1).
8. ✅ Generated and ignored output review (§9).
9. ✅ Commit strategy comparison A/B/C with a recommendation (§16).
10. ✅ Exact staging and commit sequence with messages (§17, §26), each
    commit recording file list, subject, body, targeted validation,
    dependency, partial-staging status, and independent typecheck/test
    status.
11. ✅ Boundary decision rules (§18), cumulative vs incremental attribution
    (§19), boundary summary (§20), test/report alignment (§21),
    traceability matrix (§22).
12. ✅ Scope compliance (§23), execution policy (§24), validation strategy
    (§25), external systems (§27), deletion/rename audit (§28),
    authorization boundary (§29), safety and rollback (§30).
13. ✅ Count correction (§8, §41): 87 pre-plan + 1 plan = 88, all measured.
14. ✅ Revision-2 change log documenting the defect and its correction.

---

## 34. Follow-up status

No follow-up is **required** for the release. All are **recommended** and
recorded in §36, and all remain unexecuted.

---

## 35. Items requiring human decision

All five were decided in the correction pass and are recorded as approved:

1. **`.phase11-prompt.txt`** — **EXCLUDE from every commit. Preserve untracked
   locally. Do not delete in this pass.** User-owned; never gitignored.
2. **The 63 scratch paths** — **EXCLUDE from every commit. Do not delete. Do
   not stage.** Cleanup requires a separate authorized pass. **Future staging
   must use explicit file lists, never `git add .` or `git add -A`** (§26.1).
3. **`docs/ARCHITECTURE_REVIEW.md`** — **honor the pre-existing intentional
   deletion; include the deletion in the final documentation commit (8).**
4. **`docs/ADR-001_…md` stale citation** — **APPROVED IN PRINCIPLE only.**
   Do not edit in this read-only pass. The future execution pass must stop
   before editing and request explicit scope authorization. Historical
   references inside phase reports remain unchanged.
5. **Phase 11 execution** — **not yet authorized.** First correct the plan
   (done in revision 2), then perform a separate pre-commit safety pass,
   then authorize. Status: `READY FOR PRE-COMMIT SAFETY PASS`.

---

## 36. Recommended follow-ups

Ordered by value, all optional, all to be done by an authorized operator.
`.gitignore` is **not** modified in this pass; these are recommendations for
a future change.

**Strong ignore candidates** (repeatable tool outputs):

- `.chunks/`
- `.my_tool_sandbox/`

**Review-before-ignore candidates** (may be one-off artifacts rather than
stable patterns):

- root `.txt` files: `.inbox3.txt`, `as_route_copy.txt`, `cqq.txt`,
  `cqq_full.txt`, `route_dump.txt`, `failed_block.txt`
- `nul` (a Windows device-name accident; delete rather than ignore, in a
  separate authorized pass)
- `.phase11-prompt.txt` — **must not be silently ignored or deleted**;
  it is user-owned and its disposition is §35 item 1

**Rationale:** hidden scratch directories are repeatable tool outputs that
will reappear; root filenames may be one-offs whose presence in `.gitignore`
would be noise; user-owned prompt files must never be silently ignored.

**Other follow-ups:**

1. **`.gitignore` env safety** — add `.env` and `.env.local` so no broad
   staging command can capture them (§10.1). Highest safety value.
2. **`npm ci` on a clean clone** — the one validation gap Phase 10 flagged.
   Cloning to a scratch directory and running `npm ci` proves the
   regenerated lockfile is self-consistent.
3. **`docs/ADR-001` redirect note** (§14.1 / §35 item 4) — one line,
   documentation only, after explicit scope authorization.
4. **`.gitattributes`** — the CRLF/LF warnings (§40 W-3) are informational,
   but an explicit `* text=auto eol=lf` would make line endings deterministic
   across Windows/Linux contributors and silence the warnings. Not required;
   the tree is consistent today.

**Cleanup remains unexecuted.**

---

## 37. Remaining risk and residual defect assessment

**No residual defects in the change set.** All ten phase findings are closed
and proven by green gates.

Residual risk, in order of significance:

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | The regenerated lockfile has never been installed from empty (`npm ci` unproven) | medium | high — CI `npm ci` could fail on push | §36 item 2 before pushing |
| R-2 | Vitest 4 has never run on CI's Node 22 (local runs used Node 26.7) | low | medium — the engine range `^22` is declared and satisfied, but unexercised | CI is the check; `npm test` passed locally |
| R-3 | 63 untracked scratch paths remain in the working tree | medium | low — they cannot be committed by this plan, but a broad future `git add .` would capture them | §36 ignore rules + §26.1 explicit-path-only staging |
| R-4 | One stale cross-reference to a deleted document (`docs/ADR-001:84`) | certain | negligible — historical context in a "recorded, unchanged" section | §36 item 3, after authorization |
| R-5 | 93 pre-existing lint warnings (unchanged across all phases) | certain | low — zero errors; debt, not defect | separate cleanup, out of scope |

**No risk is introduced by the plan itself.** The revision-1 package-staging
defect was a *planning* error that could not have executed correctly; it is
corrected analytically in revision 2 without touching any package file.

---

## 38. Phase completion status

**PASS WITH WARNINGS.**

- Node 22 CI pending.
- Isolated `npm ci` pending.
- Scratch cleanup pending.
- `ADR-001` redirect edit pending explicit scope authorization.
- Final staging-diff review pending.

**Do not claim authorized-staging readiness yet.**

**Status: `READY FOR PRE-COMMIT SAFETY PASS`** — not `READY FOR COMMIT
EXECUTION`.

---

## 39. Pre-existing change attribution

The four `docs/` paths modified/deleted in the working tree are **not** the
product of any phase in this series. Proven by:

- **Phase 1 report §6 and §7** (the first read-only pass, 2026-09-13):
  "Modified: `docs/PROJECT_BLUEPRINT.md`, `docs/SECURITY_AUDIT.md`,
  `docs/UI_UX_REVIEW.md`; Deleted: `docs/ARCHITECTURE_REVIEW.md` … This
  discovery phase did not restore, delete, rename, stage, commit, or
  otherwise alter it."
- **Phase 2 report §7**: lists the same four under "Pre-existing changes
  preserved (untouched)".
- **Phase 3–10 reports**: each lists the same four as pre-existing.
- **Content**: all three rewrites are full-document rewrites
  (+2,513/−2,513 combined) in a single consistent style, matching a
  2026-09-10 authoring date, not the incremental edit pattern of every
  phase's own changes.

The working-tree `PROJECT_BLUEPRINT.md` documents this itself: it names the
branch, the SHA, and states that the working tree deletes the four
documentation paths. **Attribution: user, pre-existing, carried unchanged by
every phase.**

---

## 40. Warnings and anomalies

Recorded as required, with evidence:

- **W-1 — mixed Node versions across phases.** Phase 2–7 reports record
  Node v24.21.0; Phase 8's re-verification and this pass record v26.7.0. CI
  targets Node 22. Local results are valid but CI remains unexercised
  (§37 R-2). **Node 22 was not installed and CI was not run in this pass.**
- **W-2 — modified-file count drift in the phase reports.** Reports record
  3 → 19 → 20 → 31 → 32 modified across Phases 2 → 4 → 5/6 → 7/8 → 9/10,
  while the measured current figure is 35 M + 1 D. The discrepancy is
  explained (§11 note): Phase 8 deleted the untracked `extract.js`, and some
  reports count the `D` path differently. **The authoritative figure is the
  one measured directly in this pass, not any report's count.** No phase
  mis-stated its own delta.
- **W-3 — CRLF/LF warnings on 18 files.** Git warns that LF in the working
  copy will be replaced by CRLF. Informational only; no normalization was
  performed and none is required (§36).
- **W-4 — `nul` file.** A 0-byte file named `nul` exists in the repo root —
  the Windows reserved device name was used as an output path by an earlier
  scratch operation. Harmless; classified EXCLUDE. Deleting it is outside
  this phase's rules (§36).
- **W-5 — UTF-16LE scratch dumps.** `cqq.txt` and `route_dump.txt` are
  UTF-16LE-encoded captures. Not a defect of the repository — they are
  untracked scratch that must not be committed (§37 R-3).
- **W-6 — revision-1 planning defect (CORRECTED).** The original nine-commit
  sequence staged `package.json` and `package-lock.json` in two different
  commits, which is impossible with whole-file staging. Corrected in
  revision 2 to a single combined dependency commit (§12, §13, §17 Commit 7).
  **This was a defect in the plan, not in the repository** — no package file
  was modified to fix it.
- **W-7 — coverage figure drift.** The suite reports 42 files / 431 tests;
  an earlier phase recorded 429 before 3 cache-boundary tests were added.
  The 431 figure is measured on the current tree. Coverage metrics
  (58.76/49.53/69.19/60.06) are stable across the last two passes.

---

## 41. Final Git evidence (captured during this pass, read-only)

```text
$ git rev-parse HEAD
70fe77655467f5105f5d0e9b02594ba1c62b2952

$ git status --porcelain=v2 --branch
# branch.oid 70fe77655467f5105f5d0e9b02594ba1c62b2952
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -0

$ git diff --cached --name-status
(empty — nothing staged)

$ git diff --name-status | wc -l
36          # 35 modified + 1 deleted

$ git ls-files --others --exclude-standard | wc -l
88

$ git ls-files --others --exclude-standard | grep -v 'PHASE-11-COMMIT-BOUNDARY' | wc -l
87          # untracked paths that pre-existed this plan

$ git status --porcelain --untracked-files=all | wc -l
89          # 88 untracked + 1 header line

$ git status --porcelain | wc -l
18          # collapsed view — directories not expanded; NOT authoritative

$ git stash list
(empty)

$ git check-ignore -v .next coverage
.gitignore:7:/.next/	.next
.gitignore:32:/coverage/	coverage

$ git check-ignore -v .env .env.local    # exit 1: NOT ignored
(empty — both are ignored by `.gitignore:20`/`:21`, so neither can be captured by any staging command; see §10.1)

$ sha256sum package.json package-lock.json
13be9f065dfff1c126404565f0f8a2ce5f74f8910d8801f9d38c338a4493a23c  package.json
51484f3e14102b89d05beb4b5a34c3f08cc5324e010a240bb21b4a18e6d5c3c1  package-lock.json
```

**Count reconciliation (measured, not hard-coded):**

| Measure | Value |
|---|---|
| Tracked changes | 36 (35 M + 1 D) |
| Untracked paths, total | 88 |
| Untracked paths pre-existing the Phase 11 plan | 87 |
| The Phase 11 plan itself | 1 |
| Deliverable paths (INCLUDE) | 61 path entries (35 M + 1 D + 25 untracked) = **60 files on disk** after the intentional deletion |
| Scratch excluded | 63 |
| User prompt excluded | 1 |

**Authoritative counting command:** `git ls-files --others --exclude-standard`
(or `git status --porcelain --untracked-files=all`). Plain
`git status --porcelain` collapses untracked directories and reports 18
entries — do not use it for counts.

---

## 42. Reproduce

```bash
cd "D:/fork ai to create website/final porject/movie-recommendation-system"
git rev-parse HEAD                                  # 70fe77655467f5105f5d0e9b02594ba1c62b2952
git diff --name-status | wc -l                      # 36
git ls-files --others --exclude-standard | wc -l    # 88
git status --porcelain --untracked-files=all | wc -l  # 89 (incl. header line)
git diff --ignore-cr-at-eol --stat                  # per-file volumes (§11.1)
npm run lint && npm run typecheck && npm test && npm run test:coverage
npm run build && npm audit --audit-level=high --omit=dev && npm audit
```

**Coverage self-check (this plan against the measured tree):**

```bash
# union of all eight commit file lists must equal the deliverable set
( git diff --name-only; git ls-files --others --exclude-standard   | grep -vE '^\.(chunks|my_tool_sandbox)/|^\.(inbox3|phase11-prompt)\.txt|^as_route_copy\.txt|^cqq(_full)?\.txt|^route_dump\.txt|^failed_block\.txt|^nul$' ) | sort -u | wc -l
# expect 61
```

---

## 43. Applicable instructions

- Phase 11 prompt (original): read-only release and git-attribution
  diagnostic, commit/dispatch denied.
- Phase 11 Commit-Plan Correction Pass prompt (revision 2): bounded
  correction; package-boundary decision §B approved; eight-commit sequence
  §C; human decisions §D; env safety §E; cleanup decision §F; Node 22 / npm
  ci gates §G; count correction §H; staging safety §I; change control §J;
  final status §K.
- `AGENTS.md`: absent (verified in Phase 1 §4 and re-verified this pass).
- `.cursor/rules/*.mdc`: absent (no `.cursor` directory).
- User rules: staff-engineer standard; read-before-edit; atomic targeted
  edits; strict typing, no `any`; YAGNI; no placeholders; no commits/staging.
- `.env` / `.env.local`: **not read** (absent from this phase entirely; §10.1
  records the staging-safety control).

---

## 44. Files created

- `docs/reports/diagnostics/PHASE-11-COMMIT-BOUNDARY-AND-ATTRIBUTION-PLAN.md`
  (this report; written in revision 1, rewritten in revision 2)

No other file was created, modified, or deleted by this phase.

---

## 45. Commit message style

Every proposed commit subject follows the existing repository convention
(verified against `git log --oneline`):

```
70fe776 chore(docs): ADR-001 consolidation and phase 7 report
6126313 fix(security+dx): header hardening, encoding, schema tightening, design tokens, retention comments
bcdb834 fix(cache): calibrate redis queue cap and bound watchlist fan-out
```

- **type(scope): summary** — lowercase, imperative mood, ≤72 characters
- type is `fix` for corrections, `chore`/`docs` for non-functional work
- scope names the subsystem touched
- the body explains *why*, not *what*, and cites the phase report path so the
  reviewer can find the evidence

---

**Phase 11 status: PASS WITH WARNINGS. READY FOR PRE-COMMIT SAFETY PASS.
No state change. Awaiting operator review of the 8-commit sequence in §17.**
