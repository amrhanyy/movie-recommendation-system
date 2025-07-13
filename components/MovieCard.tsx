import React from "react"
import Image from "next/image"
import Link from "next/link"


interface Genre {
  id: number
  name: string
}

interface MovieCardProps {
  movie: {
    id: number
    title: string
    release_date: string
    vote_average: number
    genre_ids: number[]
    poster_path: string | null
    overview?: string
  }
  genres: Genre[]
}

export function MovieCard({ movie, genres }: MovieCardProps) {
  const getGenreNames = (genreIds: number[]) => {
    return genreIds.map((id) => genres.find((genre) => genre.id === id)?.name).filter(Boolean)
  }

  const releaseYear = new Date(movie.release_date).getFullYear()
  const genreNames = getGenreNames(movie.genre_ids)

  return (
    <Link href={`/movie/${movie.id}`}>
      <div className="flex gap-4 p-4 hover:bg-gray-700/30 transition-colors rounded-xl cursor-pointer group">
        <div className="relative h-[180px] w-[120px] flex-shrink-0">
          {movie.poster_path ? (
            <Image
              src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
              alt={movie.title}
              fill
              className="object-cover rounded-lg group-hover:opacity-80 transition-opacity"
            />
          ) : (
            <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center">
              <span className="text-gray-400 text-sm text-center px-2">No poster</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-100 group-hover:text-blue-400 transition-colors line-clamp-1">
            {movie.title}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-gray-400 text-sm">
            <span>{releaseYear}</span>
            <span className="w-1 h-1 rounded-full bg-gray-600" />
            <span className="flex items-center gap-1">
              <span className="text-yellow-400">★</span>
              <span>{movie.vote_average.toFixed(1)}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {genreNames.map((genre) => (
              genre && (
                <span
                  key={genre}
                  className="px-2 py-1 text-xs rounded-full bg-gray-800/60 text-gray-300 border border-gray-700"
                >
                  {genre}
                </span>
              )
            ))}
          </div>
          {movie.overview && (
            <p className="mt-2 text-gray-400 text-sm line-clamp-2 group-hover:text-gray-300 transition-colors">
              {movie.overview}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

