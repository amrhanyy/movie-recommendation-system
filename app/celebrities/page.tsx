'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Star, Film, ArrowLeft } from 'lucide-react'
import { Button } from '../../components/ui/button'

interface Celebrity {
  id: number
  name: string
  profile_path: string
  known_for_department: string
  popularity: number
}

export default function CelebritiesPage() {
  const router = useRouter()
  const [celebrities, setCelebrities] = useState<Celebrity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    async function fetchCelebrities() {
      try {
        const response = await fetch(`/api/celebrities?page=${page}`)
        const data = await response.json()
        setCelebrities(prev => [...prev, ...data.results])
      } catch (error) {
        console.error('Error fetching celebrities:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCelebrities()
  }, [page])

  if (isLoading && page === 1) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 py-8">
      <div className="container mx-auto px-4">
        <Button 
          onClick={() => router.back()}
          variant="ghost"
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors mb-6"
        >
          <ArrowLeft className="w-6 h-6 text-gray-400" />
        </Button>

        <h1 className="text-3xl font-bold text-white mb-8">Popular Celebrities</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {celebrities.map((celebrity) => (
            <div
              key={celebrity.id}
              onClick={() => router.push(`/person/${celebrity.id}`)}
              className="group relative bg-gradient-to-br from-gray-800/80 to-gray-900/90
                       rounded-xl overflow-hidden hover:shadow-2xl hover:shadow-cyan-500/10
                       transform hover:-translate-y-1 transition-all duration-300
                       border border-gray-700/50 cursor-pointer"
            >
              <div className="relative h-56 w-full overflow-hidden">
                <Image
                  src={`https://image.tmdb.org/t/p/w500${celebrity.profile_path}`}
                  alt={celebrity.name}
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              
              <div className="p-4 relative">
                <h3 className="text-white font-semibold truncate text-sm">{celebrity.name}</h3>
                <p className="text-cyan-400/80 text-xs mt-1">{celebrity.known_for_department}</p>
                
                <div className="mt-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500" />
                    <span className="text-gray-300 text-xs">{celebrity.popularity.toFixed(1)}</span>
                  </div>
                  <Film className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {!isLoading && (
          <Button
            onClick={() => setPage(prev => prev + 1)}
            className="mt-8 mx-auto block px-6 py-3 bg-cyan-500 hover:bg-cyan-600
                     text-white rounded-lg font-medium transition-all duration-300"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              'Load More'
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
