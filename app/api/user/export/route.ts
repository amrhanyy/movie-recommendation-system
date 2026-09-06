import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/security/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import connectToMongoDB from "@/lib/mongodb";
import { User } from "@/lib/models/User";
import { FavoritesModel } from "@/lib/models/FavoritesModel";
import { WatchlistModel } from "@/lib/models/WatchlistModel";
import { History } from "@/lib/models/History";
import { ChatHistory } from "@/lib/models/ChatHistory";
import {
  EXPORT_HISTORY_CAP,
  LIST_ITEM_PROJECTION,
  HISTORY_ITEM_PROJECTION,
  CHAT_PROJECTION,
  USER_EXPORT_PROJECTION,
  buildExportObject,
} from "@/lib/privacy-service";
import { chatCutoffDate, historyCutoffDate } from "@/lib/privacy-retention";

const GENERIC_EXPORT_ERROR = "Failed to generate your data export";

/**
 * GET /api/user/export
 * Authenticated server-side export of the CURRENT user's data.
 *
 * - Identity comes only from the session; query string/body are ignored.
 * - Every query is scoped to the authenticated user id/email.
 * - Explicit projection allowlists only.
 * - Conservative per-user rate limit and no-store.
 * - Generic safe filename (no email/user id) in Content-Disposition.
 * - Exported content is never logged or emailed anywhere.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.userExport
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    await connectToMongoDB();

    const userEmail = authResult.user.email;
    const historyCutoff = historyCutoffDate();
    const chatCutoff = chatCutoffDate();

    const [userDoc, preferences, favorites, watchlist, history, chats] =
      await Promise.all([
        User.findOne({ email: userEmail })
          .select(USER_EXPORT_PROJECTION)
          .lean<{ name?: string; role?: string; preferences?: unknown }>(),
        User.findOne({ email: userEmail })
          .select({ preferences: 1, _id: 0 })
          .lean<{ preferences?: unknown }>(),
        FavoritesModel.find({ userId: userEmail })
          .select(LIST_ITEM_PROJECTION)
          .sort({ createdAt: -1 })
          .lean(),
        WatchlistModel.find({ userId: userEmail })
          .select(LIST_ITEM_PROJECTION)
          .sort({ createdAt: -1 })
          .lean(),
        History.find({
          userId: userEmail,
          viewedAt: { $gte: historyCutoff },
        })
          .select(HISTORY_ITEM_PROJECTION)
          .sort({ viewedAt: -1 })
          .limit(EXPORT_HISTORY_CAP)
          .lean(),
        ChatHistory.find({
          userId: userEmail,
          updatedAt: { $gte: chatCutoff },
        })
          .select(CHAT_PROJECTION)
          .sort({ updatedAt: -1 })
          .limit(100)
          .lean(),
      ]);

    const prefs =
      (preferences?.preferences as Record<string, unknown> | undefined) ?? {};

    const data = buildExportObject({
      profileName: userDoc?.name ?? authResult.user.name ?? undefined,
      profileRole: userDoc?.role ?? authResult.user.role,
      preferences: (userDoc?.preferences as Record<string, unknown> | undefined) ?? prefs,
      favorites,
      watchlist,
      history,
      chats,
      chatCutoff,
    });

    return new NextResponse(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="movie-data-export.json"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: GENERIC_EXPORT_ERROR }, { status: 500 });
  }
}
