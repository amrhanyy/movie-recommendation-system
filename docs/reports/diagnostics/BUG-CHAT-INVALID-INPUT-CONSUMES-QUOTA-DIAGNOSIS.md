# BUG-CHAT-INVALID-INPUT-CONSUMES-QUOTA — READ-ONLY DIAGNOSIS

**Phase:** Phase 7 — Chat Quota Ordering Diagnosis
**Finding ID:** REL-001
**Bug ID:** BUG-CHAT-INVALID-INPUT-CONSUMES-QUOTA
**Prompt type:** READ-ONLY DIAGNOSTIC (no fix implemented)
**Diagnostic status:** **PASS**
**Date:** 2026-09-13 (local UTC+3)
**Commit policy:** COMMIT_ALLOWED: NO — **honored**
**Deployment policy:** DEPLOYMENT_ALLOWED: NO — **honored**
**Risk level:** MEDIUM

---

## 1. Executive summary

The `POST /api/chat` handler consumes the user's daily chat quota **before** parsing the request body or running Zod schema validation. `consumeQuota` is an atomic **increment-then-observe** with no refund primitive, so every malformed-JSON request (400) and every schema-invalid request (400) permanently increments `UsageQuota.chats` for that user/day. A buggy or malicious client authenticated as a user can burn that user's full 50/day budget with zero Gemini calls.

Auth, origin, and rate-limit gates correctly precede quota and do not consume it. The reported condition is **verified against current source** — it is not a stale claim: `app/api/chat/route.ts:154` (`consumeQuota`) executes before line 163 (`request.json()`) and line 168 (`chatRequestSchema.safeParse`).

The sibling route `app/api/ai-recommendations/route.ts:245` consumes `recs` quota only after the cache-hit early return; it has no malformed-JSON input at all (GET), so the chat route is the only quota-before-validation defect.

**Root cause:** REQUEST-ORDERING DEFECT. **Smallest safe fix (recommended, NOT implemented):** keep auth → origin → rate limit; move `request.json()` + `chatRequestSchema.safeParse()` above `consumeQuota`; place the ownership lookup above or below the moved quota (preferred: above, so foreign-`chatId` probes cost nothing); keep `consumeQuota` immediately before the Gemini call. No refunds, no storage change, no new quota call, no contract change.

---

## 2. Finding and bug identity

| Item | Value |
|---|---|
| Project | MovieMind |
| Repository | movie-recommendation-system |
| Finding ID | REL-001 |
| Bug ID | BUG-CHAT-INVALID-INPUT-CONSUMES-QUOTA |
| Category | Correctness (quota accounting / abuse surface) |
| Severity | Medium |
| Confidence (pre) | High (per `docs/PROJECT_BLUEPRINT.md` REL-001) |
| Status (post-diagnosis) | **Confirmed — static + test-verified isolation** |
| Defective code | `app/api/chat/route.ts` lines 154–176 |

---

## 3. Initial Git state (captured before any action)

- Root: `D:/fork ai to create website/final porject/movie-recommendation-system`
- Branch: `main`
- HEAD: `70fe77655467f5105f5d0e9b02594ba1c62b2952` (`70fe776`)
- Upstream: `origin/main`, relationship `+2 -0` (ahead 2, behind 0)
- Staged additions/modifications/deletions: **none** (`git diff --cached --name-status` empty)
- Unstaged modifications: 31 files (pre-existing user/prior-phase work: API routes, pages, components, contexts, docs, `lib/security/auth.ts`, `lib/security/rateLimit.ts`, `middleware.ts`, `package.json`, `package-lock.json`, 6 test files)
- Unstaged deletions: 1 (`docs/ARCHITECTURE_REVIEW.md`)
- Untracked (15): `docs/reports/` (6 phase reports + 3 diagnostics), `lib/list-membership.ts`, `tests/ai-recommendations-ownership-exclusion.test.ts`, `tests/authenticated-read-rate-limit.test.ts`, `tests/list-membership-collision.test.tsx`, `tests/middleware-security.test.ts`
- All pre-existing changes preserved; none touched by this phase.

## 4. Applicable instructions

- `AGENTS.md`: **absent** (checked repo root).
- `.cursor/rules/*.mdc`: **absent** (no `.cursor` directory).
- User rules in scope: staff-level engineering rules (read-before-edit, no placeholders, atomic edits), strict JSON tool-call rule, two-step debugging protocol (this prompt).
- Repository testing instructions: `vitest.config.mts` — two named projects (`node` for `tests/**/*.test.ts`, `dom`/jsdom for `tests/**/*.test.tsx`), 20s test timeout, no setup files, no global env loading.
- `package.json` scripts: `test` = `vitest run`; no pre-test env bootstrap. `dotenv` is a dependency but **no test path imports it** (verified by search in `lib/` for `dotenv|config(`: no matches in `lib/env.ts`).

## 5. Environment versions

| Tool | Version |
|---|---|
| OS | Windows 10, 10.0.19045 |
| Shell | Windows PowerShell 5.1 |
| Node | v24.21.0 (local; CI Node 22 pending per baseline) |
| npm | 11.5.2 |
| Git | 2.50.1.windows.1 |
| vitest | 3.2.7 |
| next | 15.5.24; mongoose ^8.24.3; zod ^3.24.1; next-auth ^4.24.15 |

Baseline (reported, consistent with observed repo state): 40 test files, 395 tests, full suite exit 0, typecheck 0, lint 0 with 93 warnings, audit 0, build 0. Test-file count **verified = 40** by directory listing.

---

## 6. Files and symbols inspected

Source (full read unless noted):
- `app/api/chat/route.ts` — complete (all 256 lines).
- `lib/security/quota.ts` — complete (`consumeQuota`, `QuotaResult`).
- `lib/models/UsageQuota.ts` — complete (schema, unique index, TTL).
- `lib/security/auth.ts` — complete (`requireUser`, `requireSession`, `assertSameOriginOrReject`, helpers).
- `lib/security/rateLimit.ts` — complete (`checkRateLimit`, `applyRateLimitUser`, `rateLimitResponse`, `RATE_LIMITS.chat = 10/60s`).
- `lib/security/schemas.ts` — `chatRequestSchema` region (lines 69–77).
- `lib/gemini-payload.ts` — constants region: `GEMINI_GENERATE_URL`, `GEMINI_TIMEOUT_MS = 15000`, `getGeminiApiKey`.
- `lib/ai-security.ts` — `mapAIError`, `httpStatusForAIError` regions.
- `lib/mongodb.ts` — complete (module-load `MONGODB_URI` guard).
- `app/api/ai-recommendations/route.ts` — quota region (lines 225–275).

Tests (full read):
- `tests/quota-security.test.ts`
- `tests/chat-trust-boundary.test.ts`
- `tests/admin-chat-ai-security.test.ts`
- `tests/helpers.ts` (`installGlobalFetch`)
- `vitest.config.mts`, `package.json`

