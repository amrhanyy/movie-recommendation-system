import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/security/auth';
import {
  applyRateLimitUser,
  RATE_LIMITS,
} from '@/lib/security/rateLimit';
import redisCache from '../../../../../lib/cache';
import {
  AIUpstreamError,
  extractGeminiText,
  mapAIError,
  parseAISimilarMoviesFromText,
  redactSensitive,
} from '@/lib/ai-security';
import {
  buildSimilarMoviesGeminiPayload,
  GEMINI_GENERATE_URL,
  GEMINI_TIMEOUT_MS,
  getGeminiApiKey,
} from '@/lib/gemini-payload';
import { buildCacheKey, CACHE_SCOPES } from '@/lib/cache-namespace';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

interface MovieDetailItem {
  title?: string;
  release_date?: string;
  overview?: string | null;
  genres?: { name: string }[];
  credits?: {
    crew?: { job: string; name: string }[];
    cast?: { name: string }[];
  };
}

// W3-006c: bounded concurrency for TMDB enrichment (max 4 in-flight).
// Inline copy of the established pool-4 pattern (ai-recommendations route):
// items are sliced into fixed-size batches and each batch is awaited before
// the next starts. No shared helper, no new abstraction — see PERF-001.
const ENRICHMENT_POOL_SIZE = 4;

interface AISuggestion {
  title: string;
  year?: string;
  reasoning?: string;
}

