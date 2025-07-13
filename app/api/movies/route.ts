import { NextResponse } from "next/server"
import redisCache from "../../../lib/cache";

const TMDB_API_KEY = process.env.TMDB_API_KEY
const BASE_URL = "https://api.themoviedb.org/3"

async function fetchFromTMDB(endpoint: string) {
  const response = await fetch(`${BASE_URL}${endpoint}?api_key=${TMDB_API_KEY}&language=en-US`)
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export async function GET() {
  try {
    // Cache key for combined movie data (popular, top-rated, genres)
    const cacheKey = 'movies:home';
    
    // Try to get from cache or fetch from API
    const movieData = await redisCache.getOrSet(
      cacheKey,
      async () => {
        console.log('Cache miss - fetching popular and top-rated movies from TMDB API');
        
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate'
      }
    })
  } catch (error) {
    console.error("Error fetching data from TMDB:", error)
    return NextResponse.json({ error: "Failed to fetch movie data" }, { status: 500 })
  }
}

