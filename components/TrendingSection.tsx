'use client'
import React from "react"
import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Bookmark } from 'lucide-react'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useSession, signIn } from 'next-auth/react'

interface MediaItem {
  id: number
  title?: string
  name?: string
  poster_path: string
  backdrop_path: string
  vote_average: number
  release_date?: string
  first_air_date?: string
  media_type: 'movie' | 'tv'
  popularity: number
}

export function TrendingSection({ initialMovies }: { initialMovies: MediaItem[] }) {
  const { data: session } = useSession()
  const [timeWindow, setTimeWindow] = useState<'day' | 'week'>('day')
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initialMovies)
  const [isLoading, setIsLoading] = useState(false)
  const [activeItem, setActiveItem] = useState<MediaItem | null>(null)
  const [watchlistItems, setWatchlistItems] = useState<Set<number>>(new Set())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const fetchWatchlistStatus = async () => {
    try {
      const response = await fetch('/api/watchlist');
      if (response.ok) {
        const data = await response.json();
        const itemIds = new Set(data
          .filter((item: { itemId: number }) => typeof item.itemId === 'number')
          .map((item: { itemId: number }) => item.itemId)) as Set<number>;
        setWatchlistItems(itemIds);
      }
    } catch (error) {
      console.error('Error fetching watchlist status:', error);
    }
  };

  const handleTimeWindowChange = async (newWindow: 'day' | 'week') => {
    try {
      setIsLoading(true)
      setTimeWindow(newWindow)
      
      // Fetch both movies and TV shows
      const [moviesRes, tvRes] = await Promise.all([
        fetch(`/api/trending/movie?time_window=${newWindow}`),
        fetch(`/api/trending/tv?time_window=${newWindow}`)
      ])

      const [moviesData, tvData] = await Promise.all([
        moviesRes.json(),
        tvRes.json()
      ])

      // Combine and process the results
      const combinedResults = [
        ...moviesData.results.map((item: any) => ({ ...item, media_type: 'movie' })),
        ...tvData.results.map((item: any) => ({ 
          ...item, 
          media_type: 'tv',
          title: item.name 
        }))
      ].sort((a, b) => b.popularity - a.popularity)

      setMediaItems(combinedResults)
    } catch (error) {
      console.error('Error fetching trending items:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 800; // Adjust this value to control scroll distance
      const newScrollPosition = scrollContainerRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
      scrollContainerRef.current.scrollTo({
        left: newScrollPosition,
        behavior: 'smooth'
      });
    }
  };

  const handleWatchlistToggle = async (item: MediaItem, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!session) {
      signIn();
      return;
    }
    
    try {
      // Check if item is already in watchlist
      const isInWatchlist = watchlistItems.has(item.id);
      
      if (isInWatchlist) {
        // If it's in watchlist, remove it
        const response = await fetch(`/api/watchlist?itemId=${item.id}&type=${item.media_type}`, {
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
            type: item.media_type,
            title: item.title || item.name,
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
      console.error('Error toggling watchlist:', error);
    }
  };

  useEffect(() => {
    handleTimeWindowChange('day')
    fetchWatchlistStatus();
  }, [])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  return (
    <section className="relative">
      {activeItem && (
        <div className="fixed inset-0 -z-10 transition-opacity duration-1000">
          <Image
            src={`https://image.tmdb.org/t/p/original${activeItem.backdrop_path}`}
            alt=""
            fill
            className="object-cover opacity-25 transition-transform duration-500 scale-105"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/80 to-gray-900/60" />
        </div>
      )}

      <div className="py-8">
        <div className="flex items-center justify-between mb-6 px-4">
          <div className="flex items-center gap-4">
            <div className="w-1 h-8 bg-cyan-500 rounded-full shadow-[0_0_8px_0px] shadow-cyan-500/50" />
            <div>
              <h2 className="text-2xl font-bold text-white tracking-wider">TRENDING</h2>
              <p className="text-gray-400 mt-1">Most popular content this week</p>
            </div>
          </div>
          <div className="flex bg-gray-800/30 backdrop-blur-xl rounded-xl p-1 border border-gray-700/50">
            <button
              onClick={() => handleTimeWindowChange('day')}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                timeWindow === 'day'
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handleTimeWindowChange('week')}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                timeWindow === 'week'
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              This Week
            </button>
          </div>
        </div>

        <div className="relative group">
          {/* Left scroll button */}
          <button 
            onClick={() => scroll('left')}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full 
                      opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* Right scroll button */}
          <button 
            onClick={() => scroll('right')}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full 
                      opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          <div className="relative overflow-x-auto scrollbar-hide">
            <div 
              ref={scrollContainerRef}
              className="flex space-x-6 px-4 pb-4 overflow-x-auto scroll-smooth"
            >
              {mediaItems.map((item) => (
                <div
                  key={item.id}
                  className="relative flex-none w-[200px] first:ml-2 last:mr-2"
                  onClick={() => router.push(`/${item.media_type}/${item.id}`)}
                  onMouseEnter={() => setActiveItem(item)}
                  onMouseLeave={() => setActiveItem(null)}
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden group cursor-pointer">
                    <Image
                      src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                      alt={item.title || item.name || ''}
                      fill
                      className="object-cover transform group-hover:scale-105 transition-all duration-300"
                      sizes="200px"
                    />
                    
                    <button
                      onClick={(e) => handleWatchlistToggle(item, e)}
                      className="group/tooltip absolute top-2 right-2 p-2 rounded-full
                                bg-black/50 backdrop-blur-sm border border-gray-700/50
                                text-white hover:bg-black/70 hover:scale-110
                                transition-all duration-300 z-10"
                    >
                      <Bookmark 
                        className={`w-4 h-4 ${watchlistItems.has(item.id) ? 'fill-white' : ''}`} 
                      />
                      
                  
                    </button>

                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                                  opacity-0 group-hover:opacity-100 transition-all duration-500">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(0,200,255,0.1),transparent_70%)]" />
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <div className="relative z-10">
                          <h3 className="text-white font-medium text-sm line-clamp-2 mb-2">
                            {item.title || item.name}
                          </h3>
                          <div className="flex items-center gap-2">
                            <div className="px-2 py-1 rounded-md bg-cyan-500/20 backdrop-blur-sm border border-cyan-500/20">
                              <span className="text-cyan-400 text-xs">
                                {new Date(item.release_date || item.first_air_date || '').getFullYear()}
                              </span>
                            </div>
                            <div className="w-8 h-8 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center border border-cyan-500/20">
                              <div className="text-sm font-bold text-cyan-400">
                                {item.vote_average.toFixed(1)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500/25 to-cyan-500/0 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
