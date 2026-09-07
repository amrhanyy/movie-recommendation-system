import { NextRequest, NextResponse } from "next/server";
import { requireUser, assertSameOriginOrReject } from "@/lib/security/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import { listItemSchema, mediaTypeStrictSchema } from "@/lib/security/schemas";
import connectToMongoDB from "@/lib/mongodb";
import { WatchlistModel } from "@/lib/models/WatchlistModel";

// M-05: maximum number of items a single user may keep per list.
const MAX_LIST_ITEMS = 500;

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    const readLimit = await applyRateLimitUser(request, authResult.user.email, RATE_LIMITS.read);
    if (readLimit) return readLimit;

    await connectToMongoDB();

    const items = await WatchlistModel.find({ userId: authResult.user.email })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(items);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch watchlist" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    const originRejection = assertSameOriginOrReject(request);
    if (originRejection) return originRejection;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Strict validation
    const parseResult = listItemSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    // M-05: per-user write rate limit
    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.listWrite
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    await connectToMongoDB();

    const existingCount = await WatchlistModel.countDocuments({
      userId: authResult.user.email,
    });
    const isNewItem = !(await WatchlistModel.exists({
      userId: authResult.user.email,
      itemId: parseResult.data.itemId,
      type: parseResult.data.type,
    }));

    // Pre-check: reject if at cap and new item
    if (isNewItem && existingCount >= MAX_LIST_ITEMS) {
      return NextResponse.json(
        {
          error: `Watchlist is full (maximum ${MAX_LIST_ITEMS} items). Remove an item before adding a new one.`,
        },
        { status: 400 }
      );
    }

    const item = await WatchlistModel.findOneAndUpdate(
      {
        userId: authResult.user.email,
        itemId: parseResult.data.itemId,
        type: parseResult.data.type,
      },
      {
        $set: {
          title: parseResult.data.title,
          posterPath: parseResult.data.posterPath ?? null,
          addedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // W3-005: atomic list cap with rollback — if fresh insert pushed count over 500,
    // delete the inserted doc and return 400. Re-adds of existing items are unaffected.
    const isUpsert = !!(item as Record<string, unknown>).upserted;
    if (isUpsert) {
      const countAfter = await WatchlistModel.countDocuments({ userId: authResult.user.email });
      if (countAfter > MAX_LIST_ITEMS) {
        await WatchlistModel.deleteOne({
          userId: authResult.user.email,
          itemId: parseResult.data.itemId,
          type: parseResult.data.type,
        });
        return NextResponse.json(
          { error: `Watchlist limit reached (maximum ${MAX_LIST_ITEMS})` },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(item);
  } catch {
    return NextResponse.json(
      { error: "Failed to update watchlist" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    const originRejection = assertSameOriginOrReject(request);
    if (originRejection) return originRejection;

    const { searchParams } = new URL(request.url);
    const itemIdStr = searchParams.get("itemId");
    const type = searchParams.get("type");

    if (!itemIdStr || !type) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const itemId = parseInt(itemIdStr, 10);
    if (isNaN(itemId) || itemId <= 0) {
      return NextResponse.json(
        { error: "Invalid itemId" },
        { status: 400 }
      );
    }

    if (!mediaTypeStrictSchema.safeParse(type).success) {
      return NextResponse.json(
        { error: "Invalid type" },
        { status: 400 }
      );
    }

    await connectToMongoDB();

    await WatchlistModel.findOneAndDelete({
      userId: authResult.user.email,
      itemId,
      type,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove from watchlist" },
      { status: 500 }
    );
  }
}
