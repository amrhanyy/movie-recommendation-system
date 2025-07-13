'use client'

import React, { Suspense, use } from 'react'
import { useRouter } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import Image from "next/image"
import { Calendar, Star, TrendingUp, ExternalLink, ChevronLeft, ChevronRight, Bookmark } from 'lucide-react'
import PageWrapper from '../../../components/PageWrapper'  // Standard import
import TVShowTrailer from '../../../components/TVShowTrailer'
import { useWatchlist } from '../../../hooks/useWatchlist'
import { HistoryTracker } from '../../../components/HistoryTracker'
import { FavoriteButton } from '../../../components/FavoriteButton'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { useSession, signIn } from 'next-auth/react'

interface TVShow {
  id: number
  name: string
  first_air_date: string
  vote_average: number
  overview: string
  poster_path: string
  backdrop_path: string
  number_of_seasons: number
  number_of_episodes: number
  status: string
  genres: { id: number; name: string }[]
  popularity: number
  homepage: string | null
  tagline: string
  credits: {
    cast: {
      id: number
      name: string
      character: string
      profile_path: string | null
    }[]
  }
  similar_shows?: {
    results: {
      id: number
      name: string
      poster_path: string
      vote_average: number
      first_air_date: string
    }[]
  }
  recommendations?: {
    results: {
      id: number
      name: string
      poster_path: string
      vote_average: number
      first_air_date: string
    }[]
  }
  languages: string[]
  networks: {
    id: number
    name: string
    logo_path: string
  }[]
  in_production: boolean
  type: string
  origin_country: string[]
  original_language: string
  videos: {
    results: {
      key: string
      name: string
      site: string
      type: string
    }[]
  }
}

