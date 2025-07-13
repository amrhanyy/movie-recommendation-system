import { NextResponse } from 'next/server'
import redisCache from "../../../../lib/cache";
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';
import { WatchlistModel } from '@/lib/models/WatchlistModel';
import { FavoritesModel } from '@/lib/models/FavoritesModel';

const durationRanges = {
  quick: { 
    min: 1, 
    max: 90,
    description: "Movies under 90 minutes",
    minRating: 6.5
  },
  medium: { 
    min: 90, 
    max: 120,
    description: "Movies between 90-120 minutes",
    minRating: 6.8
  },
  long: { 
    min: 120, 
    max: 999,
    description: "Movies over 2 hours",
    minRating: 7.0
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const duration = searchParams.get('duration')
  const page = searchParams.get('page') || '1'
  const genre = searchParams.get('genre') || ''

  if (!duration || !durationRanges[duration as keyof typeof durationRanges]) {
    return NextResponse.json({ error: 'Invalid duration parameter' }, { status: 400 })
  }

  const { min, max, minRating } = durationRanges[duration as keyof typeof durationRanges]
  
  // Get current date and time to vary recommendations
  const now = new Date()
  const dayOfWeek = now.getDay()
  const hour = now.getHours()
  const minutes = now.getMinutes()
  
  // Get user session to personalize recommendations
  const session = await getServerSession(authOptions)
  const userId = session?.user?.email
  
  // Create a time-based seed for variety that changes every 5 minutes
  const timeSlot = Math.floor(minutes / 5)
  const timeSeed = `${dayOfWeek}-${hour}-${timeSlot}`
  const cacheKey = `movies:duration:${duration}:page:${page}:genre:${genre}:time:${timeSeed}:user:${userId || 'guest'}`

  try {
    const data = await redisCache.getOrSet(
      cacheKey,
      async () => {
        console.log(`Cache miss - fetching ${duration} duration movies from TMDB API`)
        
        const genreParam = genre ? `&with_genres=${genre}` : ''
        
        // Vary sort method based on time for more variety
        let sortMethod = 'popularity.desc'
        
        // Change sort method based on day of week, time of day, and 5-minute interval
        const timeVariant = (dayOfWeek * 24 * 12) + (hour * 12) + timeSlot
        const sortMethods = [
          'popularity.desc',
          'vote_average.desc',
          'revenue.desc',
          'primary_release_date.desc',
          'vote_count.desc'
        ]
        
        sortMethod = sortMethods[timeVariant % sortMethods.length]
        
        const response = await fetch(
          `https://api.themoviedb.org/3/discover/movie?` +
          `api_key=${process.env.TMDB_API_KEY}&` +
          `with_runtime.gte=${min}&` +
          `with_runtime.lte=${max}&` +
          `vote_average.gte=${minRating}&` +
          `vote_count.gte=100&` +
          `sort_by=${sortMethod}&` +
          `page=${page}` +
          genreParam
        )

        if (!response.ok) throw new Error('TMDB API error')
        const movieData = await response.json()
        
        // If user is logged in, personalize recommendations based on watchlist and favorites
        if (userId) {
          await connectToMongoDB()
          
          // Get user's watchlist and favorites
          const [watchlist, favorites] = await Promise.all([
            WatchlistModel.find({ userId }).lean(),
            FavoritesModel.find({ userId }).lean()
          ])
          
          // Extract genres from user's watchlist and favorites
          const userGenreIds = new Set<number>()
          const userMovieIds = new Set<number>()
          
          // Process watchlist and favorites to extract genres and movie IDs
          watchlist.forEach(item => {
            if (item.genreIds) {
              item.genreIds.forEach((genreId: number) => userGenreIds.add(genreId))
            }
            userMovieIds.add(item.tmdbId)
          })
          
          favorites.forEach(item => {
            if (item.genreIds) {
              item.genreIds.forEach((genreId: number) => userGenreIds.add(genreId))
            }
            userMovieIds.add(item.tmdbId)
          })
          
          // Filter out movies already in watchlist/favorites
          movieData.results = movieData.results.filter((movie: any) => 
            !userMovieIds.has(movie.id)
          )
          
          // Sort results to prioritize movies with genres matching user preferences
          if (userGenreIds.size > 0) {
            movieData.results.sort((a: any, b: any) => {
              const aMatchCount = a.genre_ids?.filter((id: number) => userGenreIds.has(id)).length || 0
              const bMatchCount = b.genre_ids?.filter((id: number) => userGenreIds.has(id)).length || 0
              return bMatchCount - aMatchCount
            })
          }
        }
        
        return movieData
      },
      // Cache for 5 minutes (300 seconds) to allow for time-based changes every 5 minutes
      300
    )

    return NextResponse.json({
      ...data,
      duration_info: {
        range: `${min}-${max} minutes`,
        description: durationRanges[duration as keyof typeof durationRanges].description
      }
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed to fetch movies' }, { status: 500 })
  }
}
