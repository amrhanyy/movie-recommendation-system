'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'

interface HistoryTrackerProps {
  itemId: number;
  type: 'movie' | 'tv' | 'person';
  title: string;
  posterPath: string | null;
}

export function HistoryTracker({ itemId, type, title, posterPath }: HistoryTrackerProps) {
  const { data: session } = useSession()

  useEffect(() => {
    const addToHistory = async () => {
      if (!session?.user?.email) return;

      try {
        const response = await fetch('/api/history', {
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

        if (!response.ok) {
          throw new Error('Failed to add to history');
        }
      } catch (error) {
        console.error('Error adding to history:', error);
      }
    };

    addToHistory();
  }, [itemId, type, title, posterPath, session?.user?.email]);

  return null;
}
