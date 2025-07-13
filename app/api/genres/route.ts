import { NextResponse } from 'next/server'

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_API_KEY = process.env.TMDB_API_KEY

export async function GET() {
  try {
    const res = await fetch(
      `${TMDB_API_URL}/genre/movie/list?api_key=${TMDB_API_KEY}&language=en-US`,
      { next: { revalidate: 86400 } } // Cache for 24 hours
    )

    if (!res.ok) throw new Error('Failed to fetch genres')
    
    const data = await res.json()

    // Keep track of used backdrop paths to avoid duplicates
    const usedBackdrops = new Set<string>();
    
    // Fetch sample movies for each genre to get backdrop images
    const genresWithImages = await Promise.all(
      data.genres.map(async (genre: any) => {
        const moviesRes = await fetch(
          `${TMDB_API_URL}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${genre.id}&sort_by=popularity.desc&page=1`,
          { next: { revalidate: 86400 } }
        )
        const moviesData = await moviesRes.json();
        const movies = moviesData.results || [];
        
        // Try to find a movie backdrop that hasn't been used yet
        let selectedMovie = null;
        let backdropPath = null;
        
        // Look through the top movies to find one with a unique backdrop
        for (let i = 0; i < Math.min(movies.length, 10); i++) {
          const movie = movies[i];
          if (movie.backdrop_path && !usedBackdrops.has(movie.backdrop_path)) {
            selectedMovie = movie;
            backdropPath = movie.backdrop_path;
            usedBackdrops.add(backdropPath);
            break;
          }
        }
        
        // If we couldn't find a unique backdrop, just use the most popular one
        if (!selectedMovie && movies.length > 0) {
          selectedMovie = movies[0];
          backdropPath = selectedMovie.backdrop_path;
        }
        
        return {
          ...genre,
          count: moviesData.total_results,
          backdrop_path: backdropPath,
          sample_movie: selectedMovie?.title || null
        }
      })
    )

    return NextResponse.json({ genres: genresWithImages })
  } catch (error) {
    console.error('Genres API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch genres' },
      { status: 500 }
    )
  }
}