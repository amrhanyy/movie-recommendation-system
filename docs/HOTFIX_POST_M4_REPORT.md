# HOTFIX (POST-M4) REPORT — Mongoose-8 driver shape + projection contract

**Base:** `4b34b1b` (main). **Date:** 2026-09-08 ~06:15 GMT+3. **Diagnostic:** `docs/DIAGNOSTIC_POST_M4_PROD_FAILURE.md` (ACCEPTED).
**P1:** list-write 500s (prod data-path). **P2:** `/ai-assistant` client crash.
**Constraints honored:** zero breaking public JSON changes, zero visual UI changes, zero new deps, no `as any`, frozen suites (`documentation-contract`, `operational-security`) UNMODIFIED.

---

## 1 Context Confirmation (file + verbatim lines)

| # | Source | Verbatim confirmation |
|---|--------|------------------------|
| 1 | `git log --oneline -1` (pre-edit) | `4b34b1b perf(client): FavoritesContext single-fetch favorites and phase report` |
| 2 | `app/api/favorites/route.ts` POST l35–135 (pre-edit) | `const res = (await FavoritesModel.findOneAndUpdate( … { upsert: true, new: true, includeRawResult: true } )) as unknown as FavoritesUpsertResult;` (l99–111); `const isUpsert = !!res.lastErrorObject?.upserted;` (l112); `const doc = res.value;` (l113); rollback `if (isUpsert) { … if (countAfter > MAX_LIST_ITEMS && doc) { await FavoritesModel.deleteOne({ _id: doc._id }); … } }` (l118–127); `return NextResponse.json(doc);` (l129) |
| 3 | `app/api/watchlist/route.ts` POST (pre-edit) | Identical shape: `type WatchlistUpsertResult` (l96–99), `WatchlistModel.findOneAndUpdate` (l101–115) with `{ upsert: true, new: true, includeRawResult: true }` (l115), `$set` includes `addedAt: new Date()` (l112), `isUpsert`/`doc = res.value` (l117–118), rollback l121–130, `return NextResponse.json(doc);` (l134) |
| 4 | `app/api/chat-history/list/route.ts` l19–29 (pre-edit) | `const chats = await ChatHistory.find({ … }).sort({ updatedAt: -1 }).limit(100).select({ _id: 1, title: 1, updatedAt: 1, createdAt: 1 }).lean();` (l20–29) — **`messages` ABSENT** |
| 5 | `components/ChatList.tsx` l57–59 (pre-edit) | `const getPreviewText = (messages: ChatSession['messages']) => { const lastUserMessage = messages.filter(m => m.role === 'user')[0] || messages[0] … }` — `messages.filter` on `undefined` throws |
| 6 | `components/ChatList.tsx` l107 | `const previewText = getPreviewText(chat.messages)` (search path) |
| 7 | `components/ChatList.tsx` l147 | `{getPreviewText(chat.messages)}` (per-item preview) |
| 8 | `tests/list-capacity-security.test.ts` (pre-edit) | `mocks.findOneAndUpdate.mockReset().mockResolvedValue({ lastErrorObject: {}, value: { _id: 'x' } });` (l91) and the rawResult-shaped mocks at l134, l146, l163–165, l182–184, l203, l219 — **masks the real driver shape** |
| 9 | `tests/performance-m4.test.ts` (pre-edit) | `expect(chain.select).toHaveBeenCalledWith({ _id: 1, title: 1, updatedAt: 1, createdAt: 1 });` (l266) — encodes the broken projection |
| 10 | `node_modules/mongoose/lib/query.js:3535` (re-confirmed this session) | `const doc = !options.includeResultMetadata ? res : res.value;` — **`includeResultMetadata`-only** |

Installed versions: `mongoose 8.24.3`, `mongodb 6.20.0`, node `v22.17.0` (diagnostic §1.4 / §1.14).

---

## 2 Root-cause recap (verbatim diagnostic quotes + query.js:3535)

**FIX 1 (list-write 500s).** From `DIAGNOSTIC_POST_M4_PROD_FAILURE.md` §3.0:

