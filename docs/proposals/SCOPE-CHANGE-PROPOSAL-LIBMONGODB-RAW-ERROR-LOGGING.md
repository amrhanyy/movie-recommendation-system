# Scope Change Proposal: Sanitize Raw MongoDB Driver Error Logging

- Proposal ID: SCP-LIBMONGODB-RAW-ERROR-LOGGING-001
- Status: APPROVED AND IMPLEMENTED IN PHASE 23 - LOCALLY VERIFIED
- Date: 2026-11-06
- Target: `lib/mongodb.ts` (shared production helper)
- Commit status: this document lands in the Phase 23 documentation commit
  (Commit B of the Phase 23 release, Section R of the Phase 23 brief). The
  implementation it describes is in Commit A of the same release.
  Release lifecycle evidence is in the Phase 23 completion report.
  It is not part of the probe-budget follow-up commit.

## 1. Request

Approve a one-file, logging-only change to the shared MongoDB connection
helper so a failed connection never writes the raw driver error object -
whose message carries host:port - into the platform logs. Connection,
caching, retry, and error-propagation behaviour stay exactly as they are.

## 2. Problem

Source: `lib/mongodb.ts`, catch path of `connectToMongoDB` (read
2026-11-06; file is 56 lines):

```ts
try {
  cached.conn = await cached.promise;
} catch (e) {
  cached.promise = null;
  console.error('MongoDB connection error:', e);
  throw e;
}
```

The `console.error` call passes the error object as its second argument.
The runtime serialises the error message and stack into the log line.

Measured evidence (localhost only: `mongoose.connect` to `127.0.0.1:1`
with a 500 ms server-selection timeout; no Atlas, no external network;
2026-11-06):

| Field | Observed value |
| --- | --- |
| `e.name` | `MongooseServerSelectionError` |
| `e.code` | absent |
| `e.message` | `connect ECONNREFUSED 127.0.0.1:1` |
| message carries host:port | true |
| stack first line | `MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:1` |

For an Atlas failure the same message field carries the cluster
hostname(s) and port. SCRAM credentials are not in the message;
hostnames and topology detail are. The readiness-correction brief
prohibits printing hostnames, credentials, usernames, and database names.
This helper sits outside that bounded change set, so both committed
reports record it as an out-of-scope observation (diagnosis report
section 14; Phase 22 report section 14) instead of fixing it silently.

Evidence class: primary (source read plus executed reproduction).

## 3. Why a separate scope change

Section I of the correction brief limits the expected implementation scope
to the readiness route, focused readiness tests, the diagnosis report, and
the completion report, and requires a Scope Change Proposal rather than an
autonomous edit when another production file is needed. `lib/mongodb.ts`
is shared by every MongoDB-backed route and by the focused readiness
suite. No proposal document existed under `docs/` before this file - only
prose mentions in four reports - so this document introduces
`docs/proposals/`.

## 4. Proposed change

Single production file. In the catch block only, replace the raw-object
log with a fixed message plus the error name and, when present, a numeric
driver code:

```ts
} catch (e) {
  cached.promise = null;
  const errorName = e instanceof Error ? e.name : 'UnknownError';
  const raw = e as { code?: unknown };
  const errorCode = typeof raw.code === 'number' ? raw.code : undefined;
  console.error(
    'MongoDB connection error.',
    errorCode === undefined ? { errorName } : { errorName, errorCode },
  );
  throw e;
}
```

Preserved exactly: promise reset on failure, rethrow, the cached
connection fast path, in-flight promise reuse, the success log at line 40
(already a fixed string), and `MONGODB_URI` handling. No second
MongoClient or Mongoose instance, no timeout change, no env change, no
API-response change, no Atlas or Vercel setting change.

Why name plus code: the measured failure class is identified by name
(`MongooseServerSelectionError`); for driver-level failures a numeric
code (for example an authentication code) is useful and carries no host
or secret. Neither field can contain a hostname, URI, username, or
database name.

