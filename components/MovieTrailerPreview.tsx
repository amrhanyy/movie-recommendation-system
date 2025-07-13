'use client'

import React, { useState, useEffect } from 'react'

export default function MovieTrailerPreview({ movieId }: { movieId: string }) {
  const [trailerKey, setTrailerKey] = useState('')

  useEffect(() => {
    fetch(`/api/movie/${movieId}/videos`)
      .then(res => res.json())
      .then(data => {
        const trailer = data.results?.find((v: any) => v.type === 'Trailer')
        if (trailer) setTrailerKey(trailer.key)
      })
  }, [movieId])

  if (!trailerKey) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="relative w-full max-w-4xl aspect-video">
        <iframe
          src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="absolute inset-0 w-full h-full rounded-lg"
        />
      </div>
    </div>
  )
}