export default function TVShowPage({ params }: { params: any }) {
  // Unwrap params with React.use()
  const unwrappedParams = use(params) as { id: string };
  const tvShowId = unwrappedParams.id;
  
  const router = useRouter()
  const [show, setShow] = useState<TVShow | null>(null)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [similarShows, setSimilarShows] = useState<TVShow[]>([])
  const [recommendations, setRecommendations] = useState<TVShow[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const similarScrollRef = useRef<HTMLDivElement>(null)
  const { data: session, status } = useSession()
  const [watchlistItems, setWatchlistItems] = useState<Set<number>>(new Set())

  const handleWatchlistToggle = async (show: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) {
      signIn();
      return;
    }

    try {
      const isInWatchlist = watchlistItems.has(show.id);
      
      if (isInWatchlist) {
        // If it's in watchlist, remove it
        const response = await fetch(`/api/watchlist?itemId=${show.id}&type=tv`, {
          method: 'DELETE',
          credentials: 'same-origin'
        });
        
        if (response.status === 401) {
          signIn();
          return;
        }
        
        if (!response.ok) throw new Error('Failed to remove from watchlist');
      } else {
        // If it's not in watchlist, add it
        const response = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: show.id,
            type: 'tv',
            title: show.name,
            posterPath: show.poster_path
          }),
          credentials: 'same-origin'
        });
        
        if (response.status === 401) {
          signIn();
          return;
        }
        
        if (!response.ok) throw new Error('Failed to add to watchlist');
      }

      // Update local state
      setWatchlistItems((prev) => {
        const newSet = new Set(prev);
        if (isInWatchlist) {
          newSet.delete(show.id);
        } else {
          newSet.add(show.id);
        }
        return newSet;
      });
    } catch (error) {
      console.error('Error updating watchlist:', error);
    }
  };

  const handleSimilarWatchlistToggle = async (show: any, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!session) {
      signIn();
      return;
    }
    
    try {
      const isInWatchlist = watchlistItems.has(show.id);
      
      if (isInWatchlist) {
        const response = await fetch(`/api/watchlist?itemId=${show.id}&type=tv`, {
          method: 'DELETE',
          credentials: 'same-origin'
        });
        
        if (response.status === 401) {
          signIn();
          return;
        }
        
        if (!response.ok) throw new Error('Failed to remove from watchlist');
      } else {
        const response = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: show.id,
            type: 'tv',
            title: show.name,
            posterPath: show.poster_path
          }),
          credentials: 'same-origin'
        });
        
        if (response.status === 401) {
          signIn();
          return;
        }
        
        if (!response.ok) throw new Error('Failed to add to watchlist');
      }

      // Update local state
      setWatchlistItems(prev => {
        const newSet = new Set(prev);
        if (isInWatchlist) {
          newSet.delete(show.id);
        } else {
          newSet.add(show.id);
        }
        return newSet;
      });
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    }
  };

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

  const handleGenreClick = (genreId: number, genreName: string) => {
    router.push(`/genre/${genreId}?type=tv&name=${encodeURIComponent(genreName)}`);
  };

  useEffect(() => {
    async function fetchShow() {
      if (!tvShowId) return; // Don't fetch if we don't have an ID yet
      
      try {
        const [showRes, similarRes, recsRes] = await Promise.all([
          fetch(`/api/tv/${tvShowId}`),
          fetch(`/api/tv/${tvShowId}/similar`),
          fetch(`/api/tv/${tvShowId}/recommendations`)
        ])

        if (!showRes.ok) throw new Error('Failed to fetch TV show')
        
        const [showData, similarData, recsData] = await Promise.all([
          showRes.json(),
          similarRes.json(),
          recsRes.json()
        ])

        setShow(showData)
        setSimilarShows(similarData.results?.slice(0, 12) || [])
        setRecommendations(recsData.results?.slice(0, 12) || [])
      } catch (err) {
        setError("Failed to load show details")
      } finally {
        setIsLoading(false)
      }
    }

    fetchShow()
  }, [tvShowId])

  useEffect(() => {
    async function fetchWatchlistStatus() {
      if (status === 'loading') return;
      
      if (!session) {
        setWatchlistItems(new Set());
        return;
      }
      
      try {
        const response = await fetch('/api/watchlist', {
          credentials: 'same-origin'
        });
        
        if (response.status === 401) {
          console.log('User not authenticated for watchlist');
          return;
        }
        
        if (response.ok) {
          const data = await response.json();
          const itemIds = new Set(
            data
              .filter((item: { itemId: number; type: string }) => 
                item.type === 'tv' && typeof item.itemId === 'number'
              )
              .map((item: { itemId: number }) => item.itemId)
          ) as Set<number>;
          setWatchlistItems(itemIds);
        }
      } catch (error) {
        console.error('Error fetching watchlist status:', error);
      }
    }

    fetchWatchlistStatus();
  }, [session, status]);

  if (isLoading) {
    return <LoadingSpinner message="Loading TV show details..." />
  }

  if (error) return <div className="text-center text-red-500 p-4">{error}</div>
  if (!show) return <div className="text-center p-4">Loading...</div>

  return (
    <PageWrapper>
      {show && (
        <HistoryTracker
          itemId={show.id}
          type="tv"
          title={show.name}
          posterPath={show.poster_path}
        />
      )}
      {/* Hero Section */}
      <div className="relative h-[80vh] w-full overflow-hidden rounded-3xl border-b border-gray-700/50">
        {/* Background Image */}
        <div className="absolute inset-0">
          <Image
            src={`https://image.tmdb.org/t/p/original${show.backdrop_path}`}
            alt={show.name}
            fill
            className="object-cover filter brightness-75"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/70 to-transparent" />
          <div className="absolute inset-0 bg-scan-lines opacity-10" />
        </div>

        {/* Content Container */}
        <div className="relative h-full">
          <div className="container mx-auto h-full px-1">
            <div className="flex h-full items-center pb-8 gap-12">
              {/* Poster Section */}
              <div className="flex-shrink-0 hidden md:block">
                <div className="relative w-[370px] aspect-[2/3] rounded-xl overflow-hidden 
                            shadow-2xl border border-gray-700/50 transform translate-y-8">
                  <Image
                    src={`https://image.tmdb.org/t/p/w780${show.poster_path}`}
                    alt={show.name}
                    fill
                    className="object-cover"
                    priority
                  />
                  {/* Save Button */}
                  <button
                    onClick={(e) => handleWatchlistToggle(show, e)}
                    className="absolute top-4 right-4 p-2 rounded-full
                            bg-black/50 backdrop-blur-sm border border-gray-700/50
                            text-white hover:bg-black/70 hover:scale-110
                            transition-all duration-300 z-10"
                  >
                    <Bookmark 
                      className={`w-5 h-5 ${watchlistItems.has(show.id) ? 'fill-white' : ''}`}
                    />
                  </button>
                  <FavoriteButton
                    itemId={show.id}
                    type="tv"
                    title={show.name}
                    posterPath={show.poster_path}
                  />
                </div>
                {show.homepage && (
                  <a 
                    href={show.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl
                            bg-gray-800/40 backdrop-blur-sm border border-gray-700/50
                            text-gray-300 hover:text-white hover:border-gray-600 transition-all duration-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Official Website</span>
                  </a>
                )}
              </div>

              {/* Show Info */}
              <div className="flex-1 space-y-6 transform translate-y-8">
                {show.genres?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {show.genres.map(genre => (
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
                  {show.name}
                </h1>
                <div className="flex flex-wrap items-center gap-6 text-gray-300">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    <span>{show.first_air_date ? new Date(show.first_air_date).getFullYear() : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span>{show.vote_average ? show.vote_average.toFixed(1) : 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    <span>{show.popularity ? `${Math.round(show.popularity)} popularity` : 'N/A'}</span>
                  </div>
                </div>

                {/* Overview */}
                <div className="mt-8">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1 h-6 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
                    <h2 className="text-lg font-semibold text-white">Overview</h2>
                  </div>
                  <p className="text-gray-300 text-lg leading-relaxed max-w-3xl mb-8">
                    {show.overview}
                  </p>

                  {/* Show Details Grid */}
                  <div className="grid grid-cols-2 gap-4 max-w-xl">
                    <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50">
                      <h3 className="text-gray-400 text-sm mb-1">Seasons</h3>
                      <p className="text-gray-100 font-semibold text-lg">
                        {show.number_of_seasons}
                      </p>
                    </div>
                    <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50">
                      <h3 className="text-gray-400 text-sm mb-1">Episodes</h3>
                      <p className="text-gray-100 font-semibold text-lg">
                        {show.number_of_episodes}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Column */}
      <div className="lg:col-span-3 space-y-8">
        {/* Tagline */}
        {show.tagline && (
          <p className="text-2xl text-gray-400 italic text-center mb-12">"{show.tagline}"</p>
        )}

        {/* Content Sections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
          {/* Left Section - Additional Details */}
          <div className="space-y-8">
            <div className="bg-gray-800/30 rounded-3xl border border-gray-700/50 p-6
                        shadow-[0_0_50px_-12px] shadow-cyan-500/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
                <h2 className="text-2xl font-bold text-white tracking-wider">ADDITIONAL DETAILS</h2>
              </div>
              
              <div className="grid grid-cols-1 gap-6">
                {/* Status */}
                <div className="space-y-2">
                  <h3 className="text-gray-400 text-sm">Status</h3>
                  <p className="text-gray-100">
                    {show.status} {show.in_production && '(In Production)'}
                  </p>
                </div>

                {/* Type */}
                <div className="space-y-2">
                  <h3 className="text-gray-400 text-sm">Type</h3>
                  <p className="text-gray-100">{show.type}</p>
                </div>

                {/* Languages */}
                <div className="space-y-2">
                  <h3 className="text-gray-400 text-sm">Languages</h3>
                  <div className="flex flex-wrap gap-2">
                    {show.languages?.map((lang) => (
                      <span
                        key={lang}
                        className="px-2 py-1 bg-gray-800/50 rounded-lg text-sm text-gray-300"
                      >
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Origin Countries */}
                <div className="space-y-2">
                  <h3 className="text-gray-400 text-sm">Origin Countries</h3>
                  <div className="flex flex-wrap gap-2">
                    {show.origin_country?.map((country) => (
                      <span
                        key={country}
                        className="px-2 py-1 bg-gray-800/50 rounded-lg text-sm text-gray-300"
                      >
                        {country}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Networks */}
                {show.networks && show.networks.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-gray-400 text-sm">Networks</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {show.networks.map((network) => (
                        <div
                          key={network.id}
                          className="flex items-center gap-2 bg-gray-800/30 rounded-xl p-3"
                        >
                          {network.logo_path ? (
                            <Image
                              src={`https://image.tmdb.org/t/p/w92${network.logo_path}`}
                              alt={network.name}
                              width={60}
                              height={30}
                              className="object-contain"
                            />
                          ) : (
                            <div className="w-[60px] h-[30px] bg-gray-700/50 rounded flex items-center justify-center">
                              <span className="text-xs text-gray-400">No logo</span>
                            </div>
                          )}
                          <p className="text-sm text-gray-100">{network.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
              
              <TVShowTrailer 
                tvShowId={tvShowId} 
                initialTrailerKey={show.videos?.results.find(v => 
                  v.type === "Trailer" && v.site === "YouTube"
                )?.key} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Cast Section */}
      {show.credits?.cast && show.credits.cast.length > 0 && (
        <div className="mt-8 bg-gray-800/30 rounded-3xl border border-gray-700/50 p-6
                    shadow-[0_0_50px_-12px] shadow-cyan-500/10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
            <h2 className="text-2xl font-bold text-white tracking-wider">TOP CAST</h2>
          </div>
          
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
            {show.credits.cast.slice(0, 8).map((person) => (
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

      {/* Similar TV Shows Section */}
      {similarShows.length > 0 && (
        <div className="relative -mx-8 px-8 py-12 bg-gray-800/30 backdrop-blur-xl border-y border-gray-700/50">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
            <h2 className="text-2xl font-bold text-white tracking-wider">SIMILAR TV SHOWS</h2>
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
              {similarShows.map((show) => (
                <div
                  key={show.id}
                  className="flex-none w-[180px] group/item cursor-pointer"
                  onClick={() => router.push(`/tv/${show.id}`)}
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-3 
                              transform group-hover/item:scale-105 transition-all duration-300 
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
                    <button
                      onClick={(e) => handleSimilarWatchlistToggle(show, e)}
                      className="absolute top-2 right-2 p-2 rounded-full
                                bg-black/50 backdrop-blur-sm border border-gray-700/50
                                text-white hover:bg-black/70 hover:scale-110
                                transition-all duration-300 z-10"
                    >
                      <Bookmark
                        className={`w-4 h-4 ${watchlistItems.has(show.id) ? 'fill-white' : ''}`}
                      />
                    </button>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                                opacity-0 group-hover/item:opacity-100 transition-all duration-500">
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="text-cyan-400 text-sm">
                          ★ {show.vote_average.toFixed(1)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <h3 className="font-medium text-gray-100 text-sm group-hover/item:text-cyan-400 transition-colors">
                    {show.name}
                  </h3>
                  <p className="text-gray-400 text-xs">
                    {show.first_air_date ? new Date(show.first_air_date).getFullYear() : 'N/A'}
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
              {recommendations.map((show) => (
                <div
                  key={show.id}
                  className="flex-none w-[180px] group/item cursor-pointer"
                  onClick={() => router.push(`/tv/${show.id}`)}
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-3 
                              transform group-hover/item:scale-105 transition-all duration-300 
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
                    <button
                      onClick={(e) => handleSimilarWatchlistToggle(show, e)}
                      className="absolute top-2 right-2 p-2 rounded-full
                                bg-black/50 backdrop-blur-sm border border-gray-700/50
                                text-white hover:bg-black/70 hover:scale-110
                                transition-all duration-300 z-10"
                    >
                      <Bookmark
                        className={`w-4 h-4 ${watchlistItems.has(show.id) ? 'fill-white' : ''}`}
                      />
                    </button>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                                opacity-0 group-hover/item:opacity-100 transition-all duration-500">
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="text-cyan-400 text-sm">
                          ★ {show.vote_average.toFixed(1)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <h3 className="font-medium text-gray-100 text-sm group-hover/item:text-cyan-400 transition-colors">
                    {show.name}
                  </h3>
                  <p className="text-gray-400 text-xs">
                    {show.first_air_date ? new Date(show.first_air_date).getFullYear() : 'N/A'}
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