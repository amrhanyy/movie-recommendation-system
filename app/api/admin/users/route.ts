import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, assertSameOriginOrReject } from "@/lib/security/auth";
import type { UserRole } from "@/lib/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import { objectIdSchema } from "@/lib/security/schemas";
import { User } from "@/lib/models/User";
import connectToMongoDB from "@/lib/mongodb";
import { z } from "zod";
import { wouldRemoveLastOwner } from "@/lib/security/auth";

// Capped pagination to prevent unbounded queries
const getPagination = (searchParams: URLSearchParams) => {
  const page = Math.max(1, Math.min(parseInt(searchParams.get("page") || "1"), 1000));
  const limit = Math.max(1, Math.min(parseInt(searchParams.get("limit") || "10"), 100));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// Strict validation for admin user updates. userId uses the shared ObjectId
// schema (W3-009): non-ObjectId ids become 400, never a Mongoose CastError 500.
const adminUpdateSchema = z
  .object({
    userId: objectIdSchema,
    updates: z
      .object({
        role: z.enum(["user", "admin", "owner"]).optional(),
        preferences: z
          .object({
            favorite_genres: z.array(z.string().max(50)).max(20).optional(),
            selected_moods: z.array(z.string().max(50)).max(10).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (!authResult.ok) {
      return authResult.response;
    }

    const readLimit = await applyRateLimitUser(request, authResult.user.email, RATE_LIMITS.read);
    if (readLimit) return readLimit;

    await connectToMongoDB();

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPagination(searchParams);

    const users = await User.find({}, { __v: 0 })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await User.countDocuments({});

    return NextResponse.json({
      users,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (!authResult.ok) {
      return authResult.response;
    }

    const originRejection = assertSameOriginOrReject(request);
    if (originRejection) return originRejection;

    const callerRole = authResult.user.role;
    const callerId = authResult.user.id;

    // Rate limit admin mutations (F-011)
    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.adminMutation
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

    const parseResult = adminUpdateSchema.safeParse(data);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid update data", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { userId, updates } = parseResult.data;

    await connectToMongoDB();

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const targetUserRole: UserRole = targetUser.role || "user";

    // Cannot demote self
    if (userId === callerId) {
      if (
        (targetUserRole === "owner" && updates.role !== "owner") ||
        (targetUserRole === "admin" && updates.role !== "admin")
      ) {
        return NextResponse.json(
          { error: "You cannot remove your own elevated role" },
          { status: 403 }
        );
      }
    }

    // Only owners can modify owners
    if (targetUserRole === "owner" && callerRole !== "owner") {
      return NextResponse.json(
        { error: "Only owners can modify other owners" },
        { status: 403 }
      );
    }

    // Only owners can assign owner role
    if (updates.role === "owner" && callerRole !== "owner") {
      return NextResponse.json(
        { error: "Only owners can assign the owner role" },
        { status: 403 }
      );
    }

    // Admins can't modify other admins (only owners can)
    if (
      callerRole === "admin" &&
      userId !== callerId &&
      (targetUserRole === "admin" || targetUserRole === "owner")
    ) {
      return NextResponse.json(
        { error: "Admins can only modify regular users" },
        { status: 403 }
      );
    }

    // Prevent removing the last owner
    if (updates.role && updates.role !== "owner" && targetUserRole === "owner") {
      const isLast = await wouldRemoveLastOwner(userId, updates.role as UserRole);
      if (isLast) {
        return NextResponse.json(
          { error: "Cannot demote the last owner" },
          { status: 403 }
        );
      }
    }

    // Build explicit $set with only allowlisted fields
    const updateSet: Record<string, unknown> = {};
    if (updates.role !== undefined) {
      updateSet.role = updates.role;
    }
    if (updates.preferences) {
      if (updates.preferences.favorite_genres !== undefined) {
        updateSet["preferences.favorite_genres"] =
          updates.preferences.favorite_genres;
      }
      if (updates.preferences.selected_moods !== undefined) {
        updateSet["preferences.selected_moods"] =
          updates.preferences.selected_moods;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateSet },
      { new: true }
    ).select({ __v: 0 });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch {
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
