# Phase 22: Production Readiness Cold-Start Correction

- Phase: 22 (bounded Production MongoDB readiness diagnosis and correction)
- Working branch at authoring: fix/phase-22-readiness-cold-start
- Base revision: origin/main at 840478a
- Date: 2026-11-06
- Diagnosis report: docs/reports/diagnostics/BUG-PRODUCTION-READINESS-MONGOOSE-COLD-START-DIAGNOSIS.md
- Engines measured in this pass: Node v24.21.0, npm 11.5.2, Vitest 4.1.12,
  Mongoose 8.24.8
- Local status: implementation verified locally (section 15).
- Evidence boundary: implementation and local validation only; the release
  chain runs after this commit and its evidence is reported in the session's
  final evidence report (section 12).
- Follow-up amendment (owner-approved): DB_PROBE_TIMEOUT_MS was raised from
  3000 ms to 8000 ms (corrected-route line 42); the route gained 2 comment
  lines (168 to 170), so add 2 to every corrected-route line above 40 quoted
  in this document. Budget values and corrected-route line references below
  are frozen at implementation commit 76e882f; its post-release verification
  is reported in the session release report (section 12 policy).

## 1. Objective

Make GET /api/health/ready report the database accurately on a serverless
cold start: attempt a real, time-bounded connection through the project's
existing shared helper before declaring the database disconnected; return
HTTP 200 with status ready when the probe succeeds; return HTTP 503 only
after a real failure or a bounded timeout - never merely because a fresh
instance had not connected yet.

## 2. Scope

In scope:
- app/api/health/ready/route.ts: bounded connect-and-ping readiness probe.
- tests/readiness-cold-start.test.ts: new focused reproduction suite.
- tests/operational-security.test.ts: readiness contract hardening.
- the two reports named in the metadata block.

Out of scope, unchanged by this phase: MongoDB Atlas, MONGODB_URI, Vercel
environment variables, Vercel deployment settings, database roles,
credentials, AI-provider behaviour, /api/health/live, lib/mongodb.ts, Redis
behaviour, and CI configuration.

## 3. Acceptance criteria and outcomes

| Criterion | Outcome | Evidence |
| --- | --- | --- |
| Cold start with readyState 0 and a healthy helper returns 200 ready | met | focused test 1; operational-security cold-start test |
| Successful bounded connection returns the exact readiness JSON | met | focused test 2 |
| Failed connection returns 503 degraded with no secret leakage | met | focused test 3; body asserted free of driver text |
| Connection timeout is bounded and never hangs | met | focused tests 4 and 9; deadlines measured with fake timers |
| Existing ready connection is not connected a second time | met | focused test 5 |
| Concurrent probes reuse one in-flight promise | met | focused test 6 (exactly one connect call) |
| Redis optional behaviour unchanged | met | focused test 7; route line 101 |
| Config-invalid behaviour unchanged | met | focused test 8; config gate lines 105-130 |
| Typecheck, lint, full suite, coverage, build, audits, policy and diff check clean | met | section 9 |
| Change set introduces no secret findings | met | section 10 targeted scans exit 0 |
| Scope limited to readiness route, focused tests and two reports | met | section 11; no scope change proposal needed |

## 4. Decision log

Decision 1: reuse lib/mongodb.ts through a lazy import.
Context: the helper owns the single Mongoose instance and a globalThis
connection and promise cache; readiness must not create a second instance.
Alternatives considered: (a) eager top-level import, which would evaluate the
helper's MONGODB_URI check at module load before the config gate; (b) an
inline mongoose.connect in the route, risking a second connection path and
duplicated cache logic; (c) reading readyState only, the confirmed defect.
Reason: the lazy import reaches the shared cache exactly when needed, after
the config gate, and warm instances short-circuit.
Tradeoff: one dynamic import on the cold path, negligible cost.
Validation: focused tests 1, 5 and 6.