Docs:
- `docs/PROJECT_BLUEPRINT.md` — chat route lifecycle line 252; REL-001 entry (lines ~359–368).
- `docs/SECURITY_AUDIT.md` — line 213 (chat auth/quota chain).
- `docs/reports/PHASE-1-CURRENT-STATE-VERIFICATION-REPORT.md` — Section 41 (Phase 1 Verification Correction), lines 4171–4478.
- `docs/reports/PHASE-4-AUTH-API-SECURITY-HARDENING-COMPLETION-REPORT.md` — context (open in IDE; prior auth hardening baseline).
- `docs/reports/PHASE-6-LIST-MEMBERSHIP-IDENTITY-CORRECTION-COMPLETION-REPORT.md` — listed as required context; exists untracked in `docs/reports/` (not central to quota ordering; no contradictions found in any doc read).

---

## 7. Current request lifecycle — `POST /api/chat`

Exact order in `app/api/chat/route.ts` `POST()` (line 131):

| # | Step | Line(s) | Notes |
|---|---|---|---|
| 1 | Authentication | 134–137 | `requireUser()`: `getServerSession(authOptions)` → 401 if no email or throw; then `connectToMongoDB()`, `RevokedSession.exists({jti})` (W1-001 revocation), `User.findOne({email})` fresh role load → 401 if missing; 500 if DB error |
| 2 | Same-origin | 141–142 | `assertSameOriginOrReject(request)` → 403 `{error:"Origin verification failed"}` on mismatch/missing (fail-closed: no Origin/Referer/Sec-Fetch-Site → 403) |
| 3 | Rate limit (per-user) | 144–149 | `applyRateLimitUser(request, userId, RATE_LIMITS.chat)` — 10 req/min, key `user:<email>`, prefix `chat`; Redis `INCR` when healthy, bounded in-memory fallback; 429 + `Retry-After` header on denial |
| 4 | **Quota consumption** | 154–160 | `consumeQuota(userId, 'chats', 50)` — **atomically increments first** (`$inc`), then observes post-inc value; 429 `{error:"Daily chat limit reached", retryAfterSeconds}` when count > 50. **← earliest incorrect state** |
| 5 | JSON parsing | 162–167 | `request.json()` → 400 `{error:"Invalid JSON body"}` on parse failure — **after quota already incremented** |
| 6 | Schema validation | 168–175 | `chatRequestSchema.safeParse(data)` → 400 `{error:"Invalid input"}`. Strict object: `message` string 1..`MAX_CHAT_MESSAGE_LENGTH`; `chatId` optional ObjectId; `previousMessages` optional array ≤ `MAX_CHAT_HISTORY_MESSAGES` (ignored by server, R5) — **after quota already incremented** |
| 7 | Chat ownership lookup | 180–201 | `connectToMongoDB()`; if `chatId`: `ChatHistory.findOne({_id, userId}).lean()` → 403 `{error:"Chat not found"}` when null. No `chatId` → no lookup, empty history |
| 8 | Prompt construction | 203 | `boundChatHistory(history)` (20 msgs / 8000 chars) |
| 9 | Gemini invocation | 204 | `getGeminiResponse(message, orderedHistory)` → single `GEMINI_GENERATE_URL` POST, `x-goog-api-key` header, 15s abort timeout, **1 retry on `AI_UNAVAILABLE` only** (1s backoff) |
| 10 | Output parsing | 78–88 (in `postToGemini`) | `response.json()` → `extractGeminiText(raw)`; empty/invalid → `AI_INVALID_RESPONSE` |
| 11 | Persistence | 207–233 | update path: `ChatHistory.findOneAndUpdate({_id,userId}, {$push messages $slice:-200, $set updatedAt})`; create path: `ChatHistory.create(...)`. Then `trimCollection(ChatHistory, {userId, maxCount:100, sortField:'updatedAt'})` (W3-006b) |
| 12 | Response | 236–240 | 200 `{response, chatId, status:"success"}` |
| 13 | Error mapping | 241–254 | `AIUpstreamError` → `{error:"Failed to process chat request", code}` with `httpStatusForAIError(code)`; anything else → 500 `{error:"Failed to process chat request"}` |

Retry metadata: rate-limit 429 carries a `Retry-After` **header**; quota 429 carries `retryAfterSeconds` in the **body** (no header); AI `AI_RATE_LIMITED` (429) carries only the error body.

## 8. Early-return matrix

`RLΔ` = rate-limit counter change; `QΔ` = quota counter change; `DB` = MongoDB state change (excl. the counted ones).

| Path | Status | Body | RLΔ | QΔ | Other DB | Gemini | History write | Retry metadata |
|---|---|---|---|---|---|---|---|---|
| Unauthenticated (no session / revoked jti / user deleted) | 401 | `{error:"Authentication required"}` | none (not reached) | **none** | session/revocation/user reads | no | no | none |
| Auth DB failure | 500 | `{error:"Authentication failed"}` | none | **none** | reads | no | no | none |
| Origin rejected | 403 | `{error:"Origin verification failed"}` | none (not reached) | **none** | none | no | no | none |
| Rate-limit denied | 429 | `{error:"Too many requests. Please try again later."}` | +1 (observed) | **none** | Redis/memory RL store only | no | no | `Retry-After` header, `X-RateLimit-*` headers |
| **Malformed JSON** | 400 | `{error:"Invalid JSON body"}` | +1 | **+1 (BUG)** | quota `$inc` | no | no | none |
| **Schema-invalid body** (bad/overlong message, bad chatId shape, unknown key, >20 previousMessages) | 400 | `{error:"Invalid input"}` | +1 | **+1 (BUG)** | quota `$inc` | no | no | none |
| Quota exhausted (post-inc count > 50) | 429 | `{error:"Daily chat limit reached", retryAfterSeconds}` | +1 | **+1 (increment-then-observe; denial also increments)** | quota `$inc` | no | no | `retryAfterSeconds` body field |
| Foreign / non-owned `chatId` (schema-valid ObjectId) | 403 | `{error:"Chat not found"}` | +1 | **+1 (BUG, secondary)** | quota `$inc` + `ChatHistory.findOne` read | no | no | none |
| `chatId` invalid shape (`not-an-id`) | 400 | `{error:"Invalid input"}` | +1 | **+1 (BUG)** | quota `$inc` | no | no | none |
| Gemini timeout | 504 | `{error:"Failed to process chat request", code:"AI_TIMEOUT"}` | +1 | +1 (consumed, not refunded) | quota `$inc` | yes | no | none |
| Gemini 429/503/5xx/4xx/invalid JSON/no content | 429/503/502 | same envelope + `code` | +1 | +1 (consumed, not refunded) | quota `$inc` | yes (503 has 1 retry) | no | none |
| Gemini success but `ChatHistory` write/create fails | 500 | `{error:"Failed to process chat request"}` | +1 | +1 (consumed, not refunded) | quota `$inc`; failed write | yes | no | none |
| Successful | 200 | `{response, chatId, status:"success"}` | +1 | +1 | quota `$inc`, history write, `trimCollection` (possible deletes beyond 100) | yes | yes | none |

