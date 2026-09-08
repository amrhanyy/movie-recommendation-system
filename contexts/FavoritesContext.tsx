'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useSession, signIn } from 'next-auth/react'
import { toast } from 'react-hot-toast'

export interface FavoriteToggleItem {
  itemId: number
  type: 'movie' | 'tv'
  title: string
  posterPath: string | null
}

interface FavoritesContextValue {
  /** Set of every favorite item id (across movies and TV). */
  favoriteIds: Set<number>
  /** O(1) membership check for a single id. */
  isFavorite: (id: number) => boolean
  /**
   * Optimistically add/remove an item. Updates UI immediately, reverts and
   * toasts on failure. Prompts sign-in for guests.
   */
  toggleFavorite: (item: FavoriteToggleItem) => Promise<void>
  /** True while the initial list is being fetched. */
  isLoading: boolean
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  // Fetch the favorites once per authenticated session (single source of truth
  // for every card/section, replacing the per-component fetches).
  useEffect(() => {
    let cancelled = false
    if (!session?.user?.email) {
      setFavoriteIds(new Set())
      setIsLoading(false)
      return
    }

    const load = async () => {
      try {
        const response = await fetch('/api/favorites')
        if (!response.ok) {
          setFavoriteIds(new Set())
          return
        }
        const data: { itemId: number }[] = await response.json()
        if (cancelled) return
        const ids = new Set(
          data
            .filter((item) => typeof item.itemId === 'number')
            .map((item) => Number(item.itemId))
        )
        setFavoriteIds(ids)
      } catch (error) {
        if (cancelled) return
        console.error('Error fetching favorites:', error)
        setFavoriteIds(new Set())
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [session?.user?.email])

  const isFavorite = useCallback(
    (id: number) => favoriteIds.has(id),
    [favoriteIds]
  )

  const toggleFavorite = useCallback(
    async (item: FavoriteToggleItem) => {
      if (!session?.user?.email) {
        signIn()
        return
      }

      const alreadyIn = favoriteIds.has(item.itemId)

      // Optimistic update.
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        if (alreadyIn) next.delete(item.itemId)
        else next.add(item.itemId)
        return next
      })

      try {
        if (alreadyIn) {
          const res = await fetch(
            `/api/favorites?itemId=${item.itemId}&type=${item.type}`,
            { method: 'DELETE' }
          )
          if (!res.ok) throw new Error('Failed to remove from favorites')
          toast.success('Removed from favorites')
        } else {
          const res = await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          })
          if (!res.ok) throw new Error('Failed to add to favorites')
          toast.success('Added to favorites')
        }
      } catch (error) {
        console.error('Error toggling favorite:', error)
        // Roll back the optimistic change.
        setFavoriteIds((prev) => {
          const next = new Set(prev)
          if (alreadyIn) next.add(item.itemId)
          else next.delete(item.itemId)
          return next
        })
        toast.error('Failed to update favorites')
      }
    },
    [session?.user?.email, favoriteIds]
  )

  const value = useMemo<FavoritesContextValue>(
    () => ({ favoriteIds, isFavorite, toggleFavorite, isLoading }),
    [favoriteIds, isFavorite, toggleFavorite, isLoading]
  )

  return (
    <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
  )
}

export function useFavoritesContext(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) {
    throw new Error('useFavoritesContext must be used within a FavoritesProvider')
  }
  return ctx
}
