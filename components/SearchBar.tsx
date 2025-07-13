'use client'

import React, { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useDebounce } from '@/hooks/useDebounce'
import Image from 'next/image'
import { Search, Loader2, Film, Tv, X, Clock, TrendingUp, Star } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

interface MediaItem {
  id: number;
  title?: string;
  name?: string;
  media_type: 'movie' | 'tv';
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
}

const RECENT_SEARCHES_KEY = 'recent_searches';

export function SearchBar() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<MediaItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [recentSearches, setRecentSearches] = useState<MediaItem[]>([])
  const [trendingSuggestions, setTrendingSuggestions] = useState<MediaItem[]>([])
  const debouncedQuery = useDebounce(query, 300)
  const router = useRouter()
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { t } = useLanguage()

  // Load recent searches from localStorage on mount
  useEffect(() => {
    const storedSearches = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (storedSearches) {
      try {
        setRecentSearches(JSON.parse(storedSearches));
      } catch (e) {
        console.error('Failed to parse recent searches', e);
      }
    }
    
    // Fetch trending items for empty state suggestions
    fetch('/api/trending?limit=3')
      .then(res => res.json())
      .then(data => {
        setTrendingSuggestions(data.results.slice(0, 3));
      })
      .catch(err => console.error('Failed to fetch trending suggestions', err));
  }, []);

  // Add hotkey (/ key) to focus search
  useEffect(() => {
    const handleHotkey = (e: KeyboardEvent) => {
      // Focus search when / is pressed, unless in another input/textarea
      if (
        e.key === '/' && 
        document.activeElement?.tagName !== 'INPUT' && 
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    
    document.addEventListener('keydown', handleHotkey as any);
    return () => document.removeEventListener('keydown', handleHotkey as any);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (debouncedQuery.length > 2) {
      setIsLoading(true)
      fetch(`/api/search?query=${debouncedQuery}`)
        .then(res => res.json())
        .then(data => {
          setSuggestions(data.results.slice(0, 6))
          setIsOpen(true)
          setIsLoading(false)
        })
        .catch(() => {
          setIsLoading(false)
        })
    } else if (debouncedQuery.length === 0) {
      setSuggestions([])
      // Show recent searches when input is empty and focused
      setIsOpen(isFocused)
    } else {
      setSuggestions([])
      setIsOpen(false)
    }
  }, [debouncedQuery, isFocused])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => 
          prev < (query ? suggestions.length : recentSearches.length) - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > -1 ? prev - 1 : prev)
        break
      case 'Enter':
        if (selectedIndex > -1) {
          const items = query ? suggestions : recentSearches;
          if (items[selectedIndex]) {
            handleResultClick(items[selectedIndex])
          }
        } else if (query.length > 2) {
          // If no suggestion is selected but query exists, navigate to search results page
          router.push(`/search?q=${encodeURIComponent(query)}`);
          setIsOpen(false);
        }
        break
      case 'Escape':
        setIsOpen(false)
        inputRef.current?.blur();
        break
    }
  }

  const handleResultClick = (item: MediaItem) => {
    // Add to recent searches
    const updatedRecentSearches = [
      item,
      ...recentSearches.filter(i => i.id !== item.id)
    ].slice(0, 5);
    
    setRecentSearches(updatedRecentSearches);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updatedRecentSearches));
    
    router.push(`/${item.media_type}/${item.id}`)
    setQuery('')
    setIsOpen(false)
    setSuggestions([])
    setSelectedIndex(-1)
  }

  const clearRecentSearch = (e: React.MouseEvent, itemId: number) => {
    e.stopPropagation();
    const updatedRecentSearches = recentSearches.filter(item => item.id !== itemId);
    setRecentSearches(updatedRecentSearches);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updatedRecentSearches));
  }

  const clearInput = () => {
    setQuery('');
    inputRef.current?.focus();
  }

  // Determine which items to show in dropdown
  const dropdownItems = query ? suggestions : recentSearches;
  const showDropdown = isOpen && (dropdownItems.length > 0 || (!query && trendingSuggestions.length > 0));

  return (
    <div className="relative w-full" ref={searchRef}>
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300 ${isFocused ? 'text-cyan-400' : 'text-gray-400'}`} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            setIsOpen(true);
          }}
          placeholder={`${t('search')}... (Press / to focus)`}
          className="w-full h-12 pl-11 pr-14 bg-gray-800/50 text-white rounded-xl 
                     focus:outline-none focus:ring-2 focus:ring-cyan-500/50 
                     border border-gray-700/50 focus:border-cyan-500/30 placeholder:text-gray-400
                     transition-all duration-300"
        />
        
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isLoading && (
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          )}
          
          {query && !isLoading && (
            <button 
              onClick={clearInput}
              className="p-1 rounded-full hover:bg-gray-700/50 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-4 h-4 text-gray-400 hover:text-white" />
            </button>
          )}
          
          <div className="hidden md:flex items-center justify-center w-6 h-6 text-xs text-gray-400 border border-gray-600 rounded">
            /
          </div>
        </div>
      </div>

      {showDropdown && (
        <div 
          className="absolute w-full mt-2 bg-gray-800/95 backdrop-blur-xl rounded-xl 
                   shadow-xl z-[60] border border-gray-700/50 overflow-hidden
                   transition-all duration-200 origin-top"
          style={{
            opacity: showDropdown ? 1 : 0,
            transform: showDropdown ? 'translateY(0)' : 'translateY(-10px)'
          }}
        >
          {query ? (
            // Search results
            suggestions.length > 0 ? (
              suggestions.map((item, index) => (
                <div
                  key={item.id}
                  onClick={() => handleResultClick(item)}
                  className={`flex items-center gap-4 p-3 transition-colors cursor-pointer
                            ${index === selectedIndex ? 'bg-cyan-500/10' : 'hover:bg-gray-700/50'}
                            ${index !== suggestions.length - 1 ? 'border-b border-gray-700/50' : ''}`}
                >
                  <div className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-md">
                    {item.poster_path ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                        alt={`${item.title || item.name} poster`}
                        fill
                        className="object-cover"
                        sizes="48px"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-700 rounded flex items-center justify-center">
                        {item.media_type === 'movie' ? (
                          <Film className="w-6 h-6 text-gray-400" />
                        ) : (
                          <Tv className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">
                      {item.title || item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-1 bg-gray-700/50 rounded-full text-gray-300">
                        {item.media_type === 'movie' ? 'Movie' : 'TV Show'}
                      </span>
                      {(item.release_date || item.first_air_date) && (
                        <span className="text-sm text-gray-400">
                          {new Date(item.release_date || item.first_air_date || '').getFullYear()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              // No results
              <div className="p-4 text-center text-gray-400">
                <p>No results found for "{query}"</p>
              </div>
            )
          ) : (
            // Recent searches & suggestions when query is empty
            <>
              {recentSearches.length > 0 && (
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-300">Recent searches</span>
                  </div>
                  {recentSearches.map((item, index) => (
                    <div
                      key={item.id}
                      onClick={() => handleResultClick(item)}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors
                                ${index === selectedIndex ? 'bg-cyan-500/10' : 'hover:bg-gray-700/50'}`}
                    >
                      <div className="relative h-10 w-7 flex-shrink-0 overflow-hidden rounded">
                        {item.poster_path ? (
                          <Image
                            src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                            alt={`${item.title || item.name} poster`}
                            fill
                            className="object-cover"
                            sizes="28px"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-700 rounded flex items-center justify-center">
                            {item.media_type === 'movie' ? (
                              <Film className="w-4 h-4 text-gray-400" />
                            ) : (
                              <Tv className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {item.title || item.name}
                        </p>
                      </div>
                      <button
                        onClick={(e) => clearRecentSearch(e, item.id)}
                        className="p-1 rounded-full hover:bg-gray-600/50"
                        aria-label="Remove from recent searches"
                      >
                        <X className="w-3 h-3 text-gray-400 hover:text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {trendingSuggestions.length > 0 && (
                <div className="p-3 border-t border-gray-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-cyan-500" />
                    <span className="text-sm font-medium text-gray-300">Trending now</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {trendingSuggestions.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleResultClick(item)}
                        className="relative rounded-lg overflow-hidden cursor-pointer group"
                      >
                        <div className="relative aspect-[2/3] w-full">
                          {item.poster_path ? (
                            <Image
                              src={`https://image.tmdb.org/t/p/w185${item.poster_path}`}
                              alt={`${item.title || item.name} poster`}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                              {item.media_type === 'movie' ? (
                                <Film className="w-8 h-8 text-gray-500" />
                              ) : (
                                <Tv className="w-8 h-8 text-gray-500" />
                              )}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="absolute bottom-0 p-2">
                              <p className="text-xs text-white font-medium line-clamp-2">
                                {item.title || item.name}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          
          {/* Search tips at the bottom */}
          <div className="p-2 bg-gray-850 border-t border-gray-700/50">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 justify-center">
              <span className="flex items-center">
                <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 mr-1">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 mr-1">↓</kbd>
                to navigate
              </span>
              <span className="flex items-center">
                <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 mr-1">Enter</kbd>
                to select
              </span>
              <span className="flex items-center">
                <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 mr-1">Esc</kbd>
                to close
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
