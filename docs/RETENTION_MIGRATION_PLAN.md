# Retention Migration Plan

## Overview

This document describes an optional TTL-based retention rollout for `History.viewedAt` and `ChatHistory.updatedAt`.
**No changes are applied now.** This is a read-only migration plan.

## Current State

| Model | Collection | Sort Index | Unique Index | TTL Index |
|-------|-----------|------------|--------------|-----------|
| `History` | `histories` | `{ userId: 1, viewedAt: -1 }` | `{ userId: 1, itemId: 1, type: 1 }` | none |
| `ChatHistory` | `chathistories` | `{ userId: 1, updatedAt: -1 }` | none | none |
| `UsageQuota` | `usagequotas` | `{ userId: 1, day: 1 }` (unique) | `{ expiresAt: 1 }` (TTL, 0s) | active |

## Proposed Changes

### Option A: History TTL via `HISTORY_RETENTION_DAYS`

```
// lib/models/History.ts — uncomment when ready
HistorySchema.index({ viewedAt: 1 }, { expireAfterSeconds: 0 });
```

- Controlled by env var `HISTORY_RETENTION_DAYS` (default: 365).
- TTL index is on `viewedAt`; documents where `viewedAt < now - DAYS * 86400s` expire automatically.
- MongoDB deletes expired documents lazily (background thread every 60s).

### Option B: ChatHistory TTL via `CHAT_RETENTION_DAYS`

```
// lib/models/ChatHistory.ts — uncomment when ready
ChatHistorySchema.index({ updatedAt: 1 }, { expireAfterSeconds: 0 });
```

- Controlled by env var `CHAT_RETENTION_DAYS` (default: 90).
- Same lazy-delete semantics.

## Pre-Checks (run before rollout)

1. Confirm no application code reads documents older than retention window:
   ```bash
   grep -rn "viewedAt\|updatedAt" app/lib --include="*.ts"
   ```
2. Verify index builds without locking (MongoDB 4.2+ supports online index build):
   ```bash
   db.histories.createIndex({ viewedAt: 1 }, { expireAfterSeconds: 0 })
   db.chathistories.createIndex({ updatedAt: 1 }, { expireAfterSeconds: 0 })
   ```
3. Snapshot current collection sizes:
   ```bash
   db.histories.stats() && db.chathistories.stats()
   ```

## Rollout Steps

1. Set `HISTORY_RETENTION_DAYS` / `CHAT_RETENTION_DAYS` in Vercel env.
2. Add schema-level `index(...)` lines (uncomment).
3. Redeploy. MongoDB will create indexes online if not present.
4. Monitor `db.serverStatus().metrics.document` for delete rate.
5. After 7 days, confirm no stale-document reads in logs.

## Rollback

1. Drop the TTL index:
   ```bash
   db.histories.dropIndex({ viewedAt: 1 })
   db.chathistories.dropIndex({ updatedAt: 1 })
   ```
2. Remove env vars.
3. Redeploy with commented-out index lines.

## Risks

- **Lazy deletion**: TTL deletes are background; expired docs may persist for up to 60s.
- **TTL index on hashed/sharded collections**: Not applicable here (single primary).
- **Query plan regression**: TTL index is separate from sort indexes; no conflict.
- **Data loss**: Retired documents are permanently deleted by MongoDB. Ensure compliance with data-retention policy before enabling.

## Decision Log

| Date | Decision | Owner |
|------|----------|-------|
| 2026-09-07 | Keep indexes at schema level; defer TTL application until retention config is set | eng |
