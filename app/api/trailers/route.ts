import { NextResponse } from 'next/server'

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_API_KEY = process.env.TMDB_API_KEY

// Common streaming services IDs (Netflix, Amazon Prime, Disney+, Apple TV+, Hulu)
const STREAMING_SERVICES = '8|9|337|350|384'

const getEndpoint = (filter: string) => {
  switch (filter) {
    case 'streaming':
      return {
        url: `/discover/movie`,
        params: `&with_watch_providers=${STREAMING_SERVICES}&watch_region=US&with_watch_monetization_types=flatrate`
      }
    case 'on tv':
      return {
        url: `/tv/on_the_air`,
        params: ''
      }
    case 'for rent':
      return {
        url: `/discover/movie`,
        params: '&with_watch_monetization_types=rent'
      }
    case 'in theaters':
      return {
        url: `/movie/now_playing`,
        params: '&region=US'
      }
    case 'popular':
    default:
      return {
        url: `/movie/popular`,
        params: ''
      }
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const filter = (searchParams.get('filter') || 'popular').toLowerCase()
    const { url, params } = getEndpoint(filter)

    const moviesRes = await fetch(
      `${TMDB_API_URL}${url}?api_key=${TMDB_API_KEY}&language=en-US&page=1${params}`,
      { 
        next: { revalidate: 3600 },
        headers: {
          'Accept': 'application/json'
        }
      }
    )

    if (!moviesRes.ok) {
      const errorText = await moviesRes.text()
      console.error('Movies fetch failed:', errorText)
      return NextResponse.json({ error: 'Failed to fetch movies' }, { status: moviesRes.status })
    }
    
    const contentType = moviesRes.headers.get('content-type')
    if (!contentType?.includes('application/json')) {
      console.error('Invalid content type:', contentType)
      return NextResponse.json({ error: 'Invalid response from movie service' }, { status: 500 })
    }

    const moviesData = await moviesRes.json()
    if (!moviesData.results) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 500 })
    }

    // Fetch trailers for each movie
    const moviesWithTrailers = await Promise.all(
      moviesData.results.slice(0, 10).map(async (movie: any) => {
        try {
          const mediaType = url.includes('/tv/') ? 'tv' : 'movie'
          const videosRes = await fetch(
            `${TMDB_API_URL}/${mediaType}/${movie.id}/videos?api_key=${TMDB_API_KEY}`,
            { 
              next: { revalidate: 3600 },
              headers: {
                'Accept': 'application/json'
              }
            }
          )
          
          if (!videosRes.ok) return null
          const videosData = await videosRes.json()
          
          const trailer = videosData.results?.find((video: any) => 
            video.type === 'Trailer' && video.site === 'YouTube'
          ) || videosData.results?.[0]

          return trailer ? {
            id: movie.id,
            title: movie.title || movie.name,
            overview: movie.overview,
            poster_path: movie.poster_path,
            backdrop_path: movie.backdrop_path,
            release_date: movie.release_date || movie.first_air_date,
            vote_average: movie.vote_average,
            trailer_key: trailer.key
          } : null
        } catch (error) {
          console.error(`Error fetching trailer for movie ${movie.id}:`, error)
          return null
        }
      })
    )

    // Filter out items without trailers
    const validMovies = moviesWithTrailers.filter(movie => movie && movie.trailer_key)

    if (validMovies.length === 0) {
      return NextResponse.json({ error: `No trailers found for ${filter}` }, { status: 404 })
    }

    return NextResponse.json({ results: validMovies })
  } catch (error) {
    console.error('Trailers API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trailers' },
      { status: 500 }
    )
  }
}
