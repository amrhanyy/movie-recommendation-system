import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Bookmark, Star, Calendar, Film, Tv2 } from 'lucide-react';

interface GridItemCardProps {
  item: {
    _id: string;
    itemId: number;
    userId: string;
    title: string;
    type: 'movie' | 'tv';
    posterPath: string;
    addedAt: string;
    releaseDate?: string;
    voteAverage?: number;
    runtime?: number;
    overview?: string;
    genres?: string[];
  };
  onRemove: (itemId: number, type: string) => void;
}

export function GridItemCard({ item, onRemove }: GridItemCardProps) {
  const router = useRouter();
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const handleCardClick = () => {
    router.push(`/${item.type}/${item.itemId}`);
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(item.itemId, item.type);
  };

  const releaseYear = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null;
  const typeIcon = item.type === 'movie' ? <Film className="w-3.5 h-3.5" /> : <Tv2 className="w-3.5 h-3.5" />;

  return (
    <div onClick={handleCardClick} className="group relative cursor-pointer transform hover:-translate-y-1 transition-all duration-300">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-2 border border-gray-700/50 shadow-md shadow-black/20 group-hover:shadow-cyan-900/20 group-hover:border-gray-600/70 transition-all duration-300">
        {/* Subtle Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800/20 to-black/50 group-hover:from-cyan-950/20 group-hover:to-gray-900/80 transition-colors duration-500"></div>
        
        {/* Loading Indicator */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-cyan-500 rounded-full animate-spin"></div>
          </div>
        )}
        
        <Image
          src={item.posterPath 
            ? `https://image.tmdb.org/t/p/w500${item.posterPath}` 
            : '/placeholder-poster.png'
          }
          alt={item.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
          quality={85}
          className={`object-cover transform group-hover:scale-105 transition-transform duration-500 z-10 relative ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoadingComplete={() => setImageLoaded(true)}
        />
        
        {/* Bookmark Button */}
        <button
          onClick={handleRemoveClick}
          className="absolute top-2 right-2 p-2 rounded-full
            bg-black/50 backdrop-blur-sm border border-gray-700/50
            text-cyan-500 hover:bg-black/70 hover:scale-110 hover:border-cyan-500/50 hover:text-cyan-400
            transition-all duration-300 z-30"
        >
          <Bookmark className="w-4 h-4 fill-current" />
        </button>
        
        {/* Rating Pill (Always Visible) */}
        {item.voteAverage && (
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1 border border-yellow-500/30 z-20">
            <Star className="w-3 h-3 text-yellow-400" />
            <span className="text-yellow-400 text-xs font-medium">{item.voteAverage.toFixed(1)}</span>
          </div>
        )}
        
        {/* Hover Overlay with Info */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/70 to-black/10
            opacity-0 group-hover:opacity-100 transition-all duration-300 z-20">
          <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col gap-2">
            {/* Title and Type */}
            <h3 className="text-white font-medium line-clamp-2 text-sm">{item.title}</h3>
            
            {/* Media Details */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300">
              <span className="flex items-center gap-1 bg-gray-800/80 px-2 py-1 rounded-full border border-gray-700/50">
                {typeIcon}
                <span>{item.type === 'movie' ? 'Movie' : 'TV'}</span>
              </span>
              
              {releaseYear && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-cyan-400/70" />
                  {releaseYear}
                </span>
              )}
              
              {item.runtime && item.runtime > 0 && (
                <span className="text-gray-300">
                  {item.runtime}min
                </span>
              )}
            </div>
            
            {/* Genres Tags */}
            {item.genres && item.genres.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {item.genres.slice(0, 2).map((genre) => (
                  <span 
                    key={`${item._id}-${genre}`}
                    className="bg-gray-800/60 text-gray-300 text-xs px-1.5 py-0.5 rounded border border-gray-700/50"
                  >
                    {genre}
                  </span>
                ))}
                {item.genres.length > 2 && (
                  <span className="text-gray-400 text-xs">+{item.genres.length - 2}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Title below poster (visible when not hovering) */}
      <h3 className="text-sm text-gray-200 truncate group-hover:text-cyan-300 transition-colors">{item.title}</h3>
    </div>
  );
} 