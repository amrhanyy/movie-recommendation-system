# BUG: Production Readiness Reports MongoDB Disconnected on Serverless Cold Starts

- Report type: bounded production readiness diagnosis (section G of the brief)
- Repository: movie-recommendation-system
- Working branch at authoring: fix/phase-22-readiness-cold-start
- Base revision: origin/main at 840478a (merge of pull request 18)
- Date of diagnosis: 2026-11-06
- Companion report: docs/reports/PHASE-22-PRODUCTION-READINESS-COLD-START-CORRECTION-REPORT.md
- Evidence boundary: this document covers diagnosis, reproduction, and the
  locally verified correction. It makes no claim about production behaviour
  after deployment; that evidence is reported separately (section 12).

## 1. Executive summary

Production `GET /api/health/ready` was observed returning HTTP 503:

    {
      "status": "degraded",
      "components": {
        "config": "ready",
        "database": "disconnected",
        "redis": "optional"
      }
    }

while the MongoDB Atlas owner reported a healthy cluster and production AI
Recommendations and AI Similar requests worked.

The primary hypothesis was that the readiness route reads
`mongoose.connection.readyState` without first invoking the project's
connection helper. That hypothesis is CONFIRMED: source inspection
(section 5) and a deterministic RED test (section 6) both show the original
route never attempted a connection. Prior production observations
recorded by Phases 19 to 21 and by the Gemini diagnosis are
reconciled against this finding in section 3.

Root cause: the original `probeDatabase()` returned false immediately when
`readyState !== 1`. A fresh Vercel serverless instance starts with
module-local readyState 0, so it reported the database disconnected without
any network operation, regardless of Atlas health or the state of other
instances.

Correction: `probeDatabase()` now lazily imports the shared helper
`lib/mongodb.ts`, connects inside one 3000 ms probe budget, and bounds
`admin().ping()` by `min(remaining, 2000 ms)`. Warm instances reuse the
helper's cached connection; concurrent probes share one in-flight attempt.

Report verdict: root cause confirmed and corrected, with the implementation
verified by the local gates in section 10. The full-history secret scan
(gate 11) exits non-zero on seven pre-existing findings unrelated to this
change; they are classified in section 11. Production verification is not
claimed by this document (section 12).

## 2. Atlas owner evidence (operator-provided)

Evidence class for every row: OPERATOR_PROVIDED, as stated in the task brief.
This agent made no Atlas management call and no direct database connection, so
none of these rows is independently verified here.

| Observation | Reported value |
| --- | --- |
| Cluster state | Cluster1 ACTIVE |
| Replica set | 1 PRIMARY and 2 SECONDARY members, reported healthy |
| Active connections shown in Atlas | 3 |
| Database user | exists |
| Authentication method | SCRAM |
| Cluster assignment | user assigned to exactly 1 Cluster |
| User role | atlasAdmin@admin |
| Application data path | Production AI Recommendations and AI Similar requests work |

Taken together these facts rule out a cluster outage, a missing user, an
authentication-method mismatch, and a role-assignment problem as causes of
the readiness response. They are also consistent with the application-level
root cause: the data paths work because those routes call the shared helper,
while the readiness route did not.

## 3. Symptom reconciliation and cross-document production evidence

The task describes the degraded response as intermittent or persistent. The
call-site survey in section 5 explains both appearances: an instance that has
served any MongoDB-backed route is connected and would answer ready; a
brand-new instance whose first request is the readiness probe reads
readyState 0 and, before this correction, immediately reported disconnected.
The mix of cold and warm instances in the serving pool determines which
pattern an observer sees.

### Production observations recorded by prior phases

Evidence class for every row: CROSS-DOCUMENT OBSERVATION - a measurement
recorded in a sibling phase report, quoted with its originating engine. This
diagnosis did not re-run those measurements; each row is a third-party
observation carried into this report, not a claim re-verified here.

