'use client';
import React from 'react'
import { useState, useEffect } from 'react';

export default function RedisDemoPage() {
  const [movieId, setMovieId] = useState('550'); // Default to Fight Club
  const [movieData, setMovieData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch movie data using our Redis-cached API
  const fetchMovie = async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/redis-example?id=${id}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch movie: ${response.status}`);
      }
      
      const data = await response.json();
      setMovieData(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error('Error fetching movie:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch movie on initial load
  useEffect(() => {
    fetchMovie(movieId);
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Redis Cache Demo</h1>
      
      <p className="mb-4">
        This page demonstrates Redis caching with a movie database API. 
        The first request will be fetched from the API, and subsequent 
        requests within 30 minutes will be served from Redis cache.
      </p>
      
      <div className="mb-4">
        <label className="block mb-2">
          Movie ID:
          <input
            type="text"
            value={movieId}
            onChange={(e) => setMovieId(e.target.value)}
            className="border ml-2 p-1"
          />
        </label>
        
        <button
          onClick={() => fetchMovie(movieId)}
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          {loading ? 'Loading...' : 'Fetch Movie'}
        </button>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {movieData && (
        <div className="bg-white shadow rounded p-4">
          <h2 className="text-xl font-bold">{movieData.title}</h2>
          <p className="text-gray-600">{movieData.tagline}</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <p><strong>Release Date:</strong> {movieData.release_date}</p>
              <p><strong>Runtime:</strong> {movieData.runtime} minutes</p>
              <p><strong>Vote Average:</strong> {movieData.vote_average}/10</p>
              <p><strong>Popularity:</strong> {movieData.popularity}</p>
            </div>
            
            <div>
              <p><strong>Original Language:</strong> {movieData.original_language}</p>
              <p><strong>Budget:</strong> ${movieData.budget?.toLocaleString()}</p>
              <p><strong>Revenue:</strong> ${movieData.revenue?.toLocaleString()}</p>
              <p><strong>Genres:</strong> {movieData.genres?.map((g: any) => g.name).join(', ')}</p>
            </div>
          </div>
          
          <div className="mt-4">
            <p><strong>Overview:</strong></p>
            <p>{movieData.overview}</p>
          </div>
          
          <div className="mt-4 text-sm text-gray-500">
            <p>
              This data might be coming from Redis cache. Check the console logs in your 
              terminal to see if there was a cache miss (API call) or cache hit (from Redis).
            </p>
          </div>
        </div>
      )}
    </div>
  );
} 