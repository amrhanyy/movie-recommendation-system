import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit';
import redisCache from '@/lib/cache';
import { buildCacheKey, CACHE_SCOPES } from '@/lib/cache-namespace';

// Enhanced mood mapping with genres and keywords for better recommendations
const moodToRecommendations = {
  happy: { 
    genres: ['35', '10751'], // Comedy, Family
    keywords: 'feel-good,happy,comedy,uplifting',
    minRating: 7.0
  },
  melancholic: { 
    genres: ['18'], // Drama
    keywords: 'emotional,drama,touching,melancholy',
    minRating: 7.2
  },
  excited: { 
    genres: ['28', '12'], // Action, Adventure
    keywords: 'action,adventure,thrilling,exciting',
    minRating: 6.8
  },
  relaxed: { 
    genres: ['99', '10751'], // Documentary, Family
    keywords: 'calm,relaxing,peaceful,gentle',
    minRating: 6.5
  },
  tense: { 
    genres: ['53', '9648'], // Thriller, Mystery
    keywords: 'suspense,thriller,mystery,intense',
    minRating: 7.0
  },
  romantic: { 
    genres: ['10749'], // Romance
    keywords: 'romance,love,romantic,relationship',
    minRating: 6.8
  },
  thoughtful: { 
    genres: ['18', '99'], // Drama, Documentary
    keywords: 'thought-provoking,philosophical,deep,meaningful',
    minRating: 7.5
  },
  energetic: { 
    genres: ['28', '12', '16'], // Action, Adventure, Animation
    keywords: 'action,fast-paced,dynamic,energetic',
    minRating: 6.5
  }
};

// R3: mood recommendations are cached server-side, keyed by the validated
// mood and page. Two upstream discover calls are collapsed behind one cached
// result. (TTL chosen in the 2-6h band; 6h matches the other public TMDB
// content caches.)
const MOOD_TTL = 6 * 60 * 60; // 6 hours

export async function GET(request: NextRequest) {
  // Rate limit public mood requests (F-011)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.mood);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const mood = searchParams.get('mood');
  const pageParam = searchParams.get('page') || '1';

  if (!mood || !moodToRecommendations[mood as keyof typeof moodToRecommendations]) {
    return NextResponse.json({ error: 'Invalid mood' }, { status: 400 });
  }

  // Validate page number (1-1000)
  const page = Number(pageParam);
  if (!Number.isInteger(page) || page < 1 || page > 1000) {
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  }

  if (!process.env.TMDB_API_KEY) {
    return NextResponse.json({ error: 'Upstream service unavailable' }, { status: 503 });
  }

  // R3: cache the combined result. Only validated mood + integer page are
  // embedded in the key (both normalized by buildCacheKey).
  const cacheKey = buildCacheKey(
    CACHE_SCOPES.publicTMDb,
    `mood:${mood}:page:${page}`
  );

  try {
    const payload = await redisCache.getOrSet(
      cacheKey,
      async () => {
        const moodData = moodToRecommendations[mood as keyof typeof moodToRecommendations];
        const genres = moodData.genres.join(',');
        const keywords = moodData.keywords;
        const minRating = moodData.minRating;

        // Make two parallel requests - one with genres and one with keywords
        const [genreResponse, keywordResponse] = await Promise.all([
          fetch(
            `https://api.themoviedb.org/3/discover/movie?` +
            `api_key=${process.env.TMDB_API_KEY}&` +
            `with_genres=${genres}&` +
            `vote_average.gte=${minRating}&` +
            `sort_by=popularity.desc&` +
            `vote_count.gte=200&` +
            `page=${page}`
          ),
          fetch(
            `https://api.themoviedb.org/3/discover/movie?` +
            `api_key=${process.env.TMDB_API_KEY}&` +
            `with_keywords=${keywords.split(',').join('|')}&` +
            `vote_average.gte=${minRating}&` +
            `sort_by=popularity.desc&` +
            `vote_count.gte=150&` +
            `page=${page}`
          )
        ]);

        if (!genreResponse.ok || !keywordResponse.ok)
          throw new Error('TMDB API error');

        const [genreData, keywordData] = await Promise.all([
          genreResponse.json(),
          keywordResponse.json()
        ]);

        // Combine and deduplicate results
        const combinedResults = [...genreData.results];
        const existingIds = new Set(combinedResults.map(movie => movie.id));

        keywordData.results.forEach((movie: { id: number }) => {
          if (!existingIds.has(movie.id)) {
            combinedResults.push(movie);
            existingIds.add(movie.id);
          }
        });

        // Sort by popularity and limit to 20 results
        const sortedResults = combinedResults
          .sort((a, b) => b.popularity - a.popularity)
          .slice(0, 20);

        return {
          page,
          results: sortedResults,
          total_results: sortedResults.length,
          total_pages: Math.max(genreData.total_pages, keywordData.total_pages)
        };
      },
      MOOD_TTL
    );

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error fetching movies:', error);
    return NextResponse.json({ error: 'Failed to fetch movies' }, { status: 500 });
  }
}
