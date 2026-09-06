import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/security/auth';
import { applyRateLimitUser, RATE_LIMITS } from '@/lib/security/rateLimit';
import connectToMongoDB from '@/lib/mongodb';
import { History } from '@/lib/models/History';
import { WatchlistModel } from '@/lib/models/WatchlistModel';
import { FavoritesModel } from '@/lib/models/FavoritesModel';
import {
  AIUpstreamError,
  extractGeminiText,
  httpStatusForAIError,
  mapAIError,
  parseAIRecommendationsFromText,
} from '@/lib/ai-security';
import {
  buildRecommendationGeminiPayload,
  GEMINI_GENERATE_URL,
  getGeminiApiKey,
} from '@/lib/gemini-payload';

const TMDB_API_KEY = process.env.TMDB_API_KEY;

/** Safely read a bounded upstream error body for server logs (never client). */
async function readUpstreamErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return '<unreadable>';
  }
}

async function postRecommendationsToGemini(
  url: string,
  apiKey: string,
  preferences: string
): Promise<Array<{ title: string; confidence?: number; "sub-genre"?: string; type: string }>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(buildRecommendationGeminiPayload(preferences)),
  });

  if (!response.ok) {
    const errorData = await readUpstreamErrorBody(response);
    console.error('[Gemini Upstream Error]', response.status, errorData);
    throw new AIUpstreamError(
      mapAIError(response.status, false).code,
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

  const validated = parseAIRecommendationsFromText(content);
  if (!validated) {
    throw new AIUpstreamError("AI_INVALID_RESPONSE", "AI response failed validation");
  }
  return validated.recommendations;
}

async function getAIRecommendations(preferences: string) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new AIUpstreamError("AI_UNAVAILABLE", "AI service is not configured");
  }

  const maxRetries = 3;
  let retryCount = 0;
  let backoffTime = 1000;

  while (retryCount < maxRetries) {
    try {
      return await postRecommendationsToGemini(GEMINI_GENERATE_URL, apiKey, preferences);
    } catch (error) {
      if (
        error instanceof AIUpstreamError &&
        (error.code === "AI_UNAVAILABLE" || error.code === "AI_RATE_LIMITED")
      ) {
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          backoffTime *= 2;
          continue;
        }
      }
      if (error instanceof AIUpstreamError) {
        throw error;
      }
      retryCount++;
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        backoffTime *= 2;
      } else {
        console.error('AI request failed');
        return [];
      }
    }
  }

  throw new AIUpstreamError("AI_UNAVAILABLE", "AI service unavailable after retries");
}

