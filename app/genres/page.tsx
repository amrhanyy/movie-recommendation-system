'use client'

import React from 'react'
import { useEffect, useState } from 'react'
import { GenreCard } from '../../components/GenreCard'
import { LoadingSpinner } from '../../components/LoadingSpinner'

interface Genre {
  id: number
  name: string
  count?: number
}

export default function GenresPage() {
  const [genres, setGenres] = useState<Genre[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGenres = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/genres')
      if (!res.ok) throw new Error('Failed to fetch genres')
      const data = await res.json()
      setGenres(Array.isArray(data.genres) ? data.genres : [])
    } catch (err) {
      setError('We could not load genres right now. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchGenres()
  }, [])

  if (isLoading) {
    return <LoadingSpinner message="Loading genres..." />
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div role="alert" className="rounded-3xl border border-red-700/50 bg-gray-800/30 p-8 text-center">
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            type="button"
            onClick={() => void fetchGenres()}
            className="min-h-[44px] px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-12">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-8 mb-12 overflow-hidden">
        <div className="absolute inset-0 bg-[url('/images/film-pattern.svg')] opacity-5"></div>
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-cyan-500/10 to-transparent"></div>
        
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-8 bg-cyan-500 rounded-full shadow-[0_0_12px_0px] shadow-cyan-500/50 animate-pulse" />
            <h1 className="text-4xl font-bold text-white tracking-wider">EXPLORE GENRES</h1>
          </div>
          <p className="text-gray-300 text-lg mb-6">Discover movies and shows across different categories.</p>
          <div className="flex gap-4 items-center">
            <div className="h-1 w-24 bg-gradient-to-r from-cyan-500 to-transparent rounded-full"></div>
            <span className="text-cyan-400 text-sm font-medium">{genres.length} GENRES AVAILABLE</span>
          </div>
        </div>
      </div>
      
      {/* Genre Grid */}
      {genres.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/30 rounded-3xl border border-gray-700/50">
          <h3 className="text-xl font-semibold text-white mb-2">No genres available</h3>
          <p className="text-gray-400">Check back later for new categories.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8">
          {genres.map((genre) => (
            <GenreCard
              key={genre.id}
              {...genre}
            />
          ))}
        </div>
      )}
      
      {/* Information Section */}
      <div className="mt-16 p-6 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="p-3 rounded-full bg-cyan-500/10 text-cyan-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-medium">Genre Recommendations</h3>
            <p className="text-gray-400 mt-1">Click on any genre to explore curated selections of the best movies and shows.</p>
          </div>
        </div>
      </div>
    </div>
  )
}