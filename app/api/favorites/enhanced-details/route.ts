import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import connectToMongoDB from '@/lib/mongodb'
import { FavoritesModel } from '@/lib/models/FavoritesModel'
import { authOptions } from '@/lib/auth'

// Helper function to fetch with timeout and retry
async function fetchWithRetry(url: string, options = {}, retries = 2, timeout = 5000) {
  // Create an AbortController to handle timeouts
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (retries <= 0) throw error;
    
    // Wait a bit before retrying (exponential backoff)
    const delay = 500 * Math.pow(2, 2 - retries);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry the request with one fewer retry attempt
    return fetchWithRetry(url, options, retries - 1, timeout);
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    await connectToMongoDB()
    
    // Get the user's favorites items
    const favoriteItems = await FavoritesModel.find({ userId: session.user.email })
      .sort({ createdAt: -1 })
      .lean()
    
    // Prepare to fetch additional details for each item
    const enhancedItems = await Promise.all(
      favoriteItems.map(async (item) => {
        const { itemId, type } = item
        
        // Fetch additional details from TMDB API
        const apiKey = process.env.TMDB_API_KEY
        const url = `https://api.themoviedb.org/3/${type}/${itemId}?api_key=${apiKey}`
        
        try {
          // Use the retry function instead of direct fetch
          const response = await fetchWithRetry(url)
          
          if (!response.ok) {
            console.error(`TMDB API error for ${type}/${itemId}: ${response.status}`)
            return item
          }
          
          const details = await response.json()
          
          // Extract the relevant fields
          const enhancedItem = {
            ...item,
            overview: details.overview || null,
            voteAverage: details.vote_average || null,
            genres: details.genres ? details.genres.map((g: any) => g.name) : [],
            // Add additional fields
            releaseDate: details.release_date || details.first_air_date || item.releaseDate,
            popularity: details.popularity || item.popularity || 0,
            runtime: details.runtime || (
              details.episode_run_time && details.episode_run_time.length > 0 
                ? details.episode_run_time[0] 
                : item.runtime || 0
            )
          }
          
          return enhancedItem
        } catch (error) {
          // If API call fails, return the original item
          console.error(`Failed to fetch details for ${type}/${itemId}:`, error)
          return item
        }
      })
    )
    
    return NextResponse.json(enhancedItems)
  } catch (error) {
    console.error('Error retrieving enhanced favorites:', error)
    return NextResponse.json({ error: 'Failed to retrieve favorites' }, { status: 500 })
  }
} 