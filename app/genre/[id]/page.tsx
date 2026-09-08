'use client'

import React, { useEffect, useState, use } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bookmark } from 'lucide-react'
import { useWatchlistContext } from '@/contexts/WatchlistContext'

interface Content {
  id: number
  title?: string
  name?: string
  poster_path: string
  backdrop_path: string
  release_date?: string
  first_air_date?: string
  vote_average: number
  overview: string
  uniqueKey?: string
}

interface Genre {
  id: number
  name: string
}

export default function GenrePage({ params }: { params: Promise<{ id: string }> }) {
  const [content, setContent] = useState<Content[]>([])
  const [contentIds, setContentIds] = useState(new Set<number>())
  const [genre, setGenre] = useState<Genre | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { id } = use(params)
  const contentType = searchParams.get('type') || 'movie'
  const { isInWatchlist, toggleWatchlist } = useWatchlistContext()

  const handleWatchlistToggle = (item: Content, e: React.MouseEvent) => {
    e.stopPropagation();
    void toggleWatchlist({
      itemId: item.id,
      type: contentType as 'movie' | 'tv',
      title: item.title || item.name || '',
      posterPath: item.poster_path
    });
  };

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return
    
    try {
      setIsLoadingMore(true)
      setError(null)
      const nextPage = page + 1
      const timestamp = Date.now()
      const res = await fetch(`/api/genre/${id}/content?page=${nextPage}&type=${contentType}`)
      const data = await res.json()
      
      if (!data.results || data.results.length === 0) {
        setHasMore(false)
        return
      }

      const newContent = data.results.filter((item: Content) => 
        !contentIds.has(item.id) && item.poster_path != null
      )
      
      if (newContent.length === 0) {
        setHasMore(false)
        return
      }

      const contentWithKeys = newContent.map((item: Content) => ({
        ...item,
        uniqueKey: `${item.id}-${timestamp}`
      }))

      const newIds = new Set([...contentIds])
      newContent.forEach((item: Content) => newIds.add(item.id))
      setContentIds(newIds)

      setContent(prev => [...prev, ...contentWithKeys])
      setPage(nextPage)
    } catch (error) {
      console.error('Error loading more content:', error)
      setError('Failed to load more content. Please try again later.')
      setHasMore(false)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const retryFetch = () => {
    setError(null)
    setHasMore(true)
    setIsLoading(true)
    setPage(1)
    setContent([])
    setContentIds(new Set())
    setRetryToken((t) => t + 1)
  }

  useEffect(() => {
    async function fetchGenreContent() {
      try {
        setIsLoading(true)
        setError(null)
        const [contentRes, genreRes] = await Promise.all([
          fetch(`/api/genre/${id}/content?page=1&type=${contentType}`),
          fetch(`/api/genre/${id}`)
        ])

        if (!contentRes.ok || !genreRes.ok) {
          const errorRes = !contentRes.ok ? contentRes : genreRes;
          const errorData = await errorRes.json();
          throw new Error(errorData.error || 'Failed to fetch data');
        }

        const [contentData, genreData] = await Promise.all([
          contentRes.json(),
          genreRes.json()
        ]);

        if (!contentData.results) {
          throw new Error('Invalid content data received');
        }

        const timestamp = Date.now();
        const uniqueContent = contentData.results.filter(
          (item: Content, index: number, self: Content[]) => 
            self.findIndex((t) => t.id === item.id) === index
        );

        const contentWithKeys = uniqueContent.map((item: Content) => ({
          ...item,
          uniqueKey: `${item.id}-page-1-${timestamp}`
        }));

        const ids = new Set<number>(uniqueContent.map((item: Content) => Number(item.id)));
        setContentIds(ids);

        setContent(contentWithKeys);
        setGenre(genreData);
      } catch (error) {
        console.error('Error:', error);
        setError(error instanceof Error ? error.message : 'Failed to load content');
      } finally {
        setIsLoading(false);
      }
    }

    setContent([]);
    setContentIds(new Set());
    setPage(1);
    setHasMore(true);
    setIsLoading(true);
    fetchGenreContent();
  }, [id, contentType, retryToken]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const handleScroll = () => {
      if (timeoutId) clearTimeout(timeoutId);
      
      timeoutId = setTimeout(() => {
        const scrollPosition = window.innerHeight + window.pageYOffset
        const scrollThreshold = document.documentElement.scrollHeight - 800

        if (scrollPosition > scrollThreshold && !isLoading && !isLoadingMore && hasMore) {
          loadMore()
        }
      }, 100);
    }

    window.addEventListener('scroll', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [hasMore, isLoading, isLoadingMore, page])

  if (error) {
    return (
      <div className="container-fluid py-4 px-2 max-w-[2000px] mx-auto">
        <div role="alert" className="text-red-500 text-center py-4">
          {error}
          <button
            type="button"
            onClick={retryFetch}
            className="ml-4 text-cyan-400 hover:text-cyan-300 min-h-[44px] min-w-[44px] px-4"
          >
            Try Again
          </button>
        </div>
        {content.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
            {content.map((item) => (
              <Link
                key={item.uniqueKey || item.id}
                href={`/${contentType}/${item.id}`}
                aria-label={`View details for ${item.title || item.name || 'title'}`}
                className="group relative aspect-[2/3] rounded-lg overflow-hidden block focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              >
                <Image
                  src={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
                  alt={item.title || item.name || ''}
                  fill
                  sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 16.66vw, (max-width: 1280px) 12.5vw, 10vw"
                  className="object-cover transform group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                              opacity-0 group-hover:opacity-100 transition-all duration-500">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(0,200,255,0.1),transparent_70%)]" />
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <h3 className="text-white font-medium text-xs line-clamp-1 mb-1">
                      {item.title || item.name}
                    </h3>
                    <div className="flex items-center gap-1">
                      <div className="px-1.5 py-0.5 rounded-md bg-cyan-500/20 backdrop-blur-sm border border-cyan-500/20">
                        <span className="text-cyan-400 text-[10px]">
                          {new Date(item.release_date || item.first_air_date || '').getFullYear()}
                        </span>
                      </div>
                      <div className="w-6 h-6 rounded-md bg-black/50 backdrop-blur-sm flex items-center justify-center border border-cyan-500/20">
                        <div className="text-xs font-bold text-cyan-400">
                          {item.vote_average.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleWatchlistToggle(item, e)}
                  aria-pressed={isInWatchlist(item.id)}
                  aria-label={isInWatchlist(item.id) ? `Remove ${item.title || item.name || 'item'} from watchlist` : `Add ${item.title || item.name || 'item'} to watchlist`}
                  className="group/tooltip absolute top-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full
                            bg-black/50 backdrop-blur-sm border border-gray-700/50
                            text-white hover:bg-black/70 hover:scale-110
                            transition-all duration-300 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                >
                  <Bookmark
                    className={`w-4 h-4 ${isInWatchlist(item.id) ? 'fill-white' : ''}`}
                  />

                </button>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container-fluid py-4 px-2 max-w-[2000px] mx-auto">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
          {[...Array(40)].map((_, i) => (
            <div key={`initial-skeleton-${i}`} className="aspect-[2/3] bg-gray-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container-fluid py-4 px-2 max-w-[2000px] mx-auto min-h-screen">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
          <h1 className="text-2xl font-bold text-white tracking-wider">
            {genre?.name.toUpperCase()}
          </h1>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/genre/${id}?type=movie&name=${genre?.name}`)}
            className={`px-4 py-2 rounded-lg transition-all ${
              contentType === 'movie'
                ? 'bg-cyan-500 text-white'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
            }`}
          >
            Movies
          </button>
          <button
            onClick={() => router.push(`/genre/${id}?type=tv&name=${genre?.name}`)}
            className={`px-4 py-2 rounded-lg transition-all ${
              contentType === 'tv'
                ? 'bg-cyan-500 text-white'
                : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
            }`}
          >
            TV Shows
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
        {content.map((item) => (
          <Link
            key={item.uniqueKey || item.id}
            href={`/${contentType}/${item.id}`}
            aria-label={`View details for ${item.title || item.name || 'title'}`}
            className="group relative aspect-[2/3] rounded-lg overflow-hidden block focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            <Image
              src={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
              alt={item.title || item.name || ''}
              fill
              sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 16.66vw, (max-width: 1280px) 12.5vw, 10vw"
              className="object-cover transform group-hover:scale-110 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent 
                          opacity-0 group-hover:opacity-100 transition-all duration-500">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(0,200,255,0.1),transparent_70%)]" />
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <h3 className="text-white font-medium text-xs line-clamp-1 mb-1">
                  {item.title || item.name}
                </h3>
                <div className="flex items-center gap-1">
                  <div className="px-1.5 py-0.5 rounded-md bg-cyan-500/20 backdrop-blur-sm border border-cyan-500/20">
                    <span className="text-cyan-400 text-[10px]">
                      {new Date(item.release_date || item.first_air_date || '').getFullYear()}
                    </span>
                  </div>
                  <div className="w-6 h-6 rounded-md bg-black/50 backdrop-blur-sm flex items-center justify-center border border-cyan-500/20">
                    <div className="text-xs font-bold text-cyan-400">
                      {item.vote_average.toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => handleWatchlistToggle(item, e)}
              aria-pressed={isInWatchlist(item.id)}
              aria-label={isInWatchlist(item.id) ? `Remove ${item.title || item.name || 'item'} from watchlist` : `Add ${item.title || item.name || 'item'} to watchlist`}
              className="group/tooltip absolute top-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full
                        bg-black/50 backdrop-blur-sm border border-gray-700/50
                        text-white hover:bg-black/70 hover:scale-110
                        transition-all duration-300 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              <Bookmark
                className={`w-4 h-4 ${isInWatchlist(item.id) ? 'fill-white' : ''}`}
              />

            </button>
          </Link>
        ))}
      </div>

      {(hasMore || isLoadingMore) && isLoadingMore && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 mt-2">
          {[...Array(20)].map((_, i) => (
            <div key={`loading-more-skeleton-${i}`} className="aspect-[2/3] bg-gray-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
