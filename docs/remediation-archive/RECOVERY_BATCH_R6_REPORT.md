# RECOVERY_BATCH_R6_REPORT.md

- **Date:** 2026-08-20 (UTC+3)
- **Scope:** R6 only - privacy, user-data controls, retention, history consent, account export, and account deletion.
- **Status:** **COMPLETE** - every required command exits 0; previous 117 tests plus all R6 tests pass (148/148); no live external service contacted; no later remediation batch started.

---

## 1. Initial Git state

- Branch: `main`, HEAD `b4e8023`.
- Dirty tree from R1-R5 preserved (not reset).
- Baseline before R6 edits: lint 0, typecheck 0, 117/117 tests, coverage 0, build 0, diff-check 0.

## 2. Data inventory

Canonical server-side inventory in `lib/privacy-inventory.ts` (10 categories). Summary (no user records/secrets):

| Category | Storage | Owner | Export | Delete | Retention | Sent to | Admin | User disable |
|---|---|---|---|---|---|---|---|---|
| Profile | `users` | email | yes | yes | until deletion | none | admin-tools | no |
| Preferences | `users.preferences` | email | yes | yes | until deletion | none | admin-tools | no |
| Favorites | `favorites` | email | yes | yes | until deletion | TMDB | no | no |
| Watchlist | `watchlists` | email | yes | yes | until deletion | TMDB | no | no |
| Viewing history | `histories` | email | yes | yes | bounded (default 180d) | TMDB | no | yes |
| Chat history | `chathistories` | email | yes | yes | bounded (default 365d) | Gemini | no | no |
| Recent searches | browser localStorage | none | no | no | user-clearable | none | technical-logs-only | yes |
| Personalized cache | Redis `user:recommendations` scope | normalized | no | best-effort | short TTL | none | technical-logs-only | no |
| Operational logs | deployment backend | none | no | no | platform | none | technical-logs-only | no |
| Google account data | Google | Google | no | no | Google-controlled | none | no | no |

The public page and the implementation both follow this module.

## 3. Export endpoint design

`GET /api/user/export` (`app/api/user/export/route.ts`):

