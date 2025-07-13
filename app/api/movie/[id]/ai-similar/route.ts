import { NextResponse } from 'next/server';
import redisCache from '../../../../../lib/cache';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

async function getAISimilarMovies(movieDetails: any) {
  // Add retry parameters
  const maxRetries = 3;
  let retryCount = 0;
  let backoffTime = 1000; // Start with 1 second backoff
  
  while (retryCount < maxRetries) {
    try {
      // Create a detailed prompt about the movie
      const prompt = `
        As a movie recommendation AI, suggest similar movies to "${movieDetails.title}" (${movieDetails.release_date?.slice(0, 4) || 'N/A'}).
        
        Movie details:
        - Genres: ${movieDetails.genres?.map((g: any) => g.name).join(', ') || 'N/A'}
        - Overview: ${movieDetails.overview || 'N/A'}
        - Director: ${movieDetails.credits?.crew?.find((c: any) => c.job === 'Director')?.name || 'N/A'}
        - Cast: ${movieDetails.credits?.cast?.slice(0, 5).map((c: any) => c.name).join(', ') || 'N/A'}
        
        Provide recommendations that match the tone, themes, and style of this movie.
        Each recommendation should be unique and from similar sub-genre categories.
        
        Generate recommendations in the following JSON format:
        {
          "similar_movies": [
            {
              "title": "exact movie title",
              "year": "year of release (YYYY)",
              "reasoning": "brief explanation of why this is similar (tone, theme, style, etc.)"
            }
          ]
        }
        
        Return ONLY the JSON object, no additional text.
        Include exactly 12 highly relevant movie recommendations.
      `;
      
      // Using Google's Gemini API
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
            temperature: 0.7,
            maxOutputTokens: 1500,
            topP: 0.95,
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
        
        throw new Error(`Failed to get AI similar movies: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
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

      // Parse the JSON response
      try {
        // First try direct parsing in case it's already valid JSON
        const cleanedContent = content
          .replace(/```json\n?|\n?```/g, '') // Remove JSON code blocks
          .replace(/\\n/g, ' ') // Replace escaped newlines
          .trim();
          
        const parsed = JSON.parse(cleanedContent);
        return parsed.similar_movies || [];
      } catch (error) {
        console.error('Parse error:', error);
        return [];
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: movieId } = await params;
    
    // Cache key for AI similar movies
    const cacheKey = `movie:${movieId}:ai-similar`;
    
    // Try to get from cache or generate with AI
    let aiSuggestions = await redisCache.getOrSet(
      cacheKey,
      async () => {
        console.log(`Cache miss - generating AI similar movies for ${movieId}`);
        
        // First, get the movie details to use for the prompt
        const detailsResponse = await fetch(
          `${BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=credits`,
          { next: { revalidate: 3600 } }
        );

        if (!detailsResponse.ok) {
          throw new Error(`Movie details fetch failed: ${detailsResponse.status}`);
        }
        
        const movieDetails = await detailsResponse.json();
        
        try {
          // Generate AI recommendations
          const aiResults = await getAISimilarMovies(movieDetails);
          
          // If AI returned empty results or very few, throw an error so we use TMDB fallback
          if (!aiResults || aiResults.length < 4) {
            throw new Error('Insufficient AI results, falling back to TMDB');
          }
          
          return aiResults;
        } catch (aiError) {
          console.error('Error in AI recommendations, using TMDB fallback:', aiError);
          
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
            return similarData.results.slice(0, 12).map((movie: any) => ({
              title: movie.title,
              year: movie.release_date?.slice(0, 4) || '',
              reasoning: 'Similar movie recommended by TMDB'
            }));
          } catch (tmdbError) {
            console.error('TMDB fallback also failed:', tmdbError);
            return []; // Return empty if all methods fail
          }
        }
      },
      // Cache for 24 hours (86400 seconds)
      86400
    );
    
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
          aiSuggestions = popularData.results.slice(0, 12).map((movie: any) => ({
            title: movie.title,
            year: movie.release_date?.slice(0, 4) || '',
            reasoning: 'Popular movie you might enjoy'
          }));
        }
      } catch (fallbackError) {
        console.error('Emergency fallback failed:', fallbackError);
      }
    }
    
    // Now fetch TMDB details for these movie recommendations
    const enhancedRecommendations = await Promise.all(
      aiSuggestions.map(async (movie: any) => {
        try {
          // Search for the movie in TMDB
          const searchResponse = await fetch(
            `${BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}&year=${movie.year || ''}`,
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
        } catch (error) {
          console.error('Error fetching movie data from TMDB:', error);
          return {
            ...movie,
            poster_path: null,
            id: null,
            vote_average: 0
          };
        }
      })
    );
    
    const validRecommendations = enhancedRecommendations.filter((movie: any) => movie.id !== null);
    
    return NextResponse.json({ results: validRecommendations });
  } catch (error) {
    console.error('Error in AI similar movies route:', error);
    return NextResponse.json(
      { error: 'Failed to generate similar movies' },
      { status: 500 }
    );
  }
} 