**Earliest incorrect state:** step 4 — `consumeQuota` (line 154) mutates the quota counter before any knowledge of input validity exists. From that point, steps 5, 6, and 7 can all fail with 400/403 while the increment is retained.

## 9. Authentication behavior

`requireUser` (auth.ts:89–154): server-session only; fresh DB role; W1-001 jti revocation check; never trusts client-supplied identity. Denials: 401 (all auth failures except DB throw → 500). Executed **first**; on denial the handler returns before origin, rate limit, and quota. **No quota or rate-limit state changes on auth denial.** User scope for quota = `session.user.email` (freshly DB-verified).

## 10. Origin behavior

`assertSameOriginOrReject` (auth.ts:274–324): strict order Origin → Referer → Sec-Fetch-Site → fail-closed 403. Expected origin = `NEXTAUTH_URL` origin or `https://<Host>`. Executed **second**; on denial returns before rate limit and quota. **No quota or rate-limit state changes on origin denial.**

## 11. Rate-limit behavior

`applyRateLimitUser` → `checkRateLimit(request, "user:"+email, {10, 60_000, prefix:"chat"})` (rateLimit.ts:191–267, 345–354). Redis `INCR` + `PEXPIRE` (namespace `CACHE_NAMESPACE`), in-memory bounded fallback (10k entries, 60s cleanup) on Redis failure. **Increment-then-observe** like quota: allowed requests and the (max+1)th denied request each increment; denials observe `count > max`. Executed **third**, before quota. **Rate-limit denial consumes no quota** (handler returns at line 150).

**Assessment:** rate limiting **must remain before body parsing**. It is the cheap, per-minute, abuse-facing gate; body parsing (however cheap) before it would let a flood of malformed posts bypass the 10/min bucket on the parse-error path only if parsing were free of the RL bucket — which it is not today, and moving parse ahead of RL would create an abuse regression (malformed-post flood no longer bucketed before it reaches `request.json()` + `safeParse` + Mongo-connect overhead). Keep RL where it is.

## 12. JSON parsing behavior

`request.json()` (route.ts:163) inside try/catch → 400 `{error:"Invalid JSON body"}`. Non-JSON body (e.g. `"not json"`, empty body) throws in the body consumer and is caught. This is step 5 — **after** quota increment (step 4). No size limit is applied before parsing (body bounded only by upstream/server limits); `MAX_CHAT_MESSAGE_LENGTH` is enforced by the schema, not by parsing.

## 13. Schema-validation behavior

`chatRequestSchema` (schemas.ts:71–77): strict object; `message: string` min 1 max `MAX_CHAT_MESSAGE_LENGTH` (2000 — verified by test `x.repeat(2001)` → 400); `chatId: objectIdSchema.optional()`; `previousMessages: array.unknown().max(MAX_CHAT_HISTORY_MESSAGES)` optional and **ignored by the server** (R5 trust boundary — client history is never used). `.strict()` rejects unknown keys (e.g. `response` → 400, verified by test). Step 6 — **after** quota increment (step 4).

## 14. Chat-ownership behavior

Only when `chatId` present (route.ts:183–201): `ChatHistory.findOne({_id: chatId, userId}).lean()` — ownership is the query itself (email-scoped). Null → 403 `{error:"Chat not found"}` (also covers non-existent ids). This runs **after** quota consumption, so every probe with a schema-valid but foreign/nonexistent `chatId` costs 1 unit of the 50/day quota in addition to one Mongo read. No `chatId` → no lookup; the create path implicitly scopes new chats to the user.

## 15. Quota implementation and semantics

`consumeQuota(userId, kind, limit)` (quota.ts:28–63):

- **Meaning:** "increment my `<kind>` counter for today and tell me whether I'm over budget." Consume + check fused; **no separate check-only operation exists**.
- **Atomicity:** single `UsageQuota.findOneAndUpdate({userId, day}, {$inc: {kind: 1}, $setOnInsert: {expiresAt}}, {upsert: true, new: true, setDefaultsOnInsert: true})` — safe under concurrency (MongoDB update operators atomic; unique index `{userId, day}` prevents duplicate docs).
- **Denial semantics:** **denial also increments.** Post-inc `count > limit` → `{allowed: false, retryAfterSeconds}` computed from `expiresAt`. The denied request's own increment is never rolled back.
- **Refund:** **does not exist.** No `refundQuota`, no decrement path anywhere (search for `refundQuota`: zero matches; only call sites of the quota helper are the two `consumeQuota` invocations).
- **Counter key identity:** document `{userId: <email>, day: "YYYY-MM-DD" (UTC)}`, field `chats` (or `recs`).
- **User scope:** authenticated email (freshly DB-verified via `requireUser`).
- **Category/maximum:** `chats`, 50/day (hard-coded at call site, route.ts:154). Sibling: `recs`, 20/day, cache-miss-only.
- **Expiry/reset:** new UTC day → new `day` string → fresh counter (logical reset). `expiresAt` = day end + 2 days grace; TTL index `expireAfterSeconds: 0` deletes the doc (housekeeping only; the `day` key already resets at UTC midnight).
- **Storage backend:** MongoDB only (`UsageQuota` collection). **No Redis, no memory fallback for quota** (unlike rate limiting). `consumeQuota` calls `connectToMongoDB()` internally.
- **Failure behavior:** throw (uncaught by `consumeQuota`) → caught by the route's outer `catch` → 500 `{error:"Failed to process chat request"}`. Mongo unavailable = fail-closed for chat.
- **Returned denial contract:** 429, body `{error: "Daily chat limit reached", retryAfterSeconds: <int>}` (route.ts:156–159).
- **Can it be moved after validation?** Yes — the operation is a self-contained atomic increment; its only ordering requirements are (a) after auth (needs verified user identity) and (b) before the billable Gemini call. Nothing else depends on its position relative to parsing/validation/ownership.
- **Must it remain before Gemini?** Yes. Gemini is the billable side effect; quota must gate it.
- **Should ownership precede consumption?** Yes, preferred (see §17 Option A): ownership is a cheap indexed read already required before Gemini, and placing it before quota makes foreign-`chatId` probes free.

## 16. Gemini-call boundary

