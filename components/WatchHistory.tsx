'use client'
 
import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { LoadingSpinner } from './ui/LoadingSpinner'
import Link from 'next/link'

type HistoryItem = {
  _id: string
  itemId: number
  type: 'movie' | 'tv' | 'person'
  title: string
  posterPath: string | null
  viewedAt: string
}

interface WatchHistoryProps {
  limit?: number;
}

export default function WatchHistory({ limit }: WatchHistoryProps) {
  const { data: session } = useSession()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchHistory = async () => {
      if (!session?.user?.email) {
        setLoading(false)
        return
      }
      
      try {
        const response = await fetch('/api/history', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Add this to ensure cookies are sent
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch history')
        }
        
        const data = await response.json()
        setHistory(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Error:', error)
        setError(error instanceof Error ? error.message : 'Failed to load history')
        setHistory([])
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [session?.user?.email])

  if (loading) return <LoadingSpinner />
  if (error) return <div className="text-red-500">{error}</div>
  if (history.length === 0) return <div className="text-gray-400">No watch history available</div>

  // Apply limit if provided
  const displayHistory = limit ? history.slice(0, limit) : history;

  const getItemLink = (item: HistoryItem) => {
    switch (item.type) {
      case 'movie':
        return `/movie/${item.itemId}`
      case 'tv':
        return `/tv/${item.itemId}`
      case 'person':
        return `/actor/${item.itemId}`
      default:
        return '#'
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 gap-4">
      {displayHistory.map((item) => (
        <Link key={item._id} href={getItemLink(item)}>
          <div className="flex items-center gap-4 bg-gray-800/50 rounded-xl p-4 hover:bg-gray-700/50 transition cursor-pointer">
            <div className="relative h-16 w-12 flex-shrink-0">
              {item.posterPath ? (
                <Image
                  src={`https://image.tmdb.org/t/p/w92${item.posterPath}`}
                  alt={item.title}
                  fill
                  className="rounded-md object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-700 rounded-md flex items-center justify-center">
                  <span className="text-xs text-gray-400">No image</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{item.title}</p>
              <p className="text-gray-400 text-sm">
                {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
              </p>
              <p className="text-gray-500 text-xs">
                {new Date(item.viewedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
