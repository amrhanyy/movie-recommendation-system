'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Bookmark } from 'lucide-react'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { useWatchlistContext } from '@/contexts/WatchlistContext'

interface Movie {
  id: number
  title: string
  poster_path: string
  vote_average: number
  release_date: string
  overview: string
}

export default function TrendingPage() {
  const [movies, setMovies] = useState<Movie[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const { isInWatchlist, toggleWatchlist } = useWatchlistContext()

  useEffect(() => {
    async function fetchTrendingMovies() {
      try {
        const response = await fetch('/api/trending')
        if (!response.ok) throw new Error('Failed to fetch trending movies')
        const data = await response.json()
        setMovies(data.results)
      } catch (err) {
        setError('Failed to load trending movies')
        console.error('Error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTrendingMovies()
  }, [])

  const handleWatchlistToggle = (item: Movie, e: React.MouseEvent) => {
    e.stopPropagation()
    void toggleWatchlist({
      itemId: item.id,
      type: 'movie',
      title: item.title,
      posterPath: item.poster_path
    })
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading trending content..." />
  }

  return (
    <div className="container-fluid">
      <div className="glass-card rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan motion-safe:animate-pulse" />
          <h1 className="text-2xl font-bold text-white tracking-wider">TRENDING NOW</h1>
        </div>

        {error ? (
          <div className="text-center py-12">
            <p className="text-red-400">{error}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6 list-none">
            {movies.map((movie) => (
              <li key={movie.id}>
                <Link
                  href={`/movie/${movie.id}`}
                  aria-label={`View details for ${movie.title}`}
                  className="group/item block focus:outline-none"
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-3
                              transform group-hover/item:scale-105 transition-all duration-300
                              border border-gray-700/50">
                    <Image
                      src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                      alt={movie.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
                    />
                    <button
                      type="button"
                      onClick={(e) => handleWatchlistToggle(movie, e)}
                      aria-pressed={isInWatchlist(movie.id)}
                      aria-label={isInWatchlist(movie.id) ? `Remove ${movie.title} from watchlist` : `Add ${movie.title} to watchlist`}
                      className="group/tooltip absolute top-2 right-2 p-2 rounded-full
                                bg-black/50 backdrop-blur-sm border border-gray-700/50
                                text-white hover:bg-black/70 hover:scale-110
                                transition-all duration-300 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                    >
                      <Bookmark
                        className={`w-4 h-4 ${isInWatchlist(movie.id) ? 'fill-white' : ''}`}
                      />
                    </button>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent
                                opacity-0 group-hover/item:opacity-100 transition-all duration-500">
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="text-cyan-400 text-sm">
                          ★ {movie.vote_average.toFixed(1)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <h3 className="font-medium text-gray-100 text-sm group-hover/item:text-cyan-400
                             transition-colors line-clamp-1">
                    {movie.title}
                  </h3>
                  <p className="text-gray-400 text-xs">
                    {new Date(movie.release_date).getFullYear()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
