# PHASE 6 (M6) Report — UI Consistency, States, Confirms, Dead Code, I18N Honesty

**Base:** `99bb4a0` (verified: `git log --oneline -5` = `99bb4a0/515db85/fdf960b/1aecc88/2c64209`).
**Design contract:** `docs/UI_UX_REVIEW.md` §4 (tokens — no change, fixed dark look kept), §5 (state matrix gaps), §9 (strengths preserved: SearchBar, personalization states, privacy UI), §14 (non-recommendations respected: no new deps, no redesign) + `ui-ux-pro-max` skill invoked first (consistency/unification, confirm-before-destructive, explicit toggle values, touch-target guidance applied).
**Scope lock:** zero API contract changes, zero backend/env/CI changes, frozen suites unmodified, no visual redesign beyond unification. The 9 neutral untracked owner docs untouched.
**Verification:** `npm run lint` exit 0 (0 errors, 94 warnings — all pre-existing); `npm run typecheck` exit 0; `npm test` exit 0 (35 files / 345 tests, incl. 8 new M6 tests); `npm run build` exit 0.

## 1. Files changed

| File | Change |
|---|---|
| `components/MediaCard.tsx` (new) | One card with `variant="grid\|detailed\|compact"` + `accent="cyan\|pink"`; explicit `aria-pressed="true"` + labelled remove buttons; `sizes` + `lazy` + placeholder poster preserved. |
| `components/ConfirmDialog.tsx` (new) | Shared Radix AlertDialog confirm (focus trap + Escape free); cancel stays default-focused. |
| `app/watchlist/page.tsx`, `app/favorites/page.tsx` | Switched to `MediaCard`; sort/view toasts dropped; sort dropdown gains `aria-expanded/haspopup/listbox/option/selected`; view toggles gain `aria-pressed` + labels; optimistic remove with rollback toasts kept; **Clear list** confirm (destructive, rollback on failure). |
| `components/Watchlist.tsx` | `GridItemCard` → `MediaCard variant="grid" accent="cyan"`. |
| `components/Section.tsx` | `div` → landmark `section` with `aria-label`; accent bar `aria-hidden`; stray dead import removed (`app/page.tsx`); kept for the one real consumer (`movie/[id]` Additional Details). |
| `app/page.tsx` | Removed unused `Section` import (STEP 2 blast-radius reduction). |
| `components/GenreGrid.tsx` | Genre emoji `aria-hidden`; buttons gain `type="button"` + `focus-visible` ring. |
| `app/genres/page.tsx` | Error state (`role=alert` + working retry, no more console-only) + empty state. |
| `app/trending/page.tsx` | Empty-state message instead of bare empty `ul` (`role=alert` on error kept). |
| `app/profile/page.tsx` | Redirect moved into `useEffect` (no mid-render `router.push`); `null` while unauthenticated. |
| `components/PrivacySettings.tsx` | Clear-history now behind `ConfirmDialog` (typed account-delete confirm unchanged). |
| `components/ChatList.tsx` | Chat delete now behind `ConfirmDialog` (immediate DELETE removed). |
| `contexts/LanguageContext.tsx` | `LANGUAGES` trimmed 12 → 4 shipped catalogs (`en-US/es-ES/fr-FR/de-DE`); English fallback preserved. |
| `package.json` / `package-lock.json` | Removed `embla-carousel-react`, `embla-carousel` (transitive), `date-fns`, `input-otp`, `vaul`, `sonner`, `react-day-picker`. `recharts` KEPT (`DashboardOverview` imports it directly). |
| Deleted (13 files) | 6 cards + `ui/carousel|calendar|input-otp|drawer|chart|sonner` + `ui/use-toast.ts` (kept `hooks/use-toast.ts`, the one `ui/toaster.tsx` imports). |
| `tests/m6-consistency.test.tsx` | 8 jsdom tests (see §4). |

## 2. Six-card BEFORE/AFTER matrix

| Before (6 files) | After (`MediaCard`) | Preserved |
|---|---|---|
| `GridItemCard` (cyan, Bookmark) | `variant="grid" accent="cyan"` | `onRemove` guard (`stopPropagation`), `sizes` + `lazy`, placeholder, rating pill, hover overlay, genre slice-2 |
| `FavoriteGridItemCard` (pink, Heart) | `variant="grid" accent="pink"` | Same + strict NaN guards (now applied to both) |
| `DetailedItemCard` (cyan) | `variant="detailed" accent="cyan"` | `formatDate` N/A path, Added-date, full genres, overview clamp |
| `FavoriteDetailedItemCard` (pink) | `variant="detailed" accent="pink"` | Same + `releaseDate !== 'N/A'` guard unified |
| `CompactItemCard` (cyan) | `variant="compact" accent="cyan"` | w200 poster, quality 70, first-genre |
| `FavoriteCompactItemCard` (pink) | `variant="compact" accent="pink"` | Same + NaN-safe year/runtime unified |
| Bare `aria-pressed` (`GridItemCard`) / missing labels (Favorite*) | Explicit `aria-pressed="true"` + `Remove {title} from {Watchlist\|Favorites}` on all three variants | Focus-visible rings per accent |

## 3. Bundle delta (First Load JS shared + routes, `npm run build` exit 0)

