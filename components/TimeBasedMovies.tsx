'use client'

import React from 'react'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Clock, Star, Lock, Bookmark } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useWatchlistContext } from '@/contexts/WatchlistContext'

interface Movie {
  id: number
  title: string
  poster_path: string
  runtime: number
  vote_average: number
}

const timeCategories = [
  {
    id: 'quick',
    name: 'Quick Watch',
    duration: '< 90min',
    icon: '⚡',
    color: 'from-cyan-500/20 to-blue-500/20',
    description: 'Perfect for a quick entertainment fix'
  },
  {
    id: 'medium',
    name: 'Medium Length',
    duration: '90-120min',
    icon: '⏱️',
    color: 'from-purple-500/20 to-pink-500/20',
    description: 'Ideal for a standard movie night'
  },
  {
    id: 'long',
    name: 'Long Watch',
    duration: '> 120min',
    icon: '🎬',
    color: 'from-amber-500/20 to-red-500/20',
    description: 'Epic stories that need more time'
  }
];

export function TimeBasedMovies() {
  const { data: session, status } = useSession()
  const { isInWatchlist, toggleWatchlist } = useWatchlistContext()
  const [movies, setMovies] = useState<Movie[]>([])
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleWatchlistToggle = (movie: Movie, e: React.MouseEvent) => {
    e.stopPropagation();
    void toggleWatchlist({
      itemId: movie.id,
      type: 'movie',
      title: movie.title,
      posterPath: movie.poster_path
    });
  };

  useEffect(() => {
    async function fetchMovies() {
      if (!selectedTime) return;

      setIsLoading(true)
      try {
        const response = await fetch(`/api/movies/time-based?duration=${selectedTime}`)
        if (!response.ok) throw new Error('Failed to fetch movies')

        const data = await response.json()
        if (data && Array.isArray(data.results)) {
          setMovies(data.results.slice(0, 6))
        } else {
          setMovies([])
        }
      } catch (error) {
        console.error('Error fetching movies:', error)
        setMovies([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchMovies()
  }, [selectedTime])

  const handleTimeSelect = (timeId: string) => {
    setSelectedTime(timeId)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="w-full">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-1 h-8 bg-cyan-500 rounded-full shadow-[0_0_8px_0px] shadow-cyan-500/50" />
          <div>
            <h2 className="text-2xl font-bold text-white">Time-Based Recommendations</h2>
            <p className="text-gray-400 mt-1">Find the perfect movie for your available time</p>
          </div>
        </div>
        <p className="text-gray-400 mt-1">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-1 h-8 bg-cyan-500 rounded-full shadow-[0_0_8px_0px] shadow-cyan-500/50" />
          <div>
            <h2 className="text-2xl font-bold text-white">Time-Based Recommendations</h2>
            <p className="text-gray-400 mt-1">Find the perfect movie for your available time</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center p-8 bg-gray-800/50 rounded-xl border border-gray-700/50">
          <Lock className="w-12 h-12 text-cyan-500 mb-4" />

        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-1 h-8 bg-cyan-500 rounded-full shadow-[0_0_8px_0px] shadow-cyan-500/50" />
        <div>
          <h2 className="text-2xl font-bold text-white">Time-Based Picks</h2>
          <p className="text-gray-400 mt-1">Find the perfect movie for your available time</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {timeCategories.map((category) => (
          <button
            key={category.id}
            onClick={() => handleTimeSelect(category.id)}
            aria-pressed={selectedTime === category.id}
            className={`relative p-6 rounded-xl overflow-hidden group cursor-pointer
                     bg-gradient-to-br ${category.color} backdrop-blur-sm
                     border border-gray-700/50 hover:border-cyan-500/50
                     transition-all duration-300 hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500
                     ${selectedTime === category.id ? 'ring-2 ring-cyan-500/50' : ''}`}
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl" aria-hidden="true">{category.icon}</span>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-medium text-white group-hover:text-cyan-400
                           transition-colors duration-300">
                  {category.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm bg-black/30 px-2 py-0.5 rounded-full
                                text-cyan-400 font-mono">
                    {category.duration}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-2">{category.description}</p>
              </div>
              {selectedTime === category.id && (
                <div className="absolute top-2 right-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-500 motion-safe:animate-ping" />
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {selectedTime && movies.length > 0 && (
        <div className="mt-8">
          <div className="inline-flex items-center gap-3 px-4 py-2 mb-6
                       bg-gradient-to-r from-gray-800/50 to-gray-900/50
                       border border-gray-700/50 rounded-lg
                       backdrop-blur-sm">
            <div className="w-1 h-4 bg-cyan-500 rounded-full motion-safe:animate-pulse" />
            <h3 className="text-lg font-medium">
              <span className="text-gray-400">Duration Match:</span>
              {' '}
              <span className="bg-gradient-to-r from-cyan-400 to-cyan-200 bg-clip-text text-transparent">
                {timeCategories.find(c => c.id === selectedTime)?.name}
              </span>
            </h3>
          </div>

          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 list-none">
            {movies.map((movie) => (
              <li key={movie.id}>
                <Link
                  href={`/movie/${movie.id}`}
                  aria-label={`View details for ${movie.title}`}
                  className="group relative bg-gray-800/50 rounded-lg overflow-hidden
                           hover:shadow-lg transition-all duration-300 block focus:outline-none"
                >
                  <div className="relative aspect-[2/3]">
                    <Image
                      src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                      alt={movie.title}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0
                                  group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleWatchlistToggle(movie, e)}
                    aria-pressed={isInWatchlist(movie.id)}
                    aria-label={isInWatchlist(movie.id) ? `Remove ${movie.title} from watchlist` : `Add ${movie.title} to watchlist`}
                    className="absolute top-2 right-2 p-2 rounded-full
                              bg-black/50 backdrop-blur-sm border border-gray-700/50
                              text-white hover:bg-black/70 hover:scale-110
                              transition-all duration-300 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                  >
                    <Bookmark
                      className={`w-4 h-4 ${isInWatchlist(movie.id) ? 'fill-white' : ''}`}
                    />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 p-3 transform translate-y-full
                                group-hover:translate-y-0 transition-transform duration-300">
                    <p className="text-white text-sm font-medium truncate">{movie.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-cyan-400" />
                        <span className="text-gray-300 text-xs">{movie.runtime}min</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-500" />
                        <span className="text-gray-300 text-xs">{movie.vote_average.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