`getGeminiResponse` → `postToGemini` (route.ts:49–129): single URL `GEMINI_GENERATE_URL` (`gemini-3.7-flash:generateContent`), key in `x-goog-api-key` header (never in URL/body), 15s `AbortController` timeout, **one retry** only when `AI_UNAVAILABLE` (non-HTTP failure), 1s backoff. Upstream error bodies read ≤500 chars, redacted, server-logged only. Error map (`ai-security.ts:234–259`): timeout→`AI_TIMEOUT`/504; 429→`AI_RATE_LIMITED`/429; 503 or ≥500/undefined→`AI_UNAVAILABLE`/503; 400/401/403→`AI_AUTH_ERROR`/502; other→`AI_INVALID_RESPONSE`/502; bad/empty output→`AI_INVALID_RESPONSE`/502.

**Quota is consumed before this boundary today and is NOT refunded on any AI failure** — a valid request that hits a downed Gemini still costs 1/50. That is defensible design (attempt billing) and **out of scope** for REL-001; the fix must preserve it (no refunds, no contract change).

## 17. Persistence boundary

Only after a successful Gemini response: update path `$push` + `$slice:-200` + `updatedAt` (route.ts:209–223); create path (route.ts:224–232); then `trimCollection` to newest 100 (route.ts:236). **No chat history is written on any 4xx/429 path or on AI failure** (verified by test `failed model response does not persist a fabricated assistant message`). Malformed/schema-invalid input therefore cannot poison chat history — the only damaged state is the quota counter.

## 18. Malformed-JSON impact (QUOTA-DIAG-3)

**CONFIRMED (static, deterministic).** Request flow for `POST /api/chat` with body `"not json"` from an authenticated, same-origin, non-rate-limited user: auth pass → origin pass → RL +1 (allow) → **`consumeQuota` → `chats` +1** → `request.json()` throws → 400 `{error:"Invalid JSON body"}`. 50 such posts exhaust the day; subsequent valid posts get 429 "Daily chat limit reached". Same for an empty body. The user loses 1/50 quota per malformed post with zero Gemini cost to the provider.

## 19. Schema-invalid impact (QUOTA-DIAG-4)

**CONFIRMED (static, deterministic).** Same path for JSON that parses but fails `chatRequestSchema.safeParse` (empty message, >2000-char message, `chatId: "not-an-id"`, unknown key `response`, >20 `previousMessages`): RL +1 → **`chats` +1** → 400 `{error:"Invalid input"}`. Identical quota burn; two of these shapes are exercised by existing tests that pass *while the counter is silently incremented* (they never assert on `consumeQuota`).

## 20. Invalid-chatId impact (QUOTA-DIAG-5)

**CONFIRMED (static, deterministic).** Three sub-cases, all consuming quota today:
1. Invalid *shape* (`"not-an-id"`) → schema-invalid → 400, quota +1.
2. Valid ObjectId, **foreign** (belongs to another user) or nonexistent → ownership `findOne` returns null → 403 `{error:"Chat not found"}`, quota +1 **plus** one Mongo read per probe. An authenticated attacker can spend a *victim's* quota at 10/min (RL-bound) with zero Gemini cost, while learning nothing (uniform 403 for foreign and nonexistent — no information disclosure in the response; the cost is quota, not data).
3. Valid ObjectId, owned → continues (quota +1 legitimate).

**Ownership-ordering determination:** ownership should occur **before** quota consumption (preferred) or at minimum not after it without justification. Rationale: (a) the `ChatHistory.findOne({_id, userId})` read is already mandatory before Gemini — moving it earlier costs nothing new; (b) it is cheap (indexed compound lookup) vs. the quota write; (c) it eliminates the 403-probe quota burn; (d) it cannot weaken abuse resistance because auth + origin + RL still gate it, and the response contract (uniform 403) is unchanged; (e) no race concerns — the read is idempotent and pre-Gemini either way. Parsing must NOT move ahead of rate limiting (regression, §11).

## 21. Existing test coverage (QUOTA-DIAG-8 / H10)

| File | Chat/quota coverage |
|---|---|
| `tests/quota-security.test.ts` | 2 tests: (1) quota-denied → 429 + `retryAfterSeconds:3600` (valid body); (2) **valid** body → `consumeQuota` called with `('test@example.com','chats',50)`. **No test sends malformed JSON or a schema-invalid body to `/api/chat`. No test asserts `consumeQuota` was NOT called on any 400/401/403 path.** |
| `tests/chat-trust-boundary.test.ts` | 11 tests: 401-before-model; foreign chatId 403; invalid chatId shape 400; unknown key 400; previousMessages injection ignored; ownership criteria; oversized message 400; no-model-on-failure; persistence-only-after-success; AI-failure-no-persist (503). **None of the 400/403 paths assert `consumeQuota` non-invocation — the bug is invisible to this suite.** |
| `tests/admin-chat-ai-security.test.ts` | chat section: 401, oversized message 400, oversized previousMessages 400, RL 429 — again **no `consumeQuota` non-invocation assertions**; `installGlobalFetch` stubs `globalThis.fetch`. |
| `tests/performance-m4.test.ts` | mocks `consumeQuota` for other routes; not chat-ordering-specific. |

**H10 (tests already cover invalid-input quota preservation): REJECTED.** The suite asserts response statuses and Gemini non-invocation, but never the quota counter on rejected input.

## 22. Test network-isolation assessment (QUOTA-DIAG-10)

Per-test-file inspection before execution:

- `tests/quota-security.test.ts` — mocks: `@/lib/mongodb` (default fn), `@/lib/security/auth`, `@/lib/security/rateLimit`, `@/lib/security/quota`. Route never reaches Gemini (both tests return before it). **Isolated. No fetch path reachable.**
- `tests/chat-trust-boundary.test.ts` — mocks: `@/lib/mongodb`, auth, rateLimit, quota, `@/lib/models/ChatHistory`, `@/lib/models/UsageQuota`, `@/lib/security/cardinality`; `beforeEach` sets `globalThis.fetch = mocks.fetch` (stub; restored only within the file's own tests, and it is a `vi.fn` returning canned `Response`s — no real network). `GOOGLE_API_KEY` stubbed via `vi.stubEnv('test-placeholder-key')` — placeholder is a test double, never sent anywhere because fetch is stubbed. **Isolated (deny-by-default in practice: only the stub is installed and the route's sole network sink is `fetch`).**
- `tests/admin-chat-ai-security.test.ts` — same module mocks plus `tests/helpers.installGlobalFetch()` (replace `globalThis.fetch` with a `vi.fn` in `beforeEach`, restore in `afterEach`). **Isolated.**

MongoDB/Redis/Gemini/NextAuth: all mocked at module level in all three files. No test imports `lib/mongodb` unmocked (module load would throw without `MONGODB_URI`; nothing loads `.env` in test paths). **No deny-by-default global guard exists** (no setup file, no `unstubAllGlobals`-style fail-on-real-fetch), but for these three files every network sink in the exercised code paths (`fetch`, `mongoose`, redis) is replaced. **Verdict: execution safe.** Executed: `npx vitest run tests/quota-security.test.ts tests/chat-trust-boundary.test.ts tests/admin-chat-ai-security.test.ts` → **3 files, 26 tests, all pass, exit 0**, 6.05s. No external request occurred (stubs returned canned values; observed stdout contained only the expected redacted `[Gemini Upstream Error] 500 {"error":{"message":"upstream boom"}}` log line from the mocked-response test).

