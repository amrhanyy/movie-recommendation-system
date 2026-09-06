import { NextRequest, NextResponse } from "next/server"
import redisCache from "../../../lib/cache";
import { applyRateLimitPublic, RATE_LIMITS } from "@/lib/security/rateLimit";

const TMDB_API_KEY = process.env.TMDB_API_KEY
const BASE_URL = "https://api.themoviedb.org/3"

async function fetchFromTMDB(endpoint: string) {
  const response = await fetch(`${BASE_URL}${endpoint}?api_key=${TMDB_API_KEY}&language=en-US`)
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status}`)
  }
  return response.json()
}

export async function GET(request: NextRequest) {
  // Rate limit public TMDB proxy (M-03)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!TMDB_API_KEY) {
    return NextResponse.json({ error: "Upstream service unavailable" }, { status: 503 })
  }

  try {
    // Cache key for combined movie data (popular, top-rated, genres)
    const cacheKey = 'movies:home';

    // Try to get from cache or fetch from API
    const movieData = await redisCache.getOrSet(
      cacheKey,
      async () => {
        const [popularMovies, topRatedMovies, genres] = await Promise.all([
          fetchFromTMDB("/movie/popular"),
          fetchFromTMDB("/movie/top_rated"),
          fetchFromTMDB("/genre/movie/list"),
        ]);

        return {
          popularMovies: popularMovies.results,
          topRatedMovies: topRatedMovies.results,
          genres: genres.genres,
        };
      },
      // Cache for 6 hours (21600 seconds) since this doesn't change often
      21600
    );

    return NextResponse.json(movieData, {
      headers: {
        // F-024 fix: removed Access-Control-Allow-Origin: * (same-origin app)
        'Cache-Control': 'public, max-age=21600'
      }
    })
  } catch (error) {
    console.error("Error fetching data from TMDB:", error)
    return NextResponse.json({ error: "Failed to fetch movie data" }, { status: 500 })
  }
}