Decision 2: one total probe budget of 3000 ms, with ping capped at
min(remaining, 2000 ms).
Context: the brief prefers a 2-3 second bounded readiness timeout, and
connect plus ping must together never exceed it.
Alternatives considered: two independent timers, under which connect and ping
could sum beyond the intended bound; a connect-only probe, which proves
reachability but not liveness; a 2000 ms total, tighter than the brief's
preference and leaving less room for a cold connect.
Reason: a single deadline makes the bound arithmetic provable: connect is
capped by remaining time and ping by min(remaining, 2000).
Tradeoff: worst-case cold readiness latency of 3000 ms.
Validation: focused tests 4, 9 and 12; fake-timer assertions on settle times.
Amendment (owner-approved follow-up): based on post-release session evidence
(reported in the session release report, not persisted here per section 12
policy), DB_PROBE_TIMEOUT_MS was raised from 3000 ms to 8000 ms. The
single-deadline arithmetic and the min(remaining, 2000 ms) ping cap are
unchanged; the worst-case cold readiness latency is now 8000 ms.

Decision 3: share concurrent readiness work with a deferred promise, and pin
the budget-exhausted guard with a ping-not-called assertion.
Context: concurrent GETs on one instance must not start duplicate probes, and
a guard test must not pass for the wrong reason.
Alternatives considered: storing connection state on the module, which would
recreate the state this phase fixes; omitting the discriminator, under which
test 12 could pass via a different failure branch.
Reason: a promise is sufficient for sharing and carries no state; the
discriminator pins the exact fail-closed branch.
Validation: focused tests 6 and 12.

## 5. Implementation

app/api/health/ready/route.ts (37 insertions, 6 deletions; 137 to 168 lines
at the frozen implementation commit; 170 lines after the owner-approved
follow-up):

- Header contract comment updated for the cold-start connect and both
  budgets (lines 7-32).
- DB_PROBE_TIMEOUT_MS added as the whole-probe budget (3000 ms, line 40, at
  the frozen implementation commit; 8000 ms, line 42, after the owner-approved
  follow-up), alongside the existing 2000 ms ping cap (line 35).
- probeDatabase (lines 58-94) now computes one deadline (59); on readyState
  not 1 lazily imports and calls the shared helper inside withTimeout bounded
  by the remaining budget (62-73); re-checks readyState (76-78), the db
  handle (79-82) and remaining time (83-86); pings with min(remaining,
  2000 ms) (88); catches everything and returns false (90-93).
- GET (lines 96-168): config gate, probe invocation, generic response body
  and generic operational event keep their existing contract.

tests/readiness-cold-start.test.ts (new, 416 lines, 12 tests; inventory in
section 7). The shared helper is deliberately not mocked in this file; only
the mongoose driver layer and timers are controlled, so the helper's cache
and dedup behaviour are the contract under test.

tests/operational-security.test.ts (43 insertions, 1 deletion): the existing
vi.mock for @/lib/mongodb now exposes a controlled failure flag plus a mock
connect that sets the fake readyState on success and throws on failure; the
readyState-failure test was rewritten to exercise the attempt path, and a
new test covers the cold-start success path. Net test-count effect: one test
replaced and two added (section 7).

## 6. TDD cycle record

Engine: Vitest 4.1.12 under Node v24.21.0; injected driver fake, fake timers,
deferred-promise barriers; no real network, no real Atlas connection, no
arbitrary sleeps.

RED. The focused test file was authored first. Two initial fake-timer
assertions were corrected because this runner anchors fake time at the real
clock rather than zero, then the suite was re-run to a clean RED (session
transcript message 73949):

    x 1. a fresh instance (readyState 0) does not declare a healthy database disconnected 27ms
    x 2. a successful bounded connection returns the exact production readiness JSON 3ms
    x 3. a failed connection returns 503 degraded and leaks no connection detail 2ms
    x 4. a connection that never settles yields a bounded 503 and never hangs 6ms
    x 6. concurrent probes share the helper in-flight promise (no connection storm) 3ms
    x 7. Redis stays optional and never downgrades a ready database 2ms
    -- Failed Tests 6 --
    AssertionError: expected +0 to be 1 // Object.is equality
    AssertionError: expected 503 to be 200 // Object.is equality
    AssertionError: expected +0 to be 1 // Object.is equality
    AssertionError: expected +0 to be 1 // Object.is equality
    AssertionError: expected +0 to be 1 // Object.is equality
    AssertionError: expected 503 to be 200 // Object.is equality
     Test Files  1 failed (1)
          Tests  6 failed | 3 passed (9)

