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
  getGeminiApiKey,
  type ChatTurn,
} from "@/lib/gemini-payload";

interface ChatHistoryDoc {
  messages?: { role: string; content: string }[];
}

const GEMINI_TIMEOUT_MS = 15_000;
const MAX_MESSAGES_PER_CHAT = 200;

/**
 * Safely read a bounded upstream error body for server-side logging only.
 * Redacted before logging; never returned to the client.
 */
async function readUpstreamErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return redactSensitive(text.slice(0, 500));
  } catch {
    return "<unreadable>";
  }
}

/**
 * POST to a single Gemini model URL. Returns the model text or throws.
 * Logs upstream failures with status + redacted body to end 502 blindness.
 */
async function postToGemini(
  url: string,
  apiKey: string,
  currentMessage: string,
  history: ChatTurn[]
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(buildChatGeminiPayload(currentMessage, history)),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await readUpstreamErrorBody(response);
      console.error("[Gemini Upstream Error]", response.status, errorData);
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

/**
 * Call Gemini with the API key in the x-goog-api-key header (no key in URL).
 * Single model (GEMINI_GENERATE_URL); 503s get one retry. Upstream bodies are
 * logged server-side (redacted) and never returned to the client.
 */
async function getGeminiResponse(
  currentMessage: string,
  history: ChatTurn[]
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new AIUpstreamError("AI_UNAVAILABLE", "AI service is not configured");
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await postToGemini(GEMINI_GENERATE_URL, apiKey, currentMessage, history);
    } catch (error) {
      const isUnavailable = error instanceof AIUpstreamError && error.code === "AI_UNAVAILABLE";
      if (isUnavailable && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw error;
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
