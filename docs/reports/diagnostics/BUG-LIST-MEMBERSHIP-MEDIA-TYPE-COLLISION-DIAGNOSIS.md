# BUG-LIST-MEMBERSHIP-MEDIA-TYPE-COLLISION — Read-Only Diagnosis

**Phase 6, Step 1 of 2 (diagnosis only). No fix implemented.**

| Field | Value |
|---|---|
| Project | MovieMind |
| Repository | movie-recommendation-system |
| Finding ID | FE-STATE-001 |
| Bug ID | BUG-LIST-MEMBERSHIP-MEDIA-TYPE-COLLISION |
| Diagnostic status | **PASS** (diagnosis complete; defect VERIFIED; not fixed) |
| Commit policy | COMMIT_ALLOWED: NO — honored |
| Deployment policy | DEPLOYMENT_ALLOWED: NO — honored |

---

## 1. Executive Summary

The reported condition is **confirmed in both contexts**. `WatchlistContext` and `FavoritesContext` each store membership as `Set<number>` built exclusively from the API record's `itemId` (hydration at `contexts/WatchlistContext.tsx:62-66` and `contexts/FavoritesContext.tsx:64-68`), while the API and persistence identity is the triple `(userId, itemId, type)` (strict `listItemSchema` upsert/delete keyed on `itemId+type`; unique index `{userId, itemId, type}` on both models). The identity collapse `(type, id) → id` occurs at **hydration** (earliest incorrect state, §18) and propagates to the public membership query (`isInWatchlist(id)` / `isFavorite(id)`), the optimistic add/remove (`add/delete(item.itemId)`), and rollback (`add/delete(item.itemId)`).

A movie and a TV show with the same numeric TMDB id therefore **share one membership entry**: saving movie #N marks TV #N as saved (and vice versa) in every card/detail/section view; removing one flips the other's pill; a failed toggle's rollback restores the single shared entry for both types; and — the strongest impact — the `alreadyIn` gate is id-based, so a click on the *absent* cross-type item sends a **no-op DELETE** for a nonexistent `(itemId, type)` pair, which the API answers 200 (`findOneAndDelete` is a no-op), producing a false "Removed" toast while the *present* cross-type record persists server-side: the UI then diverges from the database until the next full refetch. Persistence itself is never corrupted (all writes/deletes are type-scoped to the clicked item's own type).

**12 consumer call sites** across 11 files were inventoried. Every consumer already passes a media type to `toggle*` (literal `'movie'`/`'tv'` in single-type sections, `item.media_type` in mixed sections, a searchParams-derived cast on the genre page), so the migration is local: key the sets by a type-qualified key (canonical form `type:itemId`, e.g. `movie:603` — consistent with adjacent patterns `${media_type}-${id}` list keys, `media:${type}:${id}:details` cache keys, `/[mediaType]/[id]` routes) via one small shared helper, and change `isInWatchlist`/`isFavorite` to take `(type, id)`. No API, model, schema, or migration change is needed. Watchlist's identity-stable callback (ref mirror, test-pinned) must be preserved; the Favorites callback-identity churn (FE-DATA-002) is a separate finding and is not required by this migration.

No existing test reproduces the same-number cross-type collision; the defect is proven **statically** (deterministic). Two network-isolated existing suites were executed (7/7 green) to verify current behavior and isolation. No external network request occurred (verified per-suite; §42).

## 2. Diagnostic Status

**PASS.** All §10 completion criteria met. RID-LIST-DIAG-6 is PASS WITH WARNING in the sense that runtime frequency of same-id pairs is unmeasurable without a live catalog; the collision mechanism itself is statically deterministic.

## 3. Finding and Bug Identity

- **Finding:** FE-STATE-001 — "Watchlist/favorite membership keyed by id only (movie↔TV collision)" (`docs/UI_UX_REVIEW.md:578-601`: status Probable, severity High, confidence Medium; `docs/PROJECT_BLUEPRINT.md` references the state area).
- **Bug ID:** BUG-LIST-MEMBERSHIP-MEDIA-TYPE-COLLISION.
- **Related (separate, NOT in scope):** FE-DATA-002 — `toggleFavorite` dependency on `favoriteIds` causes callback identity churn (`docs/UI_UX_REVIEW.md:799-817`, Phase 1 report §1750).

## 4. Initial Git State

Captured before any diagnostic command:

- **Root:** `D:/fork ai to create website/final porject/movie-recommendation-system`
- **Branch:** `main`, **HEAD:** `70fe77655467f5105f5d0e9b02594ba1c62b2952`, upstream `origin/main`, +2/-0.
- **Staged:** none (`git diff --cached --name-status` empty).
- **Unstaged modified (20):** `app/api/ai-recommendations/route.ts` (Phase 5), `app/api/chat-history/route.ts`, `app/api/genres/route.ts`, `app/api/trailers/route.ts`, `app/api/user/route.ts`, `docs/PROJECT_BLUEPRINT.md`, `docs/SECURITY_AUDIT.md`, `docs/UI_UX_REVIEW.md`, `lib/security/auth.ts`, `lib/security/rateLimit.ts`, `middleware.ts`, `package-lock.json`, `package.json`, `tests/documentation-contract.test.ts`, `tests/m5-a11y.test.tsx`, `tests/performance-m4.test.ts` (Phase 5 SC-P1), `tests/ratelimit-ip-security.test.ts`, `tests/session-lifecycle.test.ts`, `tests/tmdb-proxy-validation.test.ts`.
- **Unstaged deleted (1):** `docs/ARCHITECTURE_REVIEW.md`.
- **Untracked (4):** `docs/reports/` (Phase 1-5 reports incl. Phase 5 diagnostic + completion report), `tests/ai-recommendations-ownership-exclusion.test.ts`, `tests/authenticated-read-rate-limit.test.ts`, `tests/middleware-security.test.ts`.
- All prior-phase and user changes preserved untouched by this phase.

## 5. Applicable Instructions

- No repository `AGENTS.md`; no `.cursor/rules/*.mdc` (verified in Phase 5; directories re-confirmed absent).
- User rules: staff-engineer standard; read-before-edit; no placeholders; read-only scope of this phase honored.
- Authoritative context read: `docs/PROJECT_BLUEPRINT.md` (favorites/watchlist flow + input discipline), `docs/UI_UX_REVIEW.md` (FE-STATE-001 full entry, FE-DATA-002 entry, context fan-out analysis), `docs/reports/PHASE-1-CURRENT-STATE-VERIFICATION-REPORT.md` corrected §41 (Git evidence/dirty-attribution format) and its FE-DATA-002 section, `docs/reports/PHASE-5-RECOMMENDATION-IDENTIFIER-CORRECTION-COMPLETION-REPORT.md` (current baseline + network-incident context from Phase 5 test authoring).
- Network safety requirement (§C) applied: every executed test's mocks were inspected for global `fetch` interception **before** execution; placeholder credentials are not treated as isolation.

