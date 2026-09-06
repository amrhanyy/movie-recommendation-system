# Phase 4 Report — Watchlist State Consolidation, Systemic A11y Overhaul & Mobile Navigation

**Project:** MovieMind (movie-recommendation-system)
**Date:** 2026-09-06
**Status:** Complete — all acceptance criteria met.

> Scope note: Phases 1–3 were completed in the same working tree and are not yet
> committed, so `git status` shows their `M`/`??` entries alongside Phase 4's.
> This report documents **only Phase 4** changes.

---

## 1. Files Created, Modified, Deleted

### Created
| File | Purpose |
|------|---------|
| `contexts/WatchlistContext.tsx` | Single source of truth for watchlist state. `useWatchlistContext()` exposes `watchlistIds: Set<number>`, `isInWatchlist(id)`, `toggleWatchlist(item)` (optimistic + rollback + toast), `isLoading`. Fetches `/api/watchlist` **once** per authenticated session. |
| `components/layout/MobileNav.tsx` | Mobile navigation drawer (`< 768px`) built on the Radix-backed shadcn `Sheet` (free focus-trap, Escape-to-close, dialog announcement). Custom hamburger trigger with `aria-expanded`/`aria-controls`. Renders primary routes (feature-flag-aware) + auth state (Sign In / Profile + Sign Out). |
| `tests/phase4-watchlist-mobile.test.tsx` | 6 automated tests: single-fetch, no-fetch-when-guest, optimistic rollback + error toast, DELETE-on-removal, MobileNav trigger aria, MobileNav drawer links. |

### Modified
| File | Change |
|------|--------|
| `components/providers.tsx` | Mounted `<WatchlistProvider>` inside `<SessionProvider>` (it depends on `useSession`). |
| `app/trending/page.tsx` | Migrated to `useWatchlistContext`; poster card clickable `<div>` → `next/link` (A1); bookmark `aria-label` + `aria-pressed` (A2). Removed per-component `fetch('/api/watchlist')`. |
| `components/TrendingSection.tsx` | Migrated to context; `<ul>/<li>` list with `Link` cards (A1); bookmark ARIA (A2); accessible scroll buttons with `aria-label` + visible-on-touch/focus + focus ring (A5); `motion-safe:animate-pulse` (A7); ref typed `HTMLUListElement`. |
| `components/TopRatedMovies.tsx` | Same A1/A2/A5/A7 + context migration as TrendingSection. |
| `components/TopRatedTVShows.tsx` | Same A1/A2/A5/A7 + context migration. |
| `components/ForYouSection.tsx` | Context migration; card overlay clickable `<div>` → single `Link` (A1); bookmark ARIA (A2); **replaced emoji icons (🎬/📺) with `lucide-react` `Film`/`Tv2`** (icon discipline). |
| `components/TimeBasedMovies.tsx` | Context migration; card `<div>` → `Link` (A1); bookmark ARIA (A2); time-category `aria-pressed` (A2); `motion-safe:` on pulse/ping (A7). |
| `components/MoodBasedRecommendations.tsx` | Context migration; movie card clickable `<div>` → `Link` (A1); bookmark ARIA (A2). Removed now-unused `signIn`/`useRouter`/`useSession` imports. |
| `app/movie/[id]/page.tsx` | **Eliminated the dual-state bug**: removed the local `watchlistItems` `Set` + the `useWatchlist` hook (both fetched `/api/watchlist`) and the `fetchWatchlistStatus` effect; hero save + both carousels now use `useWatchlistContext` (single state). A1: carousel cards `<div>` → `Link`. A2: all bookmark `aria-label`/`aria-pressed`. A5: all carousel scroll buttons accessible. Removed now-unused `useSession`/`Play`/`isSaved`/`signIn`. |
| `app/tv/[id]/page.tsx` | Same context migration + dual-state removal; A1/A2/A5 across hero + both carousels; removed unused `useSession`/`signIn`. |
| `app/genre/[id]/page.tsx` | Context migration (removed the 8th duplicated `fetch('/api/watchlist')`); A1: both poster-card grids `<div>` → `Link`; A2: bookmark ARIA. |
| `components/GridItemCard.tsx` | A2: bookmark `aria-label` + `aria-pressed` + focus ring. |
| `components/FavoriteButton.tsx` | A2: favorite heart `aria-label` + `aria-pressed` (kept `title`) + focus ring. |
| `components/SearchBar.tsx` | A3: header search `<input>` gained `aria-label="Search movies, TV shows, and celebrities"`, `id="global-search"`, `name="search"` (restored the `onFocus` handler in the same edit). |
| `components/PageWrapper.tsx` | A6: nested `<main>` → `<div role="region" aria-label="Page content">`, so the root layout is the **single** top-level `<main>`. |
| `components/Section.tsx` | A7: `animate-pulse` → `motion-safe:animate-pulse`. |
| `app/globals.css` | A7: global `@media (prefers-reduced-motion: reduce)` safety net neutralizing animations/transitions/scroll-behavior. |
| `app/layout.tsx` | Mounted `<MobileNav />` in the header (desktop nav is `hidden md:flex`; the drawer trigger is `md:hidden`). |

