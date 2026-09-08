# PHASE 5 (M5) Report — UI/UX: Keyboard & A11y Blockers, Silent Failures, LCP, Double-Fetch, Stable Keys

**Base:** current main HEAD (`1aecc88` at start of phase).
**Design contract:** `docs/UI_UX_REVIEW.md` (§5 state matrix, §6 a11y A1–A12, §7 perf P1–P8, §9 strengths, §10 risks R1–R6) + `ui-ux-pro-max` skill searches run first (keyboard focus-ring guidance applied; combobox query had no DB match so WAI-ARIA combobox/listbox defaults applied and labelled as fallback; touch-target guidance applied as 44px web minimums).
**Scope lock:** zero API contract changes, zero backend/env/CI changes, frozen suites untouched, no visual redesign beyond the fixes. The 9 neutral untracked owner docs were not touched.
**Verification:** `npm run lint` exit 0 (0 errors, 95 warnings — all pre-existing); `npm run typecheck` exit 0; `npm test` exit 0 (34 files / 337 tests, incl. 11 new M5 tests); `npm run build` exit 0.

## 1. Files changed

| File | Change |
|---|---|
| `app/actor/[id]/page.tsx` | E1: movie + TV filmography `div onClick` cards → labelled `next/link` anchors with `focus-visible` ring. |
| `components/SearchBar.tsx` | E2: `combobox` + `listbox`/`option` + `aria-expanded/controls/activedescendant` (highlight tracks selection); E3: clear + recent-remove buttons to 44px; fixed dropped `</>` conditional closer. |
| `components/ChatList.tsx` | E3: delete reveals on `group-focus-within`/`focus-visible` with 44px hit area; E4: chat-history search `label` + `id`. |
| `components/TrendingSection.tsx` | E6: scroll + bookmark buttons to 44px; double-fetch kill (consume `initialMovies` for `day`, refetch on window change only); LCP: hover `/original` preload deleted, hover backdrop gated on `backdrop_path` at `w780` with `sizes`; NaN guard for missing date/rating. |
| `app/genre/[id]/page.tsx` | Bookmark buttons to 44px; retry wired to real refetch via `retryToken` (clears error, resets page/content, sets loading); `more` shimmer gated on `(hasMore \|\| isLoadingMore) && isLoadingMore`; error block gains `role=alert`. |
| `app/page.tsx` | Home error alert + working retry (`fetchMovies` extracted); `isLoading` gate shows `role=status` trending skeletons instead of hiding sections; mobile hero (`hidden md:flex` strip + stacked `md:hidden` fallback); hero posters keyboard-operable (`role=link` + Enter/Space) with first-poster `priority` + `sizes`. |
| `components/ChatAssistant.tsx` | Stable composite keys (`role-index-timestamp`); error `role=alert aria-live=assertive`; loading `role=status`; labelled input. |
| `app/ai-assistant/page.tsx` | Labelled message input; Thinking indicator `role=status aria-live=polite`; messages region `role=log`. |
| `app/watchlist/page.tsx`, `app/favorites/page.tsx` | `sr-only` labels for the page searches (ids unchanged). |
| `components/admin/UserManagement.tsx`, `components/admin/CacheManagement.tsx` | `sr-only` labels for users search + cache pattern inputs. |
| `components/PrivacySettings.tsx` | `sr-only` label for `DELETE_MY_ACCOUNT` confirm input; added missing `React` import (classic-JSX jsdom transform). |
| `contexts/WatchlistContext.tsx` | `toggleWatchlist` identity-stable: `watchlistIds` dep removed via `watchlistIdsRef` mirror + functional `setState`. |
| `tests/m5-a11y.test.tsx` | 11 jsdom tests covering (a)–(h) + stable keys + callback identity (see §4). |

## 2. BEFORE/AFTER per E-finding (E1–E6)