- **F1** — "`includeRawResult` is a mongoose ≤6/7 option. In mongoose 8 the option is `includeResultMetadata`." `node_modules/mongoose/lib/query.js:3535` (verbatim): `const doc = !options.includeResultMetadata ? res : res.value;` — "Unknown options pass silently … the only raw-result key anywhere is `includeResultMetadata`."
- **F2** — "`findOneAndUpdate(…, { upsert:true, new:true, includeRawResult:true })` in mongoose 8.24.3 returns the plain **Document** (upsert path) or `null` — NEVER a `{ lastErrorObject, value }` wrapper. Therefore … `res.value` → `undefined` ⇒ **`doc` is always `undefined`** ⇒ `app/api/favorites/route.ts:129` `return NextResponse.json(doc)` serializes `undefined`."
- **F3** — "`Response.json(undefined)` throws." Reproduced: `TypeError: Value is not JSON serializable` (undici). "So l129 throws inside `try` → catch (l131) → **500 `"Failed to update favorites"`** / `"Failed to update watchlist"`**. This matches the owner-observed toast text **exactly**."

Discriminator (§3.2): "**`app/api/favorites/route.ts:129` — `return NextResponse.json(doc);` with `doc = res.value` (`l113`) perpetually `undefined`, because mongoose 8.24.3 never honors the option `includeRawResult` (`node_modules/mongoose/lib/query.js:3535` consults `includeResultMetadata` only).**"

**FIX 2 (/ai-assistant crash).** From §4.2: "`useEffect` → `fetchChats()` → `setChats(data)` where every item **lacks `messages`** (M4 projection, route l28). Next render: `groupChatsByDate(chats)` … calls `getPreviewText(chat.messages)` (l107 … and l147 per-item) → `undefined.filter` → `TypeError` during the React render pass." §4.1 contract table: `chat.messages` — "**❌ NOT projected**" — "Undefined access throws? **YES**."

---

## 3 Before/After (file:line, verbatim)

### 3.1 `app/api/favorites/route.ts` (both routes identical shape)

**Before (l94–131):**
```ts
    type FavoritesUpsertResult = {
      lastErrorObject?: { upserted?: unknown };
      value?: { _id: unknown } | null;
    };

    const res = (await FavoritesModel.findOneAndUpdate(
      { userId: …, itemId: …, type: … },
      { $set: { title: …, posterPath: … ?? null } },
      { upsert: true, new: true, includeRawResult: true }
    )) as unknown as FavoritesUpsertResult;
    const isUpsert = !!res.lastErrorObject?.upserted;
    const doc = res.value;
    // W3-005: atomic list cap with rollback — …
    if (isUpsert) {
      const countAfter = await FavoritesModel.countDocuments({ userId: authResult.user.email });
      if (countAfter > MAX_LIST_ITEMS && doc) {
        await FavoritesModel.deleteOne({ _id: doc._id });
        return NextResponse.json(
          { error: `Favorites list limit reached (maximum ${MAX_LIST_ITEMS})` },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(doc);
```

**After (`app/api/favorites/route.ts:98-141`):**
```ts
    // Mongoose 8 driver shape: `findOneAndUpdate(..., { upsert: true, new: true })`
    // returns the hydrated Document (or null on no-match).
    // Why the raw-result option is deliberately NOT requested:
    //   - `includeResultMetadata` (the mongoose-8 name) would couple the rollback
    //     and response to the driver modify-result wrapper layout; we only need
    //     the fetched-back document, which `new: true` already returns.
    //   - The mongoose<=6 raw-result option name is silently ignored by 8.x
    //     (node_modules/mongoose/lib/query.js:3535 consults
    //     `includeResultMetadata` only). That silent drop is what made the old
    //     `res.value` read perpetually undefined and turned every successful
    //     write into a 500 (`NextResponse.json(undefined)` throws).
    const res = await FavoritesModel.findOneAndUpdate(
      { userId: …, itemId: …, type: … },
      { $set: { title: …, posterPath: … ?? null } },
      { upsert: true, new: true }
    );

    // W3-005: atomic list cap with rollback — … `isNewItem` (pre-check above) is
    // the insert signal: with it the rollback is REACHABLE — previously `isUpsert`
    // read a key mongoose 8 never populates.
    if (isNewItem && res) {
      const countAfter = await FavoritesModel.countDocuments({ userId: authResult.user.email });
      if (countAfter > MAX_LIST_ITEMS) {
        await FavoritesModel.deleteOne({ _id: res._id });
        return NextResponse.json(
          { error: `Favorites list limit reached (maximum ${MAX_LIST_ITEMS})` },
          { status: 400 }
        );
      }
    }

    // `new: true` + upsert makes `res` the document; the `?? { success: true }`
    // is an unreachable guard so `NextResponse.json` always gets a serializable body.
    return NextResponse.json(res ?? { success: true });
```

