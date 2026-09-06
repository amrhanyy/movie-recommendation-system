'use client'

import React from 'react'
import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Bookmark } from 'lucide-react'
import { LoadingSpinner } from '@/components'
import { useWatchlistContext } from '@/contexts/WatchlistContext'

interface Movie {
  id: number
  title: string
  poster_path: string
  vote_average: number
  release_date: string
}

export function TopRatedMovies() {
  const [movies, setMovies] = useState<Movie[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { isInWatchlist, toggleWatchlist } = useWatchlistContext()
  const scrollContainerRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    async function fetchTopRatedMovies() {
      try {
        const response = await fetch('/api/movies/top-rated')
        const data = await response.json()
        setMovies(data.results || [])
      } catch (error) {
        console.error('Failed to fetch top rated movies:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTopRatedMovies()
  }, [])

  const handleWatchlistToggle = (movie: Movie, e: React.MouseEvent) => {
    e.stopPropagation();
    void toggleWatchlist({
      itemId: movie.id,
      type: 'movie',
      title: movie.title,
      posterPath: movie.poster_path
    });
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 800
      const newScrollPosition = scrollContainerRef.current.scrollLeft +
        (direction === 'left' ? -scrollAmount : scrollAmount)
      scrollContainerRef.current.scrollTo({
        left: newScrollPosition,
        behavior: 'smooth'
      })
    }
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading top rated movies..." />
  }

  return (
    <section className="py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan motion-safe:animate-pulse" />
        <h2 className="text-2xl font-bold text-white tracking-wider">TOP RATED MOVIES</h2>
      </div>

      <div className="relative group">
        <button
          type="button"
          onClick={() => scroll('left')}
          aria-label="Scroll left"
          className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70
                    text-white p-3 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-cyan-500 focus:outline-none
                    transition-opacity duration-300 backdrop-blur-sm"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>

        <button
          type="button"
          onClick={() => scroll('right')}
          aria-label="Scroll right"
          className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70
                    text-white p-3 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-cyan-500 focus:outline-none
                    transition-opacity duration-300 backdrop-blur-sm"
        >
          <ChevronRight className="w-8 h-8" />
        </button>

        <ul
          ref={scrollContainerRef}
          className="flex space-x-6 overflow-x-auto scrollbar-hide scroll-smooth pb-4 list-none"
        >
          {movies.map((movie) => (
            <li key={movie.id} className="flex-none w-[180px] relative">
              <Link
                href={`/movie/${movie.id}`}
                aria-label={`View details for ${movie.title}`}
                className="group/item block focus:outline-none"
              >
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-3
                            transform group-hover/item:scale-105 transition-all duration-300
                            border border-gray-700/50">
                  <Image
                    src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                    alt={movie.title}
                    fill
                    className="object-cover"
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
                        ★ {typeof movie.vote_average === 'number' ? movie.vote_average.toFixed(1) : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
                <h3 className="font-medium text-gray-100 text-sm group-hover/item:text-cyan-400 transition-colors">
                  {movie.title}
                </h3>
                <p className="text-gray-400 text-xs">
                  {movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
