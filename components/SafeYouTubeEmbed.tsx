import React from 'react';
import { buildYouTubeEmbedUrl } from '@/lib/ai-security';

interface SafeYouTubeEmbedProps {
  videoId: string;
  title: string;
  className?: string;
  iframeClassName?: string;
  allow?: string;
}

/**
 * Renders a YouTube iframe only for a validated 11-character video ID.
 * The embed URL is constructed locally; full URLs from TMDB/Gemini are never used.
 */
export function SafeYouTubeEmbed({
  videoId,
  title,
  className,
  iframeClassName,
  allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
}: SafeYouTubeEmbedProps) {
  const src = buildYouTubeEmbedUrl(videoId);
  if (!src) {
    return null;
  }

  return (
    <div className={className}>
      <iframe
        className={iframeClassName}
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow={allow}
        allowFullScreen
      />
    </div>
  );
}
