// Canonical client-side membership identity for user lists (watchlist /
// favorites). Matches the API + persistence identity `(userId, itemId, type)`
// at the client level: a movie and a TV show with the same numeric TMDB id
// MUST produce distinct keys.
//
// This module contains only the key derivation. No persistence, fetch, or UI
// logic belongs here (see `contexts/WatchlistContext.tsx` and
// `contexts/FavoritesContext.tsx`).

export type MediaType = 'movie' | 'tv'

export type ListMembershipKey = string

export function isListMediaType(value: unknown): value is MediaType {
  return value === 'movie' || value === 'tv'
}

export function isValidListItemId(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Build the canonical membership key, e.g. `movie:603` / `tv:603`.
 *
 * @throws TypeError when the media type is not `movie`|`tv` or the item id is
 * not a finite positive number (guards against silently keying garbage).
 */
export function listMembershipKey(type: MediaType, itemId: number): ListMembershipKey {
  if (!isListMediaType(type)) {
    throw new TypeError(`listMembershipKey: type must be 'movie' or 'tv', got ${String(type)}`)
  }
  if (!isValidListItemId(itemId)) {
    throw new TypeError(
      `listMembershipKey: itemId must be a finite positive number, got ${String(itemId)}`
    )
  }
  return `${type}:${itemId}`
}
