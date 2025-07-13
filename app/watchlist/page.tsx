'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Bookmark, Film, ChevronDown, LayoutGrid, List, MenuSquare, ArrowUpDown, ArrowDownUp, Search, Star, Calendar, Clock, Tv2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import PageWrapper from '@/components/PageWrapper'
import { AuthCheck } from '@/components/AuthCheck'
import { DetailedItemCard } from '@/components/DetailedItemCard'
import { CompactItemCard } from '@/components/CompactItemCard'
import { GridItemCard } from '@/components/GridItemCard'

interface WatchlistItem {
  _id: string
  itemId: number
  userId: string
  title: string
  type: 'movie' | 'tv'
  posterPath: string
  addedAt: string
  releaseDate?: string
  popularity?: number
  runtime?: number
  overview?: string
  voteAverage?: number
  genres?: string[]
}

interface SortOption {
  label: string
  value: string
}

const sortOptions: SortOption[] = [
  { label: 'List order', value: 'order' },
  { label: 'Alphabetical', value: 'title' },
  { label: 'Popularity', value: 'popularity' },
  { label: 'Rating', value: 'vote_average' },
  { label: 'Release date', value: 'release_date' },
  { label: 'Runtime', value: 'runtime' },
  { label: 'Date added', value: 'added_date' },
]

type ViewMode = 'grid' | 'detailed' | 'compact'

const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return isNaN(date.getTime()) 
    ? 'N/A' 
    : date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
};