## 6. Environment Versions

| Tool | Version |
|---|---|
| OS | Windows 10 (10.0.19045), win32 |
| Shell | PowerShell (Windows) |
| Node | v24.21.0 (local; CI Node 22 pending) |
| npm | 11.5.2 |
| Git | 2.50.1.windows.1 |
| Next.js | 15.5.24 |
| vitest | 3.2.7 |

## 7. Files and Symbols Inspected

- `contexts/WatchlistContext.tsx` (full) — `WatchlistToggleItem`, `WatchlistContextValue` (`watchlistIds: Set<number>`, `isInWatchlist(id)`, `toggleWatchlist(item)`, `isLoading`), hydration `useEffect`, `watchlistIdsRef` mirror, optimistic update + rollback, `useMemo` value.
- `contexts/FavoritesContext.tsx` (full) — `FavoriteToggleItem`, `FavoritesContextValue` (`favoriteIds: Set<number>`, `isFavorite(id)`, `toggleFavorite(item)`, `isLoading`), hydration, optimistic update + rollback, `toggleFavorite` deps `[email, favoriteIds]`.
- `app/api/watchlist/route.ts`, `app/api/favorites/route.ts` (re-verified from Phase 5) — GET/POST/DELETE contracts; `listItemSchema`; `findOneAndDelete({userId, itemId, type})`.
- `lib/models/WatchlistModel.ts`, `lib/models/FavoritesModel.ts` — schemas + unique index `{userId:1, itemId:1, type:1}`.
- `app/api/watchlist/details/route.ts` — type-scoped enrichment (`item.itemId && item.type`).
- Consumers (full or relevant sections): `components/MoodBasedRecommendations.tsx`, `components/TopRatedTVShows.tsx`, `components/TopRatedMovies.tsx`, `components/TimeBasedMovies.tsx`, `components/TrendingSection.tsx` (+ `MediaItem.media_type` derivation), `components/ForYouSection.tsx` (+ `MediaItem`, list key `${media_type}-${id}`), `components/FavoriteButton.tsx` (full), `app/genre/[id]/page.tsx` (searchParams-derived `contentType`), `app/trending/page.tsx`, `app/movie/[id]/page.tsx` (3 call sites + FavoriteButton), `app/tv/[id]/page.tsx` (2 call sites + FavoriteButton).
- List pages (local, non-context state): `app/watchlist/page.tsx`, `app/favorites/page.tsx` — type-qualified local filter/delete.
- Adjacent key patterns: `app/search/page.tsx:187` (`key={`${type}-${item.id}`}`), `components/SearchBar.tsx:176,246,308` (`search-option-${media_type}-${id}`), `components/ForYouSection.tsx:143`, `lib/cache-namespace.ts` (`media:${type}:${id}:details`), route convention `app/[mediaType]/[id]`.
- Tests: `tests/phase4-watchlist-mobile.test.tsx` (full isolation audit), `tests/favorites-context.test.tsx` (full isolation audit), `tests/m5-a11y.test.tsx` (TrendingSection-under-Provider probe + stub audit).
- Docs: FE-STATE-001/FE-DATA-002 entries and evidence pointers in `docs/UI_UX_REVIEW.md`; Phase 4/M5 reports on context history.

## 8. Watchlist Context Contract

`contexts/WatchlistContext.tsx` ('use client'):

- **Public interface:** `watchlistIds: Set<number>` (exported raw), `isInWatchlist: (id: number) => boolean`, `toggleWatchlist: (item: WatchlistToggleItem) => Promise<void>` where `WatchlistToggleItem = { itemId: number; type: 'movie' | 'tv'; title: string; posterPath: string | null }`, `isLoading: boolean`.
- **Internal state:** `useState<Set<number>>(new Set())`.
- **Hydration:** on `[session?.user?.email]` change: unauthenticated → empty set; else `fetch('/api/watchlist')` → `data: {itemId: number}[]` → `new Set(data.filter(item => typeof item.itemId === 'number').map(item => Number(item.itemId)))`. **`type` is present in every API record but discarded here.**
- **Membership query:** `watchlistIds.has(id)` — id only.
- **Toggle:** guest → `signIn()`; `alreadyIn = watchlistIdsRef.current.has(item.itemId)` (**id only**); optimistic `new Set(prev)` + `add/delete(item.itemId)` (**id only**); request: DELETE `/api/watchlist?itemId=${item.itemId}&type=${item.type}` or POST `{itemId, type, title, posterPath}` (full item — **type included**); rollback mirrors the optimistic mutation on `item.itemId`; toasts success/error.
- **Callback stability:** `toggleWatchlist` deps `[session?.user?.email]` only; `alreadyIn` resolved via `watchlistIdsRef` mirror + functional `setState` (M5 identity-stable pattern, test-pinned in `tests/phase4-watchlist-mobile.test.tsx`). `isInWatchlist` deps `[watchlistIds]` (recreated per membership change — inherent, cheap).
- **Value memo:** `useMemo(..., [watchlistIds, isInWatchlist, toggleWatchlist, isLoading])`.

## 9. Favorites Context Contract

`contexts/FavoritesContext.tsx` ('use client'): structurally identical to Watchlist — `favoriteIds: Set<number>`; hydration `fetch('/api/favorites')` → same `Number(item.itemId)` projection (**`type` discarded**); `isFavorite: (id: number) => boolean`; `toggleFavorite(item: FavoriteToggleItem)` (same shape as watchlist toggle item) with **id-only** `alreadyIn`, optimistic, and rollback; requests carry the full item (type included in POST, `type` query param in DELETE).

**Differences from Watchlist:** (a) no `watchlistIdsRef` mirror — `alreadyIn = favoriteIds.has(item.itemId)` reads state directly and `toggleFavorite` deps are `[session?.user?.email, favoriteIds]` → **new callback identity per toggle** (FE-DATA-002, separate finding); (b) no behavioral difference in the id-only identity defect.

## 10. API and Persistence Identity

