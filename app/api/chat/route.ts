import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/security/auth";
import {
  applyRateLimitUser,
  RATE_LIMITS,
} from "@/lib/security/rateLimit";
import connectToMongoDB from "@/lib/mongodb";
import { ChatHistory } from "@/lib/models/ChatHistory";
import { chatRequestSchema } from "@/lib/security/schemas";
import {
  AIUpstreamError,
  extractGeminiText,
  httpStatusForAIError,
  mapAIError,
  redactSensitive,
} from "@/lib/ai-security";
import {
  boundChatHistory,
  buildChatGeminiPayload,
  GEMINI_GENERATE_URL,
  type ChatTurn,
} from "@/lib/gemini-payload";

interface ChatHistoryDoc {
  messages?: { role: string; content: string }[];
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_TIMEOUT_MS = 15_000;
const MAX_MESSAGES_PER_CHAT = 200;

/**
 * Call Gemini with the API key in the x-goog-api-key header (no key in URL).
 * Upstream bodies are never logged or returned.
 */
async function getGeminiResponse(
  currentMessage: string,
  history: ChatTurn[]
): Promise<string> {
  if (!GOOGLE_API_KEY) {
    throw new AIUpstreamError("AI_UNAVAILABLE", "AI service is not configured");
  }

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const response = await fetch(GEMINI_GENERATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GOOGLE_API_KEY,
        },
        body: JSON.stringify(buildChatGeminiPayload(currentMessage, history)),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 503 && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 1000));
          continue;
        }
        const mapped = mapAIError(response.status, false);
        throw new AIUpstreamError(mapped.code, `AI service error ${mapped.httpStatus}`);
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new AIUpstreamError("AI_INVALID_RESPONSE", "AI returned invalid JSON");
      }

      const content = extractGeminiText(raw);
      if (!content) {
        throw new AIUpstreamError("AI_INVALID_RESPONSE", "AI returned no content");
      }
      return content;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof AIUpstreamError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AIUpstreamError("AI_TIMEOUT", "AI request timed out");
      }
      console.error("AI request failed:", redactSensitive(String(error)));
      throw new AIUpstreamError("AI_UNAVAILABLE", "AI service unavailable");
    }
  }

  throw new AIUpstreamError("AI_UNAVAILABLE", "AI service unavailable");
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSession();
    if (!authResult.ok) {
      return authResult.response;
    }

    const userId = authResult.user.email;

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

    const orderedHistory = boundChatHistory(history);
    const responseText = await getGeminiResponse(message, orderedHistory);

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
