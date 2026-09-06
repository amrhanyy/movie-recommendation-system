/**
 * Server-only orchestrator for self-service account deletion (R6).
 *
 * Ownership is always the authenticated session id. The caller passes a small
 * set of injected dependencies so the whole flow is unit-testable with mocks
 * and never touches a real database during tests.
 *
 * Transaction strategy:
 * - The deletions in `deleteAccountAllWrites` form an "All Writes" /
 *   single-domain transaction (user doc + user-owned collections).
 * - A MongoDB replica set supports a two-phase commit / `session.withTransaction`
 *   around the same staged steps. The operator/route can wrap the staged
 *   deletions in a session transaction when the deployed topology supports it
 *   (documented in DEPLOYMENT_SECURITY_CHECKLIST.md and the R6 report).
 * - When a transaction is not available (standalone), the staged deletions run
 *   directly and a failure records the residual partial-deletion risk.
 */

import type { UserRole } from "@/lib/auth";
import {
  deleteAccountAllWrites,
  type DeleteResult,
  type DeleteDeps,
} from "@/lib/privacy-service";

export const ACCOUNT_DELETE_CONFIRMATION = "DELETE_MY_ACCOUNT";

export interface OwnerProtectionReads {
  /** Fresh role for a user id; null when absent. */
  roleFor: (userId: string) => Promise<UserRole | null>;
  /** Number of users with the 'owner' role. */
  countOwners: () => Promise<number>;
}

/**
 * Decide whether self-service deletion is allowed.
 * - users and admins may delete themselves.
 * - An 'owner' who would be the last remaining owner is blocked.
 * - Role is loaded fresh from the DB (never from a client field).
 */
export async function mayDeleteOwnAccount(
  userId: string,
  roleHint: UserRole,
  reads: OwnerProtectionReads
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  let currentRole: UserRole | null = roleHint;
  try {
    currentRole = (await reads.roleFor(userId)) ?? roleHint;
  } catch {
    currentRole = roleHint;
  }

  if (currentRole !== "owner") {
    return { allowed: true };
  }

  let owners: number;
  try {
    owners = await reads.countOwners();
  } catch {
    // Fail safe: if we cannot confirm another owner exists, block deletion.
    return { allowed: false, reason: "last_owner_unverifiable" };
  }
  if (owners <= 1) {
    return { allowed: false, reason: "last_owner" };
  }
  return { allowed: true };
}

/**
 * Delete the authenticated user's account with ownership-scoped deletions.
 *
 * When a replica-set transaction is available this can be wrapped in
 * `session.withTransaction()` by the caller; the staged steps are the same.
 * When transactions are unavailable, `deleteAccountAllWrites` runs the same
 * steps and a failure reports how many rows were deleted before failing.
 */
export async function deleteAccount(
  userId: string,
  deps: DeleteDeps
): Promise<DeleteResult> {
  return deleteAccountAllWrites(userId, deps);
}
