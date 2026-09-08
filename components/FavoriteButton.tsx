'use client'
import React from "react"
import { Heart } from 'lucide-react';
import { useFavoritesContext } from '@/contexts/FavoritesContext';
import { LoadingSpinner } from './ui/LoadingSpinner';

interface FavoriteButtonProps {
  itemId: number;
  type: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
}

export function FavoriteButton({ itemId, type, title, posterPath }: FavoriteButtonProps) {
  const { isFavorite, isLoading, toggleFavorite } = useFavoritesContext();
  const active = isFavorite(itemId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite({ itemId, type, title, posterPath });
      }}
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={active}
      title={active ? 'Remove from favorites' : 'Add to favorites'}
      className={`absolute top-2 left-2 p-2 rounded-full bg-black/50 backdrop-blur-sm
                 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${active ? 'text-pink-500' : 'text-white'}`}
    >
      {isLoading ? (
        <LoadingSpinner className="w-5 h-5" />
      ) : (
        <Heart className={`w-5 h-5 ${active ? 'fill-current' : ''}`} />
      )}
    </button>
  );
}

