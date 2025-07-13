'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Heart, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface FavoriteItem {
  id: string
  itemId: number
  type: 'movie' | 'tv'
  title: string
  posterPath: string | null
  createdAt: string
}

interface FavoritesProps {
  limit?: number;
}

export function Favorites({ limit }: FavoritesProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchFavorites = async () => {
    try {
      const response = await fetch('/api/favorites')
      if (!response.ok) throw new Error('Failed to fetch favorites')
      const data = await response.json()
      setFavorites(data)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load favorites')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (session?.user?.email) {
      fetchFavorites()
    }
  }, [session?.user?.email])

  const removeFromFavorites = async (itemId: number, type: string) => {
    try {
      const response = await fetch(`/api/favorites?itemId=${itemId}&type=${type}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) throw new Error('Failed to remove from favorites')
      
      // Update local state to remove the item
      setFavorites(prev => prev.filter(item => !(item.itemId === itemId && item.type === type)))
      toast.success('Removed from favorites')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to remove from favorites')
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
      </div>
    )
  }

  if (favorites.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No favorites added yet. Click the heart icon on movies and TV shows to add them here!
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
      {favorites
        .slice(0, limit || Infinity)
        .map((item) => (
          <div key={`${item.type}-${item.itemId}`} className="group relative">
            <div
              onClick={() => router.push(`/${item.type}/${item.itemId}`)}
              className="relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer
                       border border-gray-700/50"
            >
              <Image
                src={item.posterPath 
                  ? `https://image.tmdb.org/t/p/w500${item.posterPath}`
                  : '/placeholder-poster.png'
                }
                alt={item.title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent 
                           opacity-0 group-hover:opacity-100 transition-all duration-300">
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <p className="text-white text-sm font-medium mb-1">{item.title}</p>
                  <p className="text-gray-300 text-xs">
                    {item.type === 'movie' ? '🎬 Movie' : '📺 TV Show'}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Remove from favorites button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeFromFavorites(item.itemId, item.type)
              }}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/50 backdrop-blur-sm
                       text-pink-500 opacity-0 group-hover:opacity-100 transition-opacity
                       hover:bg-black/70 z-10"
            >
              <Heart className="w-4 h-4 fill-current" />
            </button>
          </div>
        ))}
    </div>
  )
}
