import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/security/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import connectToMongoDB from "@/lib/mongodb";
import { ChatHistory } from "@/lib/models/ChatHistory";
import { chatCutoffDate } from "@/lib/privacy-retention";

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

// Chat persistence moved to POST /api/chat (server-authoritative, R5).
// A client-supplied `response` can no longer be written as assistant output,
// closing the fabricated-assistant-message vector.
// POST here is rejected; the GET/DELETE flows above remain for reading and
// deleting the authenticated user's own chats.

interface ChatHistoryDoc {
  _id?: { toString(): string } | string;
  messages?: { role: string; content: string }[];
}

export async function GET() {
  try {
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    await connectToMongoDB();

    // R6: retention-filter by updatedAt so expired chats are never returned.
    const history = await ChatHistory.findOne({
      userId: authResult.user.email,
      updatedAt: { $gte: chatCutoffDate() },
    })
      .sort({ updatedAt: -1 })
      .limit(1)
      .lean<ChatHistoryDoc>();

    const chatId = history?._id ? String(history._id) : null;

    return NextResponse.json({
      chatId,
      messages: history?.messages || [],
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch chat history" },
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

    // Rate limit (F-011) still applies to this rejected path.
    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.chatHistoryWrite
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Intentionally disabled: assistant responses must be produced and
    // persisted server-side by /api/chat so clients cannot inject fabricated
    // messages into a user's conversation history (R5 trust boundary).
    return NextResponse.json(
      {
        error:
          "Chat persistence is handled server-side by POST /api/chat to prevent fabricated conversation content.",
      },
      { status: 403 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to save chat history" },
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

    // Rate limit (F-011) + R6 chatDeleteAll
    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.chatDeleteAll
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // R6: same-origin protection for a cookie-authenticated destructive action.
    if (!isSameOrigin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectToMongoDB();

    // Delete ALL chat history for the authenticated user only.
    await ChatHistory.deleteMany({ userId: authResult.user.email });

    return NextResponse.json(
      { message: "Chat history cleared" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to clear chat history" },
      { status: 500 }
    );
  }
}
