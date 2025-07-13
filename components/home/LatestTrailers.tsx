'use client'
import React from "react"
import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Play, X } from 'lucide-react'

interface Trailer {
  id: number
  title: string
  overview: string
  backdrop_path: string
  release_date: string
  vote_average: number
  trailer_key: string
}

const filterButtons = [
  'Popular',
  'Streaming',
  'On TV',
  'For Rent',
  'In Theaters',
]

export default function LatestTrailers() {
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [selectedFilter, setSelectedFilter] = useState<string>('Popular')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [activeTrailer, setActiveTrailer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const playerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchTrailers = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/trailers?filter=${selectedFilter.toLowerCase()}`)
        if (!response.ok) throw new Error(`Failed to fetch trailers for ${selectedFilter}`)
        const data = await response.json()
        setTrailers(data.results)
      } catch (error: any) {
        setError(error.message)
        console.error("Error fetching trailers:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTrailers()
  }, [selectedFilter])

  useEffect(() => {
    // Handle click outside player to close
    const handleClickOutside = (event: MouseEvent) => {
      if (playerRef.current && !playerRef.current.contains(event.target as Node)) {
        setActiveTrailer(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative">
      <div className="glass-card rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
            <h2 className="text-2xl font-bold text-white tracking-wider">LATEST TRAILERS</h2>
          </div>
          <div className="flex bg-gray-800/30 backdrop-blur-xl rounded-xl p-1 border border-gray-700/50">
            {filterButtons.map((filter) => (
              <button
                key={filter}
                onClick={() => setSelectedFilter(filter)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  selectedFilter === filter
                    ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
          </div>
        ) : error ? (
          <div className="text-red-400 text-center py-8">{error}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {trailers.map((trailer) => (
              <div
                key={trailer.id}
                className="relative group cursor-pointer"
                onClick={() => setActiveTrailer(trailer.trailer_key)}
              >
                <div className="relative aspect-video rounded-lg overflow-hidden">
                  <Image
                    src={`https://image.tmdb.org/t/p/w500${trailer.backdrop_path}`}
                    alt={trailer.title}
                    fill
                    className="object-cover transform group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-cyan-500/20 backdrop-blur-sm flex items-center justify-center border border-cyan-500/20 transform scale-0 group-hover:scale-100 transition-transform">
                      <Play className="w-6 h-6 text-cyan-400" />
                    </div>
                  </div>
                </div>
                <h3 className="mt-2 text-sm font-medium text-white line-clamp-1">{trailer.title}</h3>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* YouTube Player Modal */}
      {activeTrailer && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div ref={playerRef} className="relative w-full max-w-4xl aspect-video">
            <button
              onClick={() => setActiveTrailer(null)}
              className="absolute -top-12 right-0 text-white hover:text-cyan-400 transition-colors"
            >
              <X className="w-8 h-8" />
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${activeTrailer}?autoplay=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  )
}
