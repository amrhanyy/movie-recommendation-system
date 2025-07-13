'use client'
import React from 'react'
import { useEffect, useState } from 'react'
import { MovieCard } from '@/components/MovieCard'
import { MovieCardSkeleton } from '@/components/Skeleton'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

export default function PopularMovies() {
  const [movies, setMovies] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchPopular() {
      try {
        const response = await fetch('/api/movies/popular')
        const data = await response.json()
        setMovies(data.results)
      } catch (error) {
        console.error('Error fetching popular movies:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchPopular()
  }, [])

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <span className="w-2 h-2 bg-blue-500 rounded-full" />
        Popular Movies
      </h2>
      <ScrollArea className="w-full whitespace-nowrap rounded-lg">
        <div className="flex gap-4 pb-4">
          {isLoading
            ? Array(8).fill(0).map((_, i) => (
                <div key={i} className="w-[250px] flex-none">
                  <MovieCardSkeleton />
                </div>
              ))
            : movies.map((movie) => (
                <div key={movie.id} className="w-[250px] flex-none">
                  <MovieCard movie={movie} />
                </div>
              ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