| Sibling document | Observation | Recorded engine |
| --- | --- | --- |
| PHASE-19-PR15-MERGE-PRODUCTION-DEPLOYMENT-AND-SMOKE-REPORT.md (lines 19-21, 212-218) | Production /api/health/ready returned 503 degraded with database disconnected on 3 of 3 attempts (0.49 s, 0.41 s, 0.39 s); the single mandatory smoke failure (8 of 9 checks otherwise) | curl against Production |
| PHASE-20-AI-PROVIDER-RELIABILITY-AND-GEMINI-3-5-FLASH-LITE-COMPLETION-REPORT.md (line 330) | On a Preview deployment whose instance had connected, /api/health/ready answered with database ready | vercel curl against the Preview |
| PHASE-21-AI-429-HARDENING-AND-FINAL-PROJECT-CLOSEOUT-REPORT.md (lines 526-540, 589-592) | Production /api/health/ready still degraded with database disconnected; recorded as state preserved from the Phase 19 hand-off, with connection recovery classified as an owner action | vercel curl with deployment-protection bypass |
| BUG-AI-RECOMMENDATION-GEMINI-UPSTREAM-503-DIAGNOSIS.md (lines 29, 320-330, 517) | /api/health/ready answered 503 degraded on 6 consecutive observations (18:0x-19:02Z) during the same diagnosis session in which the shared helper connectToMongoDB() resolved successfully on production AI routes at route.ts:169 (17:43-17:56Z) | curl plus Vercel logs |

### Reconciliation with the Atlas-side attribution recorded in prior phases

Phases 19 and 21 and the Gemini diagnosis each attributed the readiness
failure to MongoDB itself: Phase 19 recorded an environment-side cause
(unreachable or paused MongoDB cluster) and explicitly not a release defect;
Phase 21 classified recovery of the connection as an owner action; the Gemini
diagnosis called it a separate incident requiring owner or DB-provider action.
Those attributions were reasonable inferences from a 503 whose route contract
says probe failed, and none of those phases changed the route.

The available evidence contradicts them:

1. The operator verified the cluster healthy and production AI data requests
   working (section 2).
2. The Gemini diagnosis recorded the shared helper resolving successfully on
   production routes during the same diagnosis session in which readiness
   503'd six times: the same helper, the same Mongoose instance, the same URI,
   working while the probe reported disconnected.
3. Source inspection (section 5) shows the pre-fix route never invoked the
   helper, so its 503 could not have been produced by a connection attempt.
4. Phase 20's Preview observation (database ready on a warm instance) is
   exactly what a readyState-gated probe predicts and is not predicted by an
   unreachable cluster.

Conclusion: the Atlas-side attribution is falsified as an explanation for the
observations in the table above. A transient Atlas outage during Phase 19's
specific smoke window cannot be excluded from read-only evidence, but it is
not required to explain any recorded observation, because the pre-fix route
made no connection attempt in any of them. The prior documents are left
unedited: correcting their attribution is outside this phase's change budget
(section 13).

### Timing corroboration

Phase 19 recorded readiness responses of 0.39-0.49 s. A real connection
attempt plus ping from a cold serverless instance is not consistent with a
sub-half-second end-to-end response including edge round trip; a zero-network
code path is. Source inspection confirms the pre-fix path performed no
network operation when readyState was 0, so the recorded timings corroborate
the source-level finding rather than a failed connection attempt.

## 4. Required source inspection (section C of the brief)

Every file below was read completely in this session.

