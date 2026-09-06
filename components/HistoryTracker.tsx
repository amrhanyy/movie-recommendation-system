'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'

interface HistoryTrackerProps {
  itemId: number;
  type: 'movie' | 'tv' | 'person';
  title: string;
  posterPath: string | null;
}

/**
 * Records a viewed item to /api/history.
 *
 * Privacy behavior (R6):
 * - Only runs for an authenticated, loaded session (never while the session is
 *   loading, never for guests).
 * - The server decides whether history collection is enabled; the client does
 *   not send user identity and cannot toggle collection on its own.
 * - A ref guards against duplicate POSTs caused by React StrictMode double
 *   effects for the same itemId+type.
 * - No title or user data is logged by this component.
 */
export function HistoryTracker({ itemId, type, title, posterPath }: HistoryTrackerProps) {
  const { data: session, status } = useSession()
  const trackedRef = useRef<string | null>(null)

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.email) return

    const key = `${type}:${itemId}`
    if (trackedRef.current === key) return
    trackedRef.current = key

    let cancelled = false
    const addToHistory = async () => {
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
            posterPath,
          }),
        })

        if (!response.ok && !cancelled) {
          // Non-critical: history only; do not log titles or user data.
          return
        }
      } catch {
        // Non-critical and privacy-safe: never log content here.
      }
    }

    addToHistory()
    return () => {
      cancelled = true
    }
  }, [status, session, itemId, type, title, posterPath])

  return null
}