- **Model (both):** required `userId` (email string), required `itemId` (Number), required `type` (enum movie|tv), `title`, `posterPath`, timestamps; **unique compound index `{ userId: 1, itemId: 1, type: 1 }`** → a user can own movie #N and TV #N as two distinct documents.
- **POST (both routes):** `listItemSchema.strict()` — `{ itemId: tmdbIdSchema, type: enum(movie,tv), title, posterPath? }`; upsert on `(userId, itemId, type)`.
- **DELETE (both routes):** query params `itemId` (positive int) + `type` (strict enum, 400 otherwise); `findOneAndDelete({ userId, itemId, type })` — **always 200 `{success:true}` even when nothing matched** (no-op returns success).
- **GET:** full lean documents including both `itemId` and `type`.
- **`/api/watchlist/details`:** enriches only records with `itemId && type ∈ {movie,tv}`; per-media cache keys `media:${type}:${itemId}:details` (type-qualified).
- **Client membership identity (`itemId` only) ≠ persistence identity (`userId, itemId, type`).** The API and persistence are fully type-correct; the collapse is client-side only (H3 rejected).

## 11. Consumer Inventory

**Watchlist context consumers (10 files, 11 call sites):**

| # | File | `isInWatchlist(...)` arg | `toggleWatchlist` type arg | Type source reliability |
|---|---|---|---|---|
| 1 | `components/MoodBasedRecommendations.tsx` | `movie.id` | `'movie'` (literal) | High (movie-only fetch) |
| 2 | `components/TopRatedTVShows.tsx` | `show.id` | `'tv'` (literal) | High (tv-only fetch) |
| 3 | `components/TopRatedMovies.tsx` | `movie.id` | `'movie'` (literal) | High |
| 4 | `components/TimeBasedMovies.tsx` | `movie.id` | `'movie'` (literal) | High |
| 5 | `components/TrendingSection.tsx` | `item.id` | `item.media_type` | High (mapped from dual movie/tv fetches; `media_type: 'movie'|'tv'` const) |
| 6 | `components/ForYouSection.tsx` | `item.id` | `item.media_type` | High (AI route returns `media_type`) |
| 7 | `app/genre/[id]/page.tsx` | `item.id` (2 sites) | `contentType as 'movie'\|'tv'` | **Medium** — `searchParams.get('type') \|\| 'movie'` cast without enum validation; undefined is impossible (default), but arbitrary values pass the cast |
| 8 | `app/trending/page.tsx` | `item.id` | `'movie'` (literal) | High |
| 9 | `app/movie/[id]/page.tsx` | `movie.id` (3 sites: hero + 2 carousels) | `'movie'` (literal, 3 sites) | High |
| 10 | `app/tv/[id]/page.tsx` | `show.id` (2 sites: hero + similar) | `'tv'` (literal, 2 sites) | High |

**Favorites context consumers (1 component, used by 2 detail pages):**

| # | File | `isFavorite` arg | `toggleFavorite` type arg | Type source |
|---|---|---|---|---|
| 11 | `components/FavoriteButton.tsx` (used in `app/movie/[id]/page.tsx:258` with `type="movie"`, `app/tv/[id]/page.tsx:222` with `type="tv"`) | `itemId` (prop) | `type` (prop, typed `'movie' \| 'tv'`) | High (compile-time enforced) |

**No consumer reads the raw `watchlistIds`/`favoriteIds` Sets directly** (verified by search: zero hits outside the contexts) — the Set exposure is interface-only, so retyping it breaks no external caller.

**No consumer lacks media type information for its item.** All 12 toggle call sites pass a type. The membership *queries* (`isInWatchlist(id)`/`isFavorite(id)`) are id-only by the context's signature, not because callers lack the data — every call site has the type immediately available (same object or literal).

**List pages are not affected by the context defect:** `app/watchlist/page.tsx:146,148` and `app/favorites/page.tsx:141,143` keep full records and filter/delete by `(item.itemId === itemId && item.type === type)` — already type-qualified.

## 12. Hydration Flow

