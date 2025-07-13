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

  useEffect(() => {
    async function fetchGenres() {
      try {
        const res = await fetch('/api/genres')
        const data = await res.json()
        setGenres(data.genres)
      } catch (error) {
        console.error('Failed to fetch genres:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchGenres()
  }, [])

  if (isLoading) {
    return <LoadingSpinner message="Loading genres..." />
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8">
        {genres.map((genre) => (
          <GenreCard 
            key={genre.id}
            {...genre}
          />
        ))}
      </div>
      
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