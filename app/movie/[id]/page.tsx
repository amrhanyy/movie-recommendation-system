'use client'

import React from 'react'
import { useRouter } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import Image from "next/image"
import { use } from 'react'
import { Calendar, Clock, Star, TrendingUp, ExternalLink, Play, ChevronLeft, ChevronRight, Bookmark, Sparkles } from 'lucide-react'
import PageWrapper from '@/components/PageWrapper'  // Updated import
import { Section } from '@/components/Section'
import { MovieTrailer } from '@/components/MovieTrailer'
import { HistoryTracker } from '@/components/HistoryTracker'
import { useWatchlist } from '@/hooks/useWatchlist';
import { FavoriteButton } from '@/components/FavoriteButton';
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useSession, signIn } from 'next-auth/react'

interface DetailedMovie {
  id: number
  title: string
  release_date: string
  vote_average: number
  overview: string
  poster_path: string
  genres: { id: number; name: string }[]
  runtime: number
  budget: number
  revenue: number
  credits: {
    cast: {
      id: number
      name: string
      character: string
      profile_path: string | null
    }[]
    crew: {
      id: number
      name: string
      job: string
    }[]
  }
  images: {
    backdrops: {
      file_path: string
      width: number
      height: number
    }[]
    posters: {
      file_path: string
      width: number
      height: number
    }[]
  }
  trailer?: {
    key: string
    name: string
    site: string
    type: string
    official: boolean
  }
  tagline: string
  status: string
  spoken_languages: {
    english_name: string
    iso_639_1: string
    name: string
  }[]
  production_companies: {
    id: number
    logo_path: string | null
    name: string
    origin_country: string
  }[]
  production_countries: {
    iso_3166_1: string
    name: string
  }[]
  popularity: number
  backdrop_path: string
  homepage: string | null  // Add this property
}

interface MovieRecommendation {
  id: number
  title: string
  poster_path: string
  release_date: string
  vote_average: number
  reasoning?: string
}

