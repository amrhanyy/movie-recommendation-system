import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Heart, Star, Calendar, Clock, Film, Tv2, Info } from 'lucide-react';

interface FavoriteDetailedItemCardProps {
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

export function FavoriteDetailedItemCard({ item, onRemove }: FavoriteDetailedItemCardProps) {
  const router = useRouter();
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const handleCardClick = () => {
    router.push(`/${item.type}/${item.itemId}`);
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(item.itemId, item.type);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return isNaN(date.getTime()) 
      ? 'N/A' 
      : date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
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

  const releaseDate = item.releaseDate ? formatDate(item.releaseDate) : 'N/A';
  const addedDate = formatDate(item.addedAt);
  const typeIcon = item.type === 'movie' ? <Film className="w-4 h-4" /> : <Tv2 className="w-4 h-4" />;
  
  return (
    <div 
      onClick={handleCardClick}
      className="group flex gap-6 p-4 rounded-xl border border-gray-700/50 bg-gray-800/30 hover:bg-gray-800/50 
        transition-all duration-300 cursor-pointer hover:border-pink-700/30 relative overflow-hidden"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-pink-950/5 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
      
      {/* Poster */}
      <div className="relative h-40 w-28 flex-shrink-0 rounded-lg overflow-hidden border border-gray-700/50">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <div className="w-6 h-6 border-2 border-gray-600 border-t-pink-500 rounded-full animate-spin"></div>
          </div>
        )}
        
        <Image
          src={item.posterPath 
            ? `https://image.tmdb.org/t/p/w500${item.posterPath}` 
            : '/placeholder-poster.png'
          }
          alt={item.title}
          fill
          quality={80}
          className={`object-cover transition-all duration-300 group-hover:scale-105 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoadingComplete={() => setImageLoaded(true)}
        />
      </div>
      
      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="flex justify-between items-start gap-4">
          <h3 className="text-lg font-medium text-white group-hover:text-pink-300 transition-colors mr-auto">{item.title}</h3>
          
          <button
            onClick={handleRemoveClick}
            className="flex-shrink-0 p-2 rounded-full bg-black/40 hover:bg-black/60 
              text-pink-500 border border-gray-700/50 hover:border-pink-500/50 hover:text-pink-400
              transition-all duration-300 transform hover:scale-105 z-10"
          >
            <Heart className="w-4 h-4 fill-current" />
          </button>
        </div>
        
        {/* Rating */}
        {hasValidRating && (
          <div className="flex items-center gap-1 mb-2 mt-1">
            <Star className="w-4 h-4 text-yellow-400" />
            <span className="text-yellow-400 font-medium">{Number(item.voteAverage).toFixed(1)}/10</span>
          </div>
        )}
        
        {/* Meta Info */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-300 mb-2">
          <span className="flex items-center gap-1">
            {typeIcon}
            <span>{item.type === 'movie' ? 'Movie' : 'TV Series'}</span>
          </span>
          
          {item.releaseDate && releaseDate !== 'N/A' && (
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4 text-pink-400/70" />
              <span>{releaseDate}</span>
            </span>
          )}
          
          {hasValidRuntime && (
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4 text-pink-400/70" />
              <span>{Number(item.runtime)} min</span>
            </span>
          )}
          
          <span className="flex items-center gap-1 text-gray-400 text-xs">
            <Info className="w-3 h-3" />
            <span>Added: {addedDate}</span>
          </span>
        </div>
        
        {/* Genres */}
        {item.genres && item.genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {item.genres.map((genre) => (
              <span 
                key={`${item._id}-${genre}`}
                className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-300 border border-gray-600/50"
              >
                {genre}
              </span>
            ))}
          </div>
        )}
        
        {/* Overview - Truncated */}
        {item.overview && (
          <p className="text-sm text-gray-400 line-clamp-2 mt-auto group-hover:text-gray-300 transition-colors">
            {item.overview}
          </p>
        )}
      </div>
    </div>
  );
} 