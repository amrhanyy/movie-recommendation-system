import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';
import { History } from '@/lib/models/History';
import { WatchlistModel } from '@/lib/models/WatchlistModel';
import { FavoritesModel } from '@/lib/models/FavoritesModel';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

async function getAIRecommendations(preferences: string) {
  const maxRetries = 3;
  let retryCount = 0;
  let backoffTime = 1000; // Start with 1 second backoff
  
  while (retryCount < maxRetries) {
    try {
      const prompt = `
        As a movie recommendation AI, analyze these user preferences to suggest highly personalized movies and TV shows.
        User preferences: ${preferences}
        
        Follow these criteria:
        For each recommendation, ensure it matches the same sub-genres as the content the user enjoys.
        Consider elements like:
        - If user watches psychological thrillers, recommend similar psychological thrillers
        - If user enjoys romantic comedies, find movies with similar rom-com elements
        - Match specific sub-genres like sci-fi horror, supernatural drama, crime documentary etc.
        
        Generate recommendations in the following JSON format:
        {
            "recommendations": [
                {
                    "title": "exact movie or show title",
                    "confidence": 0.9,
                    "sub-genre": "specific sub-genre",
                    "type": "movie or tv"
                }
            ]
        }
        
        Return ONLY the JSON object, no additional text.
        You MUST include exactly 12 recommendations that closely match the sub-genres found in user's Watchlist and Favorites.
        Provide a balanced mix of both movies and TV shows (approximately 50% movies and 50% TV shows).
        don't include any movies and tv shows that are in the user's Watchlist or Favorites.
        Each recommendation should be unique and from similar sub-genre categories.
        Ensure high confidence scores for close sub-genre matches.
        Keep your response compact with minimal whitespace.
      `;

      // Using Google's gemini-2.0-flash model as specified
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 2000,
            topP: 0.9,
            topK: 40
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        
        // Check if it's a 503 Service Unavailable or other retryable error
        if (response.status === 503 || response.status === 429 || response.status >= 500) {
          retryCount++;
          if (retryCount < maxRetries) {
            console.log(`Retrying AI request (attempt ${retryCount}/${maxRetries}) after ${backoffTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            backoffTime *= 2; // Exponential backoff
            continue; // Try again
          }
        }
        
        throw new Error(`Failed to get AI recommendations: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Raw API Response:', data); // Debug log

      // Extract content from Google API response
      let content = '';
      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
        const parts = data.candidates[0].content.parts;
        if (parts && parts.length > 0) {
          content = parts[0].text || '';
        }
      }

      if (!content) {
        console.error('Unexpected API response structure:', data);
        return [];
      }

      // Improved JSON parsing
      try {
        // First try direct parsing in case it's already valid JSON
        const directParse = JSON.parse(content);
        return directParse.recommendations || [];
      } catch {
        // If direct parsing fails, try cleaning the content
        let cleanedContent = content
          .replace(/```json\n?|\n?```/g, '') // Remove JSON code blocks
          .replace(/\\n/g, ' ') // Replace escaped newlines
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          .trim();
        
        // Handle incomplete JSON response (truncated response)
        try {
          // Try to complete any truncated JSON
          if (cleanedContent.includes('"recommendations"')) {
            // If the content was cut off in the middle
            if (!cleanedContent.endsWith('}')) {
              // Close any unclosed arrays and objects
              const openBraces = (cleanedContent.match(/\{/g) || []).length;
              const closeBraces = (cleanedContent.match(/\}/g) || []).length;
              const openBrackets = (cleanedContent.match(/\[/g) || []).length;
              const closeBrackets = (cleanedContent.match(/\]/g) || []).length;
              
              // Add missing closing brackets and braces
              if (openBrackets > closeBrackets) {
                cleanedContent += ']'.repeat(openBrackets - closeBrackets);
              }
              if (openBraces > closeBraces) {
                cleanedContent += '}'.repeat(openBraces - closeBraces);
              }
            }
          }
          
          console.log('Cleaned content:', cleanedContent);
          const parsed = JSON.parse(cleanedContent);
          return parsed.recommendations || [];
        } catch (parseError) {
          console.error('Parse error:', parseError);
          console.log('Failed to parse content:', cleanedContent);
          
          // As a last resort, try to extract partial recommendations using regex
          try {
            const recommendationsMatch = content.match(/"recommendations"\s*:\s*\[(.*?)(?:\]|$)/s);
            if (recommendationsMatch && recommendationsMatch[1]) {
              const itemsText = recommendationsMatch[1];
              const items = itemsText.split(/},\s*{/).map((item: string) => {
                // Clean up each item
                let cleanItem = item.trim();
                if (!cleanItem.startsWith('{')) cleanItem = '{' + cleanItem;
                if (!cleanItem.endsWith('}')) cleanItem = cleanItem + '}';
                
                try {
                  return JSON.parse(cleanItem);
                } catch {
                  return null;
                }
              }).filter(Boolean);
              
              return items;
            }
          } catch (regexError) {
            console.error('Regex extraction failed:', regexError);
          }
          
          return [];
        }
      }
    } catch (error) {
      retryCount++;
      if (retryCount < maxRetries && (error instanceof Error && error.message.includes('503'))) {
        console.log(`Retrying after error (attempt ${retryCount}/${maxRetries}) after ${backoffTime}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        backoffTime *= 2; // Exponential backoff
      } else {
        console.error('AI Request Error:', error);
        return [];
      }
    }
  }
  
  // If we've exhausted all retries
  console.error(`Failed after ${maxRetries} retry attempts`);
  return [];
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToMongoDB();

    // Fetch user's data
    const [history, watchlist, favorites] = await Promise.all([
      History.find({ userId: session.user.email }).sort({ viewedAt: -1 }).limit(10),
      WatchlistModel.find({ userId: session.user.email }).sort({ createdAt: -1 }),
      FavoritesModel.find({ userId: session.user.email }).sort({ createdAt: -1 })
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
    
    console.log('User content titles for filtering:', Array.from(userContentTitles));

    // Prepare user preferences for AI
    const preferences = {
      watchHistory: history.map(h => ({
        title: h.title,
        type: h.type,
        date: h.viewedAt
      })),
      watchlist: watchlist.map(w => ({ title: w.title, type: w.type })),
      favorites: favorites.map(f => ({ title: f.title, type: f.type })),
      excludeTitles: Array.from(userContentTitles) // Explicitly tell AI what to exclude
    };

    // Try to get AI recommendations
    let aiSuggestions = await getAIRecommendations(JSON.stringify(preferences)) || [];
    
    // If AI recommendations failed, use a fallback with popular movies
    if (!Array.isArray(aiSuggestions) || aiSuggestions.length === 0) {
      console.log('AI recommendations failed, using fallback popular movies and TV shows');
      
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
          const tempMovies = moviesData.results.slice(0, 10).map((movie: any) => ({
            title: movie.title,
            confidence: 0.8,
            "sub-genre": "popular",
            type: "movie"
          }));
          
          const tempTV = tvData.results.slice(0, 10).map((show: any) => ({
            title: show.name,
            confidence: 0.8,
            "sub-genre": "popular",
            type: "tv"
          }));
          
          aiSuggestions = [...tempMovies, ...tempTV];
          console.log('Using fallback recommendations:', aiSuggestions.length);
        }
      } catch (fallbackError) {
        console.error('Fallback recommendation error:', fallbackError);
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
      console.error('Invalid AI response format:', aiSuggestions);
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
          console.log(`Filtered out: ${suggestionTitle} (matches user content: ${item.title})`);
          return false;
        }
      }
      
      return true;
    });

    console.log(`Filtered ${aiSuggestions.length - filteredSuggestions.length} recommendations that matched user content`);

    // Fetch detailed info from TMDB for each recommendation
    const detailedRecommendations = await Promise.all(
      filteredSuggestions.map(async (suggestion: any) => {
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
              console.log(`Secondary filter: Removed ${matchTitle} (similar to ${item.title})`);
              return null;
            }
            
            // Also check TMDB ID if available
            if (item.id && item.id === match.id) {
              console.log(`Secondary filter: Removed ${matchTitle} (matching TMDB ID)`);
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
        } catch (error) {
          console.error('TMDB Error:', error);
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
    
    console.log(`Removed ${detailedRecommendations.filter(Boolean).length - validRecommendations.length} duplicate items based on TMDB ID`);

    // Balance movies and TV shows in the recommendations
    const balanceRecommendations = (recommendations: any[]) => {
      // Separate into movies and TV shows
      const movies = recommendations.filter(r => r.media_type === 'movie');
      const tvShows = recommendations.filter(r => r.media_type === 'tv');
      
      console.log(`Found ${movies.length} movies and ${tvShows.length} TV shows in recommendations`);
      
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
      
      console.log(`Balanced to ${balanced.filter(r => r.media_type === 'movie').length} movies and ${balanced.filter(r => r.media_type === 'tv').length} TV shows`);
      
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
        console.log(`Final filter: Removed duplicate ID ${item.id} for "${item.title}"`);
        return;
      }

      // Skip if we've already seen a similar title
      const normalizedTitle = normalizeTitle(item.title);
      let isDuplicate = false;
      
      finalTitles.forEach(existingTitle => {
        if (isTitleSimilar(normalizedTitle, existingTitle)) {
          console.log(`Final filter: Removed duplicate title "${item.title}" (similar to existing title)`);
          isDuplicate = true;
        }
      });

      if (!isDuplicate) {
        finalRecommendations.push(item);
        finalIds.add(item.id);
        finalTitles.add(normalizedTitle);
      }
    });

    console.log(`Removed ${balancedRecommendations.length - finalRecommendations.length} final duplicates`);

    return NextResponse.json({
      recommendations: finalRecommendations,
      needsContent: false
    });
  } catch (error) {
    console.error('Recommendation error:', error);
    
    // More user-friendly error message based on the specific error
    let errorMessage = 'Failed to generate recommendations';
    let statusCode = 500;
    
    if (error instanceof Error) {
      // Handle specific error types with appropriate messages
      if (error.message.includes('503') || error.message.includes('overloaded')) {
        errorMessage = 'Our recommendation service is experiencing high demand. Please try again in a few minutes.';
        statusCode = 503;
      } else if (error.message.includes('429') || error.message.includes('rate limit')) {
        errorMessage = 'Too many requests. Please try again later.';
        statusCode = 429;
      }
    }
    
    return NextResponse.json({ 
      recommendations: [],
      error: errorMessage,
      errorDetails: error instanceof Error ? error.message : String(error)
    }, { status: statusCode });
  }
}
