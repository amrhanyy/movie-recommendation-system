import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, assertSameOriginOrReject } from "@/lib/security/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import cacheManager from "@/lib/cacheManager";
import { CACHE_NAMESPACE } from "@/lib/cache-namespace";
import { z } from "zod";

/**
 * Cache administration API.
 *
 * Security (F-008 / F-009 / F-052):
 * - requireAdmin() at handler level; never client-role-controlled.
 * - GET is read-only (stats only); destructive actions use POST/DELETE.
 * - Clearing is prefix-scoped; FLUSHDB is never called.
 * - Key listing uses bounded SCAN only; redis.keys() is never called.
 * - Same-origin check on cookie-authenticated mutations.
 * - Strict Zod bodies; raw patterns are not accepted.
 */

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (!authResult.ok) {
      return authResult.response;
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "stats";

    if (action === "stats") {
      const stats = await cacheManager.getCacheStats();
      return NextResponse.json(
        { success: true, stats },
        { headers: noStoreHeaders }
      );
    }

    // Only bounded, sanitized metadata listing is permitted via GET;
    // raw patterns are rejected.
    if (action === "list") {
      const scopeParam = searchParams.get("scope") || "public:tmdb";
      // Validate scope against an internal allowlist; never accept arbitrary
      // patterns or keys from the client.
      const allowedScopes = [
        "public:tmdb",
        "user:recommendations",
        "security:rate-limit",
        "admin:cache-metadata",
        "public:ai-similar",
      ];
      const scope = scopeParam.replace(/[^a-zA-Z0-9:_-]/g, "");
      if (!allowedScopes.includes(scope)) {
        return NextResponse.json(
          { error: "Invalid scope" },
          { status: 400, headers: noStoreHeaders }
        );
      }
      const limitParam = searchParams.get("limit");
      const limit = limitParam
        ? Math.max(1, Math.min(parseInt(limitParam, 10) || 100, 200))
        : 100;
      const keys = await cacheManager.listKeys(scope, limit);
      // Return sanitized head metadata only (no raw key names)
      const sanitized = keys.map((k) => {
        const tail = k.startsWith(CACHE_NAMESPACE)
          ? k.slice(CACHE_NAMESPACE.length)
          : k;
        return tail.length > 78 ? tail.slice(0, 75) + "..." : tail;
      });
      return NextResponse.json(
        { success: true, count: sanitized.length, keys: sanitized },
        { headers: noStoreHeaders }
      );
    }

    // GET can only retrieve stats/metadata, never clear or mutate (F-008)
    return NextResponse.json(
      { error: "Use POST or DELETE for cache operations" },
      { status: 405, headers: noStoreHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to manage cache" },
      { status: 500, headers: noStoreHeaders }
    );
  }
}

const invalidateSchema = z.object({
  action: z.literal("invalidate"),
  id: z.union([z.string().min(1).max(50), z.number()]),
  type: z.enum(["movie", "tv", "home"]),
}).strict();

const clearSchema = z.object({
  action: z.literal("clear"),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (!authResult.ok) {
      return authResult.response;
    }

    const originRejection = assertSameOriginOrReject(request);
    if (originRejection) {
      return NextResponse.json(await originRejection.json(), {
        status: 403,
        headers: noStoreHeaders,
      });
    }

    // Rate limit cache administration (F-011)
    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.cacheAdmin
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
        { status: 400, headers: noStoreHeaders }
      );
    }

    // Try invalidate schema first
    const invalidateResult = invalidateSchema.safeParse(data);
    if (invalidateResult.success) {
      const { id, type } = invalidateResult.data;

      if (type === "movie") {
        await cacheManager.invalidateMovieCache(String(id));
        return NextResponse.json(
          { success: true, message: `Cache for movie ${id} invalidated` },
          { headers: noStoreHeaders }
        );
      }

      if (type === "tv") {
        await cacheManager.invalidateTVCache(String(id));
        return NextResponse.json(
          { success: true, message: `Cache for TV show ${id} invalidated` },
          { headers: noStoreHeaders }
        );
      }

      if (type === "home") {
        await cacheManager.invalidateHomeCache();
        return NextResponse.json(
          { success: true, message: "Home page cache invalidated" },
          { headers: noStoreHeaders }
        );
      }

      return NextResponse.json(
        { error: "Invalid type" },
        { status: 400, headers: noStoreHeaders }
      );
    }

    // Try clear schema
    const clearResult = clearSchema.safeParse(data);
    if (clearResult.success) {
      const result = await cacheManager.clearAllCache();
      return NextResponse.json(
        {
          success: true,
          message: "Application cache cleared",
          deleted: result.deleted,
          remaining: result.remaining,
        },
        { headers: noStoreHeaders }
      );
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400, headers: noStoreHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to manage cache" },
      { status: 500, headers: noStoreHeaders }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (!authResult.ok) {
      return authResult.response;
    }

    const originRejection = assertSameOriginOrReject(request);
    if (originRejection) {
      return NextResponse.json(await originRejection.json(), {
        status: 403,
        headers: noStoreHeaders,
      });
    }

    // Rate limit cache administration (F-011)
    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.cacheAdmin
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Prefix-scoped clear; never FLUSHDB/FLUSHALL (F-009)
    const result = await cacheManager.clearAllCache();
    return NextResponse.json(
      {
        success: true,
        message: "Application cache cleared",
        deleted: result.deleted,
        remaining: result.remaining,
      },
      { headers: noStoreHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to clear cache" },
      { status: 500, headers: noStoreHeaders }
    );
  }
}