import { NextRequest, NextResponse } from 'next/server'
import redisCache from "../../../../lib/cache";
import { tryRequireUser } from '@/lib/security/auth';
import connectToMongoDB from '@/lib/mongodb';
import { WatchlistModel } from '@/lib/models/WatchlistModel';
import { FavoritesModel } from '@/lib/models/FavoritesModel';
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit';

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

interface TmdbMovie {
  id: number
  genre_ids?: number[]
}

interface TmdbDiscoverResponse {
  results: TmdbMovie[]
  page?: number
  total_pages?: number
  total_results?: number
}

// Shape of watchlist/favorites docs used for per-request personalization.
// `itemId` is the canonical model field; `tmdbId`/`genreIds` are read as a
// fallback for legacy docs that stored them.
interface PersonalizationItem {
  itemId?: number
  tmdbId?: number
  genreIds?: number[]
}

export async function GET(request: NextRequest) {
  // Rate limit public TMDB proxy (F-011/F-028)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url)
  const duration = searchParams.get('duration')
  const pageParam = searchParams.get('page') || '1'
  const genre = searchParams.get('genre') || ''

  if (!duration || !durationRanges[duration as keyof typeof durationRanges]) {
    return NextResponse.json({ error: 'Invalid duration parameter' }, { status: 400 })
  }

  // Validate page (F-033)
  const page = Number(pageParam);
  if (!Number.isInteger(page) || page < 1 || page > 100) {
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  }

  // Validate genre is numeric (TMDB genre ID)
  if (genre && !/^\d{1,6}$/.test(genre)) {
    return NextResponse.json({ error: 'Invalid genre' }, { status: 400 });
  }

  const { min, max, minRating } = durationRanges[duration as keyof typeof durationRanges]

  // Get current date and time to vary recommendations
  const now = new Date()
  const dayOfWeek = now.getDay()
  const hour = now.getHours()
  const minutes = now.getMinutes()

  // W1-002: optional session via tryRequireUser; null => unpersonalized base.
  const optionalUser = await tryRequireUser()
  const userId = optionalUser?.email

  // Create a time-based seed for variety that changes every 5 minutes
  const timeSlot = Math.floor(minutes / 5)
  const timeSeed = `${dayOfWeek}-${hour}-${timeSlot}`
  // Cache key is params-only (duration/page/genre/time-slot). It must never
  // contain user identity: the cached payload is the unpersonalized TMDB
  // base, and per-user filtering/ordering happens after the cache read.
  const cacheKey = `movies:duration:${duration}:page:${page}:genre:${genre}:time:${timeSeed}`

  try {
    const baseData = await redisCache.getOrSet<TmdbDiscoverResponse>(
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
        const movieData = (await response.json()) as TmdbDiscoverResponse

        return movieData
      },
      // Cache for 5 minutes (300 seconds) to allow for time-based changes every 5 minutes
      300
    )

    // Per-request personalization: filter + re-sort a copy of the cached
    // unpersonalized base. Never write this personalized output to cache.
    let results: TmdbMovie[] = Array.isArray(baseData.results)
      ? [...baseData.results]
      : []

    if (userId) {
      await connectToMongoDB()

      // Indexed ownership-scoped queries only.
      const [watchlist, favorites] = await Promise.all([
        WatchlistModel.find({ userId }).select({ itemId: 1, tmdbId: 1, genreIds: 1, _id: 0 }).lean<PersonalizationItem[]>(),
        FavoritesModel.find({ userId }).select({ itemId: 1, tmdbId: 1, genreIds: 1, _id: 0 }).lean<PersonalizationItem[]>()
      ])

      const userGenreIds = new Set<number>()
      const userMovieIds = new Set<number>()
      for (const item of [...watchlist, ...favorites]) {
        if (Array.isArray(item.genreIds)) {
          for (const genreId of item.genreIds) {
            if (typeof genreId === 'number' && Number.isInteger(genreId)) {
              userGenreIds.add(genreId)
            }
          }
        }
        const ownedId = item.itemId ?? item.tmdbId
        if (typeof ownedId === 'number' && Number.isInteger(ownedId)) {
          userMovieIds.add(ownedId)
        }
      }

      results = results.filter((movie) => !userMovieIds.has(movie.id))

      if (userGenreIds.size > 0) {
        results.sort((a, b) => {
          const aMatchCount = a.genre_ids?.filter((id) => userGenreIds.has(id)).length ?? 0
          const bMatchCount = b.genre_ids?.filter((id) => userGenreIds.has(id)).length ?? 0
          return bMatchCount - aMatchCount
        })
      }
    }

    return NextResponse.json({
      ...baseData,
      results,
      duration_info: {
        range: `${min}-${max} minutes`,
        description: durationRanges[duration as keyof typeof durationRanges].description
      }
    })
  } catch (error) {
    console.error('Error fetching time-based movies')
    return NextResponse.json({ error: 'Failed to fetch movies' }, { status: 500 })
  }
}