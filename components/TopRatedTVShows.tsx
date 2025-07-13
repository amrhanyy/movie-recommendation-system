'use client'

import React from 'react'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Bookmark } from 'lucide-react'
import { useSession, signIn } from 'next-auth/react'
import { LoadingSpinner } from '@/components/LoadingSpinner'

interface TVShow {
  id: number
  name: string
  poster_path: string
  vote_average: number
  first_air_date: string
}

export function TopRatedTVShows() {
  const [shows, setShows] = useState<TVShow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { data: session } = useSession()
  const [watchlistItems, setWatchlistItems] = useState<Set<number>>(new Set())
  const router = useRouter()
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchTopRatedShows() {
      try {
        const response = await fetch('/api/tv/top-rated')
        const data = await response.json()
        setShows(data.results || [])
      } catch (error) {
        console.error('Failed to fetch top rated TV shows:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTopRatedShows()
    if (session?.user?.email) {
      fetchWatchlistStatus()
    }
  }, [session?.user?.email])

  const fetchWatchlistStatus = async () => {
    try {
      const response = await fetch('/api/watchlist')
      if (response.ok) {
        const data = await response.json()
        const itemIds = new Set<number>(data
          .filter((item: { itemId: number }) => typeof item.itemId === 'number')
          .map((item: { itemId: number }) => Number(item.itemId)))
        setWatchlistItems(itemIds)
      }
    } catch (error) {
      console.error('Error fetching watchlist status:', error)
    }
  };

  const handleWatchlistToggle = async (show: TVShow, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!session) {
      signIn();
      return;
    }
    
    try {
      // Check if show is already in watchlist
      const isInWatchlist = watchlistItems.has(show.id);
      
      if (isInWatchlist) {
        // If it's in watchlist, remove it
        const response = await fetch(`/api/watchlist?itemId=${show.id}&type=tv`, {
          method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to remove from watchlist');
      } else {
        // If it's not in watchlist, add it
        const response = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: show.id,
            type: 'tv',
            title: show.name,
            posterPath: show.poster_path
          }),
        });
        if (!response.ok) throw new Error('Failed to add to watchlist');
      }

      // Update local state
      setWatchlistItems(prev => {
        const newSet = new Set(prev);
        if (isInWatchlist) {
          newSet.delete(show.id);
        } else {
          newSet.add(show.id);
        }
        return newSet;
      });
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    }
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
    return <LoadingSpinner message="Loading top rated TV shows..." />
  }

  return (
    <section className="py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
        <h2 className="text-2xl font-bold text-white tracking-wider">TOP RATED TV SHOWS</h2>
      </div>

      <div className="relative group">
        <button 
          onClick={() => scroll('left')}
          className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 
                    text-white p-3 rounded-full opacity-0 group-hover:opacity-100 
                    transition-opacity duration-300 backdrop-blur-sm"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>

        <button 
          onClick={() => scroll('right')}
          className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 
                    text-white p-3 rounded-full opacity-0 group-hover:opacity-100 
                    transition-opacity duration-300 backdrop-blur-sm"
        >
          <ChevronRight className="w-8 h-8" />
        </button>

        <div 
          ref={scrollContainerRef}
          className="flex space-x-6 overflow-x-auto scrollbar-hide scroll-smooth pb-4"
        >
          {shows.map((show) => (
            <div
              key={show.id}
              className="flex-none w-[180px] group/item cursor-pointer relative"
              onClick={() => router.push(`/tv/${show.id}`)}
            >
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-3 
                          transform group-hover/item:scale-105 transition-all duration-300 
                          border border-gray-700/50">
                <Image
                  src={`https://image.tmdb.org/t/p/w342${show.poster_path}`}
                  alt={show.name}
                  fill
                  className="object-cover"
                />
                <button
                  onClick={(e) => handleWatchlistToggle(show, e)}
                  className="group/tooltip absolute top-2 right-2 p-2 rounded-full
                          bg-black/50 backdrop-blur-sm border border-gray-700/50
                          text-white hover:bg-black/70 hover:scale-110
                          transition-all duration-300 z-10"
                >
                  <Bookmark 
                    className={`w-4 h-4 ${watchlistItems.has(show.id) ? 'fill-white' : ''}`} 
                  />
                  
                  
                </button>
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                            opacity-0 group-hover/item:opacity-100 transition-all duration-500">
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="text-cyan-400 text-sm">
                      ★ {typeof show.vote_average === 'number' ? show.vote_average.toFixed(1) : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
              <h3 className="font-medium text-gray-100 text-sm group-hover/item:text-cyan-400 transition-colors">
                {show.name}
              </h3>
              <p className="text-gray-400 text-xs">
                {show.first_air_date ? new Date(show.first_air_date).getFullYear() : 'N/A'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