**Watchlist (`app/api/watchlist/route.ts:98-142`):** identical, with `addedAt: new Date()` retained inside its `$set` (l112) and error string `Watchlist limit reached (maximum ${MAX_LIST_ITEMS})`.

Changes: **DELETE** `FavoritesUpsertResult`/`WatchlistUpsertResult` + `as unknown as` cast; **DELETE** `includeRawResult` option; **DELETE** `isUpsert`/`doc = res.value`; rollback gate `isUpsert` → `isNewItem && res`, delete target `doc._id` → `res._id`, drop the redundant `&& doc`; return `doc` → `res ?? { success: true }`.

### 3.2 `app/api/chat-history/list/route.ts` (projection)

**Before (l28):**
```ts
      .select({ _id: 1, title: 1, updatedAt: 1, createdAt: 1 })
```
**After (`app/api/chat-history/list/route.ts:27`):**
```ts
      .select({ _id: 1, title: 1, updatedAt: 1, createdAt: 1, messages: 1 })
```

### 3.3 `components/ChatList.tsx` (defense-in-depth guard)

**Before (l57–59):**
```tsx
  const getPreviewText = (messages: ChatSession['messages']) => {
    // Try to get the first user message which is more descriptive of the conversation
    const lastUserMessage = messages.filter(m => m.role === 'user')[0] || messages[0]
```
**After (`components/ChatList.tsx:57-60`):**
```tsx
  const getPreviewText = (messages: ChatSession['messages']) => {
    // Defense-in-depth: a list item missing/empty `messages` degrades to
    // 'New Chat' instead of throwing (the projection fix keeps `messages` present).
    if (!Array.isArray(messages) || messages.length === 0) return 'New Chat'
    // Try to get the first user message which is more descriptive of the conversation
    const lastUserMessage = messages.filter(m => m.role === 'user')[0] || messages[0]
```

---

## 4 Tests added/reshaped + results

**`tests/list-capacity-security.test.ts`** (9 → 14 tests):
- **Reshaped** every `findOneAndUpdate` mock from rawResult shape `{ lastErrorObject, value }` to the **real mongoose-8 plain document** `{ _id, userId, itemId, type, title }` (beforeEach l91 + l203, and in-test mocks).
- **Added (a)** `new item with count 499 -> 500: 200 and deleteOne NOT called (doc-shape mock)`.
- **Added (b)** `new item with count 499 -> 501: 400 and deleteOne({_id: new-id}) exactly once`.
- **Added (c)** `re-add of existing item at cap: 200 and deleteOne never called`.
- **Added (d) SERIALIZATION GUARD** `serialization guard: 200 body is the doc carrying its itemId (doc-shape mock)` — asserts `res.status===200` AND `await res.json()` resolves to an object with `itemId===603` (kills the `Response.json(undefined)` class on these routes).
- **Retargeted** `never deletes on the update path` → `never deletes on the re-add path` (`exists` true) — the rawResult `upserted:false` signal no longer exists; `isNewItem` false is the no-delete signal.
- **Added CONTRACT TRIPWIRE** `list-write route source contract (mongoose-8 shape)`: fs-read of both route sources asserts **neither** `includeRawResult` **nor** `lastErrorObject` is present (house style mirrors `tests/edge-import-contract.test.ts`).