### Deleted
| File | Reason |
|------|--------|
| `components/home/PopularMovies.tsx` | Unused (no importers). |
| `app/redis-demo/` (empty dir) | Dead demo scaffold, zero files. |
| `hooks/useWatchlist.ts` | Orphaned after the dual-state bug fix — it was the per-item state that caused the redundant fetches. No consumers remain. |

---

## 2. WatchlistContext Architecture & Migration

**Problem (root cause of the 5–8 redundant calls):** 11 components each ran
`fetch('/api/watchlist')` on mount into a local `Set<number>`. On a page with
several sections (e.g. home = Trending + ForYou + TopRatedMovies +
TopRatedTVShows + TimeBased + Mood), that meant 5–8 identical network calls,
plus the movie/TV detail pages fetched it *again* while the `useWatchlist` hook
fetched a *second* copy — the dual-state desync bug.

**Solution:** one `WatchlistProvider` at the app root. The effect depends only on
`session?.user?.email`, so the list is fetched exactly once per authenticated
session; every consumer reads the shared `Set` and calls the shared
`toggleWatchlist`. Toggle semantics:

1. **Optimistic** — update the `Set` immediately (UI reacts before the round-trip).
2. **Persist** — `POST /api/watchlist` (add) or `DELETE /api/watchlist?itemId&=type` (remove).
3. **Rollback + toast** — on failure, revert the optimistic change and `toast.error`.

Consumers migrated (11 → 1 provider):
`trending/page`, `TrendingSection`, `TopRatedMovies`, `TopRatedTVShows`,
`ForYouSection`, `TimeBasedMovies`, `MoodBasedRecommendations`, `movie/[id]/page`,
`tv/[id]/page`, `genre/[id]/page`, and the standalone watchlist components
(`GridItemCard`, `FavoriteButton`) which were already stateless and only needed ARIA.

**Verification (test):** rendering the provider with **5 concurrent consumers**
asserts `fetch('/api/watchlist')` is called **exactly once** and all five read
the same shared state. A guest (no session) triggers **zero** fetches.

---

## 3. Accessibility Improvements (WCAG 2.1 AA, A1–A7)

| ID | Requirement | Where applied | Verified |
|----|-------------|---------------|----------|
| **A1** | No clickable non-interactive `<div>`s for navigation | All browse surfaces converted to `next/link` (poster cards wrap title+poster+rating; internal bookmark button uses `stopPropagation`). Surfaces: trending page, TrendingSection, TopRatedMovies, TopRatedTVShows, ForYouSection, TimeBasedMovies, MoodBasedRecommendations, movie/[id] carousels, tv/[id] carousels, genre/[id] grids. | `grep` for `onClick={() => router.push` on plain `<div>` in migrated files → none. |
| **A2** | Icon buttons have `aria-label` + `aria-pressed` | Every watchlist bookmark and the favorite heart now carry a state-dependent `aria-label` ("Add/Remove {title} to/from watchlist") and `aria-pressed`, plus a visible focus ring. | `grep aria-pressed` across components → 12 occurrences. |
| **A3** | Header search input labelled | `SearchBar` input: `aria-label` + `id` + `name`. | Present in `components/SearchBar.tsx`. |
| **A5** | Accessible carousel controls | All carousel scroll buttons are real `<button type="button">` with `aria-label="Scroll left/right"`, a visible focus ring, and — critically — `opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100` so they are **always visible on touch devices and when keyboard-focused** (no hover-only trap). | Present in all four carousel-bearing files. |
| **A6** | Single top-level `<main>` | `PageWrapper` no longer renders `<main>`; it's a `role="region"` wrapper. Only `app/layout.tsx:69` renders `<main>`. | `grep <main` → one real tag (layout); other hits are comments. |
| **A7** | Reduced-motion support | Section pulses use `motion-safe:animate-pulse`; TimeBased ping/pulse gated; **global `@media (prefers-reduced-motion: reduce)`** rule in `globals.css` neutralizes all animation/transition/scroll-behavior as a safety net. | Present in `globals.css` + `Section.tsx` + `TimeBasedMovies.tsx`. |