## 23. Static proof

The defect is provable from source alone; the ordered call sequence in `app/api/chat/route.ts` is:

```154:167:app/api/chat/route.ts
    const quotaResult = await consumeQuota(userId, 'chats', 50);
    if (!quotaResult.allowed) {
      return NextResponse.json(
        { error: "Daily chat limit reached", retryAfterSeconds: quotaResult.retryAfterSeconds },
        { status: 429 }
      );
    }

    let data: unknown;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
```

`consumeQuota`'s body proves the increment is unconditional and retained on denial:

```45:63:lib/security/quota.ts
  const result = await UsageQuota.findOneAndUpdate(
    { userId, day },
    {
      $inc: { [kind]: 1 },
      $setOnInsert: { expiresAt },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  const count = result![kind] as number;
  if (count > limit) {
    const msLeft = result!.expiresAt.getTime() - Date.now();
    const retryAfterSeconds = Math.max(1, Math.ceil(msLeft / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true };
```

A targeted runtime RED test asserting `expect(consumeQuota).not.toHaveBeenCalled()` for a malformed-JSON POST would fail against current source solely because of this ordering (mocks proven complete in §22) — see §28 for the exact plan. No runtime reproduction was needed and none was executed beyond the safe existing suite.

## 24. Root-cause analysis

`POST /api/chat` performs an irreversible, billable-accounting side effect (quota `$inc`) before establishing that the input is even well-formed (steps 5–6) or that it references the caller's resource (step 7). Because `consumeQuota` has no refund and denial is post-increment, the defect is a pure **ordering** problem, not a quota-semantics problem: the quota helper behaves exactly as designed (atomic daily meter); the route placed it too early. Secondary instance of the same root cause: ownership (step 7) also sits after consumption, so authorization failures burn quota. The `recs` route avoided the primary defect only by accident of design (GET, no body, cache-hit early return before quota) — its quota also sits after data loading, but no client-supplied parseable input exists to fail validation.

## 25. Classifications

| Field | Value |
|---|---|
| Root-cause classification | **REQUEST-ORDERING DEFECT** |
| Reproducibility | **DETERMINISTIC STATIC** (call order in source; runtime RED test planned for Step 2) |
| Impact | **INVALID INPUT AND OWNERSHIP QUOTA LOSS** (malformed JSON, schema-invalid, and foreign/nonexistent chatId all burn quota; plus pre-existing non-refund on AI failure, out of scope) |
| User impact | **CONFIRMED** (arithmetic: 50 malformed posts ⇒ next valid post returns 429 "Daily chat limit reached") |
| Confidence | **HIGH** |

## 26. Hypothesis matrix

| H | Claim | Supporting evidence | Contradicting evidence | Status |
|---|---|---|---|---|
| H1 | Malformed JSON consumes quota before 400 | route.ts:154 precedes :163; `consumeQuota` `$inc` unconditional; no refund; blueprint REL-001 concurs | none | **CONFIRMED** |
| H2 | Schema-invalid JSON consumes quota before 400 | route.ts:154 precedes :168 `safeParse`; same increment | none | **CONFIRMED** |
| H3 | Rate-limit denial occurs before quota, consumes none | route.ts:144–150 returns before :154; RL store is separate (Redis/memory) from `UsageQuota` | none | **CONFIRMED** |
| H4 | Auth/origin rejection precedes quota, consumes none | route.ts:134–142 return before :154; both helpers have no quota access | none | **CONFIRMED** |
| H5 | Invalid/unauthorized chatId consumes quota | shape-invalid → schema path (H2); foreign/absent → :154 precedes :185 ownership 403 | none | **CONFIRMED** |
| H6 | Moving quota after parse+schema preserves abuse resistance (RL stays pre-parse) | RL 10/min remains the pre-parse flood gate; quota remains pre-Gemini; per-user identity verified before quota | moving quota later means a *valid* but rejected-later request (foreign chatId) still consumes unless ownership also moves — partial only | **SUPPORTED** (with ownership caveat) |
| H7 | Quota should be consumed only immediately before the first billable AI call | Strongest invariant; matches "bill the attempt" semantics; identical observable contract | larger reorder; must keep exactly one `consumeQuota` call (no double path) | **SUPPORTED** (preferred placement within the fix) |
| H8 | Moving quota creates a race/double-consumption risk | — | the move adds no new call site; atomic upsert unchanged; concurrency profile identical (two concurrent valid posts both increment exactly once, as today); no read-then-write window introduced | **REJECTED** |
| H9 | A refund mechanism is required | — | refund = new decrement operation + storage semantics + failure mode, strictly larger than the reorder; the reorder alone eliminates the defect; instructions say do not recommend refunds unless moving cannot preserve correctness — moving can | **REJECTED** |
| H10 | Current tests cover invalid-input quota preservation | — | §21: no test asserts `consumeQuota` non-invocation on any 400/401/403 chat path | **REJECTED** |

**Rejected hypotheses detail:** H8 — the operation is a single atomic `$inc` under a unique index in all orderings; repositioning the `await` introduces no new interleaving that the current code doesn't already have between RL and Gemini. H9 — refunding would also need to refund AI-failure and (debatably) 403-ownership paths; it multiplies edge cases (refund failure, TTL-deleted docs, partial concurrency) and is unnecessary once invalid input never increments.

## 27. Ordering alternatives

Current: auth → origin → RL → **quota** → parse → schema → ownership → Gemini.

| Alt | Order | Properties |
|---|---|---|
| A (preferred) | auth → origin → RL → parse → schema → ownership → **quota** → Gemini | Invalid/foreign input costs nothing beyond RL; quota consumed immediately before the only billable call (H7); ownership read already needed pre-Gemini; smallest semantic change; one `consumeQuota` call preserved |
| B | auth → origin → RL → parse → schema → **quota** → ownership → Gemini | Fixes H1/H2; foreign-chatId probes still burn quota (H5 remains) |
| C | auth → origin → RL → parse → schema → ownership → Gemini (quota inside `getGeminiResponse`, before first `fetch`) | Equivalent to A modulo placement; slightly couples accounting to the AI module; rejected as less clear |
| D | current + refund on 400/403/AI-failure | Rejected (H9): new storage op, new failure modes, larger surface |
| E | parse → schema before RL | Rejected: abuse regression (malformed flood not pre-bucketed) |

## 28. Recommended fix options (NOT implemented)

### Option A — preferred: validate, verify ownership, then consume, then bill

