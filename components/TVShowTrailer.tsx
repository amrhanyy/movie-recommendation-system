'use client'
import React, { useState } from 'react'

interface TVShowTrailerProps {
    tvShowId: string;
    initialTrailerKey?: string;
}

const TVShowTrailer = ({ tvShowId, initialTrailerKey }: TVShowTrailerProps) => {
    const [trailerKey] = useState(initialTrailerKey);

    if (!trailerKey) {
        return (
            <div className="w-full h-[400px] flex items-center justify-center bg-gray-900 rounded-xl">
                <p className="text-gray-400">No trailer available</p>
            </div>
        );
    }

    return (
        <div className="w-full aspect-video">
            <iframe
                className="w-full h-[400px] rounded-xl"
                src={`https://www.youtube.com/embed/${trailerKey}`}
                title="TV Show Trailer"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
            ></iframe>
        </div>
    );
};

export default TVShowTrailer;