Additional icon discipline: `ForYouSection` emoji (🎬/📺) replaced with semantic
`lucide-react` `Film`/`Tv2`.

---

## 4. Mobile Navigation

- **Component:** `components/layout/MobileNav.tsx`, mounted in `app/layout.tsx`'s
  header. Desktop nav (`FeatureNavItems`) is `hidden md:flex`; the hamburger
  trigger is `md:hidden`, so the two never overlap.
- **Dialog primitive:** shadcn `Sheet` (Radix `Dialog`) → built-in **focus
  trapping**, **Escape-to-close**, `role="dialog"` + `aria-labelledby`
  (SheetTitle) / `aria-describedby` (SheetDescription), and scroll locking.
- **Trigger (accessible):** `<button aria-label="Open navigation menu"
  aria-expanded={open} aria-controls="mobile-navigation">` — `aria-expanded`
  reflects state; `aria-controls` targets the panel `id`.
- **Content:** brand header + explicit `aria-label="Close navigation menu"`
  close button; `<nav aria-label="Mobile navigation">` with `Link`s to
  Trending, Top Rated, Genres, Watchlist, Favorites, and AI Assistant (the
  AI item is gated by `useFeatures().isEnabled('aiAssistant')` and hidden while
  loading); `aria-current="page"` on the active route.
- **Auth state:** signed-in → Profile link + Sign Out button; guest → Sign In link.
- **Animation:** slide-in-from-left (Tailwind data-state variants) — covered by
  the A7 reduced-motion safety net.

---

## 5. Verification Output

### `npx vitest run`
```
 Test Files  17 passed (17)
      Tests  245 passed (245)
   Duration  ~36s
   exit code 0
```
245 = 239 (Phase 3 baseline) + 6 (Phase 4: `tests/phase4-watchlist-mobile.test.tsx`).
No regressions, no unhandled rejections.

### `npx tsc --noEmit`
```
(no output)
   exit code 0
```

### `npm run lint` (eslint .)
```
✖ 97 problems (0 errors, 97 warnings)
   exit code 0
```
0 errors. Warnings reduced from 109 → 97 (removed 12 by deleting orphaned
imports/functions during the migration).

### `npm run build`
```
✓ Compiled successfully in 87s
   exit code 0
```
All routes compiled, including the static `/search` (Phase 3) and the dynamic
detail pages. Build emitted the standard route table with no errors.

---

## 6. Acceptance Criteria

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Single `WatchlistProvider`; duplicate fetches eliminated | ✅ 1 provider; `fetch('/api/watchlist')` exists only in `WatchlistContext.tsx`. Test asserts 1 call for 5 consumers. |
| 2 | No clickable non-semantic `div`s for title navigation; poster cards use `<Link>` | ✅ All migrated browse surfaces use `next/link`; carousels/grids converted. |
| 3 | All watchlist/favorite buttons have `aria-label` + `aria-pressed` | ✅ 12 `aria-pressed` occurrences; every bookmark/heart labelled. |
| 4 | Header search input has `aria-label` | ✅ `SearchBar` input labelled + `id` + `name`. |
| 5 | Mobile nav drawer works `< 768px` | ✅ `MobileNav` (`md:hidden` trigger) mounted in header; test asserts drawer opens with all links. |
| 6 | Only one `<main>` landmark | ✅ Only `app/layout.tsx` renders `<main>`; PageWrapper is a region. |
| 7 | `npm test`, `tsc --noEmit`, `npm run build` all pass | ✅ 245/245 · 0 tsc errors · build compiled successfully. |

### Follow-ups (out of Phase 4 scope)
- `useFavorites`/`FavoriteButton` still fetch `/api/favorites` per-card (a favorites
  context analogous to `WatchlistContext` would be the natural next consolidation).
- The 97 remaining lint warnings are pre-existing unused-import/catch-block items
  across files not touched this phase.
- `grid-cols` for search/trending could be tuned per the `ui-ux-pro-max`
  responsive guidance in a UI-polish pass.