| Route | BEFORE | AFTER | Δ |
|---|---|---|---|
| Shared by all | 102 kB | 102 kB | 0 |
| `/favorites` | 6.61 kB / 135 kB | 4.23 kB / 150 kB | page −2.38 kB (shared-chunk re-balance; first-load +15 kB on this route only) |
| `/watchlist` | 6.71 kB / 136 kB | 4.31 kB / 150 kB | page −2.40 kB (same rebalance note) |
| `/profile` | 8.21 kB / 140 kB | 5.13 kB / 154 kB | page −3.08 kB (AlertDialog chunk shared) |
| `/genres` | 2.65 kB / 117 kB | 2.95 kB / 118 kB | +0.30 kB (error/empty states) |
| `/trending` | 2.59 kB / 135 kB | 2.65 kB / 135 kB | +0.06 kB |
| `/movie/[id]` | 4.63 kB / 155 kB | 4.69 kB / 155 kB | +0.06 kB |
| Middleware | 56.9 kB | 56.9 kB | 0 |

Note: shared bundle unchanged at 102 kB; dep removal shrinks `node_modules` (~−1.1k lines in lockfile) and removes 7 dead UI primitives from the graph, but Next's shared chunk boundary is unaffected at this size. Per-route page JS drops on the two heaviest list pages.

## 4. Tests (8 new, `tests/m6-consistency.test.tsx`)

Grid/cyan accent + explicit `aria-pressed`; detailed/pink Favorites label + Added-date; compact rating + genre; `Section` landmark semantics; `ConfirmDialog` blocks until confirmed; `LANGUAGES` exactly 4; `package.json` dead-dep tripwire (+`recharts` kept assertion); 13 deleted files absent + `MediaCard`/`hooks/use-toast` present. Full suite: **35 files / 345 tests green, exit 0.**

## 5. Verify (direct exit codes)

- `npm run lint` → exit 0 (0 errors, 94 warnings, pre-existing).
- `npm run typecheck` (`tsc --noEmit`) → exit 0.
- `npm test` (default, full, zero exclusions) → exit 0, 35 passed / 345 passed.
- `npm run build` → exit 0 (table above).

## 6. Commits + HOLD (no push)

- `adfb83a` chore(docs): correct M5 report commit shas (commit 0, docs-only; `4dc9d58` was a superseded local SHA — never on `main` — the pushed commit is `99bb4a0`; report §6 fixed).
- `0fe9c4c` refactor(ui): MediaCard unification + Section/PageWrapper decision (STEP 1–2; includes STEPS 3–6 file edits as single reviewable unit — see deviation note).
- Planned: `chore(deps): remove dead dependencies + phase report` (this file + dep removals; staged next).
- Push: **NOT pushed — HOLD honored.** Awaiting owner confirmation of BOTH: (a) Upstash redis trio green; (b) M5 keyboard smoke walk green.

Deviation note: the brief asked for max 3 commits with UX fixes (commit 2) separate from MediaCard (commit 1). The watchlist/favorites pages needed card-import and UX edits in the same hunks; splitting would have left commit 1 unbuildable (imports pointing at deleted files). Kept as one coherent refactor commit; dep removal stays separate for a clean revert boundary.

## 7. STEP 2 decision (ADOPT — keep both, rationale + blast radius)

**Decision: ADOPT (keep both primitives), not delete.**
- `PageWrapper`: 5 consumers (`movie/[id]`, `tv/[id]`, `actor/[id]`, `watchlist`, `favorites`) rely on its Suspense fallback + `role="region"` landmark (M4 A6 fix). Deleting would reintroduce nested-`<main>` risk and remove the only loading boundary on those pages. Blast radius of deletion (5 pages + landmark regression) exceeds any cleanliness gain.
- `Section`: only 1 real consumer remains (`movie/[id]` "Additional Details"); `app/page.tsx` import was dead (imported, never rendered) and was removed. Kept as the single section-header recipe (review §4.B strength) with landmark semantics added (`section` + `aria-label`); deleting it for one consumer saves 20 lines but loses the shared header vocabulary the review praises.
- Recorded blast radius: `PageWrapper` 5 pages kept; `Section` 1 page kept + 1 dead import removed.

## 8. Owner smoke checklist (M6 surfaces)

- [ ] Watchlist/favorites: grid/detailed/compact render identical to before (cyan vs pink accents); remove buttons announce "Remove {title} from {Watchlist|Favorites}".
- [ ] Sort dropdown announces expanded + selected option; changing sort/view fires NO toast.
- [ ] Remove item → success toast; failed remove → error toast + item restored.
- [ ] Clear list → confirm dialog appears; Cancel leaves list intact; Confirm clears + toast (failure restores + error toast).
- [ ] Privacy → Clear viewing history asks for confirmation first.
- [ ] Chat sidebar delete asks for confirmation first.
- [ ] `/genres` offline → error + working retry; empty API → "No genres available".
- [ ] `/trending` empty API → "No trending titles right now" (not a bare grid).
- [ ] Genre buttons show focus ring on Tab; emoji ignored by screen reader.
- [ ] Language list shows exactly 4 locales; `html lang` remains `en` (no real locale switch ships yet — documented, not changed).