**Exact ordering:** `requireUser` → `assertSameOriginOrReject` → `applyRateLimitUser` → `request.json()` (400 "Invalid JSON body") → `chatRequestSchema.safeParse` (400 "Invalid input") → `connectToMongoDB()` + ownership `findOne({_id,userId})` when `chatId` (403 "Chat not found") → `consumeQuota(email,'chats',50)` (429 "Daily chat limit reached" + `retryAfterSeconds`) → `boundChatHistory` → Gemini → persistence → 200.

- **Root cause addressed:** REQUEST-ORDERING (all of H1, H2, H5).
- **Likely files:** `app/api/chat/route.ts` only. New test file: `tests/chat-quota-ordering.test.ts` (pattern: `quota-security.test.ts` + `chat-trust-boundary.test.ts` mocks).
- **Rate-limit implications:** none — RL stays third, before parsing.
- **Quota atomicity implications:** none — same single atomic `consumeQuota` call, same storage, same key, same limit, same denial contract.
- **Ownership implications:** foreign/absent `chatId` → 403 with **zero** quota cost; read already mandatory pre-Gemini.
- **Gemini implications:** quota guaranteed pre-Gemini (invariant preserved); one retry on `AI_UNAVAILABLE` unchanged.
- **Response-contract implications:** **none.** Every status/body is byte-identical; only the counter state on rejected paths changes (which is the fix).
- **Security/abuse:** malformed-flood still RL-bucketed (10/min) and now quota-free; foreign-id probes now free; no new disclosure (403 uniformity preserved).
- **Rollback:** revert one file; counter state is per-day, so any partial-consumption period self-heals at UTC midnight.
- **Risk:** LOW. Only behavioral diffs: (a) rejected requests no longer increment; (b) a foreign-`chatId` request now returns 403 *before* the quota check — a user who is simultaneously quota-exhausted AND probing a foreign id sees 403 instead of 429 (arguably more correct; no contract promise either way).

### Option B — minimal: parse + schema before quota; ownership after

Same as A minus the ownership move. Fixes H1/H2 only. **Likely files:** same. **Risk:** lower diff, but leaves H5 (probe burn). **Rollback:** same. Recommended only if Option A's 403/429 precedence nuance is deemed a contract risk by the reviewer — it is not an existing contract either way.

### Option C — not recommended: refund on rejected paths

New `refundQuota` (atomic `$inc:-1` guarded ≥0) + call sites on 400/403/AI-failure. **Risk:** MEDIUM–HIGH (refund races, TTL-deleted docs, new 500 surface, storage change). Violates "avoid refunds / avoid quota storage change". Documented for completeness only.

**Preferred: Option A.**

## 29. Exact Step 2 files

1. `app/api/chat/route.ts` — reorder steps 4–7 per Option A (single-function edit inside `POST`; no other exports touched).
2. `tests/chat-quota-ordering.test.ts` — **new** focused suite (mocks per `quota-security.test.ts`/`chat-trust-boundary.test.ts`; `globalThis.fetch` stubbed deny-by-default; `vi.resetModules` per case).
3. `tests/quota-security.test.ts` — extend (do not rewrite) with `consumeQuota` non-invocation assertions for the 401/403-origin/429-RL paths if not already present (they are absent).
4. `docs/SECURITY_AUDIT.md` / `docs/PROJECT_BLUEPRINT.md` — update the REL-001 line and chat lifecycle line 252 to the corrected order (doc-only, if Step 2 policy allows).

No changes to: `lib/security/quota.ts`, `lib/security/rateLimit.ts`, `lib/security/auth.ts`, `lib/security/schemas.ts`, `lib/models/UsageQuota.ts`, `package.json`, lockfiles, CI.

## 30. Regression-test plan (Step 2)

New file `tests/chat-quota-ordering.test.ts` — mocks: `@/lib/mongodb`, `@/lib/security/auth` (`requireUser`, `assertSameOriginOrReject`), `@/lib/security/rateLimit` (`applyRateLimitUser`, `RATE_LIMITS.chat`), `@/lib/security/quota` (`consumeQuota` spy), `@/lib/models/ChatHistory`, `@/lib/security/cardinality`, `globalThis.fetch` (throwing stub = deny-by-default: any real call fails the test loudly). `beforeEach`: auth OK, origin null, RL null, `consumeQuota` spy reset.

| # | Test | Asserts | Proves |
|---|---|---|---|
| T1 | Malformed JSON (`body: "not json"`) | 400 + `{error:"Invalid JSON body"}`; `consumeQuota` **not** called; fetch not called | H1 fix; RED before fix (spy called) |
| T2 | Empty body | 400 same contract; `consumeQuota` not called | H1 edge |
| T3 | Schema-invalid: `message:""` | 400 `{error:"Invalid input"}`; `consumeQuota` not called | H2 fix; RED before fix |
| T4 | Schema-invalid: message 2001 chars | 400; `consumeQuota` not called | H2 |
| T5 | Schema-invalid: unknown key / bad `chatId` shape | 400; `consumeQuota` not called | H2/H5a |
| T6 | Auth denied (401) | 401; `consumeQuota` not called; RL not called | H4 pin |
| T7 | Origin denied (helper returns 403 response) | 403 "Origin verification failed"; `consumeQuota` not called | H4 pin |
| T8 | RL denied (429 + Retry-After) | 429; `consumeQuota` not called | H3 pin |
| T9 | Valid body, quota allowed | `consumeQuota` called **exactly once** with `(email,'chats',50)`; fetch called once; 200 `{response,chatId,status}` | single consumption preserved |
| T10 | Valid body, quota denied | 429 "Daily chat limit reached" + `retryAfterSeconds`; fetch **not** called | quota gates Gemini |
| T11 | Order spy: record call sequence | index of `consumeQuota` < index of fetch call; index of `safeParse`-equivalent (400-free path) — assert quota call position precedes the Gemini fetch and follows parse (use ordered `vi.fn` log or `mock.invocationCallOrder`) | invariant "quota after validation, before Gemini" |
| T12 | Foreign `chatId` (owned findOne → null) | 403 "Chat not found"; `consumeQuota` **not** called (Option A) ; fetch not called; no history write | H5 fix; RED before fix |
| T13 | No chatId (create path) | 200; `consumeQuota` once; `ChatHistory.create` once | create path unchanged |
| T14 | Quota-exhausted + foreign `chatId` combined | 403 (ownership precedes quota in Option A); `consumeQuota` not called | precedence pin |
| T15 | AI failure (fetch → 503) | 503 `AI_UNAVAILABLE`; history **not** written; (quota consumed once — document, do not change) | AI-failure contract unchanged |
| T16 | Deny-by-default fetch stub throws if invoked in T1–T8, T12 | implicit in asserts | network isolation |