export async function GET(request: NextRequest) {
  try {
    // Require authenticated session via central auth module (F-005)
    const authResult = await requireSession();
    if (!authResult.ok) {
      return authResult.response;
    }

    // Rate limit AI recommendations per user (F-011)
    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.aiRecommendations
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    await connectToMongoDB();

    // Fetch user's data
    const [history, watchlist, favorites] = await Promise.all([
      History.find({ userId: authResult.user.email }).sort({ viewedAt: -1 }).limit(10),
      WatchlistModel.find({ userId: authResult.user.email }).sort({ createdAt: -1 }),
      FavoritesModel.find({ userId: authResult.user.email }).sort({ createdAt: -1 })
    ]);

    // Check if user has added content to watchlist or favorites
    if (watchlist.length === 0 && favorites.length === 0) {
      return NextResponse.json({
        recommendations: [],
        needsContent: true,
        message: "Please add movies or TV shows to your Favorites or Watchlist to get personalized recommendations."
      });
    }

    // Enhanced title normalization and collection
    const normalizeTitle = (title: string): string => {
      return title.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim();
    };

    // Store normalized titles and original items
    const userContentTitles = new Set();
    const userContentItems = [
      ...watchlist.map(w => ({ title: w.title, type: w.type, id: w.tmdbId })),
      ...favorites.map(f => ({ title: f.title, type: f.type, id: f.tmdbId }))
    ];

    // Add all possible variations of titles to the set
    userContentItems.forEach(item => {
      const normalizedTitle = normalizeTitle(item.title);
      userContentTitles.add(normalizedTitle);

      // Also add without "The", "A", etc.
      userContentTitles.add(normalizedTitle.replace(/^(the|a|an)\s+/i, ''));

      // Add year-stripped version if title contains a year
      const yearMatch = item.title.match(/\s*\(\d{4}\)$/);
      if (yearMatch) {
        const titleWithoutYear = normalizeTitle(item.title.replace(/\s*\(\d{4}\)$/, ''));
        userContentTitles.add(titleWithoutYear);
      }
    });

    // Prepare user preferences for AI (minimized: titles/types only, no dates)
    const preferences = {
      watchHistory: history.map(h => ({
        title: h.title,
        type: h.type,
      })),
      watchlist: watchlist.map(w => ({ title: w.title, type: w.type })),
      favorites: favorites.map(f => ({ title: f.title, type: f.type })),
      excludeTitles: Array.from(userContentTitles) // Explicitly tell AI what to exclude
    };

    // Try to get AI recommendations
    let aiSuggestions = await getAIRecommendations(JSON.stringify(preferences)) || [];

    // If AI recommendations failed, use a fallback with popular movies
    if (!Array.isArray(aiSuggestions) || aiSuggestions.length === 0) {
      try {
        // Get popular movies and TV shows as a fallback
        const [moviesResponse, tvResponse] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`),
          fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`)
        ]);

        if (moviesResponse.ok && tvResponse.ok) {
          const [moviesData, tvData] = await Promise.all([
            moviesResponse.json(),
            tvResponse.json()
          ]);

          // Combine and format movies and TV shows results
          const tempMovies = moviesData.results.slice(0, 10).map((movie: { title: string }) => ({
            title: movie.title,
            confidence: 0.8,
            "sub-genre": "popular",
            type: "movie"
          }));

          const tempTV = tvData.results.slice(0, 10).map((show: { name: string }) => ({
            title: show.name,
            confidence: 0.8,
            "sub-genre": "popular",
            type: "tv"
          }));

          aiSuggestions = [...tempMovies, ...tempTV];
        }
      } catch {
        console.error('Fallback recommendation error');
      }

      // If still no recommendations, return empty with an error message
      if (aiSuggestions.length === 0) {
        return NextResponse.json({
          recommendations: [],
          error: 'Unable to generate recommendations at this time. Please try again later.'
        });
      }
    }

    if (!Array.isArray(aiSuggestions)) {
      return NextResponse.json({ recommendations: [] });
    }

    // Title similarity function
    const isTitleSimilar = (title1: string, title2: string): boolean => {
      const normalized1 = normalizeTitle(title1);
      const normalized2 = normalizeTitle(title2);

      // Check exact match
      if (normalized1 === normalized2) return true;

      // Check without "The", "A", etc.
      if (normalized1.replace(/^(the|a|an)\s+/i, '') === normalized2.replace(/^(the|a|an)\s+/i, '')) return true;

      // Check if one is substring of the other (for cases like "Movie Title" vs "Movie Title: Subtitle")
      if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
        // Only consider it a match if the shorter title is at least 70% of the longer title's length
        const minLength = Math.min(normalized1.length, normalized2.length);
        const maxLength = Math.max(normalized1.length, normalized2.length);
        if (minLength / maxLength > 0.7) return true;
      }

      return false;
    };

    // Enhanced filtering of recommendations
    const filteredSuggestions = aiSuggestions.filter(suggestion => {
      const suggestionTitle = suggestion.title;

      // Check against all user content titles using the similarity function
      for (const item of userContentItems) {
        if (isTitleSimilar(suggestionTitle, item.title)) {
          return false;
        }
      }

      return true;
    });

    // Fetch detailed info from TMDB for each recommendation
    const detailedRecommendations = await Promise.all(
      filteredSuggestions.map(async (suggestion: {
        title: string;
        confidence?: number;
        "sub-genre"?: string;
        type?: string;
      }) => {
        try {
          const searchResponse = await fetch(
            `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(suggestion.title)}`
          );
          const searchData = await searchResponse.json();

          if (!searchData.results || searchData.results.length === 0) {
            return null;
          }

          const match = searchData.results[0];
          const matchTitle = match.title || match.name || '';

          // Final check to ensure this title isn't in user's content
          for (const item of userContentItems) {
            if (isTitleSimilar(matchTitle, item.title)) {
              return null;
            }

            // Also check TMDB ID if available
            if (item.id && item.id === match.id) {
              return null;
            }
          }

          return {
            id: match.id,
            title: matchTitle,
            release_date: match.release_date || match.first_air_date,
            poster_path: match.poster_path,
            vote_average: match.vote_average,
            media_type: match.media_type,
            confidence_score: suggestion.confidence || 1,
          };
        } catch {
          console.error('TMDB lookup failed');
          return null;
        }
      })
    );

    // Filter out null values and remove duplicates based on TMDB ID
    const uniqueItemsMap = new Map();
    detailedRecommendations
      .filter(Boolean)
      .forEach((item) => {
        if (item && !uniqueItemsMap.has(item.id)) {
          uniqueItemsMap.set(item.id, item);
        }
      });

    const validRecommendations = Array.from(uniqueItemsMap.values());

    // Balance movies and TV shows in the recommendations
    interface AIRecommendationItem {
      id: number;
      title: string;
      release_date?: string;
      poster_path?: string;
      vote_average?: number;
      media_type: string;
      confidence_score: number;
    }
    const balanceRecommendations = (recommendations: AIRecommendationItem[]) => {
      // Separate into movies and TV shows
      const movies = recommendations.filter(r => r.media_type === 'movie');
      const tvShows = recommendations.filter(r => r.media_type === 'tv');

      // If we already have a good balance, return as is
      if (Math.abs(movies.length - tvShows.length) <= 2) {
        return recommendations;
      }

      // Sort both by confidence score
      movies.sort((a, b) => b.confidence_score - a.confidence_score);
      tvShows.sort((a, b) => b.confidence_score - a.confidence_score);

      // Calculate target number for each type
      const totalToDisplay = Math.min(recommendations.length, 12);
      const targetEach = Math.floor(totalToDisplay / 2);

      let balanced = [];

      // If we have enough of both types
      if (movies.length >= targetEach && tvShows.length >= targetEach) {
        balanced = [...movies.slice(0, targetEach), ...tvShows.slice(0, targetEach)];

        // Add one more of the type that had higher quality recommendations if we need an odd number
        if (balanced.length < totalToDisplay) {
          const remainingSlot = totalToDisplay - balanced.length;
          const topMovieScore = movies[targetEach]?.confidence_score || 0;
          const topTvScore = tvShows[targetEach]?.confidence_score || 0;

          if (topMovieScore >= topTvScore && movies.length > targetEach) {
            balanced.push(movies[targetEach]);
          } else if (tvShows.length > targetEach) {
            balanced.push(tvShows[targetEach]);
          }
        }
      }
      // If we don't have enough of one type, take as many as we can and fill with the other
      else {
        const moviesCount = Math.min(movies.length, targetEach);
        const tvShowsCount = Math.min(tvShows.length, targetEach);

        balanced = [...movies.slice(0, moviesCount), ...tvShows.slice(0, tvShowsCount)];

        // Fill remaining slots with whatever type we have more of
        const remainingSlots = totalToDisplay - balanced.length;
        if (remainingSlots > 0) {
          if (movies.length > moviesCount) {
            balanced = [...balanced, ...movies.slice(moviesCount, moviesCount + remainingSlots)];
          } else if (tvShows.length > tvShowsCount) {
            balanced = [...balanced, ...tvShows.slice(tvShowsCount, tvShowsCount + remainingSlots)];
          }
        }
      }

      // Shuffle to avoid grouping by type
      for (let i = balanced.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [balanced[i], balanced[j]] = [balanced[j], balanced[i]];
      }

      return balanced;
    };

    const balancedRecommendations = balanceRecommendations(validRecommendations);

    // Final check to ensure no duplicates by checking for duplicate IDs and similar titles
    const finalRecommendations: Array<{
      id: number;
      title: string;
      release_date?: string;
      poster_path?: string;
      vote_average?: number;
      media_type: string;
      confidence_score: number;
    }> = [];
    const finalIds = new Set<number>();
    const finalTitles = new Set<string>();

    balancedRecommendations.forEach(item => {
      // Skip if we've already seen this ID
      if (finalIds.has(item.id)) {
        return;
      }

      // Skip if we've already seen a similar title
      const normalizedTitle = normalizeTitle(item.title);
      let isDuplicate = false;

      finalTitles.forEach(existingTitle => {
        if (isTitleSimilar(normalizedTitle, existingTitle)) {
          isDuplicate = true;
        }
      });

      if (!isDuplicate) {
        finalRecommendations.push(item);
        finalIds.add(item.id);
        finalTitles.add(normalizedTitle);
      }
    });

    return NextResponse.json({
      recommendations: finalRecommendations,
      needsContent: false
    });
  } catch (error) {
    console.error('Recommendation error');

    if (error instanceof AIUpstreamError) {
      return NextResponse.json({
        recommendations: [],
        error: 'Failed to generate recommendations',
        code: error.code,
      }, { status: httpStatusForAIError(error.code) });
    }

    return NextResponse.json({
      recommendations: [],
      error: 'Failed to generate recommendations'
    }, { status: 500 });
  }
}