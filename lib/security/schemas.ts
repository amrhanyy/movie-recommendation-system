/**
 * Shared Zod validation schemas for API routes.
 *
 * All security-sensitive object schemas use .strict() to reject unknown fields.
 * These schemas prevent:
 * - $ operator injection
 * - Dotted-key injection
 * - Prototype pollution (__proto__, constructor, prototype)
 * - Mass assignment
 * - Unbounded strings, arrays, and payloads
 */

import { z } from "zod";

// Media type: movie | tv (person only where intentionally supported)
export const mediaTypeSchema = z.enum(["movie", "tv", "person"]);

export const mediaTypeStrictSchema = z.enum(["movie", "tv"]);

// TMDB ID: positive integer
export const tmdbIdSchema = z.number().int().positive().max(10_000_000);

// MongoDB ObjectId string
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId");

// Common field limits
export const MAX_TITLE_LENGTH = 500;
export const MAX_POSTER_PATH_LENGTH = 256;
export const MAX_SEARCH_QUERY_LENGTH = 200;
export const MAX_CHAT_MESSAGE_LENGTH = 2000;
export const MAX_NAME_LENGTH = 200;

// Favorites / Watchlist / History item schema
export const listItemSchema = z
  .object({
    itemId: tmdbIdSchema,
    type: mediaTypeSchema,
    title: z.string().min(1).max(MAX_TITLE_LENGTH),
    posterPath: z.string().max(MAX_POSTER_PATH_LENGTH).nullable().optional(),
  })
  .strict();

// History item schema (same as list item)
export const historyItemSchema = listItemSchema;

// Chat message schema
export const chatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
  })
  .strict();

export const MAX_CHAT_HISTORY_MESSAGES = 20;

// Chat request schema.
// previousMessages is accepted for backward compatibility and IGNORED by the
// server (R5 trust boundary). chatId is optional and must be a valid ObjectId.
export const chatRequestSchema = z
  .object({
    message: z.string().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
    chatId: objectIdSchema.optional(),
    previousMessages: z.array(z.unknown()).max(MAX_CHAT_HISTORY_MESSAGES).optional(),
  })
  .strict();

// Search query schema
export const searchQuerySchema = z
  .object({
    query: z.string().min(1).max(MAX_SEARCH_QUERY_LENGTH),
    page: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

// Pagination schema
export const paginationSchema = z
  .object({
    page: z.number().int().min(1).max(1000).default(1),
    limit: z.number().int().min(1).max(100).default(10),
  })
  .strict();

// User preferences schema
export const preferencesSchema = z
  .object({
    favorite_genres: z.array(z.string().max(50)).max(20).optional(),
    selected_moods: z.array(z.string().max(50)).max(10).optional(),
    historyTrackingEnabled: z.boolean().optional(),
  })
  .strict();

// Admin user update schema
export const adminUserUpdateSchema = z
  .object({
    userId: z.string().min(1).max(128),
    updates: z
      .object({
        role: z.enum(["user", "admin", "owner"]).optional(),
        preferences: preferencesSchema.optional(),
      })
      .strict(),
  })
  .strict();

// Redis cache action schemas
export const cacheInvalidateSchema = z.object({
  action: z.literal("invalidate"),
  id: z.union([z.string().min(1).max(50), z.number()]),
  type: z.enum(["movie", "tv", "home"]),
});

export const cacheClearSchema = z.object({
  action: z.literal("clear"),
});

// Mood recommendation schema
export const moodRecommendationSchema = z
  .object({
    mood: z.string().min(1).max(50),
    page: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

// Time-based movies schema
export const timeBasedMoviesSchema = z
  .object({
    duration: z.enum(["short", "medium", "long"]).optional(),
    page: z.number().int().min(1).max(1000).optional(),
    genre: z.string().max(50).optional(),
  })
  .strict();

// Validate a body against a schema and return a 400 response on failure
export function validateBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