| Source | Evidence class | Finding |
| --- | --- | --- |
| app/api/health/ready/route.ts (pre-fix, origin/main) | AUTHORED SOURCE FACT | probeDatabase at line 46 checks readyState and returns false with no import or call of connectToMongoDB; ping bounded by DB_PING_TIMEOUT_MS; GET maps core-invalid to 503 unavailable and probe failure to 503 degraded |
| app/api/health/ready/route.ts (corrected) | AUTHORED SOURCE FACT | bounded lazy connect plus ping, full line map in section 7 of the companion report |
| app/api/health/live/route.ts | AUTHORED SOURCE FACT | returns 200 OK with no external dependency check; untouched by this task |
| lib/mongodb.ts | AUTHORED SOURCE FACT | reads MONGODB_URI at module evaluation and throws when unset (lines 3-7); one module-level Mongoose instance shared with the route; globalThis-backed cache of {conn, promise} (lines 19-27); cached conn short-circuits (30-32); one in-flight promise (34-43); failure clears the promise so a later call retries (48) |
| lib/env.ts | AUTHORED SOURCE FACT | isCoreConfigReady gates the route; MONGODB_URI validated for presence (category database) and URL format |
| lib/boot-state.ts, lib/operational-log.ts, instrumentation.ts | AUTHORED SOURCE FACT | boot classification and generic operational events; no connection-helper call at boot |
| tests/operational-security.test.ts | AUTHORED SOURCE FACT | existing readiness contract tests; the readyState-failure test previously passed through a mock that never attempted a connection |
| tests/readiness-cold-start.test.ts (created) | AUTHORED SOURCE FACT | new focused reproduction and correction suite, 12 tests |

Recorded C-fields:

- Whether readiness calls connectToMongoDB: NO before this correction; YES
  now, via the lazy import at route line 71.
- Whether it only reads readyState: before, yes for the go/no-go decision;
  the only other operation was admin().ping() on an already-connected handle.
- readyState mapping: 0 disconnected, 1 connected, 2 connecting, 3
  disconnecting (comment at corrected route line 61, present pre-fix as well).
- Connection timeout: shallow ping capped at DB_PING_TIMEOUT_MS (2000 ms,
  line 35); the new connect step capped by the remaining total budget
  DB_PROBE_TIMEOUT_MS (3000 ms, line 40).
- Cache/promise behavior: lib/mongodb.ts caches connection and in-flight
  promise on globalThis and deduplicates concurrent callers; the route adds a
  deferred-promise share across concurrent GETs without storing state.
- Serverless cold-start behavior: per-instance module state; a fresh instance
  starts at readyState 0; instrumentation does not initiate a connection.
- Status-code decision: 200 when core config is valid and the database probe
  succeeds; 503 unavailable when core config is invalid (database not
  contacted); 503 degraded when the bounded probe fails or times out.
- Exception handling: probeDatabase catches all errors and returns false;
  lazy-import failures occur inside the same try and become a generic
  degraded response, never raw error text.
- Logging behavior: this route logs no connection detail and no URI; it emits
  only generic operational events (route lines 153-159). The pre-existing
  helper's console messages are noted in section 14.

## 5. Source-level root cause

