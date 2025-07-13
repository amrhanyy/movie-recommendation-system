'use client'

import React, { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { LoadingSpinner } from './ui/LoadingSpinner'
import Link from 'next/link'
import { GridItemCard } from './GridItemCard'

type WatchlistItem = {
  _id: string
  itemId: number
  type: 'movie' | 'tv'
  title: string
  posterPath: string | null
  addedAt: string
  voteAverage?: number
  releaseDate?: string
  runtime?: number
  overview?: string
  genres?: string[]
}

interface WatchlistProps {
  limit?: number;
}

export default function Watchlist({ limit }: WatchlistProps) {
  const { data: session } = useSession()
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchWatchlist = async () => {
      if (!session?.user?.email) {
        setLoading(false)
        return
      }
      
      try {
        // Try to use enhanced details API first for better data
        let response = await fetch('/api/watchlist/enhanced-details')
        
        if (!response.ok) {
          // Fall back to basic watchlist API
          response = await fetch('/api/watchlist')
          
          if (!response.ok) {
            throw new Error('Failed to fetch watchlist')
          }
        }
        
        const data = await response.json()
        // Handle both API formats
        const formattedData = data.map((item: any) => ({
          ...item,
          addedAt: item.addedAt || item.createdAt
        }))
        
        setItems(formattedData)
      } catch (error) {
        console.error('Error:', error)
        setError(error instanceof Error ? error.message : 'Failed to load watchlist')
        setItems([])
      } finally {
        setLoading(false)
      }
    }

    fetchWatchlist()
  }, [session?.user?.email])

  const removeFromWatchlist = async (itemId: number, type: string) => {
    try {
      const response = await fetch(`/api/watchlist?itemId=${itemId}&type=${type}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to remove item');
      
      // Update local state to remove the item
      setItems(items.filter(item => !(item.itemId === itemId && item.type === type)));
    } catch (error) {
      console.error('Error removing item:', error);
    }
  };

  if (loading) return <LoadingSpinner />
  if (error) return <div className="text-red-500">{error}</div>
  if (items.length === 0) return <div className="text-gray-400">Your watchlist is empty</div>

  // Apply limit if provided
  const displayItems = limit ? items.slice(0, limit) : items;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
      {displayItems.map((item) => (
        <GridItemCard 
          key={item._id}
          item={item} 
          onRemove={removeFromWatchlist}
        />
      ))}
    </div>
  )
}