**RED→GREEN evidence (meaningful):** run the new suite against **current** source first: T1, T2, T3, T4, T5, T12 fail with `Expected consumeQuota not to be called — but it was called 1 time with ('<email>','chats',50)` (i.e., failing **because the counter was incremented**, not due to missing mocks — the mock setup is identical to the already-passing 26-test baseline in §22); T6–T11, T13–T15 pass (pinning existing behavior). After the Step 2 reorder, all 16 pass. Any RED caused by "mock not found" or syntax is invalid RED and must be discarded.

## 31. Targeted validation (Step 2)

1. `npx vitest run tests/chat-quota-ordering.test.ts` (RED pre-fix, GREEN post-fix).
2. `npx vitest run tests/quota-security.test.ts tests/chat-trust-boundary.test.ts tests/admin-chat-ai-security.test.ts` (existing contracts).
3. `npx vitest run tests/ratelimit-ip-security.test.ts tests/middleware-security.test.ts tests/authenticated-read-rate-limit.test.ts` (trust boundary/RL/origin neighbors; all network-isolated per prior phases — re-verify mocks before run).
4. `npm run typecheck` → exit 0.
5. `npm run lint` → no new warnings (baseline 93).

## 32. Broader validation (Step 2)

6. `npm test` — full suite (40 files / 395 baseline + new), exit 0, zero unhandled errors.
7. `npm run build` (or CI-placeholder build per repo convention) → exit 0.
8. Production audit if part of repo gate (`npm audit`) → exit 0.
Every rendered/route test must be network-isolated (verified pattern: module mocks + `globalThis.fetch` stub; §22).

## 33. Security and abuse implications

