import { NextRequest, NextResponse } from "next/server";
import { requireUser, assertSameOriginOrReject } from "@/lib/security/auth";
import {
  applyRateLimitUser,
  RATE_LIMITS,
} from "@/lib/security/rateLimit";
import connectToMongoDB from "@/lib/mongodb";
import { ChatHistory } from "@/lib/models/ChatHistory";
import { chatRequestSchema } from "@/lib/security/schemas";
import { consumeQuota } from "@/lib/security/quota";
import { trimCollection } from "@/lib/security/cardinality";
import {
  AIUpstreamError,
  httpStatusForAIError,
} from "@/lib/ai-security";
import { callGemini } from "@/lib/gemini-provider";
import {
  buildChatGeminiPayload,
  type ChatTurn,
} from "@/lib/gemini-payload";

interface ChatHistoryDoc {
  messages?: { role: string; content: string }[];
}

const MAX_MESSAGES_PER_CHAT = 200;

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    const userId = authResult.user.email;

    const originRejection = assertSameOriginOrReject(request);
    if (originRejection) return originRejection;

    const rateLimitResponse = await applyRateLimitUser(
      request,
      userId,
      RATE_LIMITS.chat
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    let data: unknown;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parseResult = chatRequestSchema.safeParse(data);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }

    const { message, chatId } = parseResult.data;
    // Client-supplied previousMessages is intentionally ignored (R5).

    await connectToMongoDB();

    let history: ChatTurn[] = [];
    if (chatId) {
      const chat = await ChatHistory.findOne({
        _id: chatId,
        userId,
      }).lean<ChatHistoryDoc>();
      if (!chat) {
        return NextResponse.json(
          { error: "Chat not found" },
          { status: 403 }
        );
      }
      history = (chat.messages || [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: String(m.content || ""),
        }));
    }

    // W3-006a: daily chat quota (50 per day). Rejected input and non-owned
    // chat references must not consume the daily AI quota (REL-001).
    const quotaResult = await consumeQuota(userId, 'chats', 50);
    if (!quotaResult.allowed) {
      return NextResponse.json(
        { error: "Daily chat limit reached", retryAfterSeconds: quotaResult.retryAfterSeconds },
        { status: 429 }
      );
    }

    const responseText = await callGemini({
      payload: buildChatGeminiPayload(message, history),
    });

    let persistedChatId = chatId || "";
    if (chatId) {
      await ChatHistory.findOneAndUpdate(
        { _id: chatId, userId },
        {
          $push: {
            messages: {
              $each: [
                { role: "user", content: message, timestamp: new Date() },
                { role: "assistant", content: responseText, timestamp: new Date() },
              ],
              $slice: -MAX_MESSAGES_PER_CHAT,
            },
          },
          $set: { updatedAt: new Date() },
        },
        { new: true }
      );
    } else {
      const created = await ChatHistory.create({
        userId,
        messages: [
          { role: "user", content: message, timestamp: new Date() },
          { role: "assistant", content: responseText, timestamp: new Date() },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      persistedChatId = String(created._id);
    }

    // W3-006b: trim chats to keep newest 100
    await trimCollection(ChatHistory, { userId, maxCount: 100, sortField: 'updatedAt' });

    return NextResponse.json({
      response: responseText,
      chatId: persistedChatId || undefined,
      status: "success",
    });
  } catch (error) {
    if (error instanceof AIUpstreamError) {
      return NextResponse.json(
        { error: "Failed to process chat request", code: error.code },
        { status: httpStatusForAIError(error.code) }
      );
    }
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
