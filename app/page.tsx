'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ChatAssistant } from '@/components/ChatAssistant'
import { TrendingUp, Film, Play, Star, ArrowRight } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { AuthRequiredMessage } from '@/components/AuthRequiredMessage'

import { AuthButton } from "../components/AuthButton"
import { TrendingSection } from '@/components/TrendingSection'
import LatestTrailers from '@/components/home/LatestTrailers'
import { TopRatedMovies } from '@/components/TopRatedMovies'
import { Section } from '@/components/Section'
import { TopRatedTVShows } from '@/components/TopRatedTVShows'
import { PopularCelebrities } from '@/components/PopularCelebrities'
import { MoodBasedRecommendations } from '@/components/MoodBasedRecommendations'
import { ForYouSection } from '@/components/ForYouSection'
import { TimeBasedMovies } from '@/components/TimeBasedMovies'
import { GenreGrid } from '../components/GenreGrid'

interface Movie {
  id: number
  title: string
  poster_path: string
  backdrop_path: string
  vote_average: number
  release_date: string
  overview: string
  media_type: 'movie' | 'tv'
  popularity: number
}

export default function HomePage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [trendingMovies, setTrendingMovies] = useState<Movie[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchMovies() {
      try {
        const trendingRes = await fetch('/api/trending')
        if (!trendingRes.ok) throw new Error('Failed to fetch trending movies')
        const trendingData = await trendingRes.json()
        setTrendingMovies(trendingData.results)
      } catch (err) {
        setError('Failed to load movies')
        console.error('Error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMovies()
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Enhanced Background Effects */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-x" />
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-900/95 to-gray-800/90" />
        <div className="absolute inset-0 bg-scan-lines opacity-5" />
      </div>

      {/* Main Content */}
      <div className="relative z-10">
        {/* Hero Section */}
        <div className="relative overflow-hidden mb-8">
          <div className="container mx-auto px-4">
            <div className="relative flex items-center justify-between py-8">
              {/* Left Content */}
              <div className="flex-1 max-w-lg pr-8">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                  <span className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                    Discover Your Next
                  </span>
                  {' '}
                  <span className="bg-gradient-to-r from-cyan-400 to-cyan-200 bg-clip-text text-transparent">
                    Favorite Story
                  </span>
                </h1>
                
                <p className="text-base text-gray-300 mb-6">
                  Explore thousands of movies and TV shows, get personalized recommendations, 
                  and track what you want to watch, all in one place.
                </p>

                <div className="flex items-center gap-4 mb-6">
                  <button onClick={() => router.push('/trending')} 
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 
                              text-white rounded-lg font-medium transition-all duration-300 
                              transform hover:translate-y-[-2px]">
                    <TrendingUp className="w-4 h-4" />
                    Trending Now
                  </button>
                  <button onClick={() => router.push('/genres')}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800/80 hover:bg-gray-700/80 
                              text-gray-300 hover:text-white rounded-lg font-medium 
                              transition-all duration-300
                              transform hover:translate-y-[-2px]">
                    <Film className="w-4 h-4" />
                    Browse All
                  </button>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-cyan-200 bg-clip-text text-transparent">20K+</span>
                    <span className="text-xs text-gray-400">Movies</span>
                  </div>
                  <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-700 to-transparent" />
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-cyan-200 bg-clip-text text-transparent">5K+</span>
                    <span className="text-xs text-gray-400">TV Shows</span>
                  </div>
                  <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-700 to-transparent" />
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-cyan-200 bg-clip-text text-transparent">12+</span>
                    <span className="text-xs text-gray-400">Genres</span>
                  </div>
                </div>
              </div>

              {/* Right Content - Movie Strip */}
              <div className="flex-1 relative min-h-[300px]">
                <div className="absolute inset-y-0 right-0 flex items-center gap-4">
                  {trendingMovies.slice(0, 5).map((movie, index) => (
                    <div
                      key={movie.id}
                      className={`relative w-36 aspect-[2/3] rounded-lg overflow-hidden cursor-pointer
                                transform transition-all duration-500 hover:scale-105 hover:z-10
                                ${index === 0 ? '' : '-ml-24'}`}
                      style={{
                        transform: `translateX(${index * 20}px) rotate(${index * 2}deg)`,
                      }}
                      onClick={() => router.push(`/movie/${movie.id}`)}
                    >
                      <Image
                        src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                        alt={movie.title}
                        fill
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                                    opacity-0 hover:opacity-100 transition-opacity duration-300">
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-white text-xs font-medium mb-1">{movie.title}</p>
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-500" />
                            <span className="text-gray-300 text-xs">{movie.vote_average.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Decorative Elements */}
                <div className="absolute -inset-2 bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-cyan-500/0 
                              blur-xl opacity-50 animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="space-y-12">
            {/* Auth Required Message */}
            {!session && <AuthRequiredMessage />}

            {/* Trending Section */}
            {!isLoading && !error && (
              <TrendingSection initialMovies={trendingMovies} />
            )}

            {/* Genre Grid - Add this section */}
            <div>
              <GenreGrid />
            </div>

            {/* Always visible sections */}
            <div>
              <LatestTrailers />
            </div>

            {/* Conditional rendering for personalized sections */}
            {session && (
              <>
                <div>
                  <ForYouSection />
                </div>

                <div>
                  <TimeBasedMovies />
                </div>

                <div>
                  <MoodBasedRecommendations />
                </div>
              </>
            )}

            {/* Always visible sections */}
            <div>
              <PopularCelebrities />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