**`tests/performance-m4.test.ts`**: select assertion updated to `… createdAt: 1, messages: 1`.

**`tests/chat-list-contract.test.ts`** (new, 2 tests): statically extracts consumed keys from `components/ChatList.tsx` (regex `chat\.(\w+)`, deduped) and select keys from the route's `.select({ … })` block (fs-read); asserts select keys are a **superset** of consumed keys; second test pins `messages` in the projection. Fast + deterministic.

**Results:** 33 test files / **326 tests passed, 0 failed**. Touched suites green: `list-capacity-security` (14), `performance-m4` (10), `chat-list-contract` (2). Frozen suites **unmodified & green**: `documentation-contract` (20), `operational-security` (29).

---

## 5 Commands + exit codes + tails (direct exit codes only)

All run in `D:\fork ai to create website\final porject\movie-recommendation-system` (PowerShell). Exit codes captured **directly** via `echo …_EXIT=$LASTEXITCODE` immediately after each command (no Select-String/pipe artifacts in the recorded evidence; `Tee-Object`/`Select-Object -Last` used only to truncate captured output, not the exit code).

| # | Command | Exit | Tail |
|---|---------|------|------|
| 1 | `git log --oneline -1` | 0 | `4b34b1b perf(client): FavoritesContext single-fetch favorites and phase report` |
| 2 | `npm run lint` | 0 | `✖ 96 problems (0 errors, 96 warnings)` — all pre-existing warnings; 0 errors |
| 3 | `npm run typecheck` | 0 | (clean — `tsc --noEmit`, no output) |
| 4 | `npm test` (default timeout, full, zero exclusions) | 0 | `Test Files  33 passed (33)` / `Tests  326 passed (326)` / `Duration 97.94s` |
| 5 | `npm run build` | 0 | route table + `ƒ Middleware 56.9 kB` (clean production build) |
| 6 | `npm audit --omit=dev --audit-level=high` | 0 | `found 0 vulnerabilities` |
| 7 | rg `includeRawResult` under `app/` | — (0 matches) | **zero** occurrences |
| 8 | rg `select\(\{` in `app/api/chat-history/list/route.ts` | — | l27: `.select({ _id: 1, title: 1, updatedAt: 1, createdAt: 1, messages: 1 })` — **contains `messages: 1`** |

---

## 6 Out-of-scope proof

`git status --porcelain` / `git diff --stat` (post-edits, pre-commit):

**Tracked modifications (exactly the mandated set):**
- `app/api/favorites/route.ts`
- `app/api/watchlist/route.ts`
- `components/ChatList.tsx`
- `tests/list-capacity-security.test.ts`
- `tests/performance-m4.test.ts`
- `tests/chat-list-contract.test.ts` (new)

Plus `docs/HOTFIX_POST_M4_REPORT.md` (this report, new — commit 2).

**Frozen suites untouched:** `tests/documentation-contract.test.ts` and `tests/operational-security.test.ts` are NOT in the modification list (verified via `git status`; both still green — 20 and 29 tests respectively).

**9 neutral untracked owner docs untouched:** `DEPLOYMENT_SECURITY_CHECKLIST.md`, `DIAGNOSTIC_M3_BUILD_FAILURE.md`, `DIAGNOSTIC_PROD_AUTH_FAILURE.md`, `DIAGNOSTIC_REDIS_BOOT_FAILURE.md`, `DIAGNOSTIC_REPORT.md`, `FIX_PLAN.md`, `IMPLEMENTATION_COMPLIANCE_REPORT.md`, `INTERRUPTED_REMEDIATION_RECOVERY_REPORT.md`, `OPERATIONS.md` (plus `PROJECT_ARCHITECTURE.md` and the pre-existing `DIAGNOSTIC_POST_M4_PROD_FAILURE.md`) remain **untracked and unmodified** — none staged/committed by this hotfix. No `package.json`/`package-lock.json`/`next.config.mjs`/`middleware.ts`/`lib/**` changes (zero new deps).

---

## 7 Residual risks + manual checklist (owner)