- Identity only from session (`requireUser`), which re-reads the profile fresh.
- Query string/body are deliberately ignored (foreign `email`/`userId` cannot steer queries).
- Reads: `users` (profile + preferences, explicit projection), `favorites`, `watchlist`, `histories`, `chathistories` - all filtered by the authenticated email and explicit projection allowlists.
- Rate limit `RATE_LIMITS.userExport` (5 per 5 minutes).
- Response: `Content-Type: application/json`, `Content-Disposition: attachment; filename="movie-data-export.json"` (no email/user id), `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
- Exported content is never logged or emailed anywhere.

## 4. Export field allowlist

- Profile export projection: `{ email, name, role, preferences }` with `_id` excluded.
- Favorites/watchlist: `{ itemId, type, title, posterPath }`.
- History: `{ itemId, type, title, posterPath, viewedAt }`.
- Chat: `{ createdAt, updatedAt, messages }`.
- Excluded always: `password` (absent), OAuth/session tokens, secrets, Redis credentials/cache keys, admin-only notes, `_id`, `userId`, other users' data.
- History/chat volume capped: history 500, chats 100. Expired records are excluded (retention filter).

## 5. Account-deletion design

`DELETE /api/user/account` (`app/api/user/account/route.ts`):

- Identity only from session; `requireUser` always used (fresh role, never a client role field).
- Strict confirmation: `{ "confirmation": "DELETE_MY_ACCOUNT" }` via `z.literal` in a `.strict()` body; unknown fields (target email/userId) rejected.
- Rate limit `RATE_LIMITS.accountDelete` (2 per 5 minutes).
- Same-origin check for browser cookie-authenticated deletion.
- Deletes only the authenticated user's: favorites, watchlist, history, chat history, then the user document. Personalized-cache clear is a best-effort no-op in this env (application caches public TMDB/global AI data only).
- Global/public TMDB cache, system feature settings, and other users' data are never touched.
- Minimal success: `{ success: true }`.

## 6. Transaction / fallback behavior

- The staged deletions form an "All Writes" single-domain transaction.
- Preferred: wrap the staged deletions in `session.withTransaction()` on a replica set (operator action; not run here).
- Fallback (standalone MongoDB): the same staged deletions run without a transaction via `deleteAccountAllWrites`; a mid-sequence failure returns a generic error and records `deletedRecordsBeforeFailure` (a count only, no PII) - the residual partial-deletion risk.
- Covered by `tests/privacy-account-security.test.ts` (R6-F).

## 7. Last-owner protection

- `mayDeleteOwnAccount` (in `lib/account-deletion.ts`): role re-read fresh; if `owner` and owner count <= 1 -> blocked (`last_owner`); if owner count cannot be verified -> blocked (`last_owner_unverifiable`); plain users always allowed.
- Route returns 403 for a blocked last owner.
- Tests: R6-E (block last owner, allow owner when another exists, allow plain user, fail-safe).

## 8. Cache cleanup behavior

- Account deletion clears no global cache and no other user's data.
- Personalized-cache removal is best-effort (`clearPersonalizedCache`). The application currently caches public TMDB responses and complete global AI outputs under namespaced keys; there is no per-user content cache keyed by identity, so the clear is a documented no-op. If a per-user cache scope is later added (e.g. `user:recommendations`), the same hook should remove it keyed by a normalized non-identifying resource id (`normalizeCacheResourceId`).

## 9. History-consent behavior

- Preference `historyTrackingEnabled` (boolean) on `users.preferences`.
- Defaults: enabled for new accounts (additive, preserves existing behavior). Documented; no silent downtime of "Recently Viewed" for existing users.
- Server is authoritative: `app/api/history/route.ts` re-reads `users.preferences` on every POST via `resolveHistoryContext()` and returns `{ success:false, reason:"tracking_disabled" }` (no write) when disabled - a client cannot turn tracking on for itself.
- `HistoryTracker` (client): only fires for an authenticated, fully-loaded session; a ref guards against duplicate POSTs (React StrictMode); no user identity is sent; nothing is logged.
- Enabling/disabling flows through `PUT /api/user` allowlist (role/email/_id still rejected). `components/PrivacySettings.tsx` exposes the toggle.

## 10. History-deletion behavior

- `DELETE /api/history` deletes `histories` rows where `userId` = authenticated email only; rate-limited; returns `{ success:true }` with `Cache-Control: no-store`.
- Server consent is re-read before the write path so a tracking-disabled user is never written to.
- UI: "Clear viewing history" button in `PrivacySettings`.

## 11. Chat-deletion behavior

- Delete one: `DELETE /api/chat-history/:id` - ObjectId validated, ownership filter, 404 on foreign/not-found, retention-filtered (an expired chat 404s like a missing one).
- Delete all: `DELETE /api/chat-history` - session-scoped `deleteMany`, rate-limited (`RATE_LIMITS.chatDeleteAll`), same-origin protected, `Cache-Control: no-store`, minimal response.
- Listing (`/api/chat-history` GET and `/api/chat-history/list`) and single-chat GET are ownership-scoped and retention-filtered (`updatedAt >= chatCutoffDate()`).
- UI distinguishes delete-one (per-chat in `ChatList`) and delete-all (profile privacy card summarizes the account-level actions; the chat UI keeps per-conversation delete). Delete-all is a confirmed server action.
- No cache is cleared; no chat content is logged.

## 12. Retention configuration

`lib/privacy-retention.ts` (server-only):

- `HISTORY_RETENTION_DAYS` default `180`; `CHAT_RETENTION_DAYS` default `365`; bounds `1..3650`.
- Values strict-parsed; invalid/empty/out-of-bounds fall back to the default; out-of-bounds values are clamped.
- Values are operator config, not secrets; never logged or returned to clients.
- `historyCutoffDate()` / `chatCutoffDate()` drive read-route and export filters.

## 13. TTL / index migration plan

- Dedicated expiration field recommended (not the existing `viewedAt`/`updatedAt`, whose semantics must not be changed).
- Add `expiresAt: { type: Date }` to `History` and `ChatHistory` and backfill in a batch, then:

```
db.histories.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
db.chathistories.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

