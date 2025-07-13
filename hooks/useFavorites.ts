import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'react-hot-toast';

export function useFavorites(itemId: number, type: 'movie' | 'tv', title: string, posterPath: string | null) {
  const { data: session } = useSession();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkFavorite = async () => {
      if (!session?.user?.email || !itemId) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/favorites');
        if (!response.ok) throw new Error('Failed to fetch favorites');
        
        const items = await response.json();
        setIsFavorite(items.some((item: any) => 
          item.itemId === itemId && item.type === type
        ));
      } catch (error) {
        console.error('Error checking favorites:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkFavorite();
  }, [session?.user?.email, itemId, type]);

  const toggleFavorite = async () => {
    if (!session?.user?.email) {
      toast.error('Please sign in to use favorites');
      return;
    }

    try {
      if (isFavorite) {
        const response = await fetch(`/api/favorites?itemId=${itemId}&type=${type}`, {
          method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to remove from favorites');
        setIsFavorite(false);
        toast.success('Removed from favorites');
      } else {
        const response = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, type, title, posterPath }),
        });
        if (!response.ok) throw new Error('Failed to add to favorites');
        setIsFavorite(true);
        toast.success('Added to favorites');
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast.error('Failed to update favorites');
    }
  };

  return { isFavorite, isLoading, toggleFavorite };
}
