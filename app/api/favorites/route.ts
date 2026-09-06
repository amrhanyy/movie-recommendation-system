import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/security/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import { listItemSchema } from "@/lib/security/schemas";
import connectToMongoDB from "@/lib/mongodb";
import { FavoritesModel } from "@/lib/models/FavoritesModel";

// M-05: maximum number of items a single user may keep per list.
const MAX_LIST_ITEMS = 500;

export async function GET() {
  try {
    const authResult = await requireSession();
    if (!authResult.ok) {
      return authResult.response;
    }

    await connectToMongoDB();

    const items = await FavoritesModel.find({ userId: authResult.user.email })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(items);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch favorites" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSession();
    if (!authResult.ok) {
      return authResult.response;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Strict validation — rejects unknown fields, $ operators, dotted keys
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

    // M-05: enforce list capacity before writing
    const existing = await FavoritesModel.countDocuments({
      userId: authResult.user.email,
    });
    const isNewItem =
      !(await FavoritesModel.exists({
        userId: authResult.user.email,
        itemId: parseResult.data.itemId,
        type: parseResult.data.type,
      }));
    if (isNewItem && existing >= MAX_LIST_ITEMS) {
      return NextResponse.json(
        {
          error: `Favorites list is full (maximum ${MAX_LIST_ITEMS} items). Remove an item before adding a new one.`,
        },
        { status: 400 }
      );
    }

    const favorite = await FavoritesModel.findOneAndUpdate(
      {
        userId: authResult.user.email,
        itemId: parseResult.data.itemId,
        type: parseResult.data.type,
      },
      {
        $set: {
          title: parseResult.data.title,
          posterPath: parseResult.data.posterPath ?? null,
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json(favorite);
  } catch {
    return NextResponse.json(
      { error: "Failed to update favorites" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireSession();
    if (!authResult.ok) {
      return authResult.response;
    }

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

    // Validate type
    if (!["movie", "tv", "person"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type" },
        { status: 400 }
      );
    }

    await connectToMongoDB();

    await FavoritesModel.findOneAndDelete({
      userId: authResult.user.email,
      itemId,
      type,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to remove from favorites" },
      { status: 500 }
    );
  }
}