async function getAISimilarMovies(movieDetails: MovieDetailItem) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new AIUpstreamError("AI_UNAVAILABLE", "AI service is not configured");
  }

  const maxRetries = 3;
  let backoffTime = 1000;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const response = await fetch(GEMINI_GENERATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(buildSimilarMoviesGeminiPayload(movieDetails)),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData = '<unreadable>';
        try {
          errorData = redactSensitive((await response.text()).slice(0, 500));
        } catch {
          // ignore body-read failures
        }
        console.error('[Gemini Upstream Error]', response.status, errorData);
        const mappedCode = mapAIError(response.status, false).code;
        if (response.status === 503 || response.status === 429 || response.status >= 500) {
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            backoffTime *= 2;
            continue;
          }
        }
        throw new AIUpstreamError(
          mappedCode,
          `AI service error ${response.status}`
        );
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

      const validated = parseAISimilarMoviesFromText(content);
      if (!validated) {
        throw new AIUpstreamError("AI_INVALID_RESPONSE", "AI response failed validation");
      }
      return validated.similar_movies;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new AIUpstreamError("AI_TIMEOUT", "AI request timed out");
      }
      retryCount++;
      if (
        retryCount < maxRetries &&
        error instanceof AIUpstreamError &&
        error.code === "AI_UNAVAILABLE"
      ) {
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        backoffTime *= 2;
      } else if (error instanceof AIUpstreamError) {
        throw error;
      } else {
        console.error('AI request failed');
        return [];
      }
    }
  }
  
  throw new AIUpstreamError("AI_UNAVAILABLE", "AI service unavailable after retries");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authenticated session — no unauthenticated Gemini access (F-006 fix)
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    // Rate limit: 10 AI similar requests per minute per user (F-011 fix)
    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.aiSimilar
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { id: movieId } = await params;

    // Validate TMDB ID is a positive integer before any external call (F-033)
    if (!/^\d{1,10}$/.test(movieId)) {
      return NextResponse.json(
        { error: "Invalid movie ID" },
        { status: 400 }
      );
    }

    // Route-local v2 scoped key (CACHE-FIX-2).  The payload shape changed from
    // raw AI suggestions to the final enriched recommendation array, so the old
    // `movie:<id>:ai-similar` v1 key is left untouched and expires naturally via
    // TTL.  No dual-read, no migration.
    const cacheKey = buildCacheKey(CACHE_SCOPES.aiSimilar, `${movieId}:v2`);

    // Try to get the final enriched array from cache, or generate + enrich it.
    // PERF-001b: the popular fallback AND the pool-4 enrichment run INSIDE the
    // producer so a warm cache hit skips every upstream tier.  An empty final
    // array returns undefined so it is never cached (retry on next request).
    const cachedOrProducedRecommendations = await redisCache.getOrSet(
      cacheKey,
      async (): Promise<Array<{
        id: number | null;
        title: string;
        release_date?: string;
        poster_path?: string | null;
        vote_average?: number;
        reasoning?: string;
      }> | undefined> => {
        console.log(`Cache miss - generating AI similar movies`);

        // First, get the movie details to use for the prompt
        const detailsResponse = await fetch(
          `${BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=credits`,
          { next: { revalidate: 3600 } }
        );

        if (!detailsResponse.ok) {
          throw new Error(`Movie details fetch failed: ${detailsResponse.status}`);
        }

        const movieDetails = await detailsResponse.json();

        let aiSuggestions: AISuggestion[];

        try {
          // Generate AI recommendations
          const aiResults = await getAISimilarMovies(movieDetails);

          // If AI returned empty results or very few, throw an error so we use TMDB fallback
          if (!aiResults || aiResults.length < 4) {
            throw new Error('Insufficient AI results, falling back to TMDB');
          }

          aiSuggestions = aiResults;
        } catch {
          console.error('AI similar fallback to TMDB');

          // Fallback to TMDB similar movies
          try {
            const similarResponse = await fetch(
              `${BASE_URL}/movie/${movieId}/similar?api_key=${TMDB_API_KEY}`,
              { next: { revalidate: 3600 } }
            );

            if (!similarResponse.ok) {
              throw new Error(`TMDB similar failed: ${similarResponse.status}`);
            }

            const similarData = await similarResponse.json();

            // Format TMDB results to match our expected format
            aiSuggestions = similarData.results.slice(0, 12).map((movie: {
              title: string;
              release_date?: string;
            }) => ({
              title: movie.title,
              year: movie.release_date?.slice(0, 4) || '',
              reasoning: 'Similar movie recommended by TMDB'
            }));
          } catch {
            console.error('TMDB similar fallback failed');
            aiSuggestions = []; // Return empty if all methods fail
          }
        }

        // Ensure we have at least some results
        if (!aiSuggestions || aiSuggestions.length === 0) {
          console.log('No AI or TMDB suggestions available, using emergency fallback');

          // Emergency fallback - try to get popular movies if everything else fails
          try {
            const popularResponse = await fetch(
              `${BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}`,
              { next: { revalidate: 3600 } }
            );

            if (popularResponse.ok) {
              const popularData = await popularResponse.json();

              // Format popular movies as fallback
              aiSuggestions = popularData.results.slice(0, 12).map((movie: {
                title: string;
                release_date?: string;
              }) => ({
                title: movie.title,
                year: movie.release_date?.slice(0, 4) || '',
                reasoning: 'Popular movie you might enjoy'
              }));
            }
          } catch {
            console.error('Emergency fallback failed');
          }
        }

        // Now fetch TMDB details for these movie recommendations
        const enhancedRecommendations: Array<{
          id: number | null;
          title: string;
          release_date?: string;
          poster_path?: string | null;
          vote_average?: number;
          reasoning?: string;
        }> = [];

        for (let i = 0; i < aiSuggestions.length; i += ENRICHMENT_POOL_SIZE) {
          const batch = aiSuggestions.slice(i, i + ENRICHMENT_POOL_SIZE);
          const batchResults = await Promise.all(
            batch.map(async (movie: AISuggestion) => {
              try {
                // Search for the movie in TMDB
                const searchResponse = await fetch(
                  `${BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}&year=${encodeURIComponent(movie.year || '')}`,
                  { next: { revalidate: 3600 } }
                );

                if (!searchResponse.ok) {
                  return {
                    ...movie,
                    poster_path: null,
                    id: null,
                    vote_average: 0
                  };
                }

                const searchData = await searchResponse.json();
                const bestMatch = searchData.results[0];

                if (bestMatch) {
                  return {
                    id: bestMatch.id,
                    title: bestMatch.title,
                    release_date: bestMatch.release_date,
                    poster_path: bestMatch.poster_path,
                    vote_average: bestMatch.vote_average,
                    reasoning: movie.reasoning
                  };
                }

                return {
                  ...movie,
                  poster_path: null,
                  id: null,
                  vote_average: 0
                };
              } catch {
                console.error('TMDB search failed');
                return {
                  ...movie,
                  poster_path: null,
                  id: null,
                  vote_average: 0
                };
              }
            })
          );
          enhancedRecommendations.push(...batchResults);
        }

        // Final enrichment: keep only items we resolved to a real TMDB id.
        // Non-empty partial results are cached (intentional trade-off); an empty
        // final array returns undefined so getOrSet skips the cache write.
        const validRecommendations = enhancedRecommendations.filter(
          (movie: { id: number | null }) => movie.id !== null
        );

        return validRecommendations.length > 0 ? validRecommendations : undefined;
      },
      // Cache for 24 hours (86400 seconds)
      86400
    );

    const validRecommendations = cachedOrProducedRecommendations ?? [];

    return NextResponse.json({ results: validRecommendations });
  } catch {
    console.error('AI similar movies request failed');
    return NextResponse.json(
      { error: 'Failed to generate similar movies' },
      { status: 500 }
    );
  }
} 