| ID | Before | After | Verify |
|---|---|---|---|
| E1 keyboard cards | Actor filmography cards were `div onClick → router.push` (no role, no tab stop). | Real `Link` anchors with per-title `aria-label` + `focus-visible` ring; click behavior unchanged. | Test M5 (a) asserts both hrefs, labels, ring, and no `router.push` card handler. |
| E2 listbox | Dropdown was a plain `div`; arrow keys moved highlight only. | `combobox`/`listbox`/`option`, `aria-selected`, `aria-expanded/controls/activedescendant`; active option id equals highlighted option. | Test M5 (c) types, arrows down, asserts `activedescendant` tracks the highlighted option. |
| E3 reveal + targets | Delete visible on `group-hover` only; icon buttons below 44px. | Delete reveals on `group-focus-within`/`focus-visible` too; delete, clear, recent-remove, scroll, bookmark, retry buttons all ≥44px. | Test M5 (b) asserts reveal + `min-h/w-[44px]` classes. |
| E4 labels | 8 placeholder-only inputs (assistant ×2, watchlist, favorites, admin users, cache pattern, history/privacy search, delete-confirm). | `sr-only` `<label htmlFor/id>` on all 8; placeholders unchanged. | Test M5 (d) `getByLabelText` resolves all 7 input groups (watchlist/favorites need auth, covered separately). |
| E5 live regions | Chat error was plain text; Thinking indicator unannounced. | Chat error `role=alert aria-live=assertive`; Thinking `role=status`; chat log `role=log`. | Test M5 (e) asserts `role=alert` after failed send; source test asserts `role=status` + `role=log`. |
| E6 touch targets | Bookmark/clear/search-icon buttons under 44px. | `min-h/w-[44px]` flex-centered hit areas, no visual bloat. | Covered by (b) + lint/typecheck; genre + trending buttons updated in place. |

## 3. Silent failures, double-fetch, LCP, keys, callbacks

| Item | Before | After |
|---|---|---|
| Home error | `error` set but never rendered; `isLoading` gate hid everything. | `role=alert` error + retry wired to `fetchMovies`; loading shows skeleton grid (`role=status`). |
| Genre retry | `Try Again` only cleared flags; never refetched. `more` shimmer mounted whenever `hasMore`. | `retryFetch` resets error/page/content/loading and bumps `retryToken` (effect deps `[id, contentType, retryToken]`); shimmer only while `isLoadingMore`. |
| Double-fetch | `TrendingSection` ignored `initialMovies` on mount (`useEffect → fetch day`). | Mount consumes `initialMovies` for `day` with zero fetch; fetch only on window change. Test (h) asserts zero `fetch` calls. |
| LCP | Hover `/original` backdrop preloaded with `priority`; hero posters unprioritized, unsized. | Hover preload deleted; hover backdrop `w780` + `sizes` + `aria-hidden`; hero first poster `priority` + `sizes`. |
| Keys | `key={message.timestamp}` (collision-prone). | `key={role-index-timestamp}`; no `Date.now()` in any key path. |
| Callbacks | `toggleWatchlist` dep `[email, watchlistIds]` (new identity per toggle → fleet re-render). | Deps `[email]` only via `watchlistIdsRef` mirror; functional `setState` preserved. Phase 4 single-fetch/rollback tests still green. |

## 4. Tests (11 new, `tests/m5-a11y.test.tsx`)

(a) actor anchors labelled links; (b) ChatList delete focus-within + 44px; (c) SearchBar listbox/option/activedescendant; (d) labels ×2 tests incl. authed watchlist/favorites; (e) chat `role=alert` + live-region source checks; (f) home error/loading source checks; (g) genre retry-token source checks; (h) TrendingSection zero-fetch mount; stable keys + callback-identity source checks. Full suite: **34 files / 337 tests green, exit 0.**

## 5. Verify (direct exit codes)

- `npm run lint` → exit 0 (0 errors, 95 warnings, pre-existing).
- `npm run typecheck` (`tsc --noEmit`) → exit 0.
- `npm test` (default, full, zero exclusions) → exit 0, 34 passed / 337 passed.
- `npm run build` → exit 0 (route table emitted, incl. `/genre/[id]` 3.5 kB / 129 kB).

## 6. Commits (max 3) + push + CI

- `fdf960b` fix(a11y): keyboard activation, labels, listbox semantics, live regions — 10 files, +69/−21.
- `515db85` fix(ux): home/genre silent failures, retry wiring, skeleton gating, mobile hero — 2 files, +103/−28.
- `99bb4a0` perf(ui): LCP priority, double-fetch kill, stable keys + callbacks + phase report — 4 files, +403/−14 (incl. this file + `tests/m5-a11y.test.tsx`).
- Push: `git push origin main` exit 0 (`1aecc88..99bb4a0 main -> main`).
- CI: `gh run list` reachable; latest run `34278092089` = completed/failure in ~4s with all 4 jobs blocked: "account is locked due to a billing issue" → **PENDING-OWNER** (known billing lock; local `lint`/`typecheck`/`test`/`build` all exit 0 as recorded above; nothing fabricated).

## 7. Owner smoke checklist

- [ ] Keyboard-only walk home → actor → Enter navigates (filmography anchors show focus ring).
- [ ] Tab reveals chat delete (focus-within) and activates it.
- [ ] Labels audible via DevTools accessibility tree (assistant, chat-history, watchlist, favorites, admin users, cache pattern, delete-confirm).
- [ ] Home error state via DevTools offline throttle shows alert + working retry.
- [ ] LCP trace optional (first hero poster `priority`, no `/original` preload).