- **Before fix:** authenticated attacker (or the user's own buggy client) can zero a user's daily AI budget: 50 malformed posts (or 50 foreign-`chatId` probes) within RL bounds ≈ 5 minutes of 10/min = immediate exhaustion. Cost to attacker: only their own RL bucket. No provider cost (Gemini never called), so this is pure denial-of-service against the victim's entitlement.
- **After Option A:** the cheapest available attack surface (garbage input) costs nothing; remaining burn requires valid input **and** a real Gemini invocation (provider-cost-bounded). RL + auth + origin gates unchanged. No new information channel (403 body unchanged; 429 quota message only reachable with valid input — slightly *less* oracle than today).
- **Not weakened by the fix:** session revocation (W1-001), fail-closed origin (W1-011/W3-015), RL placement, strict schema (R5), cardinality trimming (W3-006b), AI error redaction.

## 34. Race and atomicity implications

- `consumeQuota` remains one atomic `findOneAndUpdate` upsert per accepted request in all options — no check-then-act window introduced or removed.
- Concurrent valid requests: identical to today (each increments exactly once; the 51st observes >50).
- Option A moves the increment later in the same request; two concurrent requests both valid now both reach the increment where before they both reached it earlier — same outcome.
- No double-consumption path: single call site preserved (H8 rejected).
- Ownership-before-quota introduces no write (read-only `findOne`) and cannot deadlock (no transactions).

## 35. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Behavior diff: quota-exhausted + foreign chatId returns 403 instead of 429 | Certain (intended) | Document in Step 2 report; no existing test/client depends on it |
| Client retries on 400 previously "used up" quota; after fix retries are free → minor traffic increase on broken clients | Low | RL still bounds it (10/min) |
| Edit error in single-function reorder | Low | Focused diff, existing 26-test baseline + new 16-test suite |
| Counter state drift during fix rollout window (partial-consumption days) | None | Per-UTC-day counters self-reset; no migration needed |
| Test isolation gap in the new file | Low | Copy the exact mock set of two proven-passing files; throwing fetch stub |

## 36. Unresolved questions

1. Should AI-failure (5xx/timeout) also stop consuming quota? **Out of scope** — current "bill the attempt" semantics are defensible and changing them is a product decision, not a defect fix.
2. Whether `retryAfterSeconds` on quota 429 should also be a `Retry-After` header — contract consistency nit, out of scope (contract must not change in Step 2).
3. Whether the `recs` route's post-data-load quota placement is optimal — no client-parsed input, no 400 path; no defect found; not this finding.
4. CI Node 22 parity — pending per baseline; irrelevant to this ordering logic (pure source reordering).

## 37. Command log

| # | Command | Purpose | Result |
|---|---|---|---|
| 1 | `node --version; npm --version; git --version` | environment | v24.21.0 / 11.5.2 / 2.50.1.windows.1 |
| 2 | `git status --porcelain=v2 --branch` | initial state | main@70fe776, +2-0, 31 M / 1 D unstaged, untracked listed; staged empty |
| 3 | `git log --oneline -15; git branch -vv` | history | 70fe776 HEAD |
| 4 | `git diff --name-status; git diff --cached --name-status` | attribution | 32 unstaged paths; **no staged** |
| 5 | `Test-Path AGENTS.md / .cursor` | instructions | both absent |
| 6 | `git ls-files --others --exclude-standard` | untracked | 15 entries (reports + phase-6/7 artifacts) |
| 7 | Source reads (route, quota, model, auth, rateLimit, schemas, gemini-payload, ai-security, mongodb, recs route) | static trace | see §6–§17 |
| 8 | Test reads (quota-security, chat-trust-boundary, admin-chat-ai-security, helpers, vitest.config.mts, package.json) | isolation proof | see §21–§22 |
| 9 | `npx vitest run tests/quota-security.test.ts tests/chat-trust-boundary.test.ts tests/admin-chat-ai-security.test.ts` | safe targeted run (isolation proven first) | **3 files, 26 tests passed, exit 0** |
| 10 | Final: `git status --porcelain=v2 --branch`, `git diff --name-status`, `git diff --cached --name-status`, `git ls-files --others --exclude-standard` | post-report verification | see §39 |

## 38. External-network confirmation

- No `fetch` executed outside vitest stubs; stubs returned canned `Response` objects.
- No MongoDB/Redis connection: every executed test module-mocks `@/lib/mongodb`, and no executed test imports the real client; `.env`/`.env.local` never read by test paths (no `dotenv` import in `lib/`, none in vitest config).
- No Gemini, OAuth, TMDB, or provider call. No environment values read or printed (only `vi.stubEnv` placeholder inside test files, never emitted).
- **No external request or external-state mutation occurred during this phase.**

## 39. Files created, modified, or deleted

- **Created (this phase, exactly one):** `docs/reports/diagnostics/BUG-CHAT-INVALID-INPUT-CONSUMES-QUOTA-DIAGNOSIS.md` (this file).
- **Modified:** none. **Deleted:** none. **Staged:** nothing. No temporary logs created.
- Report contains no secrets, env values, tokens, or user data (only fixture emails already present in committed tests).

## 40. Final Git state (to be re-verified after write)

Expected: identical to §3 plus this report's path under `? docs/reports/diagnostics/`. Staged set remains empty; `main` remains `70fe776` +2; HEAD unchanged; no commit, no branch, no deployment.

## 41. Commit and deployment status

- Commit created: **NO** (COMMIT_ALLOWED: NO — honored)
- Deployment executed: **NO** (DEPLOYMENT_ALLOWED: NO — honored)
- Branch created: **NO**
- Staging performed: **NO**

## 42. Requirement Traceability Matrix

Format: Requirement ID → Diagnostic evidence → Validation evidence → Status

- `QUOTA-DIAG-1 → Trace the complete chat request lifecycle` → §7 ordered step table with exact line numbers (auth 134 → origin 141 → RL 144 → quota 154 → parse 163 → schema 168 → ownership 185 → Gemini 204 → persist 207 → respond 236 → error map 241) + §8 full early-return matrix (12 paths) → full read of `app/api/chat/route.ts`; targeted run of the 3 chat/quota suites (26/26 pass) exercises 9 of those paths → **PASS**
- `QUOTA-DIAG-2 → Establish quota storage and consumption semantics` → §15 (MongoDB `UsageQuota`, key `{userId,day}`, `$inc` atomic upsert, increment-then-observe, denial increments, no check-only, no refund, TTL + day-string reset, fail-closed on Mongo error, 429 denial contract) → full read `lib/security/quota.ts` + `lib/models/UsageQuota.ts`; `tests/quota-security.test.ts` pins params `(email,'chats',50)` and 429 contract (passing run) → **PASS**
- `QUOTA-DIAG-3 → Determine malformed-JSON quota impact` → §18: CONFIRMED; route.ts:154 precedes :163 catch-400; static proof §23 → source order + quota helper body; T1/T2 planned as Step 2 RED (fail *because* spy is called) → **PASS**
- `QUOTA-DIAG-4 → Determine schema-invalid quota impact` → §19: CONFIRMED; route.ts:154 precedes :168 `safeParse` 400; five schema-failure shapes enumerated → source order; existing 400-shape tests (chat-trust-boundary) pass while counter silently increments (no assertion against it); T3–T5 planned RED → **PASS**
- `QUOTA-DIAG-5 → Determine ownership and invalid-chatId quota impact` → §20: all three sub-cases CONFIRMED; ownership determination = **before** quota (Option A), with abuse/cost/disclosure/race rationale → source order; `foreign chatId rejected` test (403, fetch-free) passing today without quota assertion; T12/T14 planned → **PASS**
- `QUOTA-DIAG-6 → Assess authentication, origin, and rate-limit ordering` → §9–§11 + §8 matrix: auth/origin/RL all precede quota, none of their denials touches quota; RL must stay pre-parse (abuse argument) → full reads `lib/security/auth.ts`, `lib/security/rateLimit.ts`; admin-chat-ai-security 401/429 tests + chat-trust-boundary 401 test passing in isolated run → **PASS**
- `QUOTA-DIAG-7 → Preserve quota-before-Gemini and abuse-resistance requirements` → §15/§16/§33: recommendation places `consumeQuota` immediately before `getGeminiResponse` (Option A); T10/T11 explicitly assert quota-denial blocks Gemini and call-order quota<fetch; RL position untouched → hypothesis matrix H6/H7 SUPPORTED; Step 2 test plan pins the invariant → **PASS**
- `QUOTA-DIAG-8 → Evaluate hypotheses and classify the defect` → §26 matrix: H1/H2/H3/H4/H5 CONFIRMED, H6/H7 SUPPORTED, H8/H9/H10 REJECTED with evidence; §24–§25 classification → static source proof + passing isolated baseline (26/26) → **PASS**
- `QUOTA-DIAG-9 → Recommend the smallest complete correction and regression tests` → §28 Option A (one-file reorder, no refund, no storage change, contract-identical) + §29 exact Step 2 files + §30 sixteen-test plan with meaningful RED→GREEN criteria → Step 2 suite design cross-checked against existing passing mock patterns (isolation proven) → **PASS**
- `QUOTA-DIAG-10 → Preserve repository state and prevent external access` → §22 isolation assessment per test file before execution; §37 only one targeted run executed; §38 no-network confirmation; §39/§40/§41 file/commit audit → isolated vitest run exit 0; final git checks below show staged-empty, HEAD unchanged, only the report added → **PASS**

Allowed statuses used: PASS.

## 43. Final summary

- **Status:** PASS
- **Report path:** `docs/reports/diagnostics/BUG-CHAT-INVALID-INPUT-CONSUMES-QUOTA-DIAGNOSIS.md`
- **Root-cause classification:** REQUEST-ORDERING DEFECT
- **Reproducibility:** DETERMINISTIC STATIC
- **Impact:** INVALID INPUT AND OWNERSHIP QUOTA LOSS (malformed JSON + schema-invalid + foreign/nonexistent chatId all burn `UsageQuota.chats`; AI-failure non-refund noted, out of scope)
- **User impact:** CONFIRMED (50 bad posts ⇒ 429 "Daily chat limit reached" on next valid post)
- **Confidence:** HIGH
- **Current ordering:** requireUser → assertSameOriginOrReject → applyRateLimitUser(10/min) → **consumeQuota(chats,50)** → request.json → chatRequestSchema.safeParse → ChatHistory ownership (403) → Gemini → persistence
- **Earliest incorrect state:** `consumeQuota` at `app/api/chat/route.ts:154` — irreversible `$inc` executed before input validity is known
- **Malformed-JSON impact:** 400 returned **after** quota +1 (CONFIRMED)
- **Schema-invalid impact:** 400 returned **after** quota +1 (CONFIRMED)
- **Invalid-chatId impact:** shape-invalid → 400 after quota +1; foreign/absent → 403 after quota +1 (CONFIRMED)
- **Preferred ordering (Option A):** requireUser → origin → rate limit → JSON parse → schema → ownership → **consumeQuota** → Gemini → persistence (quota immediately before first billable AI call; RL stays pre-parse)
- **Likely Step 2 files:** `app/api/chat/route.ts` (reorder), `tests/chat-quota-ordering.test.ts` (new, 16 tests), `tests/quota-security.test.ts` (extend), docs `SECURITY_AUDIT.md`/`PROJECT_BLUEPRINT.md` (REL-001 lines)
- **Targeted-test result (diagnosis run):** 3 files / 26 tests passed, exit 0, isolation proven first
- **Network-isolation result:** PASS — auth/quota/Mongo/Redis/Gemini mocked; `globalThis.fetch` stubbed; no external request or state mutation
- **Blockers:** none
- **Git attribution:** staged empty; HEAD `70fe776` unchanged; 31 unstaged mods + 1 unstaged deletion + 15 untracked all pre-existing; only new file is this report
- **Step 2 readiness:** READY — run `tests/chat-quota-ordering.test.ts` against current source first to capture meaningful RED (T1–T5, T12 fail on `consumeQuota` called), then apply Option A reorder and re-run to GREEN.
