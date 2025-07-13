'use client';

import { useState, useEffect } from 'react';

interface MovieTrailerProps {
  movieId: string;
  initialTrailerKey?: string;
}

export const MovieTrailer: React.FC<MovieTrailerProps> = ({ movieId, initialTrailerKey }) => {
  const [trailerKey, setTrailerKey] = useState<string | null>(initialTrailerKey || null);
  const [isLoading, setIsLoading] = useState(!initialTrailerKey);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTrailerKey) return; // Use initial trailer key if provided
    const fetchTrailer = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/movie/${movieId}/videos`);
        if (response.status === 404) {
          setError('Trailer not available.');
          return;
        }
        if (!response.ok) {
          throw new Error(`Failed to fetch trailer: ${response.status}`);
        }
        const data = await response.json();
        const trailer = data.results?.find((video: any) => video.type === 'Trailer' && video.site === 'YouTube');

        if (trailer) {
          setTrailerKey(trailer.key);
        } else {
          setError('No YouTube trailer found for this movie.');
        }
      } catch (err: any) {
        setError(`Failed to fetch trailer: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrailer();
  }, [movieId, initialTrailerKey]);

  if (isLoading) {
    return <div className="text-center text-gray-400">Loading trailer...</div>;
  }

  if (error) {
    return (
      <div className="text-center text-gray-400">
        {error === 'Trailer not available.' ? 'No trailer available.' : `Error: ${error}`}
      </div>
    );
  }

  if (!trailerKey) {
    return <div className="text-center text-gray-400">No trailer available.</div>;
  }

  return (
    <div className="relative w-full aspect-video">
      <iframe
        className="absolute inset-0 w-full h-full rounded-lg"
        src={`https://www.youtube.com/embed/${trailerKey}`}
        title="Movie Trailer"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
};
