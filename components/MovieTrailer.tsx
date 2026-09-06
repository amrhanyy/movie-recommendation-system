'use client';

import React from 'react';
import { isValidYouTubeVideoId } from '@/lib/ai-security';
import { SafeYouTubeEmbed } from '@/components/SafeYouTubeEmbed';

interface MovieTrailerProps {
  movieId: string;
  initialTrailerKey?: string;
}

/**
 * Renders a movie trailer from `initialTrailerKey` (provided by the movie
 * details page via /api/movie/[id], which already resolves trailer info).
 *
 * Phase 3: the previous `fetch('/api/movie/[id]/videos')` fallback targeted a
 * route that does not exist (404). It has been removed — when no valid trailer
 * key is available we render the static "No trailer available" fallback with
 * no extraneous network call.
 */
export const MovieTrailer: React.FC<MovieTrailerProps> = ({
  initialTrailerKey,
}) => {
  const trailerKey = isValidYouTubeVideoId(initialTrailerKey)
    ? (initialTrailerKey as string)
    : null;

  if (!trailerKey) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-gray-700/50 bg-gray-800/30 py-10 text-center text-gray-400">
        No trailer available.
      </div>
    );
  }

  const embed = (
    <SafeYouTubeEmbed
      videoId={trailerKey}
      title="Movie Trailer"
      className="relative w-full aspect-video"
      iframeClassName="absolute inset-0 w-full h-full rounded-lg"
    />
  );

  return embed ?? <div className="text-center text-gray-400">No trailer available.</div>;
};
