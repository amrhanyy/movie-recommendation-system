import { z } from "zod";

/**
 * AI / browser security utilities (R5 hardening).
 *
 * - Strict URL validation for external links and Markdown links.
 * - YouTube video-ID validation for embeds.
 * - Zod schemas for structured Gemini output.
 * - Gemini HTTP error mapping without leaking upstream bodies.
 */

export const AI_ERROR_CODES = {
  AI_RATE_LIMITED: "AI_RATE_LIMITED",
  AI_TIMEOUT: "AI_TIMEOUT",
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
  AI_INVALID_RESPONSE: "AI_INVALID_RESPONSE",
} as const;

export type AIErrorCode = (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES];

export class AIUpstreamError extends Error {
  code: AIErrorCode;
  constructor(code: AIErrorCode, message: string) {
    super(message);
    this.name = "AIUpstreamError";
    this.code = code;
  }
}

export const MAX_CHAT_MESSAGE_LENGTH = 2000;
export const MAX_CHAT_HISTORY_MESSAGES = 20;
export const MAX_CONTEXT_CHARS = 8000;
export const MAX_ASSISTANT_RESPONSE_LENGTH = 4000;
export const MAX_FENCED_JSON_CHARS = 200_000;
export const MAX_TMDB_OVERVIEW_CHARS = 500;
export const MAX_PREFERENCE_JSON_CHARS = 8000;

const SAFE_URL_PATTERN = /^https:\/\//i;

/**
 * Validate an external URL for href assignment.
 * Exact rule set used by markdown links, homepage links, and AI output:
 * - absolute HTTPS only (no http, no protocol-relative, no scheme-less)
 * - no credentials in the URL
 * - no control characters, whitespace, or quotes
 * - malformed URLs are rejected, never crashed on
 */
export function isSafeExternalUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!SAFE_URL_PATTERN.test(trimmed)) return false;
  if (/[\u0000-\u001F\u007F"'\\\s]/.test(trimmed)) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (!parsed.hostname) return false;
  return true;
}

/**
 * Sanitize a URL for use in href. Returns undefined when unsafe.
 */
export function safeExternalHref(value: unknown): string | undefined {
  return isSafeExternalUrl(value) ? value.trim() : undefined;
}

/**
 * YouTube video-ID allowlist: 11 characters from the standard set.
 * Used for all embed URLs; complete URLs from any source are never trusted.
 */
export function isValidYouTubeVideoId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[A-Za-z0-9_-]{11}$/.test(value);
}

export const YOUTUBE_EMBED_ORIGIN = "https://www.youtube-nocookie.com";

/**
 * Build the embed URL for a validated video ID.
 * Never accepts a full URL; never appends user-controlled query parameters.
 */
export function buildYouTubeEmbedUrl(videoId: string): string | undefined {
  if (!isValidYouTubeVideoId(videoId)) return undefined;
  return `${YOUTUBE_EMBED_ORIGIN}/embed/${videoId}`;
}

/**
 * Extract a fenced JSON block from a model reply.
 * Deterministic, bounded; output must still pass a strict Zod schema.
 * Returns null when no fenced block exists.
 */
export function extractFencedJson(content: string): string | null {
  if (typeof content !== "string") return null;
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (!match) return null;
  return match[1].trim().slice(0, MAX_FENCED_JSON_CHARS);
}

