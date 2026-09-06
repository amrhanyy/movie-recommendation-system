# Privacy (operator / developer reference)

This document is the operator-facing version of the privacy policy. The public
page is `app/privacy/page.tsx`. This file describes what the code actually
does, the deployment responsibilities, and the required pre-production review.
It is not a legal opinion and does not guarantee any legal compliance.

## Data inventory

See `lib/privacy-inventory.ts` (canonical, server-side). In short:

| Category | Storage | Owner key | Export | Delete | Retention |
|---|---|---|---|---|---|
| Profile | `users` | email | yes | yes | until deletion |
| Preferences | `users.preferences` | email | yes | yes | until deletion |
| Favorites | `favorites` | email | yes | yes | until deletion |
| Watchlist | `watchlists` | email | yes | yes | until deletion |
| Viewing history | `histories` | email | yes | yes | bounded (default 180d) |
| Chat history | `chathistories` | email | yes | yes | bounded (default 365d) |
| Recent searches | browser localStorage | none | no | no | user-clearable |
| Personalized cache | Redis `user:recommendations` scope | normalized resource | no | best-effort | short TTL |
| Operational logs | deployment backend | none | no | no | platform |
| Google account data | Google | Google | no | no | Google-controlled |

## What is sent elsewhere

- **Gemini:** chat messages and bounded prior conversation turns (AI chat).
- **TMDB:** movie/TV titles used for favorites, watchlist, history, and
  recommendation lookups.

## Controls implemented

- `GET /api/user/export` — authenticated, ownership-scoped data export.
- `DELETE /api/user/account` — confirmed, ownership-scoped account deletion with
  last-owner protection.
- `DELETE /api/history` — clear viewing history (current user only).
- `POST /api/chat-history` is disabled (server authority, R5); `DELETE
  /api/chat-history/:id` deletes one conversation; `DELETE /api/chat-history`
  deletes all conversations (current user only).
- History tracking preference (`historyTrackingEnabled`) is enforced server-side.

## Retention configuration

Server-only `lib/privacy-retention.ts`:

- `HISTORY_RETENTION_DAYS` default `180` (bounds `1..3650`).
- `CHAT_RETENTION_DAYS` default `365` (bounds `1..3650`).
- Invalid or out-of-bounds values fall back to the default; values are clamped.
- These values are operator config, not secrets, and must never be logged or
  returned to clients.

Read routes filter expired records at query time. Exports exclude expired rows.

## Required MongoDB TTL/migration (do not run against production in this batch)

MongoDB TTL indexes expire documents when the indexed date is past. We do not
use the existing `viewedAt`/`updatedAt` fields for TTL because backend cleanup
queries could unexpectedly drop other data and because schema compatibility
must be analyzed first.

Recommended dedicated expiration fields:

```
# Histories
db.histories.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
# ChatHistories
db.chathistories.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

Add `expiresAt: { type: Date }` to each schema and set it on write (or backfill
in a batch) so TTL cleanup uses a field with no other semantics. Enabling this
is an operator action and must be coordinated with backups. Chat arrays stay
bounded independently via `$slice` in `app/api/chat/route.ts`.

## Account deletion behavior

- Current-user rows in `favorites`, `watchlists`, `histories`, and
  `chathistories` are deleted, then the user document.
- A replica-set transaction is preferred ("All Writes"). On standalone MongoDB
  the same steps run without a transaction; a mid-sequence failure surfaces as
  a generic error and records a residual partial-deletion risk (count only).
- Global/public TMDB cache, system feature settings, and other users' data are
  never touched. Personalized cache removal is best-effort.
- Last-owner self-deletion is blocked; `requireUser` re-reads the role fresh.
- Google account data is not deleted or modified; backups may retain deleted
  data until backup expiration.

## Deletion does not remove from backups

Deletion targets active application records. Data already written to backups
remains until backups expire or are rotated.

## Privacy-safe logging

Privacy operations (export, deletion, history clear, chat delete) log only
anonymous action categories, success/failure, and duration. They never log user
email, chat text, viewing titles, exported data, deleted-record contents,
tokens, database URIs, or stack traces of privacy flows.

## Pre-production requirements

1. **Counsel review:** have qualified counsel review this policy before launch.
   Do not claim GDPR/CCPA/other compliance.
2. **Replace the placeholder** on `app/privacy/page.tsx` (section 11) and in
   this file with a real operator contact.
3. **Staging checks** (see `DEPLOYMENT_SECURITY_CHECKLIST.md`): verify export and
   deletion endpoints on a staging account are same-user and last-owner-blocked;
   confirm history preference and clear-history flows; confirm retention filters;
   confirm no PII appears in extract-level logs.
4. Keep `lib/privacy-inventory.ts` in sync with the public page and with any
   future code changes.

## Verification commands

```
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
git diff --check
```
