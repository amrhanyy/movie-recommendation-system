"use client"
import React from "react"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"

interface Genre {
  id: number
  name: string
}

export function MoodSelector() {
  const [genres, setGenres] = useState<Genre[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedGenres, setSelectedGenres] = useState<number[]>([])

  useEffect(() => {
    async function fetchGenres() {
      try {
        const response = await fetch("/api/movies")
        if (!response.ok) {
          throw new Error("Failed to fetch genres")
        }
        const data = await response.json()
        setGenres(data.genres)
      } catch (err) {
        setError("Failed to load genres. Please try again later.")
        console.error(err)
      }
    }
    fetchGenres()
  }, [])

  const toggleGenre = (genreId: number) => {
    setSelectedGenres(prev =>
      prev.includes(genreId)
        ? prev.filter(id => id !== genreId)
        : [...prev, genreId]
    )
  }

  if (error) {
    return <div className="text-red-500 p-4 rounded-lg bg-red-50 text-center">{error}</div>
  }

  if (genres.length === 0) {
    return <div className="text-center p-4 animate-pulse">Loading genres...</div>
  }

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-t-lg">
        <CardTitle className="text-2xl font-bold text-center">Select Your Mood</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex flex-wrap gap-3 justify-center">
          {genres.map((genre) => (
            <Button
              key={genre.id}
              variant={selectedGenres.includes(genre.id) ? "default" : "outline"}
              onClick={() => toggleGenre(genre.id)}
              className={`
                transform transition-all duration-200
                hover:scale-105 hover:shadow-md
                ${selectedGenres.includes(genre.id)
                  ? 'bg-purple-500 text-white hover:bg-purple-600'
                  : 'hover:border-purple-500 hover:text-purple-500'
                }
                px-6 py-2 rounded-full font-medium
              `}
            >
              {genre.name}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

