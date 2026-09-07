import { NextResponse, type NextRequest } from "next/server";
import { requireUser, assertSameOriginOrReject } from "@/lib/security/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import { objectIdSchema } from "@/lib/security/schemas";
import connectToMongoDB from "@/lib/mongodb";
import { ChatHistory } from "@/lib/models/ChatHistory";
import { chatCutoffDate } from "@/lib/privacy-retention";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    const readLimit = await applyRateLimitUser(request, authResult.user.email, RATE_LIMITS.read);
    if (readLimit) return readLimit;

    const { id } = await params;

    // Validate ObjectId format
    const idResult = objectIdSchema.safeParse(id);
    if (!idResult.success) {
      return NextResponse.json(
        { error: "Invalid chat ID" },
        { status: 400 }
      );
    }

    await connectToMongoDB();

    // Ownership enforced: userId filter from session. Retention-filtered:
    // an expired chat returns 404 like a missing one (no content leak).
    const chat = await ChatHistory.findOne({
      _id: id,
      userId: authResult.user.email,
      updatedAt: { $gte: chatCutoffDate() },
    }).lean();

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(chat);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch chat" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    const originRejection = assertSameOriginOrReject(request);
    if (originRejection) return originRejection;

    const { id } = await params;

    const idResult = objectIdSchema.safeParse(id);
    if (!idResult.success) {
      return NextResponse.json(
        { error: "Invalid chat ID" },
        { status: 400 }
      );
    }

    await connectToMongoDB();

    // Ownership enforced: userId filter from session
    await ChatHistory.findOneAndDelete({
      _id: id,
      userId: authResult.user.email,
    });

    return NextResponse.json({ message: "Chat deleted successfully" });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete chat" },
      { status: 500 }
    );
  }
}