`GET /api/watchlist` (or `/api/favorites`) → JSON array of `{ userId, itemId, type, title, posterPath, createdAt, _id? }` (lean) → context maps to `Set<number>` via `Number(item.itemId)`, **discarding `type`**. Two same-number records (movie #N, TV #N) hydrate into **one** set entry `N`. This is the earliest identity collapse (§18).

## 13. Membership-Query Flow

`isInWatchlist(id)` / `isFavorite(id)` → `set.has(id)`. For same-number movie #N + TV #N: both cards render the saved affordance from the single entry — **one item's presence is displayed on the other type's card** (every `aria-pressed`, icon fill, and aria-label in the 12 call sites).

## 14. Optimistic Add Flow

`toggleWatchlist({itemId: N, type:'tv', ...})` when movie #N is already in the set: `alreadyIn = set.has(N) = true` (wrong — TV #N is not in the list) → optimistic **delete** of `N` (movie #N's pill flips off) → request path takes the **DELETE** branch: `DELETE /api/watchlist?itemId=N&type=tv` → no matching TV doc → `findOneAndDelete` no-op → 200 `{success:true}` → `toast.success('Removed from watchlist')`. Net effect: the user's movie #N pill is removed in the UI, a false success toast fires, and nothing changed on the server. **The click intended to *add* TV #N actually *removed* movie #N's displayed membership.**

## 15. Optimistic Delete Flow

Symmetric: user removes TV #N while movie #N is present and TV #N is not: `alreadyIn = true` via movie's entry → DELETE for TV (no-op, 200) → success toast → set entry `N` removed → movie #N pill flips off. Same false-removal outcome.

## 16. Rollback Flow

On request failure (or any throw), rollback re-adds/re-deletes the **single** `item.itemId` entry. Because both types share it: (a) a failed *add* of TV #N rolls back by deleting `N`, which also clears movie #N's pill that the user expected to remain; (b) a failed *remove* of movie #N restores `N`, which also flips TV #N's pill back to saved even if the TV doc genuinely does not exist. Rollback is "correct" for the shared key and **incorrect for the cross-type item** (H7 confirmed).

## 17. Request Payload and Query Behavior

- **POST body:** `JSON.stringify(item)` = `{ itemId, type, title, posterPath }` — always the clicked item's own correct type; `listItemSchema.strict()` validates; upsert targets the clicked item's own `(userId, itemId, type)`. **Cannot create a record of the wrong type.**
- **DELETE query:** `?itemId=N&type=<clicked type>` — targets only the clicked item's own triple. **Cannot delete the cross-type record** (the API is fully type-scoped).
- **Consequence:** the only wrong request possible is the *branch mis-selection* described in §14-§15 — a DELETE sent for a record that doesn't exist (or a POST upsert that legitimately (re)adds the clicked item). Data integrity is preserved; the damage is (i) false success toasts, (ii) UI state that no longer matches the database until the next full refetch, (iii) a redundant harmless round-trip.

## 18. Earliest Identity Collapse

**`contexts/WatchlistContext.tsx:62-66` and `contexts/FavoritesContext.tsx:64-68` — hydration maps the record array to `Set<number>` via `item.itemId` alone.** Persistence hands the context two distinct same-number records; after this map they are one indistinguishable entry. All downstream id-only behavior (query, optimistic, rollback) is a consequence of this single projection. (The public interface `Set<number>` / `isIn*(id)` is the contract defect that makes the projection legal; the collapse point is hydration.)

## 19. Same-Number Cross-Type Collision Proof (static, deterministic)

Let movie M=(itemId 603, type 'movie') be in the user's watchlist and TV T=(itemId 603, type 'tv') not.

1. Hydration: `Set([Number(603)])` = `{603}` (both records cannot coexist; only M exists, but T is indistinguishable from it).
2. Card for T: `isInWatchlist(603)` → `true` → T's card renders the *saved* state and "Remove from watchlist" affordance **without T existing in the list** (display corruption, §13).
3. User clicks T (intends to add): `alreadyIn = ref.has(603) = true` → optimistic `delete(603)` → M's card flips to *unsaved* (§14).
4. Request: `DELETE /api/watchlist?itemId=603&type=tv` → no TV doc → 200 success (API no-op semantics, `app/api/watchlist/route.ts:188-196`) → `toast.success('Removed from watchlist')`.
5. End state: UI shows **neither** M nor T as saved; database still contains M. Next full refetch (new session/route remount of provider) restores M's pill; T remains correctly unsaved. **Confirmed divergence + false success, no data loss.**
6. Symmetric direction (remove present TV while same-number movie is absent) produces the same class of outcome.
7. If both M and T are genuinely in the list: set `{603}`; removing M sends the correct DELETE (M's doc removed, 200) but the optimistic `delete(603)` also flips T's pill to unsaved **while T persists** — divergence in the opposite direction.

The chain contains no runtime contingency: `Set<number>` semantics + `has(itemId)` + id-only optimistic mutation + no-op-200 DELETE = deterministic given a same-number pair. Frequency of such pairs depends on live TMDB catalog (unmeasurable offline); the UI_UX review rates it "uncommon per pair, inevitable at catalog scale" (mixed sections — Trending, For You, genre — display movie+TV together, so both cards of a colliding pair can be on screen simultaneously).

## 20. Existing Test Coverage

| Area | Test | Coverage vs this defect |
|---|---|---|
| Watchlist single-fetch + probes | `tests/phase4-watchlist-mobile.test.tsx` (6 tests) | Fixtures `[{itemId: 42},{itemId: 7}]`, `[{itemId: 500}]` — **single-type only; no same-number cross-type pair; no `type` in fixtures at all** (proves hydration ignores `type` incidentally). Member probe uses `isInWatchlist(500)` id-only signature. |
| Favorites single-fetch + optimistic + rollback | `tests/favorites-context.test.tsx` (1 test) | `ITEMS = [11..55]` all `type:'movie'`; GET fixture `[{itemId:11,type:'movie'}]`; POST body asserted `{itemId:22,...}`. No cross-type pair. |
| TrendingSection under provider (a11y) | `tests/m5-a11y.test.tsx` (M5(h) section) | Mounts with `initialMovies`, zero fetch; no membership-collision assertions. |
| API contracts | `tests/strict-validation.test.ts`, `tests/list-capacity-security.test.ts` (Phase 5/4) | Server-side `(itemId,type)` identity proven correct; no client-state coverage. |

**No existing test reproduces the collision.** Per protocol, none was created in this phase; the exact RED test is specified in §33.

## 21. Test Network-Isolation Assessment (per §C)

Executed suites (both inspected **before** execution):

- `tests/phase4-watchlist-mobile.test.tsx` — **isolated.** Every test renders only context + tiny probe components (no data-fetching components). Global `fetch` is `vi.stubGlobal('fetch', fetchMock)` in all four provider tests (`mockResolvedValue`, `mockRejectedValueOnce`, or `mockImplementation` routing only `/api/watchlist`); the unauthenticated test stubs with a bare `vi.fn()` and asserts zero calls; the `MobileNav` tests mock `LanguageContext`, `useFeatures`, `next/navigation`, and `MobileNav` itself contains **no fetch** (verified by search). No provider (TMDB/Gemini) is reachable: the only fetches the rendered tree can issue are the context's `/api/watchlist` calls, all intercepted.
- `tests/favorites-context.test.tsx` — **isolated.** Renders `FavoritesProvider` + `FavoriteButton` only; single `fetchMock` `vi.fn().mockImplementation` installed as global fetch routing `/api/favorites` GET/POST/DELETE to canned responses; `next-auth/react` and `react-hot-toast` mocked. No reachable fetch escapes the stub.

Not executed (isolation not needed to prove, no added value for this defect, or out of scope): `tests/m5-a11y.test.tsx` (stubbed but broad a11y surface — audited only: stubs present at lines 125/156/194/214/259; would be safe but unnecessary), list-page and MediaCard behavior (no dedicated suites; the pages' own local state is type-qualified per §11 and unaffected).

## 22. Root-Cause Analysis

The client contexts define membership identity as the bare numeric `itemId`, although the domain identity is `(type, itemId)` — the API validates, writes, deletes, and indexes on the triple `(userId, itemId, type)`, and TMDB's movie and TV catalogs share one numeric namespace. Hydration projects the triple to a number (earliest collapse, §18); the public query, optimistic mutation, and rollback all inherit the 1-D identity. The toggle *requests* are still type-correct (full item / typed query), so the server never misbehaves on data — the failure is entirely in client state: shared display, shared optimistic mutation, shared rollback, and the id-based `alreadyIn` branch selector that can send the wrong *kind* of request (no-op DELETE with false success) for the cross-type item. This is a client identity **contract** defect: the context interface (`Set<number>`, `isIn*(id)`) legally encodes the wrong identity, and every consumer complies with it.

## 23. Root-Cause Classification

**CLIENT IDENTITY CONTRACT DEFECT** (exactly one). Not API/persistence (both type-correct), not optimistic-update logic per se (the mutation code is correct for its key — the key is wrong), not test-only (production client code is wrong).

## 24. Reproducibility

**DETERMINISTIC STATIC.** The collision follows necessarily from `Set<number>` + `has(itemId)` + id-only mutation + no-op-200 DELETE given a same-number pair; no runtime contingency. No existing test reproduces it; a Step 2 jsdom test would promote this to DETERMINISTIC TARGETED TEST.

## 25. Impact

**WRONG REQUEST POSSIBLE** (strongest applicable class; display and optimistic state are also affected and persistence is not corrupted):
- Membership **display** corruption across all 12 call sites (wrong `aria-pressed`/affordance for the cross-type item).
- **Optimistic state** corruption in both directions (add-click removes the other type's pill; rollback restores a shared entry for both).
- **Wrong request possible:** `alreadyIn` branch mis-selection → no-op DELETE sent for a nonexistent `(itemId, type)` + false success toast → UI/database divergence until refetch. POST path cannot create wrong-type records; DELETE path cannot delete the other type's record (type-scoped server).
- **Persistence: no impact** (no data loss, no wrong-type writes).

## 26. User Impact

**PROBABLE.** Complete failure chains demonstrated statically (§19) for authenticated list users; actual frequency depends on same-number movie/TV pairs in the live TMDB catalog served by the app's sections (mixed sections can display both cards simultaneously). Not yet observed in runtime logs (none exist offline).

## 27. Confidence

**HIGH** for mechanism, collapse point, request semantics, and no-persistence-corruption (all source-verified, typecheck/test baseline consistent). **MEDIUM** for real-world pair frequency (catalog-dependent, unmeasurable without live data).

## 28. Hypothesis Matrix

| ID | Hypothesis | Supporting evidence | Contradicting evidence | Status |
|---|---|---|---|---|
| H1 | Both contexts collapse `(type, itemId)` → `itemId` | Hydration maps `Number(item.itemId)` into `Set<number>` in **both** contexts (`WatchlistContext.tsx:62-66`, `FavoritesContext.tsx:64-68`); both public APIs id-only | None | **CONFIRMED** |
| H2 | Only one context affected | — | Both contexts have identical `Set<number>` construction and id-only queries/mutations | **REJECTED** |
| H3 | APIs or models also fail to distinguish type | — | Strict `listItemSchema` requires `type`; DELETE validates `type` (400 otherwise) and deletes on `(userId,itemId,type)`; unique index `{userId,itemId,type}` on both models; `/api/watchlist/details` keys `media:${type}:${itemId}` | **REJECTED** |
| H4 | Every consumer already passes media type → migration is local | All 12 toggle call sites pass a type (literals or `media_type`); every `isIn*(id)` call site has the type immediately available (same object/literal); no external raw-Set consumers | Genre page's `contentType as 'movie'\|'tv'` cast is unvalidated (see H5) but always defined | **CONFIRMED** |
| H5 | Some consumers lack reliable type and need explicit adaptation | Genre page derives `type` from `searchParams` with an unvalidated cast (`app/genre/[id]/page.tsx:41,48`) | The value is never `undefined` (default `'movie'`); the page's own data comes from `/api/genre/{id}/content?type=...` so the param matches the data; an invalid value would make the API 400 (POST/DELETE) — a wrong-value risk, not a missing-type risk, and it predates/is independent of the membership key | **REJECTED** (as missing-type; residual wrong-value cast recorded as a hardening note in §30) |
| H6 | Optimistic add/remove affects the wrong cross-type item | `set.add/delete(item.itemId)` is id-only; §14/§15 chains | None | **CONFIRMED** |
| H7 | Rollback can restore an incorrect shared state | Rollback mutates the same shared `itemId` entry (§16: failed add clears the other type's pill; failed remove resurrects a non-existent type's pill) | None | **CONFIRMED** |
| H8 | Defect is visual only, persistence correct | All writes/deletes type-scoped; server data integrity preserved | Wrong-branch requests (no-op DELETE + false success) and UI/DB divergence exceed "visual only" | **SUPPORTED** (data-safe subset true; "visual only" under-states §25) |
| H9 | Current implementation can send the wrong delete request | `alreadyIn` id-based → DELETE branch selected for an absent cross-type item → `DELETE ?itemId=N&type=<clicked>` hits no doc, returns 200 (`findOneAndDelete` no-op, route always `{success:true}`) | The DELETE can never target the *other* type's existing record (query carries the clicked type); no data deletion error | **CONFIRMED** (wrong request = no-op DELETE + false success; not a data-loss request) |
| H10 | Nearby code already provides a type-qualified key pattern | `ForYouSection.tsx:143` `key={media_type}-${id}`; `app/search/page.tsx:187` `key={`${type}-${item.id}`}`; `SearchBar.tsx:176,246,308` `search-option-${media_type}-${id}`; `lib/cache-namespace.ts` `media:${type}:${id}:details`; route convention `app/[mediaType]/[id]`; AI-route hash `type:id|na:title` (Phase 5) | No *shared reusable helper* exists — patterns are per-site inline | **SUPPORTED** (pattern yes; helper no → Step 2 introduces one small canonical helper) |
| H11 | Changing membership signatures affects callback identity/memoization/render frequency | `isIn*(type,id)` has the same dep profile as today; `toggle*` already receives the full item (no signature change needed for toggles); Watchlist's `[email]`-only stable callback (ref mirror) is **preservable** — the fix must keep `alreadyIn` ref-resolved; Favorites' existing `[email, favoriteIds]` churn (FE-DATA-002) is orthogonal and not worsened if the fix keeps the same dep structure; consumers all re-render on `watchlistIds`/`favoriteIds` identity today (no `memo`) so Set-element shape change adds no new render path | None | **SUPPORTED** (manageable; constraints recorded in §30/§36) |

## 29. Rejected Hypotheses

H2 (one-context-only) and H3 (server also broken) rejected on direct source evidence (§28). H5 rejected as *missing*-type (residual unvalidated-cast note preserved, not a blocker). H8 "visual only" rejected as a *complete* characterization because H9's wrong-request path was confirmed; its data-safe core remains true.

## 30. Fix Options (no implementation)

### Option A (preferred): type-qualified membership keys in both contexts + one small shared key helper

- **Concept:** `Set<string>` keyed by canonical `listKey(type, itemId)` = `` `${type}:${itemId}` `` (e.g. `movie:603` — delimiter and order consistent with the repository's adjacent `type:id` patterns §28/H10). Public API: `isInWatchlist: (type: 'movie'|'tv', id: number) => boolean`, `isFavorite: (type, id) => boolean`; `watchlistIds`/`favoriteIds` retyped to `Set<string>` (no external raw-Set consumers, §11). `toggleWatchlist`/`toggleFavorite` signatures unchanged (already item-based); internal `alreadyIn`/optimistic/rollback use the qualified key.
- **Exact likely files:**
  1. New tiny helper (e.g. `lib/list-membership.ts` — one exported function + key type; canonical single construction point per the "no duplicated ad hoc string construction" requirement).
  2. `contexts/WatchlistContext.tsx` — state type, hydration map (`listKey(item.type, item.itemId)` with `item.type` validated against the enum, default-skipping malformed records), `isInWatchlist(type,id)`, qualified optimistic/rollback; **keep** the `watchlistIdsRef` mirror + `[email]`-only `toggleWatchlist` deps (M5 test-pinned behavior).
  3. `contexts/FavoritesContext.tsx` — same transformation; keep existing dep structure (do **not** fix FE-DATA-002 — not required by the key migration).
  4. `components/FavoriteButton.tsx` — `isFavorite(type, itemId)` (prop already typed).
  5. 10 watchlist consumer files (11 call sites) — pass the type already in scope to `isInWatchlist`: literals where today literal, `item.media_type` where today dynamic, `contentType` on the genre page (optionally hardened with an enum check — cheap, in-scope hardening note, not required).
  6. Tests: `tests/phase4-watchlist-mobile.test.tsx` (probe signature `isInWatchlist('movie', 500)`; fixtures gain `type`), `tests/favorites-context.test.tsx` (signatures via `FavoriteButton` unchanged; fixtures already typed), new `tests/list-membership-collision.test.tsx` (§33).
- **Context public API changes:** `isIn*` gains a leading `type` param; Set element type `number`→`string`. Toggle API unchanged.
- **Consumer migration:** mechanical — every call site already has the type (verified §11); 12 sites.
- **Optimistic update changes:** qualified add/delete; `alreadyIn` on the qualified key → wrong-branch (H9) eliminated: clicking the absent cross-type item now correctly takes the POST branch.
- **Rollback implications:** restores only the targeted qualified key; the cross-type pill is untouched on failure (fixes H7).
- **Callback identity implications:** Watchlist stability preserved (ref mirror kept); Favorites unchanged from today (FE-DATA-002 out of scope).
- **API compatibility:** none needed — request payloads/queries unchanged (already type-correct).
- **Persistence compatibility:** none needed — identity already `(userId,itemId,type)`.
- **Required tests:** §33.
- **Risk:** LOW (client-only; mechanical migration; server untouched; all call sites verified to have the type).
- **Rollback strategy:** revert the ~13 files; no data/state migration existed to unwind.

### Option B: keep `Set<number>`, derive per-type membership from full records

Store the record array (or `Map<number, Set<type>>`) instead of a flat Set. More state, same call-site migration, no benefit over A. **Rejected** (heavier, no additional capability).

### Option C: per-context inline key strings (no shared helper)

Two 1-line string constructions duplicated in both contexts. Rejected only against the explicit "canonical centralized key construction / no duplicated ad hoc string construction" preference; otherwise functionally identical to A. Keep as fallback if a new module is deemed over-scope — but A's helper is one function.

## 31. Preferred Fix and Rationale

**Option A.** It corrects the earliest incorrect state (hydration projection) at the contract level (the Set's element identity), reuses the repository's established `type:id` keying convention with a single canonical construction point, requires zero API/model/migration changes (server identity is already correct), eliminates all four demonstrated failure modes (§13-§16, H6/H7/H9) at once, is a mechanical low-risk migration across 12 verified call sites, and preserves the test-pinned callback-stability behavior. Legacy/compatibility concerns: none — client state is rebuilt from the API on every provider mount; no stored client state exists to migrate.

## 32. Exact Likely Step 2 Files

1. `lib/list-membership.ts` (new; one key helper + type) — or inlined once per context if the reviewer prefers zero new modules (Option C fallback).
2. `contexts/WatchlistContext.tsx`
3. `contexts/FavoritesContext.tsx`
4. `components/FavoriteButton.tsx`
5. `components/MoodBasedRecommendations.tsx`
6. `components/TopRatedTVShows.tsx`
7. `components/TopRatedMovies.tsx`
8. `components/TimeBasedMovies.tsx`
9. `components/TrendingSection.tsx`
10. `components/ForYouSection.tsx`
11. `app/genre/[id]/page.tsx`
12. `app/trending/page.tsx`
13. `app/movie/[id]/page.tsx` (3 membership sites + FavoriteButton already typed)
14. `app/tv/[id]/page.tsx` (2 membership sites + FavoriteButton)
15. `tests/phase4-watchlist-mobile.test.tsx` (signature/fixture updates)
16. `tests/favorites-context.test.tsx` (fixture/signature check)
17. `tests/list-membership-collision.test.tsx` (new regression suite, §33)

No model, schema, API route, package, lockfile, or config file changes.

## 33. Regression-Test Plan (Step 2; none created here)

New `tests/list-membership-collision.test.tsx` (jsdom project; same stubbing pattern as `phase4-watchlist-mobile`/`favorites-context` — global fetch stub installed before every render; `next-auth/react` + `react-hot-toast` mocked):

1. **Watchlist coexistence (RED):** API fixture `[{itemId: 603, type:'movie', ...}, {itemId: 603, type:'tv', ...}]` → both `isInWatchlist('movie',603)` and `isInWatchlist('tv',603)` true independently; two probes render separately.
2. **Favorites coexistence (RED):** same pair via `/api/favorites` → `isFavorite('movie',603)` and `isFavorite('tv',603)` both true.
3. **Remove movie does not remove TV (RED):** with both in list, toggle `('movie',603)` off → DELETE asserted with `itemId=603&type=movie`; `isInWatchlist('tv',603)` still true; `isInWatchlist('movie',603)` false.
4. **Remove TV does not remove movie (RED):** symmetric.
5. **Optimistic add is type-specific (RED):** movie in list, TV not; click TV → POST (not DELETE) asserted (`itemId=603`, body `type:'tv'`); TV pill on, movie pill stays on. *This case is the H9 wrong-request proof: current code sends DELETE and flips the movie pill off.*
6. **Failed add rolls back only the targeted key (RED):** POST rejects → TV pill off again; **movie pill unchanged (stays on)**; error toast.
7. **Failed delete restores only the targeted key (RED):** both in list; movie DELETE rejects → movie pill restored; **TV pill unchanged (stays on)** — current code's shared rollback also flips TV (RED).
8. **POST body correctness:** `{itemId, type, title, posterPath}` exact for both types.
9. **DELETE query correctness:** `itemId=N&type=<type>` for each direction.
10. **Hydration preserves both same-number records:** case 1/2 fixtures already require it (current code yields one entry → RED).
11. **Single-fetch behavior preserved:** exactly one GET per provider across multiple consumers (parity with existing test).
12. **Watchlist callback stability preserved:** `toggleWatchlist` reference identical across a toggle (ref-mirror behavior, parity with M5 test).
13. **Favorites callback stability documented:** assert current behavior (identity changes with `favoriteIds`) as a characterization, without fixing FE-DATA-002.
14. **Detail-page behavior parity:** `FavoriteButton` renders active/inactive per qualified key for both `type` props (movie detail + tv detail props).
15. **No external network:** every test installs a global fetch stub before render; a final assertion asserts the stub received only `/api/watchlist`/`/api/favorites` URLs (no provider hosts).

**RED→GREEN:** cases 1-10 and 15 RED against current code (shared-entry failures: single entry after hydration; wrong-branch DELETE; cross-type pill flips; shared rollback); cases 11-14 GREEN before and after (behavior preservation). After the Option A migration, all 15 GREEN.

## 34. Targeted Validation (Step 2)

- `npx vitest run tests/list-membership-collision.test.tsx` (new).
- `npx vitest run tests/phase4-watchlist-mobile.test.tsx tests/favorites-context.test.tsx tests/m5-a11y.test.tsx` (updated + a11y TrendingSection-under-provider probe; all network-isolated per §21).
- `npx tsc --noEmit` (signature migration must typecheck under `strict`).
- `npm run lint` (baseline 93 warnings — no new).

## 35. Broader Validation (Step 2)

- Full `npm test` (baseline 39 files / 375 tests / exit 0, zero unhandled errors; expect +1 file, +N tests).
- `npm run build` with CI placeholders (exit 0) — catches JSX/TSX breakage across the 10 consumer files.
- `npm audit --omit=dev --audit-level=high` (no dependency change; expect exit 0).
- Node 22 CI run (pending, as in Phase 5).

## 36. Callback and Rendering Implications

- `isIn*(type, id)`: same `useCallback` dep profile as today (`[set]`); no new churn.
- `toggle*`: signatures unchanged; **Watchlist must keep** the `watchlistIdsRef` mirror + `[email]`-only deps (test-pinned by M5/Phase 4 suites); the qualified-key `alreadyIn` is resolvable inside the ref exactly as today.
- **Favorites:** keep current dep structure (do not fold in FE-DATA-002 unless strictly required — it is not).
- No `memo`-ized consumers exist (verified: no consumer wraps the context value in memo with the callbacks as props of memoized components beyond the trivial), so Set-element shape change adds no new render path; consumers already re-render on set identity per toggle (UI_UX_REVIEW: "correct default, no evidence of jank").
- `aria-pressed`/labels improve correctness (they will reflect the item's own type).

## 37. API and Persistence Implications

**None.** POST/DELETE/GET contracts, `listItemSchema`, model schemas, unique indexes, and `/api/watchlist/details` behavior are unchanged. The server identity triple was already correct; Step 2 makes the client match it. No API versioning, no migration, no backfill, no cache key changes (detail cache keys already type-qualified).

## 38. Security and Tenant-Isolation Implications

- Ownership remains server-derived: all queries/filters still keyed on the session email; the fix adds no client-controlled identifiers to requests (payloads already carry the validated `type` enum via `listItemSchema`/query validation).
- The genre page's unvalidated `contentType` cast is a pre-existing input-trust note: after migration it flows into the membership key and (already today) into the request; an enum check at that one site is a cheap optional hardening (recorded, not required).
- No PII in client state beyond what exists today (ids/titles); no logging added.

## 39. Risks

| Risk | Assessment | Mitigation |
|---|---|---|
| Signature migration misses a call site | Typecheck fails compile (strict) — mechanical breakage is loud | `tsc --noEmit` gate; full build |
| Watchlist callback stability regresses | Test-pinned (M5/Phase 4 suites assert single-fetch; stability pattern documented) | Preserve ref mirror explicitly; re-run targeted suites |
| Stale same-number UI state after deploy | Client state rebuilds on provider mount; no persisted client state | None needed |
| Mixed-section rendering of a colliding pair during migration | Migration is atomic per release (all call sites in one change set) | Full-suite + build gates |
| Genre-page invalid `type` value | Pre-existing; API 400s the request (fail-closed); optional enum hardening | §38 note |

## 40. Unresolved Questions

1. **Frequency of same-number movie/TV pairs in the live TMDB catalog** as served by the app's sections — unmeasurable offline; drives user-impact PROBABLE vs CONFIRMED. Non-blocking.
2. Whether to harden the genre page `type` cast with an enum check in Step 2 (recommended optional; cheap) — reviewer decision.
3. Whether the new key helper should be a new module (`lib/list-membership.ts`) or inlined per context (Option A vs C preference) — reviewer decision; behavior identical.

## 41. Command Log

Working directory: `D:\fork ai to create website\final porject\movie-recommendation-system` (repository root) for all commands. No command staged, committed, or mutated repository files.

| # | Command | Exit | Result | Network? |
|---|---|---|---|---|
| 1 | `git rev-parse --show-toplevel; git branch --show-current; git rev-parse HEAD; git status --porcelain=v2 --branch` | 0 | State captured (§4) | No |
| 2 | File reads: `contexts/WatchlistContext.tsx`, `contexts/FavoritesContext.tsx` (full) | 0 | Contracts documented (§8-§9) | No |
| 3 | Grep inventory: `isInWatchlist\|toggleWatchlist\|watchlistIds\|useWatchlistContext`; `isFavorite\|toggleFavorite\|favoriteIds\|useFavoritesContext`; `FavoriteButton` | 0 | 11 files / 12 call sites (§11); no raw-Set external consumers | No |
| 4 | Grep: all `void toggleWatchlist({` sites with context; `FavoriteButton` props at both detail pages; `MediaItem`/`media_type` in Trending/ForYou; genre `contentType` | 0 | Every toggle call site passes a type (§11) | No |
| 5 | Grep: raw Set destructure/property access (`watchlistIds`/`favoriteIds` outside contexts); legacy `useWatchlist`/`useFavorites` hooks | 0 | Zero hits — no external raw-Set consumers, no legacy hook consumers | No |
| 6 | Grep: adjacent type-qualified key patterns (`${type}-${id}`, `media_type` keys, cache `media:` keys) | 0 | Pattern evidence (§28/H10) | No |
| 7 | Grep: `tests/phase4-watchlist-mobile.test.tsx` + `tests/favorites-context.test.tsx` + `tests/m5-a11y.test.tsx` mock/stub audit (`vi.mock`, `stubGlobal`, fetch) | 0 | Both executed suites statically proven fetch-isolated (§21); m5 audited only | No |
| 8 | Grep: `app/watchlist/page.tsx` + `app/favorites/page.tsx` fetch/filter/delete | 0 | List pages type-qualified locally; unaffected (§11) | No |
| 9 | `Grep` `render(` in phase4 test (both pages) + `fetch` in `components/MobileNav.tsx` | 0 | Only context + probe components rendered; MobileNav has no fetch | No |
| 10 | `npx vitest run tests/favorites-context.test.tsx tests/phase4-watchlist-mobile.test.tsx` | 0 | 2 files, 7 tests, 0 failures, 0 unhandled errors; **network-isolated** (§21); no cross-type collision asserted (fixtures single-type) — defect NOT reproduced by existing tests | **No** (global fetch stubbed in every rendered test before execution; only `/api/watchlist`/`/api/favorites` URLs reachable) |
| 11 | Doc reads: `docs/UI_UX_REVIEW.md` FE-STATE-001/FE-DATA-002 entries + context fan-out; Phase 1 report §41 + FE-DATA-002; Phase 5 completion report (baseline) | 0 | Finding cross-checked against current source; UI_UX_REVIEW claims verified accurate (evidence pointers `WatchlistContext.tsx:42`, `FavoritesContext.tsx:40`, `:82-95` match current code) | No |
| 12 | Final: `git status --porcelain=v2 --branch`, `git diff --name-status`, `git diff --cached --name-status`, `git ls-files --others --exclude-standard`; temp log removed | 0 | See §44 | No |

Temp log `p6-targeted.log` written to the OS temp directory (outside repo) and removed during the final pass.

## 42. External-Network Confirmation

**No external network request occurred during this diagnosis.**
- Only one test command was executed (#10). Before execution, both suites' mocks were inspected: every rendered component tree issues fetches only to `/api/watchlist` or `/api/favorites`, and global `fetch` is `vi.stubGlobal`-replaced with a mock in every such test *before* `render()`; one test asserts zero fetch calls; `MobileNav` (the only non-context component rendered) contains no fetch (verified by source search).
- All other commands were local file reads, source searches, and Git inspection. No `.env`/`.env.local` was read; no placeholder credentials were used as isolation; no TMDB, Gemini, MongoDB, Redis, OAuth, or other provider was contacted.

## 43. Files Created, Modified, or Deleted (this phase)

- **Created (1):** `docs/reports/diagnostics/BUG-LIST-MEMBERSHIP-MEDIA-TYPE-COLLISION-DIAGNOSIS.md` (this report) — the only new repository file attributable to this phase.
- **Modified (0). Deleted (0).**
- No temporary logs remain in the repository.

## 44. Final Git State

- Branch `main` @ `70fe77655467f5105f5d0e9b02594ba1c62b2952`, `origin/main` +2/-0. **Staged: none** (`git diff --cached --name-status` empty).
- Unstaged modified (20) / deleted (1): exactly the pre-existing set in §4 — untouched by this phase.
- Untracked: the 4 pre-existing entries in §4, with `docs/reports/` now additionally containing `docs/reports/diagnostics/BUG-LIST-MEMBERSHIP-MEDIA-TYPE-COLLISION-DIAGNOSIS.md` (this report).
- No source, test, config, package, lockfile, environment, or generated file changed by this phase; `.next/` remains gitignored; no secrets or user data appear in this report (only fixture-style synthetic ids).

## 45. Commit and Deployment Status

- **Commits:** none; HEAD unchanged.
- **Deployments:** none. No external system contacted or mutated (§42).

## 46. Requirement Traceability Matrix

| Requirement ID | Diagnostic evidence | Validation evidence | Status |
|---|---|---|---|
| LIST-DIAG-1 — Establish Watchlist client identity contract | §8 (interface, `Set<number>`, id-only query/optimistic/rollback, ref-mirror stability, exact line refs) | Source read (#2); `tests/phase4-watchlist-mobile.test.tsx` green 6/6 (#10) | **PASS** |
| LIST-DIAG-2 — Establish Favorites client identity contract | §9 (same + FE-DATA-002 dep difference) | Source read (#2); `tests/favorites-context.test.tsx` green 1/1 (#10) | **PASS** |
| LIST-DIAG-3 — Compare client identity with API/persistence identity | §10 (triple identity: schema, strict Zod, DELETE validation, unique index, no-op-200 semantics) vs §8-§9 (id-only client) | Source reads (#2, #7 routes/models re-verified); `tests/strict-validation`/`list-capacity` baselines (Phase 4/5, green in baseline) | **PASS** |
| LIST-DIAG-4 — Inventory and classify all consumers | §11 (11 files, 12 call sites, type-source reliability per site; no raw-Set consumers; list pages unaffected) | Grep inventory (#3-#5); call-site context reads (#4) | **PASS** |
| LIST-DIAG-5 — Trace hydration, membership, optimistic, rollback | §12-§17 (hydration collapse; id-only query; wrong-branch add/remove; shared rollback; request semantics) | Source reads (#2); collision chain §19; targeted suites green (#10) | **PASS** |
| LIST-DIAG-6 — Prove or reject same-number cross-type collision | §19: deterministic 7-step proof (display corruption, wrong-branch no-op DELETE + false success, divergence, no data loss); no existing test reproduces it (protocol: none created) | Static proof from verified sources; fixtures audit shows single-type-only coverage (#7); targeted suites executed isolated (#10) | **PASS** (runtime pair frequency unmeasurable offline — noted §40) |
| LIST-DIAG-7 — Assess request correctness and persistence impact | §17 (POST/DELETE type-correct; wrong request = no-op DELETE + false toast; no wrong-type write/delete possible) | Route source (`findOneAndDelete` no-op → 200) (#2 routes); API contract tests baseline green (Phase 4/5) | **PASS** |
| LIST-DIAG-8 — Evaluate callback and render implications | §36 (preserve ref mirror; Favorites unchanged; no memoized consumers; `isIn*` dep profile unchanged) | M5/Phase 4 stability tests green in baseline; H11 evidence (#3) | **PASS** |
| LIST-DIAG-9 — Evaluate hypotheses and classify root cause | §22-§29 (H1/H4/H6/H7/H9/H10 CONFIRMED-SUPPORTED; H2/H3/H5/H8-as-complete REJECTED) | Evidence rows in §28 each cite verified source/command | **PASS** |
| LIST-DIAG-10 — Recommend smallest complete fix + regression plan | §30-§33 (Option A preferred; 17 Step 2 files; 15-case RED→GREEN plan) | Plan grounded in verified call-site inventory (#3-#5) and test patterns (#7) | **PASS** |
| LIST-DIAG-11 — Preserve repository state; prevent external network | §4/§44 (initial vs final state identical except this report; nothing staged); §42 (no external request) | Final Git capture (#12); pre-execution mock audit (#7, #9); single isolated test run (#10) | **PASS** |

---

*End of diagnosis. Step 2 entry criteria satisfied: earliest collapse point, complete consumer inventory, request/persistence impact, callback constraints, and the RED→GREEN regression plan are specified; the smallest complete fix (Option A) is defined without implementation.*
