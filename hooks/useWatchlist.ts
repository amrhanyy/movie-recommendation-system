import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'react-hot-toast';


interface WatchlistItem {
  itemId: number;
  type: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
}

export function useWatchlist(itemId: number | undefined, type: 'movie' | 'tv', title: string, posterPath: string | null) {
  const { data: session } = useSession();
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Don't do anything if itemId is undefined
  useEffect(() => {
    if (!itemId) {
      setIsLoading(false);
      return;
    }

    const checkWatchlist = async () => {
      if (!session?.user?.email) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/watchlist');
        if (!response.ok) throw new Error('Failed to fetch watchlist');
        
        const items: WatchlistItem[] = await response.json();
        setIsInWatchlist(items.some(item => 
          item.itemId === itemId && item.type === type
        ));
      } catch (error) {
        console.error('Error checking watchlist:', error);
        toast.error('Failed to check watchlist status');
      } finally {
        setIsLoading(false);
      }
    };

    checkWatchlist();
  }, [session?.user?.email, itemId, type]);

  const toggleWatchlist = async () => {
    if (!session?.user?.email) {
      toast.error('Please sign in to use watchlist');
      return;
    }

    if (!itemId) {
      console.error('Cannot toggle watchlist: itemId is undefined');
      return;
    }

    try {
      if (isInWatchlist) {
        const response = await fetch(`/api/watchlist?itemId=${itemId}&type=${type}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) throw new Error('Failed to remove from watchlist');
        setIsInWatchlist(false);
        toast.success('Removed from watchlist');
      } else {
        const response = await fetch('/api/watchlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            itemId,
            type,
            title,
            posterPath
          }),
        });

        if (!response.ok) throw new Error('Failed to add to watchlist');
        setIsInWatchlist(true);
        toast.success('Added to watchlist');
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error);
      toast.error('Failed to update watchlist');
    }
  };

  return { isInWatchlist, isLoading, toggleWatchlist };
}
