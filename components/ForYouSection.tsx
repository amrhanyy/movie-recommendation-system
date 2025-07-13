'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Sparkles, Loader2, Film, Bookmark } from 'lucide-react'

interface MediaItem {
  id: number
  title: string
  name?: string
  release_date: string
  poster_path: string | null
  vote_average: number
  media_type: 'movie' | 'tv'
  confidence_score: number
  reasoning?: string
}

export function ForYouSection() {
  const { data: session } = useSession()
  const router = useRouter()
  const [recommendations, setRecommendations] = useState<MediaItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [watchlistItems, setWatchlistItems] = useState<Set<number>>(new Set())
  const [needsContent, setNeedsContent] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)

  const fetchWatchlistStatus = async () => {
    if (!session?.user?.email) return;
    try {
      const response = await fetch('/api/watchlist');
      if (response.ok) {
        const data = await response.json();
        const itemIds = new Set<number>(data
          .filter((item: { itemId: number }) => typeof item.itemId === 'number')
          .map((item: { itemId: number }) => item.itemId)
        );
        setWatchlistItems(itemIds);
      }
    } catch (error) {
      console.error('Error fetching watchlist status:', error);
      setWatchlistItems(new Set());
    }
  };

  const handleWatchlistToggle = async (item: MediaItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session?.user?.email) {
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
    async function fetchRecommendations() {
      if (!session?.user?.email) return

      try {
        setIsLoading(true)
        setError(null)
        const response = await fetch('/api/ai-recommendations')
        
        if (response.status >= 400) {
          const errorData = await response.json()
          throw new Error(errorData.errorDetails || errorData.error || 'Failed to fetch recommendations')
        }
        
        if (!response.ok) throw new Error('Failed to fetch recommendations')
        
        const data = await response.json()
        
        if (data.needsContent) {
          setNeedsContent(true)
          setMessage(data.message || "Please add movies or TV shows to your Favorites or Watchlist to get personalized recommendations.")
        } else {
          setRecommendations(data.recommendations)
          setNeedsContent(false)
        }
      } catch (error) {
        console.error('Error:', error)
        setError(error instanceof Error ? error.message : 'An unexpected error occurred')
        setNeedsContent(false)
      } finally {
        setIsLoading(false)
      }
    }

    fetchRecommendations()
    
    if (session?.user?.email) {
      fetchWatchlistStatus();
    }
  }, [session?.user?.email])

  if (!session) {
    return (
      <div className="text-center p-8 bg-gray-800/30 rounded-3xl border border-gray-700/50">
        <Film className="w-12 h-12 mx-auto text-cyan-500 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Sign in for Personalized Recommendations</h3>
        <p className="text-gray-400">Get AI-powered suggestions based on your taste</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-3xl border border-red-700/50 p-8 text-center">
        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-red-500 text-2xl">!</span>
        </div>
        <h3 className="text-xl font-semibold text-white mb-3">Recommendation Error</h3>
        <p className="text-gray-300 mb-6 max-w-md mx-auto">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (needsContent) {
    return (
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-3xl border border-gray-700/50 p-8 text-center">
        <Bookmark className="w-12 h-12 mx-auto text-cyan-500 mb-4" />
        <h3 className="text-xl font-semibold text-white mb-3">Need Your Input</h3>
        <p className="text-gray-300 max-w-md mx-auto">{message}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <div className="w-1 h-8 bg-cyan-500 rounded-full shadow-[0_0_8px_0px] shadow-cyan-500/50" />
          <div>
            <h2 className="text-2xl font-bold text-white">Picks just for you</h2>
            <p className="text-gray-400 mt-1">Personalized recommendations</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-cyan-500/10 rounded-full">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-sm text-cyan-400">AI-Powered</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {recommendations.map((item, index) => (
          <div
            key={`${item.media_type}-${item.id}`}
            className="group relative"
            style={{ 
              animationName: 'fadeInUp',
              animationDuration: '0.3s',
              animationTimingFunction: 'ease',
              animationFillMode: 'forwards',
              animationDelay: `${index * 0.1}s`,
              opacity: 0,
              transform: 'translateY(20px)'
            }}
          >
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-2 
                          border border-gray-700/50">
              <Image
                src={item.poster_path 
                  ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                  : '/placeholder-poster.png'
                }
                alt={item.title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <button
                onClick={(e) => handleWatchlistToggle(item, e)}
                className="absolute top-2 right-2 p-2 rounded-full
                        bg-black/50 backdrop-blur-sm border border-gray-700/50
                        text-white hover:bg-black/70 hover:scale-110
                        transition-all duration-300 z-10"
              >
                <Bookmark 
                  className={`w-4 h-4 ${watchlistItems.has(item.id) ? 'fill-white' : ''}`} 
                />
              </button>
              <div 
                className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent 
                          opacity-0 group-hover:opacity-100 transition-all duration-300"
                onClick={() => router.push(`/${item.media_type}/${item.id}`)}
              >
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <p className="text-white text-sm font-medium mb-1">{item.title}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-cyan-400 text-sm">★ {item.vote_average.toFixed(1)}</span>
                    <span className="text-gray-300 text-xs">
                      {item.media_type === 'movie' ? '🎬' : '📺'}
                    </span>
                  </div>
                  {item.reasoning && (
                    <p className="text-xs text-gray-300 mt-2 opacity-75">{item.reasoning}</p>
                  )}
                </div>
              </div>
            </div>
            <div onClick={() => router.push(`/${item.media_type}/${item.id}`)} className="cursor-pointer">
              <h3 className="text-white text-sm line-clamp-1 group-hover:text-cyan-400 transition-colors">
                {item.title || item.name}
              </h3>
              <p className="text-gray-400 text-xs">
                {new Date(item.release_date).getFullYear()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