export default function WatchlistPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<string>('added_date')
  const [isAscending, setIsAscending] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')

  useEffect(() => {
    async function fetchWatchlist() {
      try {
        setIsLoading(true)
        // Try to use the enhanced API first, fall back to the basic API if it fails
        let response = await fetch('/api/watchlist/enhanced-details')
        
        // If enhanced details fail, fall back to basic watchlist
        if (!response.ok) {
          console.warn('Enhanced details API failed, falling back to basic watchlist')
          response = await fetch('/api/watchlist')
          if (!response.ok) throw new Error('Failed to fetch watchlist')
        }
        
        const data = await response.json()
        
        // Transform the data if needed to match the expected format
        const formattedData = data.map((item: any) => ({
          ...item,
          addedAt: item.addedAt || item.createdAt, // Handle both formats
        }))
        
        setItems(formattedData)
      } catch (error) {
        console.error('Error:', error)
        setError('Failed to load watchlist')
        toast.error('Failed to load watchlist. Please try again later.')
      } finally {
        setIsLoading(false)
      }
    }

    if (session?.user?.email) {
      fetchWatchlist()
    }
  }, [session?.user?.email])

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus search with Ctrl+F or Cmd+F
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        document.getElementById('watchlist-search')?.focus()
      }
      
      // Clear search with Escape when search is focused
      if (e.key === 'Escape' && document.activeElement === document.getElementById('watchlist-search')) {
        if (searchQuery) {
          e.preventDefault()
          setSearchQuery('')
        } else {
          document.getElementById('watchlist-search')?.blur()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [searchQuery])

  const removeFromWatchlist = async (itemId: number, type: string) => {
    try {
      const response = await fetch(`/api/watchlist?itemId=${itemId}&type=${type}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to remove from watchlist')
      setItems(prev => prev.filter(item => item.itemId !== itemId))
    } catch (error) {
      console.error('Error removing from watchlist:', error)
    }
  }

  const sortItems = (items: WatchlistItem[]) => {
    // First filter by search query
    const filteredItems = debouncedSearchQuery
      ? items.filter(item => 
          item.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
      : items
    
    // Then sort the filtered items
    return [...filteredItems].sort((a, b) => {
      const direction = isAscending ? 1 : -1
      
      switch (sortBy) {
        case 'title':
          return direction * a.title.localeCompare(b.title)
          
        case 'popularity':
          return direction * ((a.popularity || 0) - (b.popularity || 0))
          
        case 'vote_average':
          return direction * ((a.voteAverage || 0) - (b.voteAverage || 0))
          
        case 'release_date':
          const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
          const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
          return direction * (dateA - dateB)
          
        case 'runtime':
          return direction * ((a.runtime || 0) - (b.runtime || 0))
          
        case 'added_date':
          return direction * (
            new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
          )
          
        case 'order':
        default:
          return direction * (
            new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
          )
      }
    })
  }

  const sortedItems = sortItems(items)

  return (
    <PageWrapper>
      <AuthCheck>
        <div className="space-y-8">
          {isLoading ? (
            <LoadingSpinner />
          ) : error ? (
            <div className="text-red-500 text-center">{error}</div>
          ) : (
            <div className="container mx-auto px-4 py-8">
              <div className="flex flex-col gap-6 mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
                  <h1 className="text-2xl font-bold text-white tracking-wider">MY WATCHLIST</h1>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {/* Search Bar */}
                  <div className="relative w-full max-w-md group mr-auto">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      {debouncedSearchQuery ? (
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          className="w-5 h-5 text-cyan-400 transition-colors duration-200"
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                      ) : (
                        <Search className="w-5 h-5 text-gray-400 group-focus-within:text-cyan-400 transition-colors duration-200" />
                      )}
                    </div>
                    <input
                      id="watchlist-search"
                      type="text"
                      placeholder="Search your watchlist... (Ctrl+F)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-400 
                      focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent 
                      transition-all duration-200 ease-in-out
                      ${debouncedSearchQuery ? 'ring-2 ring-cyan-500/50 border-transparent' : ''}`}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors duration-200"
                      >
                        <span className="sr-only">Clear search</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3 bg-gray-800/20 p-2 rounded-xl">
                    {/* Sort Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-800/70 rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        <span className="text-gray-200">Sort by: {sortOptions.find(opt => opt.value === sortBy)?.label}</span>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </button>
                      {isFilterOpen && (
                        <div className="absolute top-full left-0 mt-2 w-48 py-2 bg-gray-800 rounded-lg border border-gray-700/50 shadow-xl z-10">
                          {sortOptions.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setSortBy(option.value)
                                setIsFilterOpen(false)
                                toast.success(`Sorted by ${option.label}`)
                              }}
                              className={`w-full px-4 py-2 text-left hover:bg-gray-700/50 transition-colors
                                ${sortBy === option.value ? 'text-cyan-400' : 'text-gray-300'}`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sort Order Toggle */}
                    <button
                      onClick={() => {
                        setIsAscending(!isAscending)
                        toast.success(isAscending ? "Sorted descending" : "Sorted ascending")
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                        ${isAscending 
                          ? 'bg-cyan-500/20 text-cyan-400' 
                          : 'bg-gray-800/70 text-gray-300 hover:bg-gray-700'}`}
                    >
                      {isAscending 
                        ? <ArrowDownUp className="w-4 h-4" /> 
                        : <ArrowUpDown className="w-4 h-4" />}
                      <span>{isAscending ? 'Ascending' : 'Descending'}</span>
                    </button>

                    {/* View Mode Toggles */}
                    <div className="flex items-center bg-gray-800/70 rounded-lg border border-gray-700/50 ml-2">
                      <button
                        onClick={() => {
                          setViewMode('grid')
                          toast.success("Grid view activated")
                        }}
                        className={`p-2 rounded-l-lg transition-colors
                          ${viewMode === 'grid' 
                            ? 'bg-cyan-500/20 text-cyan-400' 
                            : 'text-gray-400 hover:bg-gray-700/50'}`}
                      >
                        <LayoutGrid className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setViewMode('detailed')
                          toast.success("Detailed view activated")
                        }}
                        className={`p-2 transition-colors
                          ${viewMode === 'detailed' 
                            ? 'bg-cyan-500/20 text-cyan-400' 
                            : 'text-gray-400 hover:bg-gray-700/50'}`}
                      >
                        <MenuSquare className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setViewMode('compact')
                          toast.success("Compact view activated")
                        }}
                        className={`p-2 rounded-r-lg transition-colors
                          ${viewMode === 'compact' 
                            ? 'bg-cyan-500/20 text-cyan-400' 
                            : 'text-gray-400 hover:bg-gray-700/50'}`}
                      >
                        <List className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                    
                  {/* Results Count */}
                  {searchQuery && (
                    <div className="text-gray-300 text-sm ml-2">
                      <span>{sortedItems.length} result{sortedItems.length !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-12 bg-gray-800/30 rounded-3xl border border-gray-700/50">
                  <Bookmark className="w-12 h-12 mx-auto text-cyan-500 mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">Your Watchlist is Empty</h3>
                  <p className="text-gray-400 mb-4">Start adding movies and TV shows you want to watch later</p>
                  <button
                    onClick={() => router.push('/')}
                    className="px-6 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
                  >
                    Browse Content
                  </button>
                </div>
              ) : sortedItems.length === 0 ? (
                <div className="text-center py-12 bg-gray-800/30 rounded-3xl border border-gray-700/50">
                  <Search className="w-12 h-12 mx-auto text-cyan-500 mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">No Results Found</h3>
                  <p className="text-gray-400 mb-4">Try adjusting your search query</p>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-6 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              ) : (
                <div className={`
                  ${viewMode === 'grid' && 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6'}
                  ${viewMode === 'detailed' && 'flex flex-col gap-6'}
                  ${viewMode === 'compact' && 'flex flex-col gap-2'}
                `}>
                  {sortedItems.map((item) => (
                    <div
                      key={item._id}
                    >
                      {/* Grid View */}
                      {viewMode === 'grid' ? (
                        <GridItemCard
                          item={item}
                          onRemove={removeFromWatchlist}
                        />
                      ) : viewMode === 'detailed' ? (
                        <DetailedItemCard 
                          item={item} 
                          onRemove={removeFromWatchlist}
                        />
                      ) : (
                        <CompactItemCard 
                          item={item} 
                          onRemove={removeFromWatchlist}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </AuthCheck>
    </PageWrapper>
  )
}