export default function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [movie, setMovie] = useState<DetailedMovie | null>(null)
  const [recommendations, setRecommendations] = useState<MovieRecommendation[]>([])
  const [similarMovies, setSimilarMovies] = useState<MovieRecommendation[]>([])
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const similarScrollRef = useRef<HTMLDivElement>(null)  // Add new ref for similar movies
  const [isSaved, setIsSaved] = useState(false)
  const { data: session } = useSession()
  const [watchlistItems, setWatchlistItems] = useState<Set<number>>(new Set())
  const [usesAI, setUsesAI] = useState(true)

  const unwrappedParams = use(params)
  const movieId = unwrappedParams.id

  const { isInWatchlist, isLoading: watchlistLoading, toggleWatchlist } = useWatchlist(
    movie?.id || 0,
    'movie',
    movie?.title || '',
    movie?.poster_path || null
  );

  const scroll = (direction: 'left' | 'right', ref: React.RefObject<HTMLDivElement>) => {
    if (ref.current) {
      const scrollAmount = 800
      const newScrollPosition = ref.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount)
      ref.current.scrollTo({
        left: newScrollPosition,
        behavior: 'smooth'
      })
    }
  }

  const handleSaveMovie = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleWatchlist();
  };

  const handleGenreClick = (genreId: number, genreName: string) => {
    router.push(`/genre/${genreId}?type=movie&name=${encodeURIComponent(genreName)}`);
  };

  const fetchWatchlistStatus = async () => {
    try {
      const response = await fetch('/api/watchlist');
      if (response.ok) {
        const data = await response.json();
        const itemIds = new Set<number>(data
          .filter((item: { itemId: number }) => typeof item.itemId === 'number')
          .map((item: { itemId: number }) => item.itemId)
        );
        setWatchlistItems(itemIds);
      }
    } catch (error) {
      console.error('Error fetching watchlist status:', error);
    }
  };

  const handleWatchlistToggle = async (movie: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) {
      signIn();
      return;
    }
    
    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: movie.id,
          type: 'movie',
          title: movie.title,
          posterPath: movie.poster_path
        }),
      });

      if (response.ok) {
        setWatchlistItems(prev => {
          const newSet = new Set(prev);
          if (newSet.has(movie.id)) {
            newSet.delete(movie.id);
          } else {
            newSet.add(movie.id);
          }
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    }
  };

  const handleSimilarWatchlistToggle = async (movie: MovieRecommendation, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!session) {
      signIn();
      return;
    }
    
    try {
      const isInWatchlist = watchlistItems.has(movie.id);
      
      if (isInWatchlist) {
        const response = await fetch(`/api/watchlist?itemId=${movie.id}&type=movie`, {
          method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to remove from watchlist');
      } else {
        const response = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: movie.id,
            type: 'movie',
            title: movie.title,
            posterPath: movie.poster_path
          }),
        });
        if (!response.ok) throw new Error('Failed to add to watchlist');
      }

      // Update local state
      setWatchlistItems(prev => {
        const newSet = new Set(prev);
        if (isInWatchlist) {
          newSet.delete(movie.id);
        } else {
          newSet.add(movie.id);
        }
        return newSet;
      });
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    }
  };

  useEffect(() => {
    async function fetchMovieAndRelated() {
      try {
        // Fetch movie details
        const movieResponse = await fetch(`/api/movie/${movieId}`)
        if (!movieResponse.ok) throw new Error("Failed to fetch movie")
        const movieData = await movieResponse.json()
        setMovie(movieData)

        // Fetch recommendations from TMDB
        const recsResponse = await fetch(`/api/movie/${movieId}/recommendations`)
        if (!recsResponse.ok) throw new Error("Failed to fetch recommendations")
        const recsData = await recsResponse.json()
        setRecommendations(recsData.results.slice(0, 12))

        // Fetch AI-generated similar movies
        try {
          const aiSimilarResponse = await fetch(`/api/movie/${movieId}/ai-similar`)
          if (aiSimilarResponse.ok) {
            const aiSimilarData = await aiSimilarResponse.json()
            if (aiSimilarData.results && aiSimilarData.results.length > 0) {
              setSimilarMovies(aiSimilarData.results)
              setUsesAI(true)
              return
            }
          }
        } catch (aiError) {
          console.error("Error fetching AI similar movies:", aiError)
        }

        // Fallback to regular similar movies if AI fails
        const similarResponse = await fetch(`/api/movie/${movieId}/similar`)
        if (!similarResponse.ok) throw new Error("Failed to fetch similar movies")
        const similarData = await similarResponse.json()
        setSimilarMovies(similarData.results.slice(0, 12))
        setUsesAI(false)
      } catch (err) {
        setError("Failed to load movie details")
      } finally {
        setIsLoading(false)
      }
    }

    fetchMovieAndRelated()
    fetchWatchlistStatus();
  }, [movieId])

  const formatCurrency = (value: number | undefined | null) => {
    if (!value) return '$0'
    return `$${value.toLocaleString()}`
  }

  if (error) return <div className="p-4 text-center text-red-500">{error}</div>
  if (isLoading) {
    return <LoadingSpinner message="Loading movie details..." />
  }

  if (!movie) return <div className="p-4 text-center">Loading...</div>

  return (
    <PageWrapper>
      {movie && (
        <HistoryTracker
          itemId={movie.id}
          type="movie"
          title={movie.title}
          posterPath={movie.poster_path}
        />
      )}
      {/* Hero Section with Side Poster */}
      <div className="relative h-[80vh] w-full overflow-hidden rounded-3xl border-b border-gray-700/50">
        {/* Background Image */}
        <div className="absolute inset-0">
          <Image
            src={`https://image.tmdb.org/t/p/original${movie.backdrop_path}`}
            alt={movie.title}
            fill
            className="object-cover filter brightness-75"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/70 to-transparent" />
          <div className="absolute inset-0 bg-scan-lines opacity-10" />
        </div>

        {/* Content Container - Updated positioning */}
        <div className="relative h-full">
          <div className="container mx-auto h-full px-1">
            <div className="flex h-full items-center pb-8 gap-12"> {/* Changed items-end to items-center */}
              {/* Poster Section with Website Link and Save Button */}
              <div className="flex-shrink-0 hidden md:block flex flex-col">
                {/* Poster Image */}
                <div className="relative w-[370px] aspect-[2/3] rounded-xl overflow-hidden 
                            shadow-2xl border border-gray-700/50 transform translate-y-8 mb-4">
                  <Image
                    src={`https://image.tmdb.org/t/p/w780${movie.poster_path}`}
                    alt={movie.title}
                    fill
                    className="object-cover"
                    priority
                  />
                  {/* Save Button */}
                  <button
                    onClick={handleSaveMovie}
                    className="absolute top-4 right-4 p-2 rounded-full
                            bg-black/50 backdrop-blur-sm border border-gray-700/50
                            text-white hover:bg-black/70 hover:scale-110
                            transition-all duration-300 z-10"
                  >
                    <Bookmark 
                      className={`w-5 h-5 ${isInWatchlist ? 'fill-white' : ''}`} 
                    />
                  </button>
                  <FavoriteButton
                    itemId={movie.id}
                    type="movie"
                    title={movie.title}
                    posterPath={movie.poster_path}
                  />
                </div>

                {/* Official Website Link */}
                {movie.homepage && (
                  <div className="mt-6">
                    <a 
                      href={movie.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl
                              bg-gray-800/40 backdrop-blur-sm border border-gray-700/50
                              text-gray-300 hover:text-white hover:border-gray-600 transition-all duration-300"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Official Website</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Movie Info - Adjusted spacing */}
              <div className="flex-1 space-y-6 transform translate-y-8"> {/* Added transform translate-y-8 */}
                {movie.genres?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {movie.genres.map(genre => (
                      <button
                        key={genre.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenreClick(genre.id, genre.name);
                        }}
                        className="px-3 py-1 rounded-full bg-gray-800/50 backdrop-blur-sm 
                                  border border-gray-700/50 text-sm text-gray-300
                                  hover:bg-gray-700/50 hover:text-cyan-400 hover:border-cyan-400/50
                                  transition-all duration-300 cursor-pointer"
                      >
                        {genre.name}
                      </button>
                    ))}
                  </div>
                )}
                <h1 className="text-5xl lg:text-6xl font-bold text-white tracking-tight">
                  {movie.title}
                </h1>
                <div className="flex flex-wrap items-center gap-6 text-gray-300">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    <span>{movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span>{movie.runtime ? `${movie.runtime} min` : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span>{movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    <span>{movie.popularity ? `${Math.round(movie.popularity)} popularity` : 'N/A'}</span>
                  </div>
                </div>

                {/* Overview - Now with animate-pulse */}
                <div className="mt-8">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-6 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
                    <h2 className="text-lg font-semibold text-white">Overview</h2>
                  </div>
                  <p className="text-gray-300 text-lg leading-relaxed max-w-3xl mb-8">
                    {movie.overview}
                  </p>

                  {/* Budget and Revenue Section */}
                  <div className="grid grid-cols-2 gap-4 max-w-xl">
                    <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50">
                      <h3 className="text-gray-400 text-sm mb-1">Budget</h3>
                      <p className="text-gray-100 font-semibold text-lg">
                        {formatCurrency(movie.budget)}
                      </p>
                    </div>
                    <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50">
                      <h3 className="text-gray-400 text-sm mb-1">Revenue</h3>
                      <p className="text-gray-100 font-semibold text-lg">
                        {formatCurrency(movie.revenue)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3  mt-8">
        {/* Left Column - Only Mobile Poster */}
        <Section>
          <div className="space-y-6">
            {/* Show poster only on mobile */}
            <div className="md:hidden relative aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border border-gray-700/50">
              <Image
                src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                alt={movie.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          </div>
        </Section>

        {/* Main Content Column */}
        <div className="lg:col-span-3 space-y-8">
          {/* Tagline */}
          {movie.tagline && (
            <p className="text-2xl text-gray-400 italic text-center mb-12">"{movie.tagline}"</p>
          )}

          {/* Content Sections Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Section - Additional Details */}
            <div className="space-y-8">
              <div className="bg-gray-800/30 rounded-3xl border border-gray-700/50 p-6
                          shadow-[0_0_50px_-12px] shadow-cyan-500/10">
                <div className="flex items-center gap-3 mb-6">
                  <div/>
                  <h2 className="text-2xl font-bold text-white tracking-wider"></h2>
                </div>
                
                {/* Additional Details Content */}
                <Section title="Additional Details">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Status */}
                    <div className="space-y-2">
                      <h3 className="text-gray-400 text-sm">Status</h3>
                      <p className="text-gray-100">{movie.status}</p>
                    </div>

                    {/* Languages */}
                    <div className="space-y-2">
                      <h3 className="text-gray-400 text-sm">Spoken Languages</h3>
                      <div className="flex flex-wrap gap-2">
                        {movie.spoken_languages.map((lang) => (
                          <span
                            key={lang.iso_639_1}
                            className="px-2 py-1 bg-gray-800/50 rounded-lg text-sm text-gray-300"
                          >
                            {lang.english_name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Production Companies */}
                    <div className="space-y-2 md:col-span-2">
                      <h3 className="text-gray-400 text-sm">Production Companies</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {movie.production_companies.map((company) => (
                          <div
                            key={company.id}
                            className="flex items-center gap-2 bg-gray-800/30 rounded-xl p-3"
                          >
                            {company.logo_path ? (
                              <Image
                                src={`https://image.tmdb.org/t/p/w92${company.logo_path}`}
                                alt={company.name}
                                width={60}
                                height={30}
                                className="object-contain"
                              />
                            ) : (
                              <div className="w-[60px] h-[30px] bg-gray-700/50 rounded flex items-center justify-center">
                                <span className="text-xs text-gray-400">No logo</span>
                              </div>
                            )}
                            <div className="flex-1">
                              <p className="text-sm text-gray-100">{company.name}</p>
                              <p className="text-xs text-gray-400">{company.origin_country}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Production Countries */}
                    <div className="space-y-2">
                      <h3 className="text-gray-400 text-sm">Production Countries</h3>
                      <div className="flex flex-wrap gap-2">
                        {movie.production_countries.map((country) => (
                          <span
                            key={country.iso_3166_1}
                            className="px-2 py-1 bg-gray-800/50 rounded-lg text-sm text-gray-300"
                          >
                            {country.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </Section>
              </div>
            </div>

            {/* Right Section - Trailer */}
            <div className="space-y-8">
              <div className="bg-gray-800/30 rounded-3xl border border-gray-700/50 p-6
                          shadow-[0_0_50px_-12px] shadow-cyan-500/10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
                  <h2 className="text-2xl font-bold text-white tracking-wider">TRAILER</h2>
                </div>
                
                {/* Trailer Content */}
                {movieId && (
                  <MovieTrailer 
                    movieId={movieId} 
                    initialTrailerKey={movie?.trailer?.key} 
                  />
                )}
              </div>
            </div>
          </div>

          {/* Top Cast Section - Full Width with Updated Grid */}
          {movie.credits?.cast && movie.credits.cast.length > 0 && (
            <div className="bg-gray-800/30 rounded-3xl border border-gray-700/50 p-6
                        shadow-[0_0_50px_-12px] shadow-cyan-500/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
                <h2 className="text-2xl font-bold text-white tracking-wider">TOP CAST</h2>
              </div>
              
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                {movie.credits?.cast.slice(0, 8).map((person) => (
                  <div
                    key={person.id}
                    className="group cursor-pointer"
                    onClick={() => router.push(`/actor/${person.id}`)}
                  >
                    <div className="relative aspect-square rounded-full overflow-hidden mb-2 
                                transform group-hover:scale-105 transition-all duration-300 
                                border-2 border-gray-700/50 hover:border-cyan-500/50">
                      <Image
                        src={person.profile_path 
                          ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
                          : '/placeholder-avatar.png'
                        }
                        alt={person.name}
                        fill
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                                  opacity-0 group-hover:opacity-100 transition-all duration-500" />
                    </div>
                    <h3 className="font-medium text-center text-gray-100 text-xs group-hover:text-cyan-400 transition-colors truncate">
                      {person.name}
                    </h3>
                    <p className="text-cyan-400 text-xs text-center mt-1 opacity-0 group-hover:opacity-100 transition-all">
                      {person.character}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Similar Movies Section */}
      {similarMovies.length > 0 && (
        <div className="relative -mx-8 px-8 py-12 bg-gray-800/30 backdrop-blur-xl border-y border-gray-700/50">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
              <h2 className="text-2xl font-bold text-white tracking-wider">SIMILAR MOVIES</h2>
            </div>
            {usesAI && (
              <div className="flex items-center gap-2 px-3 py-1 bg-cyan-500/10 rounded-full">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="text-sm text-cyan-400">AI-Powered</span>
              </div>
            )}
          </div>

          <div className="relative group">
            <button 
              onClick={() => scroll('left', similarScrollRef)}
              className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 
                        text-white p-3 rounded-full opacity-0 group-hover:opacity-100 
                        transition-opacity duration-300 backdrop-blur-sm"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            <button 
              onClick={() => scroll('right', similarScrollRef)}
              className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 
                        text-white p-3 rounded-full opacity-0 group-hover:opacity-100 
                        transition-opacity duration-300 backdrop-blur-sm"
            >
              <ChevronRight className="w-8 h-8" />
            </button>

            <div 
              ref={similarScrollRef}
              className="flex space-x-6 overflow-x-auto scrollbar-hide scroll-smooth pb-4"
            >
              {similarMovies.map((movie) => (
                <div
                  key={movie.id}
                  className="flex-none w-[180px] group/item cursor-pointer"
                  onClick={() => router.push(`/movie/${movie.id}`)}
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-3 
                              transform group-hover/item:scale-105 transition-all duration-300 
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
                    <button
                      onClick={(e) => handleSimilarWatchlistToggle(movie, e)}
                      className="absolute top-2 right-2 p-2 rounded-full
                                bg-black/50 backdrop-blur-sm border border-gray-700/50
                                text-white hover:bg-black/70 hover:scale-110
                                transition-all duration-300 z-10"
                    >
                      <Bookmark 
                        className={`w-4 h-4 ${watchlistItems.has(movie.id) ? 'fill-white' : ''}`} 
                      />
                    </button>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                                opacity-0 group-hover/item:opacity-100 transition-all duration-500">
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="text-cyan-400 text-sm">
                          ★ {movie.vote_average.toFixed(1)}
                        </p>
                        {movie.reasoning && (
                          <p className="text-xs text-gray-300 mt-1 line-clamp-3">
                            {movie.reasoning}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <h3 className="font-medium text-gray-100 text-sm group-hover/item:text-cyan-400 transition-colors">
                    {movie.title}
                  </h3>
                  <p className="text-gray-400 text-xs">
                    {movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* You Might Also Like Section */}
      {recommendations.length > 0 && (
        <div className="relative -mx-8 px-8 py-12 bg-gray-800/30 backdrop-blur-xl border-y border-gray-700/50">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
            <h2 className="text-2xl font-bold text-white tracking-wider">YOU MIGHT ALSO LIKE</h2>
          </div>

          <div className="relative group">
            <button 
              onClick={() => scroll('left', scrollContainerRef)}
              className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 
                        text-white p-3 rounded-full opacity-0 group-hover:opacity-100 
                        transition-opacity duration-300 backdrop-blur-sm"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            <button 
              onClick={() => scroll('right', scrollContainerRef)}
              className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 
                        text-white p-3 rounded-full opacity-0 group-hover:opacity-100 
                        transition-opacity duration-300 backdrop-blur-sm"
            >
              <ChevronRight className="w-8 h-8" />
            </button>

            <div 
              ref={scrollContainerRef}
              className="flex space-x-6 overflow-x-auto scrollbar-hide scroll-smooth pb-4"
            >
              {recommendations.map((movie) => (
                <div
                  key={movie.id}
                  className="flex-none w-[180px] group/item cursor-pointer"
                  onClick={() => router.push(`/movie/${movie.id}`)}
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-3 
                              transform group-hover/item:scale-105 transition-all duration-300 
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
                    <button
                      onClick={(e) => handleSimilarWatchlistToggle(movie, e)}
                      className="absolute top-2 right-2 p-2 rounded-full
                                bg-black/50 backdrop-blur-sm border border-gray-700/50
                                text-white hover:bg-black/70 hover:scale-110
                                transition-all duration-300 z-10"
                    >
                      <Bookmark 
                        className={`w-4 h-4 ${watchlistItems.has(movie.id) ? 'fill-white' : ''}`} 
                      />
                    </button>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                                opacity-0 group-hover/item:opacity-100 transition-all duration-500">
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="text-cyan-400 text-sm">
                          ★ {movie.vote_average.toFixed(1)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <h3 className="font-medium text-gray-100 text-sm group-hover/item:text-cyan-400 transition-colors">
                    {movie.title}
                  </h3>
                  <p className="text-gray-400 text-xs">
                    {new Date(movie.release_date).getFullYear()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Back Button */}
      <div className="mt-8 flex justify-center">
        <button 
          onClick={() => router.back()} 
          className="px-8 py-3 rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 
                  text-gray-300 hover:text-white hover:border-gray-600 transition-all duration-300"
        >
          Back to Browse
        </button>
      </div>
    </PageWrapper>
  )
}