- Do not rely on Mongoose `autoIndex` in production. Chat arrays stay bounded independently (`$slice` in `app/api/chat/route.ts`).
- This batch performs no real DB operation.

## 14. Privacy page content

`app/privacy/page.tsx` (`/privacy`, public), linked from the app footer and the profile privacy card. Sections: what we store; viewing-history tracking; AI chat history and Gemini; TMDB; recent searches (localStorage); cache/performance; retention; your controls (export, delete account, clear history, delete conversations); Google account data is not deleted; backups may retain deleted data; contact placeholder + counsel review requirement. No tracking scripts, no compliance certification, no fake contact info. Effective date 2026-08-20.

`PRIVACY.md` is the operator/developer version with the same facts and deployment responsibilities.

## 15. Logging / error changes

- All new privacy routes return generic errors (`Failed to generate your data export`, `Failed to delete your account`, `Failed to fetch/clear history`, `Failed to fetch chat history`).
- No export content, deletion targets, chat text, titles, tokens, DB URIs, or stacks are logged by privacy flows. Tests assert responses/logged fixtures carry no such values.
- The R6 routes intentionally log nothing (empty catch blocks return generic JSON). Router-level `console.log`/`console.error` in unrelated pre-existing routes are outside R6 scope.

## 16. Tests added with exact test names

`tests/privacy-account-security.test.ts` (31 tests; previous 117 preserved; total 148):

- `R6 export > unauthenticated export returns 401` (R6-A)
- `R6 export > ignores a supplied foreign email/userId query (scoped to session)` (R6-A)
- `R6 export > returns no-store, nosniff, and a generic safe filename` (R6-B)
- `R6 export > rate limit returns 429 before any DB query` (R6-A)
- `R6 export > empty collections produce a stable export structure` (R6-B)
- `R6 export > database failure returns a generic response without internals` (R6-L)
- `R6 account deletion > unauthenticated deletion returns 401` (R6-C)
- `R6 account deletion > missing/invalid confirmation returns 400` (R6-C)
- `R6 account deletion > rejects a supplied foreign email/userId field` (R6-C/R6-D)
- `R6 account deletion > rate limit returns 429` (R6-C)
- `R6 account deletion > same-origin check rejects an invalid Origin` (R6-C)
- `R6 account deletion > scopes every delete to the authenticated identity` (R6-D/R6-F)
- `R6 account deletion > another (owner) is not deleted and global cache is untouched` (R6-F)
- `R6 last-owner protection > blocks the last owner` (R6-E)
- `R6 last-owner protection > allows an owner when another owner exists` (R6-E)
- `R6 last-owner protection > allows a plain user` (R6-E)
- `R6 last-owner protection > fails safe when owner count cannot be verified` (R6-E)
- `R6 cascading deletion service > deletes all collections then the user and reports ok` (R6-F)
- `R6 cascading deletion service > records partial deletion on failure without leaking details` (R6-F)
- `R6 cascading deletion service > is idempotent (repeat deletion affects zero rows)` (R6-F)
- `R6 history consent > disabled preference prevents the history POST` (R6-G)
- `R6 history consent > history clear is scoped to the current user` (R6-H)
- `R6 retention configuration > invalid config safely falls back to the default` (R6-J)
- `R6 retention configuration > enforces min/max bounds` (R6-J)
- `R6 retention configuration > builds a config object` (R6-J)
- `R6 retention configuration > cutoffs are in the past and retention filtering rejects old rows` (R6-K)
- `R6 retention configuration > expired chats are excluded from an export` (R6-K)
- `R6 export object shape > buildExportObject caps arrays and keeps the stable shape` (R6-K)
- `R6 privacy inventory/content contract > covers the categories described on the privacy page` (R6-M)
- `R6 privacy inventory/content contract > viewing history is the only exportable collection a user can disable` (R6-M)
- `R6 privacy error redaction > does not leak internal error text in export failure` (R6-L)

## 17. Finding IDs covered

