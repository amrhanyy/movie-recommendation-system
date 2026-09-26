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
import { listMembershipKey, isListMediaType, isValidListItemId, type ListMembershipKey } from '@/lib/list-membership'

export interface WatchlistToggleItem {
  itemId: number
  type: 'movie' | 'tv'
  title: string
  posterPath: string | null
}

interface WatchlistContextValue {
  /**
   * Set of every watchlist membership key, type-qualified (`movie:<id>` /
   * `tv:<id>`) so a movie and a TV show sharing one numeric TMDB id are
   * distinct members. Matches the API/persistence identity `(userId, itemId, type)`.
   */
  watchlistIds: Set<ListMembershipKey>
  /** O(1) membership check for a single media type + id. */
  isInWatchlist: (type: 'movie' | 'tv', id: number) => boolean
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
  const [watchlistIds, setWatchlistIds] = useState<Set<ListMembershipKey>>(new Set())
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
        const data: { itemId?: unknown; type?: unknown }[] = await response.json()
        if (cancelled) return
        // Membership identity is the type-qualified pair, not the bare id:
        // invalid records (bad/missing type, non-finite or non-positive itemId)
        // are skipped rather than given an invented type.
        const ids = new Set(
          data
            .filter(
              (item): item is { itemId: number; type: 'movie' | 'tv' } =>
                isListMediaType(item.type) && isValidListItemId(item.itemId)
            )
            .map((item) => listMembershipKey(item.type, item.itemId))
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
    (type: 'movie' | 'tv', id: number) => watchlistIds.has(listMembershipKey(type, id)),
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

      const membershipKey = listMembershipKey(item.type, item.itemId)
      const alreadyIn = watchlistIdsRef.current.has(membershipKey)

      // Optimistic update.
      setWatchlistIds((prev) => {
        const next = new Set(prev)
        if (alreadyIn) next.delete(membershipKey)
        else next.add(membershipKey)
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
        // Roll back the optimistic change (targeted key only).
        setWatchlistIds((prev) => {
          const next = new Set(prev)
          if (alreadyIn) next.add(membershipKey)
          else next.delete(membershipKey)
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
