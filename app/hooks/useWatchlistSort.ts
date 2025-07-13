import { useMemo } from 'react'
import { WatchlistItem } from '@/app/components/watchlist/WatchlistGrid'
import { SortOption } from '@/app/components/watchlist/FilterControls'

export default function useWatchlistSort(
  items: WatchlistItem[],
  sortBy: SortOption,
  sortOrder: 'asc' | 'desc'
) {
  const sortedItems = useMemo(() => {
    if (!items?.length) return []
    
    const itemsCopy = [...items]
    
    const getSortValue = (item: WatchlistItem) => {
      switch (sortBy) {
        case 'alphabetical':
          return item.title
        case 'imdb_rating':
          // Sort nulls/undefined to the end
          return item.imdbRating ?? -1
        case 'popularity':
          return item.popularity ?? -1
        case 'num_ratings':
          return item.numRatings ?? -1
        case 'release_date':
          return item.releaseDate ?? ''
        case 'runtime':
          return item.runtime ?? -1
        case 'date_added':
          return item.addedAt
        case 'user_rating':
          return item.userRating ?? -1
        case 'list_order':
        default:
          // Default is the current order (by addedAt descending)
          return item.addedAt
      }
    }
    
    itemsCopy.sort((a, b) => {
      const valueA = getSortValue(a)
      const valueB = getSortValue(b)
      
      // Handle string comparisons
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return sortOrder === 'asc' 
          ? valueA.localeCompare(valueB)
          : valueB.localeCompare(valueA)
      }
      
      // Handle number comparisons
      return sortOrder === 'asc' 
        ? (valueA as number) - (valueB as number)
        : (valueB as number) - (valueA as number)
    })
    
    return itemsCopy
  }, [items, sortBy, sortOrder])
  
  return sortedItems
}