/**
 * TMDB API Client with robust error handling and retry logic
 */
import { fetchJsonWithRetry } from './fetchWithRetry';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_API_URL = 'https://api.themoviedb.org/3';

// TMDB API types
export interface TMDBMovieDetails {
  id: number;
  title: string;
  release_date?: string;
  popularity?: number;
  runtime?: number;
  poster_path?: string;
  vote_average?: number;
  overview?: string;
  genres?: Array<{ id: number; name: string }>;
  [key: string]: any;
}

export interface TMDBTVDetails {
  id: number;
  name: string;
  first_air_date?: string;
  popularity?: number;
  episode_run_time?: number[];
  poster_path?: string;
  vote_average?: number;
  overview?: string;
  genres?: Array<{ id: number; name: string }>;
  [key: string]: any;
}

export type TMDBDetails = TMDBMovieDetails | TMDBTVDetails;

export interface TMDBPaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// Default request options
const defaultOptions = {
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
  timeout: 8000,     // 8 second timeout
  retries: 2,        // Retry twice
  retryDelay: 1000,  // 1 second between retries
  next: { revalidate: 3600 } // Cache for 1 hour
};

/**
 * Creates a URL for the TMDB API with the API key
 */
const createTMDBUrl = (path: string, queryParams: Record<string, string> = {}) => {
  // Ensure path starts with a slash
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // Add API key to query params
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY || '',
    ...queryParams
  });
  
  return `${TMDB_API_URL}${normalizedPath}?${params.toString()}`;
};

/**
 * Fetch movie details from TMDB API
 */
export async function fetchMovieDetails(movieId: number | string): Promise<TMDBMovieDetails> {
  return fetchJsonWithRetry<TMDBMovieDetails>(
    createTMDBUrl(`/movie/${movieId}`),
    defaultOptions
  );
}

/**
 * Fetch TV show details from TMDB API
 */
export async function fetchTVDetails(tvId: number | string): Promise<TMDBTVDetails> {
  return fetchJsonWithRetry<TMDBTVDetails>(
    createTMDBUrl(`/tv/${tvId}`),
    defaultOptions
  );
}

/**
 * Fetch details based on media type (movie or tv)
 */
export async function fetchMediaDetails(
  mediaId: number | string, 
  mediaType: 'movie' | 'tv'
): Promise<TMDBDetails> {
  return mediaType === 'movie' 
    ? fetchMovieDetails(mediaId)
    : fetchTVDetails(mediaId);
}

/**
 * Fetch recommendations for a movie
 */
export async function fetchMovieRecommendations(
  movieId: number | string
): Promise<TMDBPaginatedResponse<TMDBMovieDetails>> {
  return fetchJsonWithRetry<TMDBPaginatedResponse<TMDBMovieDetails>>(
    createTMDBUrl(`/movie/${movieId}/recommendations`),
    defaultOptions
  );
}

/**
 * Fetch recommendations for a TV show
 */
export async function fetchTVRecommendations(
  tvId: number | string
): Promise<TMDBPaginatedResponse<TMDBTVDetails>> {
  return fetchJsonWithRetry<TMDBPaginatedResponse<TMDBTVDetails>>(
    createTMDBUrl(`/tv/${tvId}/recommendations`),
    defaultOptions
  );
}

/**
 * Fetch similar movies
 */
export async function fetchSimilarMovies(
  movieId: number | string
): Promise<TMDBPaginatedResponse<TMDBMovieDetails>> {
  return fetchJsonWithRetry<TMDBPaginatedResponse<TMDBMovieDetails>>(
    createTMDBUrl(`/movie/${movieId}/similar`),
    defaultOptions
  );
}

/**
 * Fetch similar TV shows
 */
export async function fetchSimilarTVShows(
  tvId: number | string
): Promise<TMDBPaginatedResponse<TMDBTVDetails>> {
  return fetchJsonWithRetry<TMDBPaginatedResponse<TMDBTVDetails>>(
    createTMDBUrl(`/tv/${tvId}/similar`),
    defaultOptions
  );
}

/**
 * Fetch trending media (movies or TV shows)
 */
export async function fetchTrending(
  mediaType: 'movie' | 'tv' | 'all' = 'all',
  timeWindow: 'day' | 'week' = 'week'
): Promise<TMDBPaginatedResponse<TMDBDetails>> {
  return fetchJsonWithRetry<TMDBPaginatedResponse<TMDBDetails>>(
    createTMDBUrl(`/trending/${mediaType}/${timeWindow}`),
    defaultOptions
  );
}

// Export a default TMDB client object with all methods
const tmdbClient = {
  fetchMovieDetails,
  fetchTVDetails,
  fetchMediaDetails,
  fetchMovieRecommendations,
  fetchTVRecommendations,
  fetchSimilarMovies,
  fetchSimilarTVShows,
  fetchTrending
};

export default tmdbClient; 