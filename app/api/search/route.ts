import { NextRequest, NextResponse } from "next/server";
import { applyRateLimitPublic, RATE_LIMITS } from "@/lib/security/rateLimit";
import { MAX_SEARCH_QUERY_LENGTH } from "@/lib/security/schemas";
import { redisCache } from "@/lib/cache";
import { CACHE_SCOPES, buildCacheKey } from "@/lib/cache-namespace";

const SEARCH_TTL = 300;

export async function GET(request: NextRequest) {
  // Rate limit: 30 searches per minute per IP/client (F-011/F-028 fix)
  const rateLimitResponse = await applyRateLimitPublic(
    request,
    RATE_LIMITS.search
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const page = searchParams.get("page");

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter is required" },
      { status: 400 }
    );
  }

  // Bound the search query length to prevent abuse
  if (query.length > MAX_SEARCH_QUERY_LENGTH) {
    return NextResponse.json(
      { error: "Query exceeds maximum length" },
      { status: 400 }
    );
  }

  // Validate page if provided
  let pageNum = 1;
  if (page) {
    pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > 1000) {
      return NextResponse.json(
        { error: "Invalid page number" },
        { status: 400 }
      );
    }
  }

  try {
    const cacheKey = buildCacheKey(CACHE_SCOPES.publicTMDb, `search:${query.trim()}:${pageNum}`);
    const data = await redisCache.getOrSet(cacheKey, async () => {
      const response = await fetch(
        `https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${pageNum}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch from TMDB");
      }

      return await response.json();
    }, SEARCH_TTL);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to search movies and TV shows" },
      { status: 500 }
    );
  }
}
