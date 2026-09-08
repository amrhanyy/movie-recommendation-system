'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSession, signIn } from 'next-auth/react'
import { toast } from 'react-hot-toast'

export interface WatchlistToggleItem {
  itemId: number
  type: 'movie' | 'tv'
  title: string
  posterPath: string | null
}

interface WatchlistContextValue {
  /** Set of every watchlist item id (across movies and TV). */
  watchlistIds: Set<number>
  /** O(1) membership check for a single id. */
  isInWatchlist: (id: number) => boolean
  /**
   * Optimistically add/remove an item. Updates UI immediately, reverts and
   * toasts on failure. Prompts sign-in for guests.
   */
  toggleWatchlist: (item: WatchlistToggleItem) => Promise<void>
  /** True while the initial list is being fetched. */
  isLoading: boolean
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null)

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  // Fetch the watchlist once per authenticated session (single source of truth
  // for every card/section, replacing the per-component fetches).
  useEffect(() => {
    let cancelled = false
    if (!session?.user?.email) {
      setWatchlistIds(new Set())
      setIsLoading(false)
      return
    }

    const load = async () => {
      try {
        const response = await fetch('/api/watchlist')
        if (!response.ok) {
          setWatchlistIds(new Set())
          return
        }
        const data: { itemId: number }[] = await response.json()
        if (cancelled) return
        const ids = new Set(
          data
            .filter((item) => typeof item.itemId === 'number')
            .map((item) => Number(item.itemId))
        )
        setWatchlistIds(ids)
      } catch (error) {
        if (cancelled) return
        console.error('Error fetching watchlist:', error)
        setWatchlistIds(new Set())
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [session?.user?.email])

  const isInWatchlist = useCallback(
    (id: number) => watchlistIds.has(id),
    [watchlistIds]
  )

  // Identity-stable toggle: functional setState only, no watchlistIds dep.
  // alreadyIn is resolved inside the updater via a ref mirror, so consumers
  // holding this callback never re-render fleet-wide on toggle.
  const watchlistIdsRef = useRef(watchlistIds)
  watchlistIdsRef.current = watchlistIds

  const toggleWatchlist = useCallback(
    async (item: WatchlistToggleItem) => {
      if (!session?.user?.email) {
        signIn()
        return
      }

      const alreadyIn = watchlistIdsRef.current.has(item.itemId)

      // Optimistic update.
      setWatchlistIds((prev) => {
        const next = new Set(prev)
        if (alreadyIn) next.delete(item.itemId)
        else next.add(item.itemId)
        return next
      })

      try {
        if (alreadyIn) {
          const res = await fetch(
            `/api/watchlist?itemId=${item.itemId}&type=${item.type}`,
            { method: 'DELETE' }
          )
          if (!res.ok) throw new Error('Failed to remove from watchlist')
          toast.success('Removed from watchlist')
        } else {
          const res = await fetch('/api/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          })
          if (!res.ok) throw new Error('Failed to add to watchlist')
          toast.success('Added to watchlist')
        }
      } catch (error) {
        console.error('Error toggling watchlist:', error)
        // Roll back the optimistic change.
        setWatchlistIds((prev) => {
          const next = new Set(prev)
          if (alreadyIn) next.add(item.itemId)
          else next.delete(item.itemId)
          return next
        })
        toast.error('Failed to update watchlist')
      }
    },
    [session?.user?.email]
  )

  const value = useMemo<WatchlistContextValue>(
    () => ({ watchlistIds, isInWatchlist, toggleWatchlist, isLoading }),
    [watchlistIds, isInWatchlist, toggleWatchlist, isLoading]
  )

  return (
    <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>
  )
}

export function useWatchlistContext(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext)
  if (!ctx) {
    throw new Error('useWatchlistContext must be used within a WatchlistProvider')
  }
  return ctx
}
