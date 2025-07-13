'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2, Bookmark } from 'lucide-react'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { useSession, signIn } from 'next-auth/react'

interface Movie {
  id: number
  title: string
  poster_path: string
  vote_average: number
  release_date: string
  overview: string
}

export default function TrendingPage() {
  const router = useRouter()
  const [movies, setMovies] = useState<Movie[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const { data: session } = useSession()
  const [watchlistItems, setWatchlistItems] = useState<Set<number>>(new Set())

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
    fetchWatchlistStatus()
  }, [])

  const fetchWatchlistStatus = async () => {
    try {
      const response = await fetch('/api/watchlist')
      if (response.ok) {
        const data = await response.json()
        const itemIds = new Set<number>(
          data
            .filter((item: { itemId: number }) => typeof item.itemId === 'number')
            .map((item: { itemId: number }) => Number(item.itemId))
        )
        setWatchlistItems(itemIds)
      }
    } catch (error) {
      console.error('Error fetching watchlist status:', error)
    }
  }

  const handleWatchlistToggle = async (item: Movie, e: React.MouseEvent) => {
    e.stopPropagation()

    if (!session) {
      signIn()
      return
    }

    try {
      // Check if item is already in watchlist
      const isInWatchlist = watchlistItems.has(item.id);
      
      if (isInWatchlist) {
        // If it's in watchlist, remove it
        const response = await fetch(`/api/watchlist?itemId=${item.id}&type=movie`, {
          method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to remove from watchlist');
      } else {
        // If it's not in watchlist, add it
        const response = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: item.id,
            type: 'movie',
            title: item.title,
            posterPath: item.poster_path
          }),
        });
        if (!response.ok) throw new Error('Failed to add to watchlist');
      }

      // Update local state
      setWatchlistItems(prev => {
        const newSet = new Set(prev);
        if (isInWatchlist) {
          newSet.delete(item.id);
        } else {
          newSet.add(item.id);
        }
        return newSet;
      });
    } catch (error) {
      console.error('Error toggling watchlist:', error)
    }
  }

  if (isLoading) {
    return <LoadingSpinner message="Loading trending content..." />
  }

  return (
    <div className="container-fluid">
      <div className="glass-card rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
          <h1 className="text-2xl font-bold text-white tracking-wider">TRENDING NOW</h1>
        </div>

        {error ? (
          <div className="text-center py-12">
            <p className="text-red-400">{error}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
            {movies.map((movie) => (
              <div
                key={movie.id}
                className="group/item cursor-pointer"
                onClick={() => router.push(`/movie/${movie.id}`)}
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
                    onClick={(e) => handleWatchlistToggle(movie, e)}
                    className="group/tooltip absolute top-2 right-2 p-2 rounded-full
                              bg-black/50 backdrop-blur-sm border border-gray-700/50
                              text-white hover:bg-black/70 hover:scale-110
                              transition-all duration-300 z-10"
                  >
                    <Bookmark
                      className={`w-4 h-4 ${watchlistItems.has(movie.id) ? 'fill-white' : ''}`}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}