**Residual risks:**
- **TOCTOU cap window (accepted):** `isNewItem` is a pre-check; the same residual window the pre-cap check already accepted (documented in M3-BF §7). Rollback now handles the overshoot; a concurrent insert between the pre-check and the upsert is still covered by the post-`countDocuments` rollback.
- **Redis env (owner action, no code):** the persistent `Redis configuration error. Memory cache fallback active.` line is independent of this hotfix — see diagnostic §5.
- **Projection payload size:** `messages: 1` bounds payload by the model's own message array (capped at `MAX_CHAT_HISTORY_MESSAGES`=20 on write), under the existing `limit(100)`.

**Manual checklist (owner, post-deploy):**
1. **Redis canonical env trio** (diagnostic §5.3): set `REDIS_URL=rediss://…` (single trimmed line); delete `REDIS_TLS`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`; redeploy. Verify: no `Redis configuration error` lines; `GET /api/admin/cache?action=stats` → `stats.status==="online"` && `stats.backend==="redis"`.
2. **Favorites/Watchlist add+remove smoke + Atlas reality check after refresh:** add an item (toast "Added to …"), confirm 200; refresh the page → item persists in Atlas; remove it → 200. Confirm the 500 toasts are gone.
3. **`/ai-assistant` preview + search smoke:** sidebar shows real preview text (not all "New Chat"); typing in the search box filters conversations.
4. **M1 signOut replay → 401:** after sign-out, a replayed request to a protected route returns 401 (auth gate still intact — this hotfix touched no auth code).

---

## 8 Decision Log

- **`isNewItem` gate (not a raw-result `upserted` flag):** the route already computes `isNewItem` at the pre-check (l79–83). Reusing it as the insert signal needs no new option surface, no `ModifyResult` handling, and no TOCTOU widening beyond what the pre-check already accepted. It makes the W3-005 rollback **reachable** — previously `isUpsert = !!res.lastErrorObject?.upserted` read a key mongoose 8 never populates, so the rollback was dead.
- **`res ?? { success: true }` unreachable guard:** `new: true` + `upsert: true` ⇒ `res` is the document; the `??` is unreachable but keeps `NextResponse.json` serializable under the theoretical `null`, guaranteeing the response body is never `undefined` (the exact P1 failure class).
- **Why NOT `includeResultMetadata`:** using the mongoose-8 name would couple both the rollback and the response to the driver `ModifyResult` layout (`{ value, lastErrorObject }`). We only need the fetched-back document, which `new: true` already returns as a plain `Document`. Avoiding the option entirely removes all coupling to the driver's modify-result shape — fewer moving parts, and the rollback target (`res._id`) is the document the route itself just upserted.
- **ChatList guard added as belt-and-braces:** the projection fix (adding `messages: 1`) is the real fix and restores preview + search with real data. The `Array.isArray` guard in `getPreviewText` is defense-in-depth only — any *future* projection edit that drops `messages` degrades to "New Chat" instead of crashing the client render pass. The `chat-list-contract` superset test makes such a recurrence fail loudly in CI.
- **Tripwire token choice:** the source tripwire asserts neither `includeRawResult` nor `lastErrorObject` appears in the two route sources, so any reintroduction of the raw-result option or wrapper-key access fails immediately. (Route comments therefore document the reasoning *without* naming the deprecated option literally.)

---

## 9 Report Artifact paths

- **This report:** `docs/HOTFIX_POST_M4_REPORT.md` (committed in commit 2).
- **Diagnostic (accepted):** `docs/DIAGNOSTIC_POST_M4_PROD_FAILURE.md` (untracked owner doc, untouched).
- **Source fixes:** `app/api/favorites/route.ts`, `app/api/watchlist/route.ts`, `app/api/chat-history/list/route.ts`, `components/ChatList.tsx`.
- **Tests:** `tests/list-capacity-security.test.ts`, `tests/performance-m4.test.ts`, `tests/chat-list-contract.test.ts` (new).
- **Frozen (untouched):** `tests/documentation-contract.test.ts`, `tests/operational-security.test.ts`.
