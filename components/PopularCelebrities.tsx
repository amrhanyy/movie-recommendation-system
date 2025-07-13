'use client'
import React from "react"
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Star, Film } from 'lucide-react'

interface Celebrity {
  id: number
  name: string
  profile_path: string
  known_for_department: string
  popularity: number
}

export function PopularCelebrities() {
  const router = useRouter()
  const [celebrities, setCelebrities] = useState<Celebrity[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchCelebrities() {
      try {
        const response = await fetch('/api/celebrities')
        const data = await response.json()
        setCelebrities(data.results.slice(0, 6))
      } catch (error) {
        console.error('Error fetching celebrities:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCelebrities()
  }, [])

  const handleCelebrityClick = (personId: number) => {
    router.push(`/person/${personId}`)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-1 h-8 bg-cyan-500 rounded-full shadow-[0_0_8px_0px] shadow-cyan-500/50" />
        <div>
          <h2 className="text-2xl font-bold text-white">Popular Celebrities</h2>
          <p className="text-gray-400 mt-1">Discover trending actors and creators</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        {celebrities.map((celebrity) => (
          <div
            key={celebrity.id}
            onClick={() => handleCelebrityClick(celebrity.id)}
            className="group cursor-pointer text-center"
          >
            <div className="relative aspect-square rounded-full overflow-hidden mb-3 
                         transform group-hover:scale-105 transition-all duration-300 
                         border-2 border-gray-700/50 hover:border-cyan-500/50">
              <Image
                src={`https://image.tmdb.org/t/p/w500${celebrity.profile_path}`}
                alt={celebrity.name}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                           opacity-0 group-hover:opacity-100 transition-all duration-500" />
            </div>
            
            <h3 className="text-white font-semibold text-sm group-hover:text-cyan-400 transition-colors">
              {celebrity.name}
            </h3>
            <p className="text-cyan-400/80 text-xs mt-1">
              {celebrity.known_for_department}
            </p>
            
            <div className="mt-2 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <Star className="w-3 h-3 text-yellow-500" />
              <span className="text-gray-300 text-xs">{celebrity.popularity.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
