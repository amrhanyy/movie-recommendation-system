'use client'

import React, { useState, useEffect } from 'react'  // Add useState import
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { use } from 'react'
import PageWrapper from '../../../components/PageWrapper'  // Use relative path

import Link from "next/link"
import { Calendar, MapPin, Link as LinkIcon, Film, Cake, Globe2, Image as ImageIcon } from 'lucide-react'
import { LoadingSpinner } from '@/components/LoadingSpinner'

interface Actor {
  id: number
  name: string
  profile_path: string
  biography: string
  birthday: string
  deathday: string | null
  place_of_birth: string
  known_for_department: string
  homepage: string | null
  images: {
    profiles: {
      file_path: string
      width: number
      height: number
    }[]
  }
  movie_credits: {
    cast: {
      id: number
      title: string
      poster_path: string
      release_date: string
      character: string
      vote_average: number
    }[]
  }
  tv_credits: {
    cast: {
      id: number
      name: string
      poster_path: string
      first_air_date: string
      character: string
      vote_average: number
    }[]
  }
  gender: number
  also_known_as: string[]
}

export default function ActorPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params)
  const actorId = unwrappedParams.id
  const router = useRouter()
  const [actor, setActor] = useState<Actor | null>(null)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchActorDetails() {
      try {
        const res = await fetch(`/api/actor/${actorId}`)
        if (!res.ok) throw new Error('Failed to fetch actor details')
        const data = await res.json()
        setActor(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load actor details")
      } finally {
        setIsLoading(false)
      }
    }

    fetchActorDetails()
  }, [actorId])

  if (isLoading) return <LoadingSpinner message="Loading actor details..." />
  if (error) return <div className="text-center text-red-500 p-4">{error}</div>
  if (!actor) return <div className="text-center text-gray-400 p-4">No actor data found</div>

  return (
    <PageWrapper>
      <div className="max-w-6xl mx-auto">
        {/* Actor Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">{actor.name}</h1>
          <p className="text-gray-400">{actor.known_for_department}</p>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Main Profile Image - Smaller size */}
            <div className="max-w-[300px] mx-auto lg:mx-0">
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden shadow-lg border border-gray-700/50">
                <Image
                  src={`https://image.tmdb.org/t/p/w500${actor.profile_path}`}
                  alt={actor.name}
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>

            {/* Personal Info Card */}
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
                <h2 className="text-lg font-semibold text-white">Personal Info</h2>
              </div>
              <div className="space-y-4">
                {/* Known For */}
                <div>
                  <h3 className="text-gray-400 text-sm font-medium mb-1">Known For</h3>
                  <p className="text-gray-100">{actor.known_for_department}</p>
                </div>

                {/* Gender */}
                <div>
                  <h3 className="text-gray-400 text-sm font-medium mb-1">Gender</h3>
                  <p className="text-gray-100">
                    {actor.gender === 1 ? 'Female' : actor.gender === 2 ? 'Male' : 'Not specified'}
                  </p>
                </div>

                {/* Birthday with Age */}
                {actor.birthday && (
                  <div>
                    <h3 className="text-gray-400 text-sm font-medium mb-1 flex items-center gap-2">
                      <Cake className="w-4 h-4 text-cyan-400" />
                      Birthday
                    </h3>
                    <p className="text-gray-100">
                      {new Date(actor.birthday).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                      {!actor.deathday && (
                        <span className="text-gray-400 text-sm ml-2">
                          ({calculateAge(actor.birthday)} years old)
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* Place of Birth */}
                {actor.place_of_birth && (
                  <div>
                    <h3 className="text-gray-400 text-sm font-medium mb-1 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-cyan-400" />
                      Place of Birth
                    </h3>
                    <p className="text-gray-100">{actor.place_of_birth}</p>
                  </div>
                )}

                {/* Also Known As */}
                {actor.also_known_as && actor.also_known_as.length > 0 && (
                  <div>
                    <h3 className="text-gray-400 text-sm font-medium mb-1 flex items-center gap-2">
                      <Globe2 className="w-4 h-4 text-cyan-400" />
                      Also Known As
                    </h3>
                    <div className="space-y-1">
                      {actor.also_known_as.map((name, index) => (
                        <p key={index} className="text-gray-100 text-sm">{name}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-3 space-y-8">
            {/* Biography Card */}
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
                <h2 className="text-lg font-semibold text-white">Biography</h2>
              </div>
              <p className="text-gray-300 leading-relaxed whitespace-pre-line">
                {actor.biography || 'No biography available.'}
              </p>
            </div>

            {/* Filmography Card */}
            {actor.movie_credits?.cast.length > 0 && (
              <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-6 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
                  <h2 className="text-lg font-semibold text-white">Notable for movies
                  </h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {actor.movie_credits.cast
                    .sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())
                    .slice(0, 8)
                    .map((movie, index) => (
                      <div
                        key={`movie-${movie.id}-${index}-${movie.character?.replace(/\s+/g, '')}`}
                        className="group cursor-pointer"
                        onClick={() => router.push(`/movie/${movie.id}`)}
                      >
                        <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-3 
                                    transform group-hover:scale-105 transition-all duration-300 
                                    border border-gray-700/50">
                          <Image
                            src={movie.poster_path 
                              ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
                              : '/placeholder-poster.png'
                            }
                            alt={movie.title}
                            fill
                            className="object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                                        opacity-0 group-hover:opacity-100 transition-all duration-500">
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                              <p className="text-cyan-400 text-sm">{movie.character}</p>
                            </div>
                          </div>
                        </div>
                        <h3 className="font-medium text-gray-100 text-sm group-hover:text-cyan-400 transition-colors">
                          {movie.title}
                        </h3>
                        <p className="text-gray-400 text-xs">
                          {new Date(movie.release_date).getFullYear()}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* TV Shows Card */}
            {actor.tv_credits?.cast.length > 0 && (
              <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-6 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
                  <h2 className="text-lg font-semibold text-white">Notable for tv shows</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {actor.tv_credits.cast
                    .sort((a, b) => new Date(b.first_air_date || '').getTime() - new Date(a.first_air_date || '').getTime())
                    .slice(0, 8)
                    .map((show, index) => (
                      <div
                        key={`tv-${show.id}-${index}-${show.character?.replace(/\s+/g, '')}`}
                        className="group cursor-pointer"
                        onClick={() => router.push(`/tv/${show.id}`)}
                      >
                        <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-3 
                                    transform group-hover:scale-105 transition-all duration-300 
                                    border border-gray-700/50">
                          <Image
                            src={show.poster_path 
                              ? `https://image.tmdb.org/t/p/w342${show.poster_path}`
                              : '/placeholder-poster.png'
                            }
                            alt={show.name}
                            fill
                            className="object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                                        opacity-0 group-hover:opacity-100 transition-all duration-500">
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                              <p className="text-cyan-400 text-sm">{show.character}</p>
                            </div>
                          </div>
                        </div>
                        <h3 className="font-medium text-gray-100 text-sm group-hover:text-cyan-400 transition-colors">
                          {show.name}
                        </h3>
                        <p className="text-gray-400 text-xs">
                          {show.first_air_date ? new Date(show.first_air_date).getFullYear() : 'N/A'}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Back Button */}
        <div className="mt-8 flex justify-center">
          <button 
            onClick={() => router.back()} 
            className="px-6 py-2 rounded-lg bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 
                    text-gray-300 hover:text-white hover:border-gray-600 transition-all duration-300"
          >
            Back
          </button>
        </div>
      </div>
    </PageWrapper>
  )
}

// Utility function to calculate age
function calculateAge(birthDate: string, endDate?: string | null): number {
  const birth = new Date(birthDate)
  const end = endDate ? new Date(endDate) : new Date()
  let age = end.getFullYear() - birth.getFullYear()
  const monthDiff = end.getMonth() - birth.getMonth()
  
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
    age--
  }
  
  return age
}