GREEN. The route change landed as a single patch (session transcript message
73952) and the same file reported (message 73955):

     Test Files  1 passed (1)
          Tests  9 passed (9)
    EXIT=0

Coverage pass. Measurement showed three route branches with zero hits: a
helper that resolves while readyState stays 0, a connected driver with no db
handle, and a budget exhausted before ping. Three contract tests (10, 11, 12)
were added rather than leaving those fail-closed guards unproven; test 12
asserts ping is never called. The final dedicated run reports:

     Test Files  1 passed (1)
          Tests  12 passed (12)
    EXIT=0

No production code changed after the GREEN step.

## 7. Test inventory

tests/readiness-cold-start.test.ts (416 lines):

| # | Line | Scenario |
| --- | --- | --- |
| 1 | 172 | fresh instance, readyState 0, healthy helper: connects and returns 200 |
| 2 | 187 | exact production readiness JSON contract |
| 3 | 203 | failed connect: 503 degraded, no connection detail in the body |
| 4 | 227 | helper promise that never settles: bounded 503 within 3000 ms |
| 5 | 256 | readyState 1: helper is not called (no second connection) |
| 6 | 270 | concurrent probes: one in-flight helper promise, one connect call |
| 7 | 291 | Redis failure never downgrades a ready database |
| 8 | 310 | invalid core config: 503 unavailable, database untouched |
| 9 | 330 | hanging ping: bounded by the 2000 ms shallow-ping cap |
| 10 | 355 | helper resolves but readyState stays 0: disconnected |
| 11 | 373 | connected driver with a null db handle: disconnected |
| 12 | 389 | wall clock passes the budget before ping: fail closed, ping not called |

tests/operational-security.test.ts readiness coverage:

| Line | Test |
| --- | --- |
| 195 | ready returns 200 with valid core config and generic components |
| 210 | ready returns 503 degraded when the database ping fails |
| 230 | ready returns 503 degraded when the connection attempt fails |
| 248 | ready returns 200 after connecting when mongoose starts disconnected |
| 263 | ready returns 503 when required configuration is invalid |

## 8. Serverless-safe properties

- One Mongoose instance, reused through the shared helper; no second
  MongoClient and no second Mongoose copy.
- Warm instance: cached-connection short-circuit, then a ping capped at
  2000 ms.
- Cold instance: one bounded connect attempt, then ping; total at most
  8000 ms after the owner-approved follow-up (3000 ms at the frozen
  implementation commit).
- Concurrent probes on one instance: one deferred promise.
- Failure or timeout: 503 degraded with a body carrying no URI, host,
  credential, database name or driver text.
- /api/health/live untouched and free of external checks.

## 9. Validation gates

All commands ran from the repository root on
fix/phase-22-readiness-cold-start after the final source and test edits; the
only later writes were the two documentation files in this change set, which
the production build does not compile.

| # | Gate | Command | Result |
| --- | --- | --- | --- |
| 1 | Focused readiness suite | node node_modules/vitest/vitest.mjs run tests/readiness-cold-start.test.ts | 12 passed, exit 0 |
| 2 | MongoDB connection tests plus focused suite | vitest over the 25 files that vi.mock @/lib/mongodb plus the focused file | 26 files / 297 tests, exit 0 |
| 3 | Typecheck | npx tsc --noEmit | exit 0 |
| 4 | Lint | npx eslint . | 0 errors, 93 warnings, exit 0 (measured baseline) |
| 5 | Full suite | node node_modules/vitest/vitest.mjs run | 48 files / 592 tests, exit 0 |
| 6 | Coverage | vitest run --coverage at base and final | all four metrics improved (section 10) |
| 7 | Production build | npm run build | exit 0 |
| 8 | Raw audits | npm audit --omit=dev --json; npm audit --json | 0 vulnerabilities each, exit 0 |
| 9 | Live audit policy | node scripts/audit-policy.mjs | exit 0, both scopes accepted (CLEAN_AUDIT) |
| 10 | Diff integrity | git diff --check | exit 0 (CRLF advisory only) |
| 11 | Secret scan | gitleaks v8.18.4 targeted and CI-exact | change-set scans exit 0; CI-exact full-history scan exits 1 on 7 pre-existing findings (section 10) |

