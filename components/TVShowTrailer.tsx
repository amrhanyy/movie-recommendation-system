'use client'
import React, { useState } from 'react'
import { isValidYouTubeVideoId } from '@/lib/ai-security'
import { SafeYouTubeEmbed } from '@/components/SafeYouTubeEmbed'

interface TVShowTrailerProps {
    tvShowId: string;
    initialTrailerKey?: string;
}

const TVShowTrailer = ({ initialTrailerKey }: TVShowTrailerProps) => {
    const [trailerKey] = useState<string | null>(
        isValidYouTubeVideoId(initialTrailerKey) ? initialTrailerKey : null
    );

    if (!trailerKey) {
        return (
            <div className="w-full h-[400px] flex items-center justify-center bg-gray-900 rounded-xl">
                <p className="text-gray-400">No trailer available</p>
            </div>
        );
    }

    const embed = (
        <SafeYouTubeEmbed
            videoId={trailerKey}
            title="TV Show Trailer"
            className="w-full aspect-video"
            iframeClassName="w-full h-[400px] rounded-xl"
        />
    );

    if (!embed) {
        return (
            <div className="w-full h-[400px] flex items-center justify-center bg-gray-900 rounded-xl">
                <p className="text-gray-400">No trailer available</p>
            </div>
        );
    }

    return embed;
};

export default TVShowTrailer;
