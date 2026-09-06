import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/security/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import connectToMongoDB from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { FavoritesModel } from "@/lib/models/FavoritesModel";
import { WatchlistModel } from "@/lib/models/WatchlistModel";
import { History } from "@/lib/models/History";
import { ChatHistory } from "@/lib/models/ChatHistory";
import {
  ACCOUNT_DELETE_CONFIRMATION,
  deleteAccount,
  mayDeleteOwnAccount,
} from "@/lib/account-deletion";

const GENERIC_DELETE_ERROR = "Failed to delete your account";

// Strict confirmation body. Rejects unknown fields, target email/id, and a
// confirmation value that does not match exactly.
const deleteAccountSchema = z
  .object({
    confirmation: z.literal(ACCOUNT_DELETE_CONFIRMATION),
  })
  .strict();

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser (CLI/server-server) call
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * DELETE /api/user/account
 * Authenticated, confirmed self-service account deletion.
 *
 * - Identity comes only from the session; no target email/userId accepted.
 * - Confirmation payload required and validated with a strict schema.
 * - Strict rate limit + same-origin validation for browser calls.
 * - Deletes only the authenticated user's favorites, watchlist, history,
 *   chat history, user doc (and a best-effort personalized-cache clear).
 * - Global/public caches, feature settings, and other users' data are never
 *   touched.
 * - Owner/admins: role is re-read from the DB; the last owner cannot be
 *   deleted.
 * - Minimal success response; generic errors; nothing with PII is logged.
 */
export async function DELETE(request: NextRequest) {
  try {
    // requireUser re-reads role from the DB (fresh), so `role` is not trusted
    // from a client field.
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.accountDelete
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (!isSameOrigin(request)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parseResult = deleteAccountSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid confirmation" }, { status: 400 });
    }

    const userId = authResult.user.id;

    await connectToMongoDB();

    // Last-owner protection and fresh role verification (server-side only).
    const ownership = await mayDeleteOwnAccount(userId, authResult.user.role, {
      roleFor: async (id) => {
        const doc = await User.findById(id)
          .select({ role: 1 })
          .lean<{ role?: string }>();
        return (doc?.role as "user" | "admin" | "owner" | undefined) ?? null;
      },
      countOwners: async () => User.countDocuments({ role: "owner" }),
    });
    if (!ownership.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const deleteUserById = async (id: string) => User.deleteOne({ _id: id });
    const deleteManyByOwner = async (collection: string, filter: Record<string, string>) => {
      let result: { deletedCount?: number } | number;
      switch (collection) {
        case "favorites":
          result = await FavoritesModel.deleteMany(filter);
          break;
        case "watchlists":
          result = await WatchlistModel.deleteMany(filter);
          break;
        case "histories":
          result = await History.deleteMany(filter);
          break;
        case "chathistories":
          result = await ChatHistory.deleteMany(filter);
          break;
        default:
          return 0;
      }
      return typeof result === "number" ? result : (result?.deletedCount ?? 0);
    };
    const clearCacheNoop = async () => {
      // Personalized-cache clear is intentionally a no-op in this environment:
      // the application only caches public TMDB data and complete global AI
      // outputs under app namespaced keys. There is no per-user cache stored.
      // See RECOVERY_BATCH_R6_REPORT.md section 8.
      return;
    };

    const result = await deleteAccount(userId, {
      deleteUser: deleteUserById,
      deleteMany: deleteManyByOwner,
      clearPersonalizedCache: clearCacheNoop,
    });

    if (!result.ok) {
      return NextResponse.json({ error: GENERIC_DELETE_ERROR }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: GENERIC_DELETE_ERROR }, { status: 500 });
  }
}
