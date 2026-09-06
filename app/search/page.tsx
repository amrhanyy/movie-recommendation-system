'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Search, SearchX, Film, Tv2, Star } from 'lucide-react';

interface SearchResult {
  id: number;
  media_type?: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
}

function releaseYear(item: SearchResult): number | null {
  const raw = item.release_date || item.first_air_date;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(raw).getFullYear();
}

function SearchSkeletonGrid() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading search results"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="aspect-[2/3] w-full animate-pulse rounded-xl border border-gray-700/40 bg-gray-800/50" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-gray-800/60" />
          <div className="h-3 w-2/5 animate-pulse rounded bg-gray-800/40" />
        </div>
      ))}
      <span className="sr-only">Loading search results…</span>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchSkeletonGrid />}>
      <SearchResults />
    </Suspense>
  );
}

function SearchResults() {
  const searchParams = useSearchParams();
  const query = (searchParams.get('q') ?? '').trim();

  const [items, setItems] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query) {
      setItems([]);
      setError(null);
      setHasFetched(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetch(`/api/search?query=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('search_failed');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const results: SearchResult[] = Array.isArray(data?.results)
          ? data.results.filter(
              (m: SearchResult) => m.media_type === 'movie' || m.media_type === 'tv'
            )
          : [];
        setItems(results);
        setHasFetched(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.name === 'AbortError') return;
        setItems([]);
        setError('We could not load results right now. Please try again.');
        setHasFetched(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query]);

  // State 2: no query yet — prompt to search.
  if (!query) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-700/50 bg-gray-800/40 backdrop-blur-md">
          <Search className="h-8 w-8 text-cyan-400" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-white">Search MovieMind</h1>
        <p className="mt-2 max-w-md text-gray-400">
          Start typing in the search bar above to find movies and TV shows.
        </p>
      </div>
    );
  }

  // State 1: loading.
  if (isLoading) {
    return (
      <div className="py-8">
        <h1 className="mb-6 text-lg font-semibold text-white">
          Results for <span className="text-cyan-400">&ldquo;{query}&rdquo;</span>
        </h1>
        <SearchSkeletonGrid />
      </div>
    );
  }

  // Error surfaced from a failed fetch.
  if (error) {
    return (
      <div className="py-16 text-center" role="alert">
        <p className="text-gray-300">{error}</p>
      </div>
    );
  }

  // State 3: no results found.
  if (hasFetched && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-700/50 bg-gray-800/40 backdrop-blur-md">
          <SearchX className="h-8 w-8 text-cyan-400" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-white">No results found</h1>
        <p className="mt-2 max-w-md text-gray-400">
          We couldn&apos;t find anything for &ldquo;{query}&rdquo;. Try a
          different title, an actor&apos;s name, or fewer keywords.
        </p>
      </div>
    );
  }

  // State 4: results grid.
  return (
    <div className="py-8">
      <h1 className="mb-6 text-lg font-semibold text-white">
        Results for <span className="text-cyan-400">&ldquo;{query}&rdquo;</span>
        <span className="ml-2 text-sm font-normal text-gray-400">
          ({items.length})
        </span>
      </h1>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item) => {
          const type = item.media_type === 'tv' ? 'tv' : 'movie';
          const title = item.title || item.name || 'Unknown title';
          const year = releaseYear(item);
          const rating =
            typeof item.vote_average === 'number' && item.vote_average > 0
              ? item.vote_average
              : null;
          const posterSrc = item.poster_path
            ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
            : null;
          const TypeIcon = type === 'tv' ? Tv2 : Film;

          return (
            <li key={`${type}-${item.id}`}>
              <Link
                href={`/${type}/${item.id}`}
                aria-label={`View details for ${title}${
                  year ? `, ${year}` : ''
                }${type === 'tv' ? ' (TV show)' : ' (movie)'}`}
                className="group block focus:outline-none"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-gray-700/50 bg-gray-800/40 shadow-md shadow-black/20 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-gray-600/70 group-hover:shadow-cyan-900/20 focus-visible:ring-2 focus-visible:ring-cyan-500">
                  {posterSrc ? (
                    <Image
                      src={posterSrc}
                      alt={`${title} poster`}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <TypeIcon className="h-10 w-10 text-gray-600" aria-hidden="true" />
                    </div>
                  )}

                  {/* Rating pill */}
                  {rating !== null && (
                    <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full border border-yellow-500/30 bg-black/60 px-2 py-1 backdrop-blur-sm">
                      <Star className="h-3 w-3 text-yellow-400" aria-hidden="true" />
                      <span className="text-xs font-medium text-yellow-400">
                        {rating.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Title + meta */}
                <h2 className="mt-2 truncate text-sm text-gray-200 transition-colors group-hover:text-cyan-300">
                  {title}
                </h2>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-gray-700/50 bg-gray-800/70 px-2 py-0.5 text-xs text-gray-300">
                    <TypeIcon className="h-3 w-3" aria-hidden="true" />
                    {type === 'tv' ? 'TV' : 'Movie'}
                  </span>
                  {year && (
                    <span className="text-xs text-gray-400">{year}</span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
