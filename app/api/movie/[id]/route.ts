import { NextRequest, NextResponse } from 'next/server'
import redisCache from '../../../../lib/cache';
import { applyRateLimitPublic, RATE_LIMITS } from '@/lib/security/rateLimit';

const TMDB_API_KEY = process.env.TMDB_API_KEY
const TMDB_API_URL = 'https://api.themoviedb.org/3'

interface Params {
  id: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  // Rate limit public TMDB proxy (F-011/F-028)
  const rateLimitResponse = await applyRateLimitPublic(request, RATE_LIMITS.tmdbProxy);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!TMDB_API_KEY) {
    console.error('TMDB API key is missing')
    return NextResponse.json(
      { error: 'API configuration error' },
      { status: 500 }
    )
  }

  try {
    const { id: movieId } = await params
    
    if (!movieId) {
      return NextResponse.json(
        { error: 'Movie ID is required' },
        { status: 400 }
      )
    }

    // Validate TMDB ID: positive integer (F-033)
    if (!/^\d{1,8}$/.test(movieId)) {
      return NextResponse.json(
        { error: 'Invalid movie ID' },
        { status: 400 }
      )
    }
    
    // Cache key for this movie
    const cacheKey = `movie:${movieId}:details`;
    
    // Try to get from cache or fetch from API
    const combinedData = await redisCache.getOrSet(
      cacheKey,
      async () => {
        console.log(`Cache miss - fetching movie ${movieId} from TMDB API`);
        
        try {
          // Fetch movie details
          const [movieResponse, creditsResponse, imagesResponse, videosResponse] = await Promise.all([
            fetch(
              `${TMDB_API_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=en-US`,
              { next: { revalidate: 3600 } }
            ),
            fetch(
              `${TMDB_API_URL}/movie/${movieId}/credits?api_key=${TMDB_API_KEY}&language=en-US`,
              { next: { revalidate: 3600 } }
            ),
            fetch(
              `${TMDB_API_URL}/movie/${movieId}/images?api_key=${TMDB_API_KEY}`,
              { next: { revalidate: 3600 } }
            ),
            fetch(
              `${TMDB_API_URL}/movie/${movieId}/videos?api_key=${TMDB_API_KEY}&language=en-US`,
              { next: { revalidate: 3600 } }
            )
          ])

          if (!movieResponse.ok) {
            const errorText = await movieResponse.text();
            console.error(`TMDB movie fetch error (${movieResponse.status}):`, errorText);
            throw new Error(`Failed to fetch movie: ${movieResponse.status}`);
          }
          
          if (!creditsResponse.ok) throw new Error(`Credits API error: ${creditsResponse.status}`)
          if (!imagesResponse.ok) throw new Error(`Images API error: ${imagesResponse.status}`)
          if (!videosResponse.ok) throw new Error(`Videos API error: ${videosResponse.status}`)

          const [movie, credits, images, videos] = await Promise.all([
            movieResponse.json(),
            creditsResponse.json(),
            imagesResponse.json(),
            videosResponse.json()
          ])

          // Find official trailer
          const trailer = videos.results?.find(
            (video: { type: string; site: string; official?: boolean }) =>
              video.type === "Trailer" && 
              video.site === "YouTube" &&
              video.official
          ) || videos.results?.[0]

          // Combine all data
          return {
            ...movie,
            credits: {
              cast: credits.cast?.slice(0, 8) || [],
              crew: credits.crew || []
            },
            images: {
              backdrops: images.backdrops?.slice(0, 6) || [],
              posters: images.posters?.slice(0, 4) || []
            },
            trailer
          }
        } catch (fetchError: unknown) {
          console.error('Error fetching data from TMDB:', fetchError);
          throw fetchError;
        }
      },
      // Cache for 30 minutes (1800 seconds)
      1800
    );

    return NextResponse.json(combinedData)
  } catch (error: unknown) {
    console.error('Movie details error:', error)
    return NextResponse.json(
      { error: 'Failed to load movie details' },
      { status: 500 }
    )
  }
}

