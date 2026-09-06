/**
 * Server-only privacy service (R6).
 *
 * Pure helpers for authenticated data export and cascading account deletion,
 * kept outside the route handlers so they are unit-testable with mocks.
 *
 * Identity is derived ONLY from the authenticated session by the caller. No
 * function here accepts or trusts a target user id or email from a client.
 *
 * Deletion prefers a MongoDB "All Writes" transaction (replica set). When a
 * transaction cannot run, `deleteAccountAllWrites` executes the same deletions
 * outside a transaction and reports a residual partial-deletion risk on failure
 * (documented in RECOVERY_BATCH_R6_REPORT.md). No real DB work happens here.
 */

export interface ExportResult {
  exportVersion: number;
  generatedAt: string;
  profile?: { name?: string; role?: string };
  preferences?: Record<string, unknown>;
  favorites?: unknown[];
  watchlist?: unknown[];
  history?: unknown[];
  chats?: unknown[];
}

export interface DeleteResult {
  ok: boolean;
  errorCode?: "DB_FAILURE" | "ABORTED";
  deletedRecordsBeforeFailure?: number;
}

export const EXPORT_VERSION = 1;
export const EXPORT_HISTORY_CAP = 500;
export const EXPORT_CHAT_CAP = 100;

// Explicit projection allowlists. Never include password/secret/admin-only
// fields in an export. `_id`/`userId` are internal and excluded.
export const LIST_ITEM_PROJECTION = {
  _id: 0,
  itemId: 1,
  type: 1,
  title: 1,
  posterPath: 1,
};
export const HISTORY_ITEM_PROJECTION = {
  _id: 0,
  itemId: 1,
  type: 1,
  title: 1,
  posterPath: 1,
  viewedAt: 1,
};
export const CHAT_PROJECTION = { _id: 0, createdAt: 1, updatedAt: 1, messages: 1 };
export const USER_EXPORT_PROJECTION = {
  _id: 0,
  email: 1,
  name: 1,
  role: 1,
  preferences: 1,
};

/** Normalize a non-identifying cache resource id so it cannot escape a scope. */
export function normalizeCacheResourceId(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

/**
 * Assemble a stable export object from pre-validated, ownership-scoped rows.
 * Chats are additionally bounded by the retention cutoff passed in.
 */
export function buildExportObject(input: {
  profileName?: string;
  profileRole?: string;
  preferences?: Record<string, unknown>;
  favorites: unknown[];
  watchlist: unknown[];
  history: unknown[];
  chats: unknown[];
  chatCutoff: Date;
}): ExportResult {
  return {
    exportVersion: EXPORT_VERSION,
    generatedAt: new Date().toISOString(),
    profile: { name: input.profileName, role: input.profileRole },
    preferences: input.preferences ?? {},
    favorites: Array.isArray(input.favorites) ? input.favorites : [],
    watchlist: Array.isArray(input.watchlist) ? input.watchlist : [],
    history: Array.isArray(input.history)
      ? input.history.slice(0, EXPORT_HISTORY_CAP)
      : [],
    chats: Array.isArray(input.chats)
      ? filterChatsWithinRetention(input.chats, input.chatCutoff)
      : [],
  };
}

/**
 * Keep only chat documents whose `updatedAt` is at or after the retention
 * cutoff. Older (expired) chats are excluded from an export.
 */
export function filterChatsWithinRetention(chats: unknown[], cutoff: Date): unknown[] {
  const included: unknown[] = [];
  const cutoffMs = cutoff.getTime();
  for (const chat of chats as Array<Record<string, unknown>>) {
    if (included.length >= EXPORT_CHAT_CAP) break;
    if (!chat || typeof chat !== "object") continue;
    const updated = chat.updatedAt;
    const t =
      typeof updated === "string" || typeof updated === "number" || updated instanceof Date
        ? new Date(updated).getTime()
        : Number.NaN;
    if (Number.isFinite(t) && t >= cutoffMs) included.push(chat);
  }
  return included;
}

/**
 * Also drop history rows that fall outside retention, defensively even if the
 * caller already filtered at query time.
 */
export function filterHistoryWithinRetention(
  history: unknown[],
  cutoff: Date
): unknown[] {
  const included: unknown[] = [];
  const cutoffMs = cutoff.getTime();
  for (const row of history as Array<Record<string, unknown>>) {
    if (included.length >= EXPORT_HISTORY_CAP) break;
    if (!row || typeof row !== "object") continue;
    const viewed = row.viewedAt;
    const t =
      typeof viewed === "string" || typeof viewed === "number" || viewed instanceof Date
        ? new Date(viewed).getTime()
        : Number.NaN;
    if (Number.isFinite(t) && t >= cutoffMs) included.push(row);
  }
  return included;
}

export interface DeleteDeps {
  /** Delete one user document by user id; returns the deleted doc or null. */
  deleteUser: (userId: string) => Promise<unknown>;
  /** Delete current-user rows in a named collection, returning deleted count. */
  deleteMany: (collection: string, ownerFilter: Record<string, string>) => Promise<number>;
  /** Best-effort removal of the user's personalized cache scope. */
  clearPersonalizedCache: (ownerId: string) => Promise<void>;
}

export const ACCOUNT_DELETE_COLLECTIONS = [
  "favorites",
  "watchlists",
  "histories",
  "chathistories",
] as const;

/**
 * Non-transactional "All Writes" account deletion.
 * Order: user-owned collections first, then best-effort personalized-cache
 * clear, then the user document last (so a retry is safe and the user doc is
 * only removed once everything else succeeded). Each delete uses the owner id, so
 * other users are never touched. Idempotent: repeated deletes of an already
 * deleted owner affect zero rows.
 */
export async function deleteAccountAllWrites(
  userId: string,
  deps: DeleteDeps
): Promise<DeleteResult> {
  let deleted = 0;
  try {
    for (const collection of ACCOUNT_DELETE_COLLECTIONS) {
      deleted += await deps.deleteMany(collection, { userId });
    }
    await deps.clearPersonalizedCache(normalizeCacheResourceId(userId));
    await deps.deleteUser(userId);
    return { ok: true };
  } catch {
    return {
      ok: false,
      errorCode: "DB_FAILURE",
      deletedRecordsBeforeFailure: deleted,
    };
  }
}