function parseJsonUnknown(raw: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Parse model text as JSON (optional fenced block) then validate with a schema.
 * No silent repair of malformed JSON.
 */
export function parseStructuredModelJson<T>(
  content: string,
  schema: z.ZodType<T>
): T | null {
  if (typeof content !== "string" || content.length === 0) return null;
  const extracted = extractFencedJson(content) ?? content.trim();
  if (extracted.length === 0 || extracted.length > MAX_FENCED_JSON_CHARS) {
    return null;
  }
  const parsed = parseJsonUnknown(extracted);
  if (parsed === null) return null;
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

// ---------------------------------------------------------------------------
// Structured Gemini output schemas
// ---------------------------------------------------------------------------

export const aiRecommendationItemSchema = z
  .object({
    title: z.string().min(1).max(200),
    confidence: z.number().min(0).max(1).optional(),
    "sub-genre": z.string().max(100).optional(),
    type: z.enum(["movie", "tv"]),
  })
  .strict();

export const aiRecommendationsSchema = z
  .object({
    recommendations: z.array(aiRecommendationItemSchema).min(1).max(12),
  })
  .strict();

export const aiSimilarMovieSchema = z
  .object({
    title: z.string().min(1).max(200),
    year: z.string().regex(/^\d{4}$/).optional(),
    reasoning: z.string().max(300).optional(),
  })
  .strict();

export const aiSimilarMoviesSchema = z
  .object({
    similar_movies: z.array(aiSimilarMovieSchema).min(1).max(12),
  })
  .strict();

const geminiTextPartSchema = z
  .object({
    text: z.string().optional(),
  })
  .passthrough();

const geminiGenerateResponseSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            content: z
              .object({
                parts: z.array(geminiTextPartSchema).optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

/**
 * Extract bounded Markdown text from a Gemini generateContent JSON body.
 * Empty or malformed candidate lists return null (caller uses a generic error).
 */
export function extractGeminiText(value: unknown): string | null {
  const parsed = geminiGenerateResponseSchema.safeParse(value);
  if (!parsed.success) return null;
  const first = parsed.data.candidates?.[0];
  const text = first?.content?.parts?.[0]?.text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_ASSISTANT_RESPONSE_LENGTH);
}

/**
 * Validate a parsed model JSON object against the recommendation schema.
 * Returns the validated data or null (safe fallback).
 */
export function validateAIRecommendations(value: unknown) {
  const result = aiRecommendationsSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function validateAISimilarMovies(value: unknown) {
  const result = aiSimilarMoviesSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseAIRecommendationsFromText(content: string) {
  return parseStructuredModelJson(content, aiRecommendationsSchema);
}

export function parseAISimilarMoviesFromText(content: string) {
  return parseStructuredModelJson(content, aiSimilarMoviesSchema);
}

/**
 * Map an upstream Gemini failure to a stable internal code + HTTP status.
 */
export function mapAIError(
  status: number | undefined,
  timedOut: boolean
): { code: AIErrorCode; httpStatus: number } {
  if (timedOut) return { code: AI_ERROR_CODES.AI_TIMEOUT, httpStatus: 504 };
  if (status === 429) return { code: AI_ERROR_CODES.AI_RATE_LIMITED, httpStatus: 429 };
  if (status === 503) return { code: AI_ERROR_CODES.AI_UNAVAILABLE, httpStatus: 503 };
  if (status === undefined || status >= 500) {
    return { code: AI_ERROR_CODES.AI_UNAVAILABLE, httpStatus: 503 };
  }
  if (status === 400) return { code: AI_ERROR_CODES.AI_INVALID_RESPONSE, httpStatus: 502 };
  return { code: AI_ERROR_CODES.AI_INVALID_RESPONSE, httpStatus: 502 };
}

export function httpStatusForAIError(code: AIErrorCode): number {
  if (code === AI_ERROR_CODES.AI_TIMEOUT) return 504;
  if (code === AI_ERROR_CODES.AI_RATE_LIMITED) return 429;
  if (code === AI_ERROR_CODES.AI_INVALID_RESPONSE) return 502;
  return 503;
}

/**
 * Redact anything that could contain the API key or a key-bearing URL.
 * Used before any logging of upstream errors.
 */
export function redactSensitive(value: string): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/(key=)[^&\s"]+/gi, "$1[REDACTED]")
    .replace(/x-goog-api-key:\s*\S+/gi, "x-goog-api-key: [REDACTED]");
}