Pre-fix code, app/api/health/ready/route.ts at origin/main 840478a, quoted
from `git show origin/main:app/api/health/ready/route.ts`:

    46: async function probeDatabase(): Promise<boolean> {
    47:   try {
    48:     // readyState: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting.
    49:     if (mongoose.connection.readyState !== 1) {
    50:       return false;
    51:     }
    52:     const db = mongoose.connection.db;
    53:     if (!db) {
    54:       return false;
    55:     }
    56:     // Shallow, bounded liveness check. No query, no data, no secrets.
    57:     await withTimeout(db.admin().ping(), DB_PING_TIMEOUT_MS);
    58:     return true;

The decision at lines 49-51 never attempts a connection. Any instance whose
module-local readyState is not 1 fails closed as disconnected without any
network operation, regardless of Atlas health.

Call-site survey (evidence: grep for `connectToMongoDB(` over app, lib,
instrumentation.ts and middleware.ts on the corrected tree): 22 files match,
21 of them pre-fix. The pre-fix call sites span AI recommendations, chat and
chat history, favorites, features, history, movies, watchlist, user, admin
routes and admin layout, lib/auth.ts, and the auth and quota security
helpers. The readiness route was the only health route that did not call the
helper. Corollary: any instance that has served one of those paths is
connected; a cold instance serving readiness first is not. This is the
mechanism behind the observed intermittent or persistent degraded reports
while production data requests succeed. The same-session helper
success recorded alongside six failing readiness probes is the
production corroboration of this mechanism (section 3).

## 6. Deterministic reproduction (section D of the brief)

Engine: Vitest under Node v24.21.0 (versions in section 10). The mongoose
driver layer is replaced by an injected fake, timers are controlled with fake
timers, and helper promises are deferred barriers. No real network, no real
Atlas connection, no arbitrary sleeps.

Command:

    node node_modules/vitest/vitest.mjs run tests/readiness-cold-start.test.ts

RED evidence, captured before the route was changed (session transcript
message 73949):

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
    EXIT=1

Reading of the RED: every "expected +0 to be 1" is the harness connectCalls
counter, i.e. the route never called the helper. The two "503 to be 200"
rows are the fresh-instance and successful-connection expectations. Tests 5,
8 and 9 were already contract-green before the fix (warm instance does not
reconnect; invalid config leaves the database untouched; a hanging ping is
bounded), which shows the reproduction isolated the defect rather than the
whole route.

GREEN evidence, same command after the correction on this branch:

     Test Files  1 passed (1)
          Tests  12 passed (12)
    EXIT=0

The twelve-test count includes three fail-closed guard tests added after the
first coverage pass (section 8).

## 7. Correction design (section E of the brief)

All line references are to the corrected app/api/health/ready/route.ts:

| Element | Lines | Behaviour |
| --- | --- | --- |
| DB_PING_TIMEOUT_MS | 35 | shallow ping cap, 2000 ms |
| DB_PROBE_TIMEOUT_MS | 40 | whole database-probe budget, 3000 ms |
| deadline | 59 | Date.now() + DB_PROBE_TIMEOUT_MS |
| lazy helper import | 71 | await import("@/lib/mongodb") only after the config gate |
| bounded connect | 72 | withTimeout(connectToMongoDB(), deadline - Date.now()) |
| readyState re-check | 76-78 | a resolved helper with state still not 1 fails closed |
| null db-handle guard | 79-82 | fails closed without a ping |
| budget-exhausted guard | 83-86 | fails closed when no time remains |
| bounded ping | 88 | min(remaining, 2000 ms) |
| catch-all | 90-93 | returns false; no error text leaves the function |

Response contract (unchanged where already correct):

| Condition | HTTP | status | components |
| --- | --- | --- | --- |
| config valid, probe succeeds | 200 | ready | config ready, database ready, redis optional or misconfigured |
| config valid, probe fails or times out | 503 | degraded | config ready, database disconnected |
| core config invalid | 503 | unavailable | config unavailable, database disconnected, database not contacted |

Properties satisfied: one shared Mongoose instance and no second MongoClient;
no URI, host, user, database name, or error text in any response; no
connection attempt on the config-invalid path; Redis remains optional; the
liveness route is untouched.

## 8. Tests added and hardened

New file tests/readiness-cold-start.test.ts (416 lines, 12 tests):

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

Tests 10-12 were added after coverage showed three uncovered route branches;
they are contract tests for fail-closed guards. Test 12 asserts that ping is
never invoked, so it cannot pass for the wrong reason.

tests/operational-security.test.ts (43 insertions, 1 deletion):

- The readyState-failure test now drives the connection attempt through a
  controlled helper mock, so it proves the route degrades only after a real
  attempt instead of passing while that path is never entered.
- A new cold-start test proves readyState 0 at entry becomes HTTP 200 after a
  successful connection, matching the corrected behaviour.

## 9. Serverless implications

- A cold instance now attempts one connection and stays within 3000 ms total,
  independent of the platform's function timeout (that platform value was not
  inspected; no Vercel deployment setting was read or changed).
- A warm instance takes the helper's cached-connection short-circuit and adds
  only the shallow ping, capped at 2000 ms.
- Concurrent readiness calls within an instance share one deferred promise;
  the helper additionally deduplicates at the globalThis level.
- A failed or timed-out attempt returns 503 degraded only after the bounded
  attempt; no unbounded hang is possible.
- Cost of the correction on a cold readiness request: up to 3000 ms added
  latency in the worst case, versus an immediate but incorrect 503 before.

## 10. Validation (section F of the brief)

All commands were run from the repository root on branch
fix/phase-22-readiness-cold-start. "Change set" means the five files listed
in section 13. Engine versions measured in this pass: Node v24.21.0, npm
11.5.2, Vitest and Mongoose versions read from node_modules.

| # | Gate | Command | Result |
| --- | --- | --- | --- |
| 1 | Focused readiness suite | node node_modules/vitest/vitest.mjs run tests/readiness-cold-start.test.ts | 12 passed, exit 0 |
| 2 | MongoDB connection tests plus focused suite | vitest over the 25 files that vi.mock @/lib/mongodb plus the focused file | 26 files / 297 tests, exit 0 |
| 3 | Typecheck | npx tsc --noEmit | exit 0 |
| 4 | Lint | npx eslint . | 0 errors, 93 warnings, exit 0 (matches the measured baseline) |
| 5 | Full suite | node node_modules/vitest/vitest.mjs run | 48 files / 592 tests, exit 0 |
| 6 | Coverage | vitest run --coverage at base and final | no regression; all four metrics improved (section 11) |
| 7 | Production build | npm run build | exit 0 |
| 8 | Raw audits | npm audit --omit=dev --json and npm audit --json | 0 vulnerabilities each, exit 0 |
| 9 | Live audit policy | node scripts/audit-policy.mjs | exit 0, both scopes accepted (CLEAN_AUDIT) |
| 10 | Diff integrity | git diff --check | exit 0 (CRLF advisory only) |
| 11 | Secret scan | gitleaks v8.18.4, targeted and CI-exact | targeted change-set scans exit 0; CI-exact full-history scan exits 1 on 7 pre-existing findings (section 11) |

Sequencing note: gates 3 and 7 ran after the final source and test edits and
before this report was assembled; the only subsequent writes were these two
documentation files, which the production build does not compile.

## 11. Coverage and secret-scan detail

Coverage, measured with v8 over the repository's configured include set
(app/api, lib/security, lib/ai and gemini helpers, and the Safe components):

| Measurement | Test files | Tests | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- | --- | --- |
| Base 840478a | 47 | 579 | 60.00 | 50.81 | 71.30 | 61.16 |
| Final change set | 48 | 592 | 60.26 | 51.05 | 71.74 | 61.38 |

All four metrics improved (statements +0.26, branches +0.24, functions +0.44,
lines +0.22). The readiness route itself moved from 26/28 statements,
19/20 branch paths (10/10 sites, one site partial), 6/7 functions at the base
to 36/36 statements, 24/24 branch paths (12/12 sites, none partial), 7/7
functions in the final measurement.

Secret scan, gitleaks v8.18.4 with the repository's .github/gitleaks.toml:

| Scope | Command shape | Result |
| --- | --- | --- |
| Production route (change set) | detect --no-git over a mirror of the file | exit 0, no leaks |
| Focused and security tests (change set) | detect --no-git over a mirror of both files | exit 0, no leaks (also covered by the documented tests allowlist) |
| CI-exact full history and tree | detect --source . --log-opts="--all" --redact | exit 1, 7 findings |
| Current tip files at origin/main | detect --no-git over the four pre-existing paths | exit 1, 3 findings |

The seven full-history findings are all rule generic-api-key in pre-existing
commits: two older completion reports, four historical versions of
.github/workflows/ci.yml, and one 2025 version of lib/redis.ts. Six of the
seven commits are reachable from origin/main; one belongs to a side branch.
None of the seven paths or commits is part of the change set.

The three findings that still match the current tip files are
.github/workflows/ci.yml line 146 and the PHASE-9 and PHASE-12 completion
reports at lines 282 and 728. A prefix and marker probe on exactly those
lines found the word placeholder and found no known key prefix (Google,
OpenAI, GitHub, AWS, npm, Slack, GitLab, or JWT styles), which classifies
them as false positives on documented placeholder text, not as live
credentials.

Consequence: this change set adds no secret finding. The repository's
full-history scan remains non-zero for pre-existing reasons that predate this
work; fixing them would require editing other files and is outside this
phase's scope (section I of the brief).

## 12. Production evidence boundary

This document is frozen at the implementation commit by design.
It records this diagnosis source, test, and validation evidence;
production measurements it cites are quoted cross-document
observations from prior phases (section 3), not re-measurements. The release chain required
by section H of the brief (bounded commit, dedicated branch, pull request,
Vercel Preview, merge commit, automatic production deployment, and three
production probes) runs after this commit, and its evidence is reported in
the session's final evidence report. No production outcome is asserted here,
so no statement in this document can become stale when that chain completes.

## 13. Exact changed files and non-mutation

Change set (five files; deltas measured with git diff --numstat and wc):

| File | Role | Delta |
| --- | --- | --- |
| app/api/health/ready/route.ts | readiness probe (production) | 37 insertions, 6 deletions; 137 to 168 lines |
| tests/readiness-cold-start.test.ts | new focused reproduction suite | new file, 416 lines, 12 tests |
| tests/operational-security.test.ts | existing readiness contract suite | 43 insertions, 1 deletion; 410 lines |
| docs/reports/diagnostics/BUG-PRODUCTION-READINESS-MONGOOSE-COLD-START-DIAGNOSIS.md | this report | new file |
| docs/reports/PHASE-22-PRODUCTION-READINESS-COLD-START-CORRECTION-REPORT.md | companion completion report | new file |

No other production file was required, so no scope change proposal is needed
(section I of the brief). lib/mongodb.ts was reused, not modified.

Non-mutation attestations:

| Protected surface | Status | Evidence |
| --- | --- | --- |
| MongoDB Atlas (cluster, users, roles) | not modified | no Atlas management or database command was executed in this session |
| MONGODB_URI | not modified | no environment file was written; lib/mongodb.ts is unmodified |
| Vercel environment variables | not modified | no Vercel environment command was executed |
| Vercel deployment settings | not modified | no Vercel settings command was executed |
| Database roles and credentials | not modified | no role or credential command was executed; no rotation performed |
| AI-provider behaviour | not modified | no AI route or provider file is in the change set |
| Repository history | not rewritten | no rebase, reset, amend of prior commits, or force push; only branch creation and the bounded commit of this change set |

## 14. Residual risks and observations

- Production behaviour after deployment is not verified by this document
  (section 12).
- lib/mongodb.ts (unchanged) logs a generic success message and the raw
  driver error object to the process console on connect success and failure
  (lines 40 and 49). The readiness response itself stays clean, and this
  route performs no logging of its own beyond generic operational events, but
  Vercel logs from the helper may carry driver detail. Changing that would
  require editing another production file and is recorded as an observation,
  not performed.
- The connection cache is per JavaScript runtime. In a serverless deployment
  each instance connects on its own within the budget; no shared
  cross-instance connection exists, which is the platform's normal model.
- The seven pre-existing gitleaks history findings and the four red CI jobs
  at origin/main (run 41959744595: production build, lint and typecheck,
  dependency audit and secret scan, test and coverage) predate this work.
  They are observed and classified, not diagnosed or remediated, because both
  fall outside this phase's scope.
- A real Atlas connection was deliberately not made from this environment, so
  no local-to-production network path was exercised; the connection logic is
  exercised deterministically by the injected-driver suites instead.

## 15. Verdict

    DIAGNOSIS_VERDICT=ROOT_CAUSE_CONFIRMED_AND_CORRECTED