- `F-041` (missing history deletion) - implemented `DELETE /api/history` (+ retention + consent).
- Privacy/export/account-deletion and history-consent topics were not previously tracked as findings; R6 adds the controls and regression tests. Prior auth/rate-limit/CSP/AI/Redis controls are preserved (not weakened).
- No claim of GDPR/CCPA/other legal compliance.

## 18. Mocking strategy

- `vi.mock` for `@/lib/mongodb`, `@/lib/security/auth` (`requireSession`/`requireUser`), `@/lib/security/rateLimit`, and all Mongo models (`User`, `FavoritesModel`, `WatchlistModel`, `History`, `ChatHistory`).
- Chainable query fake (`select`/`sort`/`limit`/`where`/`gte`/`lean`/`findOne`/`findById`) matches the real route chains.
- No `.env`, no live services, deterministic fixtures, explicit assertions (no snapshot-only).

## 19. Proof no external service was contacted

- All Mongo/Redis/HTTP calls are mocked. New routes were exercised only through mocked dependencies.
- Not run: `setupDatabase.cts`, `testRedisConnection.ts`, owner-provisioning scripts, `npm audit fix`, destructive DB operations.
- `.env`/`.env.local` not modified. Tests use mock identity only.

## 20. Security-search results

Post-implementation search (application code, tests, config):

- `deleteMany` occurs only in owned-scoped operations: `history/route.ts` (history clear, `userId: ctx.email`), `chat-history/route.ts` (delete-all, session email), and `user/account/route.ts` (4 collections, `{ userId }` from session). All verified by tests to use session identity.
- `findOneAndDelete` / `findByIdAndDelete`: favorites/watchlist item deletes (`userId` from session) and chat delete-one (`_id` + session email).
- `userId` in history/favorites/watchlist/chat queries is always the authenticated email or id derived from the session; no route accepts a target identity from the client.
- `historyTrackingEnabled` is defined in `users.preferences`, the `PUT /api/user` allowlist, `schemas.preferencesSchema`, auth preference projections, `PrivacySettings` UI, and the history POST gate.
- `retention`/`expiresAt`/`expireAfterSeconds`: retention config values, TTL migration instructions (docs), and the dedicated-`expiresAt` recommendation live in `privacy-retention.ts`, `DEPLOYMENT_SECURITY_CHECKLIST.md`, and `PRIVACY.md`. No schema TTL index is added in code (documented reason: operator migration, avoid changing `viewedAt`/`updatedAt` semantics).
- `console.log` / `console.error`: new privacy routes log nothing. Pre-existing unrelated logs (TMDB cache misses, Redis health, auth sign-in) are outside R6 scope and were not modified.
- `error.message` / `error.stack`: not logged by privacy routes; the account-deletion partial-failure path records only a count.
- `MONGODB_URI` / `REDIS_PASSWORD` / `GOOGLE_API_KEY` / `TMDB_API_KEY`: server-side env reads in pre-existing modules; tests use placeholder values and assert keys are not in request URLs/bodies. `utils/redisExample.ts` defines an example `user:${userId}:preferences` key but is an unreferenced utility module; it is not part of any privacy route and is documented.

## 21. Documentation changes

- `DEPLOYMENT_SECURITY_CHECKLIST.md`: rewrote section 9 (Privacy) with export/delete/history/consent/retention/TTL/transaction checks + manual R6 staging steps in section 13.
- `README.md`: added a Privacy section describing export, deletion, history delete, chat delete, consent, retention, and the Google-account/backup caveats.
- `PRIVACY.md` (new): operator/developer privacy reference with inventory table, controls, retention, TTL migration, deletion caveats, logging, and pre-production requirements.

## 22. Exact commands and exit codes

| Command | Exit |
|---|---|
| `node -v` | 0 |
| `npm -v` | 0 |
| `npm run lint` | 0 |
| `npm run typecheck` | 0 |
| `npm test` | 0 |
| `npm run test:coverage` | 0 |
| `npm run build` | 0 |
| `git diff --check` | 0 |

## 23. Lint result

Exit 0. 0 errors, 110 warnings (pre-existing unused-variable / hook / `no-img-element`). No `eslint-disable`, no new suppressions.

