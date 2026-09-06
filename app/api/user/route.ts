import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/security/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import { User } from "@/lib/models/User";
import connectToMongoDB from "@/lib/mongodb";
import { z } from "zod";

// Strict allowlist for user self-update. Only preferences fields are writable.
// Never allow: role, email, _id, id, created_at, provider identifiers, name, image.
// name and image come from Google OAuth and should not be client-editable here.
// R6 adds a boolean history-tracking consent preference.
const updateUserSchema = z
  .object({
    preferences: z
      .object({
        favorite_genres: z.array(z.string().max(50)).max(20).optional(),
        selected_moods: z.array(z.string().max(50)).max(10).optional(),
        historyTrackingEnabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireSession();
    if (!authResult.ok) {
      return authResult.response;
    }

    await connectToMongoDB();
    const user = await User.findOne(
      { email: authResult.user.email },
      { password: 0, __v: 0 }
    ).lean();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch user data" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireSession();
    if (!authResult.ok) {
      return authResult.response;
    }

    // Rate limit profile updates (F-011)
    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.profileUpdate
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    let data: unknown;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Validate with strict schema — rejects role, email, _id, and unknown fields
    const parseResult = updateUserSchema.safeParse(data);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid update data", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    await connectToMongoDB();

    // Build explicit $set with only allowlisted fields (no upsert)
    const updateSet: Record<string, unknown> = {};
    if (parseResult.data.preferences) {
      if (parseResult.data.preferences.favorite_genres !== undefined) {
        updateSet["preferences.favorite_genres"] =
          parseResult.data.preferences.favorite_genres;
      }
      if (parseResult.data.preferences.selected_moods !== undefined) {
        updateSet["preferences.selected_moods"] =
          parseResult.data.preferences.selected_moods;
      }
      if (parseResult.data.preferences.historyTrackingEnabled !== undefined) {
        updateSet["preferences.historyTrackingEnabled"] =
          parseResult.data.preferences.historyTrackingEnabled;
      }
    }

    // Only update if there are valid fields
    if (Object.keys(updateSet).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const user = await User.findOneAndUpdate(
      { email: authResult.user.email },
      { $set: updateSet },
      { new: true, upsert: false }
    ).select({ password: 0, __v: 0 });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      { error: "Failed to update user data" },
      { status: 500 }
    );
  }
}