## 5. Test plan (TDD)

New file: `tests/mongodb-helper-error-logging.test.ts`.

- Keep `lib/mongodb.ts` REAL; control only the driver boundary
  (`mongoose.connect`) so the helper's promise-cache and
  reset-on-failure behaviour remain under test.
- Isolate the helper's module-level cache per case with
  `vi.resetModules()` plus a fresh dynamic import; no sleeps, no network,
  deferred promises.
- RED cases:
  1. Rejected connect whose message contains a fake host:port and a
     URI-shaped string: `connectToMongoDB` rejects; `console.error` is
     called; the captured log content contains neither the host, nor the
     port, nor the URI scheme, nor the raw message text.
  2. After a failure a second call retries (`cached.promise` was reset):
     `mongoose.connect` called twice.
  3. Successful connect: behaviour unchanged; the fixed success message
     is logged; no raw URI appears.
- Implementation follows only after the RED cases fail for the stated
  reason.

## 6. Validation plan

1. New focused suite (RED then GREEN).
2. MongoDB-referencing subset: 27 files / 300 tests (measured strict
   superset of the Phase 22 set in this session; all pass).
3. Full suite: measured baseline 48 files / 592 tests, 0 failures.
4. Coverage with no regression (measured baseline
   60.26 / 51.05 / 71.74 / 61.38); inspect the helper row and the new
   test file.
5. Typecheck exit 0; lint 0 errors (93-warning baseline).
6. Production build exit 0.
7. Raw audits (both scopes) and live audit policy exit 0.
8. `git diff --check` exit 0; gitleaks change-set 0 at staging.

All baseline counts in this section were reproduced in this session on
2026-11-06; the follow-up release adds the gitleaks change-set run at
staging time.

## 7. Impact and risks

- Logging content only; no runtime behaviour change for any caller.
- Consumers of the logs: Vercel log search and any alert that currently
  greps raw error text would lose message and stack detail. Risk: an
  existing alert keyed on message text goes quiet. Owner decision point:
  confirm no such alert depends on the raw message before approval.
- Diagnosability: error name (plus numeric code when present) remains, so
  the failure class stays visible.
- Residual: hostnames could still appear in logs emitted by the Mongoose
  driver itself or by other helpers; this proposal covers only
  `lib/mongodb.ts` line 49.

## 8. Alternatives considered

| Alternative | Decision | Reason |
| --- | --- | --- |
| Log name plus numeric code only (proposed) | Selected | Removes host, message, and stack; keeps failure class |
| Remove the `console.error` entirely | Rejected | Loses failure visibility in production logs |
| Redact hostnames from the message with a regex | Rejected | Brittle: message shapes vary by driver and failure class |
| Leave as-is | Rejected | The raw object exposes hostnames; reports already flag it and the brief prohibits hostname output |

## 9. Rollback

Revert the single helper file and remove the new test file. No data,
schema, migration, or deployment-setting is involved.

## 10. Out of scope

No change to connect logic, timeouts, the readiness route, the probe
budget, env validation, Atlas, Vercel environment variables or deployment
settings, database roles, credentials, or AI-provider behaviour. No data
mutation.

## 11. Decision requested

- Approve: implement as a separate bounded commit (helper plus new test
  file), own branch, PR, Preview, Merge Commit, production verification.
- Defer: keep this document; no code change.
- Reject: archive or delete this document.

## Appendix A. Evidence inventory

| Claim | Evidence |
| --- | --- |
| Line 49 logs the raw error object | `lib/mongodb.ts` read, lines 45-51 |
| Raw message carries host:port | Executed localhost reproduction (section 2 table) |
| Reports disclose the issue out of scope | Diagnosis report section 14; Phase 22 report section 14 |
| No proposal convention existed | `docs/` layout plus grep for proposal text (four prose mentions, no proposal file) |
| Gate baselines quoted in section 6 | Reproduced in this session (follow-up gates); see the session release report |