## 24. Type-check result

Exit 0 (`tsc --noEmit`). No `@ts-ignore`, no `any`, no `skipLibCheck` changes in R6.

## 25. Test result

Exit 0. 8 files, 148/148 passing (117 prior + 31 new).

## 26. Coverage result

Exit 0. New modules included by the existing `vitest.config.mts` globs. The aggregate "All files" figure is low because the coverage `include` glob still lists the whole `app/api/**` tree (a reporting glob, not a failure).

## 27. Build result

Exit 0. Next.js 15.5.23 production build compiled, linted, and type-checked. No `ignoreBuildErrors`/`ignoreDuringBuilds`.

## 28. `git diff --check` result

Exit 0 (CRLF/LF warnings only).

## 29. Files modified

New:
- `lib/privacy-inventory.ts`
- `lib/privacy-retention.ts`
- `lib/privacy-service.ts`
- `lib/account-deletion.ts`
- `app/api/user/export/route.ts`
- `app/api/user/account/route.ts`
- `app/privacy/page.tsx`
- `components/PrivacySettings.tsx`
- `PRIVACY.md`
- `tests/privacy-account-security.test.ts`
- `RECOVERY_BATCH_R6_REPORT.md`

Modified:
- `app/api/history/route.ts` (consent gate, retention filter, rate-limited/no-store delete)
- `app/api/chat-history/route.ts` (retention-filter GET, same-origin+rate-limited delete-all, no-store)
- `app/api/chat-history/list/route.ts` (central auth, retention filter)
- `app/api/chat-history/[id]/route.ts` (retention filter)
- `app/api/user/route.ts` (`historyTrackingEnabled` allowlist field)
- `lib/security/schemas.ts` (preferences schema + `historyTrackingEnabled`)
- `lib/security/rateLimit.ts` (new R6 rate-limit presets)
- `lib/security/auth.ts`, `lib/auth.ts` (preference type + projection)
- `lib/models/User.ts` (schema field)
- `components/HistoryTracker.tsx` (session-only, duplicate-guard, no logging)
- `app/profile/page.tsx` (privacy card)
- `app/layout.tsx` (footer privacy link)
- `DEPLOYMENT_SECURITY_CHECKLIST.md`
- `README.md`

`.env` and `.env.local` untouched.

## 30. Remaining risks

- Partial deletion without a transaction on standalone MongoDB (surfaced as a generic error with a deleted-count; operator should deploy a replica set).
- Personalized-cache clear is a no-op today; if a per-user cache scope is ever stored it must be wired into `clearPersonalizedCache`.
- TTL indexes not enabled in this batch; expired rows are filtered at read time but not physically removed until the operator adds the documented index.
- History-tracking default enabled (additive); stricter default requires the documented migration.
- Recent searches live in browser localStorage and are not removed by account deletion.
- Backups may retain deleted data until expiry.
- Google account data is never deleted or modified by this app.

## 31. Manual deployment actions

- Deploy R6 with existing secrets unchanged; do not paste keys.
- Create the MongoDB owner as before; run the documented TTL index migration on a replica set.
- Prefer a replica set so account deletion can use a transaction; otherwise accept and monitor the fallback.
- Replace the contact placeholder on `/privacy` and in `PRIVACY.md`.
- Have counsel review before production.

## 32. Required staging checks

1. Export returns only the staging user's data; filename has no email/user id; response is `no-store`.
2. Account deletion requires the exact confirmation, is blocked for the last owner, cascades to favorites/watchlist/history/chats, clears nothing global, and blocks a foreign Origin.
3. History tracking off stops new rows (write-count verified); clear history affects only the current user; delete-one and delete-all chats are session-scoped.
4. Retention: records older than configured defaults are not returned by read routes or export.
5. Confirm export/deletion/clear logs contain no email, chat text, title, DB URI, or stack.

## 33. Confirmation no later batch started

R6 is the only batch executed in this work. No R7 or later batch was started. CI/CD, broad performance work, dependency upgrades, database identity migration, CSP redesign, AI redesign, Redis redesign, and broad architecture cleanup were not performed.
