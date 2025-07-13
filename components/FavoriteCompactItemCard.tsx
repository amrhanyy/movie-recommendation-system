import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Heart, Star, Calendar, Clock, Film, Tv2 } from 'lucide-react';

interface FavoriteCompactItemCardProps {
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

export function FavoriteCompactItemCard({ item, onRemove }: FavoriteCompactItemCardProps) {
  const router = useRouter();
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const handleCardClick = () => {
    router.push(`/${item.type}/${item.itemId}`);
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(item.itemId, item.type);
  };

  // Check if voteAverage is a valid number
  const hasValidRating = item.voteAverage !== undefined && 
                        item.voteAverage !== null && 
                        !isNaN(Number(item.voteAverage));
                        
  // Check if runtime is a valid number                      
  const hasValidRuntime = item.runtime !== undefined && 
                         item.runtime !== null && 
                         !isNaN(Number(item.runtime)) && 
                         Number(item.runtime) > 0;

  const releaseYear = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null;
  // Validate the release year is not NaN
  const hasValidYear = releaseYear !== null && !isNaN(releaseYear);
  
  const typeIcon = item.type === 'movie' ? <Film className="w-4 h-4" /> : <Tv2 className="w-4 h-4" />;
  
  return (
    <div 
      onClick={handleCardClick}
      className="group flex items-center gap-3 p-2 rounded-lg border border-gray-700/50 bg-gray-800/20 
      hover:bg-gray-800/40 transition-all duration-300 cursor-pointer hover:border-pink-700/30"
    >
      {/* Small poster */}
      <div className="relative h-16 w-12 flex-shrink-0 rounded-md overflow-hidden border border-gray-700/50">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <div className="w-4 h-4 border-2 border-gray-600 border-t-pink-500 rounded-full animate-spin"></div>
          </div>
        )}
        
        <Image
          src={item.posterPath 
            ? `https://image.tmdb.org/t/p/w200${item.posterPath}` 
            : '/placeholder-poster.png'
          }
          alt={item.title}
          fill
          quality={70}
          className={`object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoadingComplete={() => setImageLoaded(true)}
        />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-white truncate group-hover:text-pink-300 transition-colors mr-auto">
            {item.title}
          </h3>
          
          {hasValidRating && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Star className="w-3 h-3 text-yellow-400" />
              <span className="text-yellow-400 text-xs font-medium">{Number(item.voteAverage).toFixed(1)}</span>
            </div>
          )}
        </div>
        
        {/* Quick meta info */}
        <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
          <span className="flex items-center gap-1 text-pink-500/70">
            {typeIcon}
          </span>
          
          {hasValidYear && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-pink-400/70" />
              <span>{releaseYear}</span>
            </span>
          )}
          
          {hasValidRuntime && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-pink-400/70" />
              <span>{Number(item.runtime)}m</span>
            </span>
          )}
          
          {/* First genre if available */}
          {item.genres && item.genres.length > 0 && (
            <span className="text-gray-500 truncate max-w-[100px]">{item.genres[0]}</span>
          )}
        </div>
      </div>
      
      {/* Action button */}
      <button
        onClick={handleRemoveClick}
        className="flex-shrink-0 p-1.5 rounded-full bg-transparent hover:bg-black/40
          text-pink-500 hover:text-pink-400 border border-transparent hover:border-gray-700/50
          transition-all duration-300 transform hover:scale-110"
      >
        <Heart className="w-4 h-4 fill-current" />
      </button>
    </div>
  );
} 