## 10. Coverage and secret scan

Coverage (v8, over the repository's configured include set):

| Measurement | Test files | Tests | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- | --- | --- |
| Base 840478a | 47 | 579 | 60.00 | 50.81 | 71.30 | 61.16 |
| Final change set | 48 | 592 | 60.26 | 51.05 | 71.74 | 61.38 |

The readiness route moved from 26/28 statements, 19/20 branch paths and 6/7
functions to 36/36 statements, 24/24 branch paths and 7/7 functions. Full
classification of the pre-existing secret-scan findings (seven
generic-api-key history hits, three current-tip placeholder false positives,
none in this change set) is in the diagnosis report section 11; the targeted
change-set scans exit 0.

## 11. Change control

Five files (three source and test, two reports); measured deltas:

| File | Delta |
| --- | --- |
| app/api/health/ready/route.ts | 37 insertions, 6 deletions; 137 to 168 lines |
| tests/readiness-cold-start.test.ts | new file; 416 lines; 12 tests |
| tests/operational-security.test.ts | 43 insertions, 1 deletion |
| docs/reports/diagnostics/BUG-PRODUCTION-READINESS-MONGOOSE-COLD-START-DIAGNOSIS.md | new file |
| docs/reports/PHASE-22-PRODUCTION-READINESS-COLD-START-CORRECTION-REPORT.md | new file |

No other production file was needed, so no scope change proposal was raised
(section I of the brief). No dependency, schema, public API or deployment
configuration changed.

## 12. Release control status

This document is committed as part of the bounded implementation commit. The
steps that follow it - push to the dedicated branch, pull request, Vercel
Preview build, merge commit, automatic production deployment, and three
production /api/health/ready probes - run after the commit, and their
evidence is delivered in the session's final evidence report. This document
makes no production claim, so it cannot become stale when those steps
complete. If production evidence is later persisted in the repository it
will be written as a separate document in a separate commit, never by
amending this one.

## 13. Non-mutation attestations

| Protected surface | Status | Evidence |
| --- | --- | --- |
| MongoDB Atlas (cluster, users, roles) | not modified | no Atlas management or database command executed in this session |
| MONGODB_URI | not modified | no environment file written; lib/mongodb.ts unmodified |
| Vercel environment variables | not modified | no Vercel environment command executed |
| Vercel deployment settings | not modified | no Vercel settings command executed |
| Database roles and credentials | not modified | no role or credential command executed; no rotation |
| AI-provider behaviour | not modified | no AI route or provider file in the change set |
| Repository history | not rewritten | no rebase, reset, amend of prior commits, or force push |

## 14. Residual risks

- Production outcome is not verified by this document (section 12).
- The connection cache is per JavaScript runtime; each cold instance connects
  itself within budget and no cross-instance connection is expected.
- lib/mongodb.ts (unchanged) logs the raw driver error object to the process
  console on connection failure; readiness responses stay clean, but Vercel
  logs from the helper may carry driver detail. Changing it would require
  editing another production file and is recorded as an observation in the
  diagnosis report section 14. The owner has requested a separate Scope
  Change Proposal for its sanitization; it is not part of this change set.
- Pre-existing CI red and gitleaks history findings are observed,
  classified and left untouched as out of scope (diagnosis report sections
  11 and 14).
- The 3000 ms budget (Decision 2) was raised to 8000 ms in the owner-approved
  follow-up; its post-release verification is in the session release report,
  not this document (section 12 policy).
- Cold-handshake duration percentiles remain unmeasurable on the current
  Vercel plan (duration metrics are plan-gated), so 8000 ms is an
  outcome-derived choice that should be re-evaluated if measurements become
  available.

## 15. Verdict

    PHASE_22_VERDICT=IMPLEMENTATION_VERIFIED_LOCALLY
