# BUG-RECOMMENDATION-OWNED-ITEM-IDENTIFIER — Read-Only Diagnosis

**Phase 5, Step 1 of 2 (diagnosis only). No fix implemented.**

| Field | Value |
|---|---|
| Project | MovieMind |
| Repository | movie-recommendation-system |
| Finding ID | REL-003 |
| Bug ID | BUG-RECOMMENDATION-OWNED-ITEM-IDENTIFIER |
| Diagnostic status | **PASS** (diagnosis complete; defect VERIFIED OPEN; REL-003 is NOT fixed) |
| Commit policy | COMMIT_ALLOWED: NO — honored |
| Deployment policy | DEPLOYMENT_ALLOWED: NO — honored |

---

## 1. Executive Summary

The reported mismatch is **real and statically deterministic**. `app/api/ai-recommendations/route.ts:183-184` builds the owned-content list as `{ title, type, id: w.tmdbId }` / `{ title, type, id: f.tmdbId }`, while the persisted `Favorites`/`Watchlist` models store the TMDB content identifier in **`itemId`** and contain **no `tmdbId` field** (from the first commit to HEAD). The query projections at `route.ts:159-160` select only `{ title: 1, type: 1, _id: 0 }` — `itemId` is not even in the result set. Consequently `item.id` is **`undefined` for every current-schema owned item**, and the only identifier-based exclusion in the pipeline — the `item.id === match.id` check inside TMDB enrichment (`route.ts:357-359`) — is **dead code** (the `item.id &&` guard short-circuits on `undefined`).

Correctness today rests entirely on title-based mechanisms (prompt `excludeTitles`, two `isTitleSimilar` filters, final title-dedup). A user can be recommended content they already own whenever the AI-returned title and the TMDB first-match title both fail title similarity against the stored title (remakes, alternate editions, subtitles, punctuation/wording variants). The identifier is **not** part of the cache hash, the prompt payload, or any sorting — so cache identity and Gemini prompt content are unaffected by the defect.

A repository-internal precedent exists: `app/api/movies/time-based/route.ts:153-154,167` reads `{ itemId: 1, tmdbId: 1, genreIds: 1 }` and computes `item.itemId ?? item.tmdbId` with an explicit "legacy docs" comment. The AI route lacks this. Preferred Step 2 fix: read `itemId` (with `tmdbId` legacy fallback, matching the time-based pattern), add both fields to the projection, and include the effective identifier in the content hash — no data migration, no cache-key namespace change.

Legacy `tmdbId` document prevalence in the collections the app actually reads (`favorites`/`watchlists`) is **PROBABLY HISTORICAL at the schema level / UNKNOWN at the data level without inspection** (see §23). This does not block the diagnosis.

## 2. Diagnostic Status

**PASS.** All completion criteria in §13 met. One RID (RID-DIAG-7) is PASS WITH WARNING because live-data prevalence of legacy `tmdbId` documents cannot be established without MongoDB access, which is prohibited.

## 3. Finding and Bug Identity

- **Finding:** REL-003 — "Recs exclusion reads non-model `tmdbId` field" (`docs/PROJECT_BLUEPRINT.md:352,401-409`; `docs/reports/PHASE-1-CURRENT-STATE-VERIFICATION-REPORT.md:647-703`, status "VERIFIED OPEN", priority MEDIUM).
- **Bug ID:** BUG-RECOMMENDATION-OWNED-ITEM-IDENTIFIER.
- **Primary goal:** determine exact root cause, behavioral impact, compatibility requirements, and smallest safe correction for the `itemId` (persisted) vs `tmdbId` (read) mismatch in AI recommendation owned-item handling.

## 4. Symptom (as reported)

Favorites/Watchlist models store the TMDB content identifier in `itemId`; the AI recommendation route was reported to read `tmdbId` when constructing owned-content inputs, so identifier comparison may receive `undefined`; title-based exclusion may still remove some items but identifier-based exclusion is not proven correct; possible contribution to sorting/hash/cache identity untraced. All reported statements verified against the repository — see §9-§20.

## 5. Initial Repository and Git State

Captured before any command that could mutate state:

- **Root:** `D:/fork ai to create website/final porject/movie-recommendation-system`
- **Branch:** `main`, **HEAD:** `70fe77655467f5105f5d0e9b02594ba1c62b2952`, upstream `origin/main`, ahead 2 / behind 0.
- **Staged:** none (`git diff --cached --name-status` empty).
- **Unstaged modified (19):** `app/api/chat-history/route.ts`, `app/api/genres/route.ts`, `app/api/trailers/route.ts`, `app/api/user/route.ts`, `docs/PROJECT_BLUEPRINT.md`, `docs/SECURITY_AUDIT.md`, `docs/UI_UX_REVIEW.md`, `lib/security/auth.ts`, `lib/security/rateLimit.ts`, `middleware.ts`, `package-lock.json`, `package.json`, `tests/documentation-contract.test.ts`, `tests/m5-a11y.test.tsx`, `tests/ratelimit-ip-security.test.ts`, `tests/session-lifecycle.test.ts`, `tests/tmdb-proxy-validation.test.ts`.
- **Unstaged deleted (1):** `docs/ARCHITECTURE_REVIEW.md`.
- **Untracked (7):** `docs/reports/PHASE-1-CURRENT-STATE-VERIFICATION-REPORT.md`, `docs/reports/PHASE-2-CHATLIST-MOCK-CORRECTION-COMPLETION-REPORT.md`, `docs/reports/PHASE-3-SUPPLY-CHAIN-REMEDIATION-COMPLETION-REPORT.md`, `docs/reports/PHASE-4-AUTH-API-SECURITY-HARDENING-COMPLETION-REPORT.md`, `docs/reports/diagnostics/BUG-CHATLIST-UNHANDLED-JSDOM-DIAGNOSIS.md`, `tests/authenticated-read-rate-limit.test.ts`, `tests/middleware-security.test.ts`.
- **Documentation-contract test:** actual tracked path is `tests/documentation-contract.test.ts` (recorded from Git, not assumed).
- All pre-existing changes (Phase 2 mock correction, Phase 3 supply-chain, Phase 4 auth/API hardening, deleted ARCHITECTURE_REVIEW, reference-doc modifications) preserved untouched by this phase.

## 6. Applicable Instructions

- No repository `AGENTS.md`; no `.cursor/rules/*.mdc` in the repository (verified by search).
- User-level rules applied: staff-engineer production standard; read-before-edit; atomic edits; no placeholders; strict typing; brief plan → precise edits → one-line verification.
- Repository operational docs consulted as authoritative context: `docs/PROJECT_BLUEPRINT.md` (REL-003 entry §401-409; input-discipline note §464), `docs/SECURITY_AUDIT.md` (no REL-003 entry found), `docs/reports/PHASE-1-CURRENT-STATE-VERIFICATION-REPORT.md` §41 (Phase 1 Verification Correction, read in full: correction of six inconsistencies; corrected final status PASS WITH WARNINGS; dirty-file attribution rules; §41.3/§41.4 Git evidence format adopted here) and the REL-003 section (§647-703: "VERIFIED OPEN"; required next action "read itemId with legacy tmdbId fallback and include the effective identifier in exclusion and cache-hash behavior"), `docs/reports/PHASE-2-CHATLIST-MOCK-CORRECTION-COMPLETION-REPORT.md`, `docs/reports/PHASE-3-SUPPLY-CHAIN-REMEDIATION-COMPLETION-REPORT.md`, `docs/reports/PHASE-4-AUTH-API-SECURITY-HARDENING-COMPLETION-REPORT.md` (checked for REL-003/`tmdbId`/`itemId` references: none).
- Read-only scope of this phase honored throughout (see §1, §10, §43).

## 7. Environment Versions

| Tool | Version |
|---|---|
| OS | Windows 10 (10.0.19045), win32 |
| Shell | PowerShell (Windows) |
| Node | v24.21.0 |
| npm | 11.5.2 |
| Git | 2.50.1.windows.1 |
| mongoose (resolved, `node_modules/mongoose/package.json`) | 8.24.3 |

## 8. Files and Symbols Inspected

- `lib/models/FavoritesModel.ts` (full), `lib/models/WatchlistModel.ts` (full), `lib/models/History.ts` (full), `lib/models/index.ts` (full), `lib/models/watchlist.ts` (empty file).
- `app/api/ai-recommendations/route.ts` (full, 530 lines) — symbols: `userContentItems`, `userContentTitles`, `normalizeTitle`, `sortedItems`, `snapshotHash`, `cacheKey`, `preferences`, `isTitleSimilar`, `filteredSuggestions`, TMDB enrichment loop (`match`, `item.id === match.id`), `uniqueItemsMap`, `balanceRecommendations`, `finalRecommendations`.
- `app/api/favorites/route.ts` (full), `app/api/watchlist/route.ts` (full), `app/api/watchlist/details/route.ts` (identifier usage).
- `app/api/movies/time-based/route.ts` (personalization block, lines 30-190) — `PersonalizationItem`, `ownedId = item.itemId ?? item.tmdbId`.
- `lib/security/schemas.ts` (full) — `tmdbIdSchema`, `listItemSchema`, `historyItemSchema`.
- `lib/cache-namespace.ts` (full) — `buildCacheKey`, `normalizeKeyComponent`, `CACHE_SCOPES.userRecommendations`.
- `lib/gemini-payload.ts` (full) — `RECOMMENDATION_SYSTEM_INSTRUCTION`, `buildRecommendationGeminiPayload`.
- `lib/mongodb.ts` (full).
- `scripts/setupDatabase.cts` (current; lines 20-205) and first-commit `scripts/setupDatabase.ts` (watchlist/media seeding).
- `tests/`: `cache-personalization.test.ts` (full), `stale-identity.test.ts` (recs section), `performance-m4.test.ts` (recs sections), `strict-validation.test.ts`, `list-capacity-security.test.ts`, `favorites-context.test.tsx` (client contract).
- `tsconfig.json`, `package.json` (scripts), `node_modules/mongoose/types/query.d.ts` (`select` signature), `node_modules/mongoose/types/connection.d.ts:180` (`mongoose.models` typing).
- Docs: REL-003 entries in `docs/PROJECT_BLUEPRINT.md`, Phase 1 report §647-703 and §41, `docs/PHASE_1_M1_SECURITY_REPORT.md` §2.2 (W3-007 legacy-fallback evidence).
- Git history: full log (46 commits), `--follow` on both model files, `-S "tmdbId"` across history, first-commit tree greps, orphan commit `9d31b5c` check.

## 9. Favorites Model and Write Contract

**Model** (`lib/models/FavoritesModel.ts`):

- Interface `IFavorite`: `userId: string; itemId: number; type: 'movie'|'tv'; title: string; posterPath: string|null; createdAt: Date`.
- Schema: `userId` String required; **`itemId` Number required**; `type` String enum `movie|tv` required; `title` String required; `posterPath` String nullable; `createdAt` Date default now. **No `tmdbId` path.**
- Unique index: `{ userId: 1, itemId: 1, type: 1 }`.
- Ownership field: `userId` (email string, server-derived from session).
- Identifier field: `itemId` (Number) — canonical, used for writes, reads, and indexes.
- Strict behavior: Mongoose default `strict: true` (not overridden in schema or `mongoose.connect` opts in `lib/mongodb.ts`). Unknown fields such as `tmdbId` are stripped on save and `doc.tmdbId` returns `undefined` at read time.
- `mongoose.models.Favorites || mongoose.model<IFavorite>('Favorites', ...)` → default collection `favorites`.

**Write contract** (`app/api/favorites/route.ts` POST):

- Body parsed as `unknown`, validated by `listItemSchema` (`lib/security/schemas.ts:38-46`): `z.object({ itemId: tmdbIdSchema, type: mediaTypeStrictSchema, title: string(1..500), posterPath: <regex>.nullable().optional() }).strict()` — **accepts exactly `itemId`**; `tmdbId` and `id` are rejected (unknown field → 400).
- `tmdbIdSchema = z.number().int().positive().max(10_000_000)` (`schemas.ts:21`).
- Persistence: `findOneAndUpdate({userId, itemId, type}, {$set:{title, posterPath}}, {upsert:true, new:true})` — `itemId` travels to Mongo; no other identifier representation is ever written.
- GET/DELETE also key on `itemId` (DELETE parses `itemId` query param, 400 on non-positive/non-integer).

**Read contracts:** favorites GET returns full lean documents (includes `itemId`); `watchlist/details` enriches by `item.itemId` (`app/api/watchlist/details/route.ts:55-67`). The entire codebase outside the two historical scripts uses `itemId` for owned lists.

## 10. Watchlist Model and Write Contract

**Model** (`lib/models/WatchlistModel.ts`): structurally identical to Favorites — `IWatchlist` interface with `itemId: number` required, enum `type`, unique index `{ userId: 1, itemId: 1, type: 1 }`, no `tmdbId` path, default `strict: true`, collection `watchlists`.

**Write contract** (`app/api/watchlist/route.ts` POST): same `listItemSchema` (single shared schema — accepts `itemId` only, `.strict()` rejects `tmdbId`/`id`); upsert on `{userId, itemId, type}` with `$set {title, posterPath, addedAt}`. DELETE on `itemId`+`type` query params. No code path in the current tree writes `tmdbId` to either collection.

**TypeScript-vs-runtime note:** the model's `mongoose.models.X || mongoose.model<T>(...)` pattern types `mongoose.models.X` as `Model<any>` (`node_modules/mongoose/types/connection.d.ts:180: readonly models: Readonly<{ [index: string]: Model<any> }>`) — this is *part* of why the defective `w.tmdbId` read compiles under `strict: true` (see §11 and §24). The interfaces (`IFavorite`/`IWatchlist`) are accurate descriptions of runtime documents; the route file does not use them for the query results.

## 11. Recommendation Query Projections

`app/api/ai-recommendations/route.ts:157-160`:

```
const [history, watchlist, favorites] = await Promise.all([
  History.find({ userId: authResult.user.email }).sort({ viewedAt: -1 }).limit(200).select({ title: 1, type: 1, _id: 0 }),
  WatchlistModel.find({ userId: authResult.user.email }).sort({ createdAt: -1 }).limit(500).select({ title: 1, type: 1, _id: 0 }),
  FavoritesModel.find({ userId: authResult.user.email }).sort({ createdAt: -1 }).limit(500).select({ title: 1, type: 1, _id: 0 })
]);
```

- All three: **projection = `{ title: 1, type: 1, _id: 0 }`**. Neither `itemId` nor `tmdbId` is selected.
- No `.lean()` — results are hydrated Mongoose documents; property access (`w.title`, `w.type`) behaves normally; field reads are unaffected by hydration for these paths.
- Runtime shape per owned item after the projection: `{ title: string, type: 'movie'|'tv' }` (+ internal doc state). Any identifier read (`w.itemId`, `w.tmdbId`) is `undefined` at runtime **regardless of which field name is used**, because neither is projected.
- Mongoose 8.24.3 `select()` (`node_modules/mongoose/types/query.d.ts:773`) does **not** narrow the result type based on the projection object; `find()` therefore returns elements typed from the model's full raw type (and `Model<any>` registry typing compounds it), so `w.tmdbId` passes `tsc --noEmit` even under `strict: true`. The type system provides no safety net here (verified: `npx tsc --noEmit --incremental false` exits 0 with the defect present).
- Contrast: `app/api/movies/time-based/route.ts:153-154` projects `{ itemId: 1, tmdbId: 1, genreIds: 1, _id: 0 }` and uses explicit `.lean<PersonalizationItem[]>()` — the correct pattern for identifier consumption.

## 12. Unified Content-Item Construction

`route.ts:182-185`:

```ts
const userContentItems = [
  ...watchlist.map(w => ({ title: w.title, type: w.type, id: w.tmdbId })),
  ...favorites.map(f => ({ title: f.title, type: f.type, id: f.tmdbId }))
];
```

- Unified list = watchlist items ++ favorites items (history intentionally excluded from the ownership set; history feeds the prompt separately).
- Per-item identifier assignment: `id: w.tmdbId` / `id: f.tmdbId`.
- For every document produced by current write contracts: `tmdbId` is (a) not a schema path and (b) not in the projection → **`id === undefined` for 100% of current-schema items**. TypeScript typing of the mapped element: the honest type would be `{ title: string; type: string; id: undefined }`; the file's implicit typing hides this (see §11).
- Title-variation set `userContentTitles` (`route.ts:187-201`) is built from `item.title` only — unaffected by the identifier defect (normalized title, article-stripped variant, year-stripped variant).

## 13. Sorting and Serialization Behavior

`route.ts:203-210`:

```ts
const sortedItems = [...userContentItems]
  .sort((a, b) => a.title.localeCompare(b.title))
  .map(item => `${item.type}:${item.title}`)
  .join('|');
const snapshotHash = createHash('sha256')
  .update(`${authResult.user.email}|${sortedItems}`)
  .digest('hex')
  .slice(0, 16);
```

- Sort: by `title` only (localeCompare); ties (same title, different list) are ordered by array position — deterministic for a given document set.
- Serialization for the hash: `type:title` pairs joined by `|`, prefixed with the user's email; **`item.id` is not serialized**. The undefined identifier therefore does **not** currently enter sorting or serialization.
- Consequence: hash identity today = f(email, multiset of owned (type,title)). Adding (or removing) an owned item changes the key. The identifier, once fixed, will change the key for every user with owned content (see §14, §38).

## 14. Content-Hash and Cache-Key Behavior

- `snapshotHash` = first 16 hex chars of SHA-256 over `email|sorted(type:title pairs)` (§13).
- Cache key: `buildCacheKey(CACHE_SCOPES.userRecommendations, \`recs:${snapshotHash}\`)` (`route.ts:212`) → `movie-recommendation-system:{production|development}:v1:user:recommendations:recs_<16hex>` (note: `normalizeKeyComponent` maps the `:` in `recs:` to `_` deterministically — consistent at read and write; not a defect, recorded for completeness).
- Cache read at `route.ts:215-217` (before quota), write at `route.ts:510` (`redisCache.set(cacheKey, result, 3600)`), TTL 3600s.
- **Impact of the defect on cache identity: none.** The identifier is not an input to the hash, so the mismatch neither changes nor corrupts cache keys today. Tenant isolation: email is the first hash component and all model queries filter by the session-derived `userId` — user-scoped isolation holds.
- **Impact of the fix:** including the effective id in the serialized items changes the hash for users who have owned content (id goes from undefined to defined), orphaning old keys; they expire within the 3600s TTL. No cross-user effect, no value-schema change, no namespace change, no manual flush required.

## 15. Prompt-Input Behavior

`route.ts:233-240`: `preferences = { watchHistory: [{title,type}...], watchlist: [{title,type}...], favorites: [{title,type}...], excludeTitles: Array.from(userContentTitles) }` → stringified (bounded by `MAX_PREFERENCE_JSON_CHARS` in `buildRecommendationGeminiPayload`, `lib/gemini-payload.ts:134-159`) and sent to Gemini under `RECOMMENDATION_SYSTEM_INSTRUCTION` ("excluding titles listed in the data").

- The prompt carries **titles and types only — no identifiers at all** (neither currently nor via `item.id`, which is never serialized into `preferences`).
- **Impact of the defect on prompt content: none.** Gemini exclusion is title-based by design; the dead `item.id` never reaches the model.
- Early-return guard: if both watchlist and favorites are empty → `needsContent: true` response before hashing/quota/Gemini (`route.ts:164-169`); behavior independent of the identifier.

## 16. AI-Output and TMDB Enrichment Flow

1. `getAIRecommendations` (`route.ts:100-132`): 3 attempts, exponential backoff, only for `AI_UNAVAILABLE`/`AI_RATE_LIMITED`; returns `[]` after final failure (then fallback).
2. Output parsing: `parseAIRecommendationsFromText` (strict; failure → `AI_INVALID_RESPONSE`); item shape `{ title, confidence?, "sub-genre"?, type }` — **no IDs from AI by contract**.
3. Fallback on zero suggestions: TMDB `movie/popular` + `tv/popular` top 10 each (`route.ts:245-280`).
4. Pre-enrichment filter `filteredSuggestions` (`route.ts:315-324`): title-similarity against `userContentItems` (title-based only).
5. TMDB enrichment (`route.ts:329-379`), batches of 4 concurrent `search/multi` per suggestion title; takes `results[0]` as the match; per owned item re-check:
   - `isTitleSimilar(matchTitle, item.title)` → drop (title-based);
   - `if (item.id && item.id === match.id) return null;` (`route.ts:357-359`) — **the only identifier-based exclusion; dead** because `item.id` is `undefined` for all current-schema items (`undefined && ...` short-circuits).
6. Dedup by TMDB `id` (`uniqueItemsMap`, `route.ts:381-391`).
7. Balancing/truncation: `balanceRecommendations` (movie/TV balance, target each = floor(min(n,12)/2), confidence sort, Fisher-Yates shuffle), then final pass with `finalIds` (Set of TMDB ids) + `finalTitles` (similarity dedup) (`route.ts:468-501`).
8. Cache write + JSON response (`route.ts:503-510`).

## 17. Owned-Item Exclusion Behavior

Three effective exclusion layers, all title-based:

1. Prompt-level: `excludeTitles` in the preferences JSON (advisory — model-dependent).
2. `filteredSuggestions` (pre-enrichment) using `isTitleSimilar` (`route.ts:294-311`): normalized exact match, leading-article-stripped match, substring match when shorter ≥ 70% of longer.
3. Enrichment re-check on the TMDB-resolved `matchTitle` (same function) plus the **dead** id check (§16.5), and final `finalTitles` dedup among recommendations (compares only within the recommendation list, not against owned items).

**Gap:** exclusion fails for an owned item iff *both* the AI-returned suggestion title and the TMDB first-match title fail all three similarity rules against the stored title. Concrete failure classes: remakes/sequels with distinct canonical titles, edition variants (subtitles after a colon shorter than the 70% threshold — e.g. stored `Batman: The Dark Knight Rises` vs matched `The Dark Knight Rises`: 18/29 chars = 0.62 < 0.7 → not similar), and TMDB `search/multi` first-result mismatch (suggestion title resolves to a *different* TMDB work whose id differs from the owned id; note the id check can only help, never hurt). In those cases the user receives content already in Favorites/Watchlist.

## 18. Title-Normalization Behavior

`normalizeTitle` (`route.ts:171-176`): lowercase → strip non-word chars (`/[^\w\s]/g`) → collapse whitespace → trim. Variants added to `userContentTitles`: base, leading-article-stripped (`^(the|a|an)\s+`), and year-stripped only when the stored title ends with `(YYYY)`. `isTitleSimilar` adds the 70%-substring rule. Normalization is title-only; it is the **sole** effective correctness mechanism today and is demonstrably insufficient in principle (title pairs with zero token overlap, e.g. alternate international titles, cannot be rescued).

## 19. Full Data-Flow Trace (numbered per prompt)

1. DB queries: `History.find({userId}).sort(viewedAt desc).limit(200).select({title,type,_id:0})`; `WatchlistModel.find({userId}).sort(createdAt desc).limit(500).select({title,type,_id:0})`; `FavoritesModel.find(...)` same projection (`route.ts:157-160`).
2. Projections: as above — **no identifier field selected**.
3. Runtime shape: hydrated Mongoose docs `{ title, type }` (no `.lean()`; no `_id`).
4. Unified list: `userContentItems` (watchlist ++ favorites) at `route.ts:182-185`.
5. Identifier per unified item: `id: w.tmdbId` / `f.tmdbId` → **`undefined` (first incorrect state, §20)**.
6. Sorting/serialization: title-sorted `type:title` pairs, `|`-joined (`route.ts:203-206`) — id excluded.
7. Hash input: `email|<sorted pairs>` (`route.ts:208-210`).
8. Cache key: `movie-recommendation-system:{env}:v1:user:recommendations:recs_<16hex>` (`route.ts:212`).
9. Model/prompt input: title/type-only `preferences` JSON with `excludeTitles` (`route.ts:233-240`) — id never sent.
10. AI parsing: `parseAIRecommendationsFromText` (strict; title/confidence/sub-genre/type).
11. TMDB matching: `search/multi` by title, `results[0]` taken as match.
12. Dedup: `uniqueItemsMap` by TMDB id.
13. Owned-item exclusion: title-similarity layers (effective) + `item.id === match.id` (dead).
14. Title fallback/normalization: §18 (only effective mechanism).
15. Balancing/truncation: movie/TV balance, ≤12, confidence-ordered, shuffled, final id+title dedup.
16. Cache write: `redisCache.set(cacheKey, result, 3600)`; response `NextResponse.json(result)`.

Identifier role map: **prompt context — unused (by design); cache identity — unused; owned-item exclusion — intended but `undefined` (dead); display — final recommendations use TMDB `id` for the *returned* items (correct, from TMDB, unrelated to owned items); unused-because-undefined — `item.id` in `userContentItems`.**

## 20. First Incorrect State

**`route.ts:183-184` — the `id` field of every `userContentItems` entry is assigned from `w.tmdbId` / `f.tmdbId` and is therefore `undefined` for all current-schema owned documents.**

Two co-located factors produce this state (both must be corrected for a working fix):

- **F1 (field-name contract):** the read targets `tmdbId`, which is not a path in `FavoritesModel`/`WatchlistModel` (persisted field is `itemId`).
- **F2 (projection):** the queries at `route.ts:159-160` do not select `itemId` either, so even a corrected name would still read `undefined` until the projection includes it.

First *observable* consequence: the `item.id && item.id === match.id` guard at `route.ts:357` short-circuits to falsy for every owned item (identifier exclusion dead). Everything downstream (hash, prompt, dedup) is either unaffected or title-based, so no later stage introduces a further incorrect state.

## 21. Safe Reproduction or Static Proof

**Static proof (deterministic):**

1. Write contract: the only POST paths (`app/api/favorites/route.ts`, `app/api/watchlist/route.ts`) accept `itemId` only (`listItemSchema`, `.strict()`) and upsert on `{userId, itemId, type}`; no path in the current tree writes `tmdbId` to these collections.
2. Model contract: both schemas define `itemId: Number, required: true`; no `tmdbId` path; Mongoose strict mode (default) → `doc.tmdbId === undefined` at runtime.
3. Read contract: the recommendation projections (`{title:1, type:1, _id:0}`) exclude `itemId` and `tmdbId` alike → both reads are `undefined` for any document, current or legacy.
4. Consequence: `item.id` is `undefined` ⇒ `item.id && item.id === match.id` is never true ⇒ identifier-based exclusion never fires. This chain contains no runtime contingency.

**Existing-test reproduction: none.** The fixtures that exercise this route (`tests/performance-m4.test.ts` — mocks `WatchlistModel.find`/`FavoritesModel.find` chains with docs `{ title, type }` only and asserts timeout/limit behavior; `tests/stale-identity.test.ts` — stops at auth 401) never assert identifier-based exclusion, and `cache-personalization.test.ts` covers the *time-based* route, not the AI route. Per §4 of the protocol, no test was created or modified during diagnosis. Reproducibility is therefore classified **DETERMINISTIC STATIC** (see §26), with the exact regression test specified for Step 2 in §35.

## 22. Existing Test-Coverage Assessment

| Area | Coverage | Verdict |
|---|---|---|
| AI recs auth/rate-limit | `stale-identity.test.ts` (401 on stale session; rate-limit not called) | Present, unaffected |
| AI recs timeout/quota/read-caps | `performance-m4.test.ts` (10 tests; asserts `historyChain.select({title:1,type:1,_id:0})`, `limit(200)`, abort→504) | Present; **asserts the History projection only** — watchlist/favorites projections unasserted; a Step 2 projection change must keep these green |
| Time-based personalization incl. legacy fallback | `cache-personalization.test.ts` (2 tests; fixtures `itemId`-only) | Present for sibling route; the `tmdbId` fallback branch of `ownedId = itemId ?? tmdbId` is **never exercised by any fixture** |
| List write contracts (strict `itemId`) | `strict-validation.test.ts`, `list-capacity-security.test.ts` (14 tests), `favorites-context.test.tsx` (client posts `{itemId,...}`) | Present; confirm `itemId`-only API contract |
| ID-based exclusion in AI recs | **None** | Gap — regression test required in Step 2 |
| Snapshot hash / cache-key derivation | **None** (no test touches `snapshotHash`/`cacheKey`) | Gap — assert in Step 2 |

No existing test detects the mismatch; all 367 suite tests pass with the defect present (exit 0), consistent with a dead-code-path defect.

## 23. Legacy-Compatibility Analysis

Repository evidence only (no MongoDB access):

1. **Model history:** `git log --all -S "tmdbId" -- lib/models/` touches only `a661c68` (deletion of `lib/models/Movie.ts` + `lib/dbUtils.ts` in "production-grade hardening"), orphan `9d31b5c` (not an ancestor of HEAD; its `lib/models/` tree contains no `tmdbId`), and `bcd9c60` (first commit — `Movie.ts`/`dbUtils.ts` era). Neither `FavoritesModel.ts` nor `WatchlistModel.ts` ever contained `tmdbId` in any commit; both have used `itemId` since the first commit (`git log --oneline -- lib/models/FavoritesModel.ts` → single commit `bcd9c60`).
2. **Historical seeding script:** first-commit `scripts/setupDatabase.ts` created a lowercase **`watchlist`** collection with JSON-schema validation `required: ["title","tmdbId","type","genres"]` and a unique index `{ tmdbId: 1 }`. Two important facts: (a) the Mongoose `WatchlistModel` maps to collection **`watchlists`** (pluralized model name) and `FavoritesModel` to **`favorites`** — different (case-sensitive) collections, so script-seeded `tmdbId` documents did not land in the collections the app reads; (b) the current `scripts/setupDatabase.cts` defines the `watchlist` collection with `required: ["userId","mediaId","type"]` (mediaId-based; the `tmdbId` in the script now belongs to the `media` collection and rating seeding).
3. **Documented compatibility rule:** `app/api/movies/time-based/route.ts:43-48` (`PersonalizationItem { itemId?; tmdbId?; genreIds? }` with comment "`itemId` is the canonical model field; `tmdbId`/`genreIds` are read as a fallback for legacy docs that stored them") and `:167` (`ownedId = item.itemId ?? item.tmdbId`), corroborated by `docs/PHASE_1_M1_SECURITY_REPORT.md` §2.2 (W3-007). This is the repository's established read-time legacy-fallback pattern. No migration or backfill document for `tmdbId`→`itemId` exists.
4. **Blueprint/Phase-1 directives:** `docs/PROJECT_BLUEPRINT.md:407` ("read `itemId` (with `tmdbId` fallback), include in `sortedItems`/hash") and Phase 1 report §684 ("read itemId with legacy tmdbId fallback and include the effective identifier in exclusion and cache-hash behavior").

**Classification:**

- Legacy `tmdbId` as a *persisted field in this repository's history*: **PROBABLY HISTORICAL** (first-commit seed script required `tmdbId` in a differently-named `watchlist` collection; a deleted `Movie.ts` model used `tmdbId` for a `media` collection; a documented fallback exists in one route).
- Legacy `tmdbId` documents **in the app-read collections `favorites`/`watchlists`**: **UNKNOWN WITHOUT DATA INSPECTION** — no repository path ever wrote them there, and the seed script targeted a different collection. Prevalence remains an unresolved question (§42) and does **not** block the fix.

**Step 2 decision:** use **`itemId` with `tmdbId` fallback** (`item.itemId ?? item.tmdbId`, both projected), mirroring the existing time-based pattern. **No migration/backfill** — the compatibility requirement is safely handled at read time, and no repository evidence demonstrates a data-compatibility requirement that read-time fallback cannot cover.

## 24. Root-Cause Analysis

The recommendation route constructs owned-content items from a field that does not exist in the owned-item contract. Chain: persisted contract = `itemId` (model schema, Zod write schema, unique index, all read routes) → route reads `tmdbId` (nonexistent) → compounded by the projection not selecting `itemId` → `item.id === undefined` for every owned item → the single identifier-based exclusion (`item.id === match.id`) is dead → owned-item exclusion degrades to title-only. The defect is invisible to the type system because (a) `mongoose.models.*` is typed `Model<any>` and (b) Mongoose 8 `select()` does not narrow result types by the projection object — both verified against `node_modules/mongoose` typings; `tsc --noEmit` exits 0 with the defect present.

Why it was introduced: the `tmdbId` naming predates the current models (first-commit era, `Movie.ts`/`setupDatabase.ts`); the recommendation route was never re-aligned when the canonical field became `itemId`, while the time-based route was (W3-007) and received the documented fallback.

**Root-cause classification (exactly one): PRODUCTION FIELD-NAME CONTRACT DEFECT.**
Rationale: the first incorrect state is the read of a non-model field at `route.ts:183-184`; the missing projection is the co-located second factor of the same contract violation (the identifier must reach the recommendation context through the model's persisted field) and is part of the same one-site fix, so the case is not classified MULTI-FACTOR. It is not a projection-only defect (a projection fix alone would still read the wrong name), not a cache-identity defect (cache is unaffected), not test/documentation-only (production code is wrong).

## 25. Root-Cause Classification (summary)

**PRODUCTION FIELD-NAME CONTRACT DEFECT** (with co-located projection omission at the same construction site; both corrected by one bounded change).

## 26. Reproducibility Classification

**DETERMINISTIC STATIC.** The `undefined` identifier and dead id-check follow necessarily from source (schemas, projections, strict mode, short-circuit semantics) with no runtime contingency. No existing test demonstrates it; per protocol, none was created. A targeted Step 2 test would promote this to DETERMINISTIC TARGETED TEST.

## 27. Impact-Scope Classification

**EXCLUSION ONLY.** Identifier-based owned-item exclusion is dead; title-based layers remain active. Sorting, serialization, content hash, cache identity, prompt content, and AI parsing are all title-based or unaffected by the identifier (§13-§16).

## 28. User-Impact Classification

**PROBABLE.** A complete leakage path is demonstrated statically (owned item recommended when both suggestion title and TMDB first-match title fail all three similarity rules — remakes/editions/subtitle variants), but no runtime occurrence is observed and frequency depends on AI and TMDB title behavior, which is outside read-only scope. Consistent with the blueprint's "Probable" user-impact and Medium severity.

## 29. Confidence

**HIGH** for the defect's existence, mechanism, dead id-check, and cache/prompt non-impact (all source-verified, single-commit-stable, typecheck/test-baseline consistent). **MEDIUM** for the quantitative user-impact frequency (unmeasurable without Gemini/TMDB/DB access) and for legacy prevalence (UNKNOWN without data inspection).

## 30. Hypothesis Comparison Matrix

| ID | Hypothesis | Supporting evidence | Contradicting evidence | Status |
|---|---|---|---|---|
| H1 | Models store `itemId`; route reads `tmdbId` → `undefined` ids | Model schemas (no `tmdbId` path, `itemId` required, since first commit); `route.ts:183-184`; projections exclude both; strict mode; all write paths `itemId`-only | None | **CONFIRMED** |
| H2 | Projection or Mongoose alias auto-maps `itemId`→`tmdbId` | None | No `alias` in either schema; Mongoose 8.24.3 has no such alias here; the time-based route must explicitly select *both* fields — pointless under auto-mapping; projection selects neither field | **REJECTED** |
| H3 | Legacy records contain `tmdbId`; route intentionally supports them | First-commit seed script `tmdbId` in a `watchlist` collection (different collection name from app-read `watchlists`); time-based route's documented legacy fallback | The AI route has **no** fallback and no comment indicating intentional legacy support; no path ever wrote `tmdbId` to `favorites`/`watchlists`; "intentional" is unsupported | **REJECTED** (legacy *existence* elsewhere: PROBABLY HISTORICAL; intentional support: no) |
| H4 | Title normalization fully compensates | Four title-based layers exist and are active; similarity rules cover articles, punctuation, years, 70% substrings | Id check provably dead; title-only matching has demonstrable failure classes (zero-token-overlap variants, <70% subtitles, TMDB first-result mismatch); "fully" is unprovable and false in principle | **REJECTED** |
| H5 | Mismatch affects owned-item exclusion only | All other stages verified title-based/unaffected (§13-§16) | None | **SUPPORTED** (equivalent to impact classification EXCLUSION ONLY) |
| H6 | Mismatch also changes sorting, serialization, hashing, or cache identity | — (would require `item.id` in those inputs) | `item.id` appears nowhere in sort/hash/key construction; hash = email + title/type pairs; typecheck + 367 tests stable | **REJECTED** (as a *current* effect; note the *fix* will intentionally change the hash — §14/§38) |
| H7 | Mismatch affects prompt content or Gemini behavior | — | `preferences` JSON contains title/type only; `item.id` never serialized to Gemini; system prompt is title-based | **REJECTED** |
| H8 | Mismatch can cause recommending content already in Favorites/Watchlist | Complete static path: AI title variant + TMDB `results[0]` resolution + dead id check → owned item returned (§17) | No observed runtime instance; title layers catch common variants | **SUPPORTED** (mechanism demonstrated; occurrence not observed → drives user-impact PROBABLE) |
| H9 | Problem is test-only or documentation-only | — | Defect is in production source (`route.ts:183-184`); blueprint + Phase 1 report independently flag it; test gap is a symptom, not the cause | **REJECTED** |

## 31. Rejected Hypotheses (summary)

H2, H3 (intentional-support reading), H4, H6, H7, H9 rejected on the evidence recorded in §30. No hypothesis was rejected without at least one recorded contradicting datum.

## 32. Recommended Fix Options (no implementation)

### Option A (preferred): read `itemId` with `tmdbId` fallback; project both; include effective id in the content hash

- **Root cause addressed:** F1 (field-name contract) and F2 (projection) at the earliest incorrect state (`route.ts:183-184`), plus precise cache identity.
- **Exact likely files:** `app/api/ai-recommendations/route.ts` only (production); new test file (Step 2).
- **Production code changes:** yes — one file. Change shape:
  - Projections (lines 159-160): `.select({ itemId: 1, tmdbId: 1, title: 1, type: 1, _id: 0 })`.
  - Mapping (lines 183-184): `id: w.itemId ?? w.tmdbId` / `id: f.itemId ?? f.tmdbId` (mirrors `time-based/route.ts:167`).
  - Serialization (line 205): include the effective id, e.g. `` `${item.type}:${item.id ?? 'na'}:${item.title}` `` (exact form Step 2's choice; must be deterministic).
- **Tests change:** yes — new regression test file (§35); no existing test should need edits (verified: `performance-m4` asserts only the History projection; its watchlist/favorites fixture docs lack `itemId`, so `id` stays `undefined` there and the hash remains deterministic).
- **Models/schemas change:** no.
- **Cache identity change:** yes — hash input gains the identifier; keys for users with owned content change.
- **Old cache entries:** remain valid-but-orphaned; natural 3600s TTL expiry; no flush, no namespace change, no value-schema change.
- **Legacy `tmdbId` fallback:** yes — justified by §23 (documented repo pattern + historical schema evidence) and by blueprint/Phase-1 directives.
- **Data migration:** none.
- **Security/tenant isolation:** preserved — queries stay session-`userId`-scoped; email remains first hash component; **no identifier is added to the Gemini prompt** (title/type-only contract must be kept); key length bounded by `MAX_KEY_LENGTH`.
- **Required regression tests:** §35.
- **Targeted validation:** new test file + the 5 existing files in §36.
- **Broader validation:** §37.
- **Rollback:** revert the route file; keys revert to title-only derivation; orphaned entries expire within TTL; no data was changed.
- **Risk:** LOW (bounded single-file diff; read-only semantics; no schema/migration; pattern copied from an already-shipped sibling route).

### Option B: minimal — fix name + projection only (no legacy fallback, no hash change)

- Same as A except: projection selects only `itemId`; read `id: w.itemId` (no fallback); hash unchanged.
- **Trade-offs:** smallest diff; but (i) any legacy `tmdbId` document (unknown prevalence) loses id-based exclusion (title-only), diverging from the time-based route's established compatibility rule; (ii) cache identity stays imprecise (title-only) contrary to blueprint/Phase-1 "include in hash" directive. Risk LOW. Rejected as preferred because A costs ~2 extra lines and matches repository precedent + documented directives.

### Option C: shared compatibility helper (e.g. `getOwnedId(item)` in `lib/`)

- Extracts `itemId ?? tmdbId` for reuse by `ai-recommendations` and `time-based`.
- **Trade-offs:** single source of truth across two call sites, but adds a module/abstraction for a two-line expression with two call sites (the time-based route is stable and tested); speculative per YAGNI. Risk LOW. Keep as a future option if a third consumer appears.

## 33. Preferred Fix and Rationale

**Option A.** It corrects the earliest incorrect state (identifier construction), preserves server-derived ownership (queries untouched beyond projection), preserves user-scoped cache isolation (email-first hash unchanged in structure), avoids any data migration, reuses the repository's existing legacy-fallback pattern (no duplicate business rule invented, no new abstraction), keeps the diff to one production file (reviewable), handles historical compatibility only as far as evidence justifies, and makes the stable identifier the primary exclusion mechanism so title matching becomes a defense-in-depth layer rather than the sole correctness mechanism.

## 34. Exact Likely Step 2 Files

1. `app/api/ai-recommendations/route.ts` — projection (lines 159-160), identifier read (lines 183-184), hash serialization (line 205). *(only production file)*
2. `tests/ai-recommendations-ownership-exclusion.test.ts` — new regression suite (§35).
3. (Contingency only) `tests/performance-m4.test.ts` — touch only if Step 2's implementation changes the History projection or the mock chain shape; current assertions (`historyChain.select({title:1,type:1,_id:0})`) remain valid under Option A.

No model, schema, cache-namespace, or config files change.

## 35. Regression-Test Recommendations (Step 2; none created in this phase)

New file `tests/ai-recommendations-ownership-exclusion.test.ts`, mocking (per existing patterns in `performance-m4.test.ts`/`cache-personalization.test.ts`): `requireUser` (one session, fixed email), `applyRateLimitUser` (pass), `connectToMongoDB`, `redisCache` (spy `get`/`set`), `consumeQuota` (spy), model `find` chains (fixture-controlled docs), `GOOGLE_API_KEY` stub, and global `fetch` stubbed for Gemini (`generateContent`) and TMDB (`search/multi`, `popular`).

Cases (RED→GREEN where marked):

1. **Current-schema Favorite + Watchlist items use `itemId` and are excluded by id** — favorites fixture `{ itemId: 603, type:'movie', title:'Inception (2010)' }`, watchlist `{ itemId: 155, type:'movie', title:'The Dark Knight Rises' }`; Gemini returns a suggestion whose title *fails* title similarity to a stored title but whose TMDB `search/multi` first result resolves to the owned id (e.g. suggestion "The Dark Knight Rises" → results[0] `{ id: 155, title: 'Batman: The Dark Knight Rises' }`). Expect: excluded from response. **RED before fix** (id dead → item returned) → **GREEN after**.
2. **Control: unrelated suggestion stays** — Gemini suggestion whose TMDB match id differs from all owned ids and whose title is not similar → present in response (guards against over-exclusion).
3. **Title variation that defeats title-only matching proves id-based exclusion** — the §35.1 pair is this case: stored `The Dark Knight Rises` vs matched `Batman: The Dark Knight Rises` (22/30 chars = 0.73 — use a pair below threshold in the actual fixture, e.g. stored `Batman: The Dark Knight Rises` vs matched `The Dark Knight Rises`: 18/29 = 0.62 < 0.7 → `isTitleSimilar` false); exclusion must come from the id check alone.
4. **Cache hash / cache-key** — spy `redisCache.get`/`set`: (a) key is namespaced `user:recommendations` scope and contains a 16-hex hash; (b) same user, same owned set → same key across two calls; (c) same titles but different `itemId` (or an added owned item) → different key; (d) two different user emails with identical owned content → different keys (tenant isolation).
5. **Legacy `tmdbId` fixture (justified by §23)** — doc `{ tmdbId: 657, type:'tv', title:'Old Title' }` (no `itemId`) with TMDB match id 657 → excluded.
6. **Empty user content unchanged** — empty fixtures → `{ needsContent: true, ... }`, zero Gemini/TMDB calls, zero `consumeQuota` calls, no cache write.
7. **Quota behavior unchanged** — cache hit → `consumeQuota` not called, cached body returned; cache miss + quota exhausted → 429 with `retryAfterSeconds`; miss + allowed → called exactly once with `('recs', 20)`.
8. **Tenant/user scoping unchanged** — user A's owned item does not appear in user B's exclusion set (A's owned id absent from B's results when B's lists are disjoint); A and B cache keys differ.
9. **AI parsing/fallback unchanged** — invalid Gemini JSON → fallback/empty behavior per existing contract (mirror `performance-m4` expectations; assert no crash, status per `httpStatusForAIError`).

## 36. Targeted-Validation Recommendations (Step 2)

- `npx vitest run tests/ai-recommendations-ownership-exclusion.test.ts` (new).
- `npx vitest run tests/performance-m4.test.ts tests/stale-identity.test.ts tests/cache-personalization.test.ts tests/strict-validation.test.ts tests/list-capacity-security.test.ts tests/favorites-context.test.tsx` (regression guard; all currently passing must stay green).
- `npx tsc --noEmit` (expect exit 0; the fix also removes one instance of a wrong-field read hidden by `Model<any>` typing).

## 37. Broader-Validation Recommendations (Step 2)

- Full suite: `npm test` (baseline 38 files / 367 tests / exit 0 must hold, now +1 file).
- `npm run lint` (baseline exit 0 / 93 warnings; expect no new warnings).
- `npm run build` with CI placeholders (baseline exit 0).
- `npm run verify` as the consolidated gate if time permits.

## 38. Cache Compatibility and Expiry Considerations

- Key derivation changes only for users **with** owned content (id goes undefined→defined in the hash input). Value schema, TTL (3600s), namespace (`v1`), and scope are unchanged.
- Old keys become orphaned; they are never read again (hash mismatch) and expire within one TTL (≤ 1 hour) — no flush, no admin-cache action, no `CACHE_VERSION` bump needed.
- No cross-tenant surface: email remains the first hash component; `normalizeKeyComponent` bounds/normalizes the resource; total key length stays under `MAX_KEY_LENGTH` (16-hex hash + fixed prefix ≈ 70 chars).
- Cache-hit behavior (no quota consumption) and cache-miss behavior (quota once) are asserted unchanged in §35.7.

## 39. Data-Migration Implications

**None.** Read-time fallback (`itemId ?? tmdbId`) covers the only hypothesized legacy shape; no repository evidence shows `tmdbId` documents in the app-read collections (seed script targeted a differently-named collection with a different required-field set); the strict write schema guarantees all *new* documents carry `itemId`. A backfill is not recommended and would be an unjustified data mutation.

## 40. Security and Tenant-Isolation Implications

- Ownership remains server-derived (`requireUser` → session email → `userId` filter); the fix adds no client-controlled input.
- **Prompt hygiene must be preserved:** identifiers must not be serialized into the Gemini `preferences` payload (current title/type-only discipline stays; `item.id` is used only server-side for hash and exclusion).
- Cache keys remain email-scoped and normalized; no PII beyond the already-present email hash component; no secret material touched.
- The dead-code fix removes a latent *over-trust* in title matching only; no auth, rate-limit, quota, origin, or input-validation surface changes.

## 41. Risks and Rollback Considerations

| Risk | Assessment | Mitigation |
|---|---|---|
| Hash-input change orphans existing recs caches | Benign; ≤3600s natural expiry; slight extra Gemini/TMDB calls during transition | Monitor recs 429/upstream volume post-deploy (out of this phase's scope) |
| Legacy `tmdbId` docs, if they exist, now get id-based exclusion | Desired behavior; no data mutation | Fallback read is read-only |
| Existing test regressions (projection assertions) | Low — only History projection is asserted; fixtures lack `itemId` | §36 targeted run before full suite |
| TS typing gap (`Model<any>`) hides future field mismatches | Pre-existing, out of scope | Optional Step 2 note: add `.lean<...>()` with an explicit item interface (mirrors time-based route) as hardening within the same edit |
| Rollback | Clean: revert one route file; no data/state changed; keys revert; orphans expire | git revert of the single file |

## 42. Unresolved Questions

1. **Prevalence of legacy `tmdbId` documents in the live `favorites`/`watchlists` collections** — UNKNOWN WITHOUT DATA INSPECTION (prohibited here). Does not affect the chosen fix (fallback is read-time).
2. **Runtime frequency of title-variant leakage** (how often Gemini/TMDB title pairs defeat the three similarity rules) — unmeasurable without Gemini/TMDB access; drives the PROBABLE user-impact rating.
3. **Whether the first-commit `watchlist` seed collection was ever created in a live database** — no repository artifact answers this; only DB inspection could.
4. Whether to opportunistically add `.lean<...>()` typing to the recs queries in Step 2 (recommended inside Option A's file, listed as hardening in §41).

## 43. Command Log (working directory, exit status, result, mutation)

All commands ran with working directory `D:\fork ai to create website\final porject\movie-recommendation-system` unless stated; none staged, committed, or mutated repository files.

| # | Command | Exit | Result | File changed? |
|---|---|---|---|---|
| 1 | `git rev-parse --show-toplevel; git branch --show-current; git rev-parse HEAD; git status --porcelain=v2 --branch` | 0 | Root confirmed; `main` @ `70fe776`; `origin/main` +2/-0; 19 modified / 1 deleted / 7 untracked recorded | No |
| 2 | `node --version; npm --version; git --version` | 0 | v24.21.0 / 11.5.2 / 2.50.1.windows.1 | No |
| 3 | File searches (Glob/Grep): `AGENTS.md`, `.cursor/rules/*.mdc`, `lib/models/*`, `app/api/ai-recommendations/**`, `tmdbId` repo-wide, `listItemSchema`, test-file matches | 0 | No repo AGENTS.md or .cursor rules; models under `lib/models/`; 1 route file; full `tmdbId` inventory obtained | No |
| 4 | `git log --oneline --follow -- lib/models/FavoritesModel.ts` / `WatchlistModel.ts` | 0 | Both: single commit `bcd9c60` | No |
| 5 | `git rev-list --count HEAD; git log --oneline; git log -S "tmdbId" --oneline` | 0 | 46 commits; `tmdbId` in history via 5 commits (route, time-based route, deleted `Movie.ts`/`dbUtils.ts` era, first-commit script) | No |
| 6 | `git show bcd9c60:lib/models/FavoritesModel.ts` / `:lib/models/WatchlistModel.ts` / `:scripts/setupDatabase.ts`; `git grep -l "tmdbId" bcd9c60` | 0 | First-commit models already `itemId`-only; first-commit script's `watchlist` collection required `tmdbId` (different collection name from app-read `watchlists`) | No |
| 7 | `git log --oneline --follow -- app/api/ai-recommendations/route.ts`; `git show bcd9c60:app/api/ai-recommendations/route.ts` (grep `tmdbId\|itemId`) | 0 | `w.tmdbId`/`f.tmdbId` present since first commit — defect is original, not a regression | No |
| 8 | `git log --diff-filter=D -- lib/models/Movie.ts lib/dbUtils.ts`; `git log --oneline --follow -- lib/models/watchlist.ts` | 0 | Deleted in `a661c68`; lowercase `watchlist.ts` is an empty file since first commit | No |
| 9 | `git log --all --oneline -S "tmdbId" -- lib/models/`; `git merge-base --is-ancestor 9d31b5c HEAD` | 0 / 1 | Orphan `9d31b5c` (not ancestor of HEAD; its `lib/models/` had no `tmdbId`); no model commit ever had `tmdbId` in the app-read models | No (exit 1 = valid "not ancestor" result) |
| 10 | `npx vitest run tests/stale-identity.test.ts tests/performance-m4.test.ts tests/cache-personalization.test.ts tests/strict-validation.test.ts tests/list-capacity-security.test.ts` | 0 | 5 files, 34 tests, 0 unhandled errors; **no test detects the mismatch** | No |
| 11 | `npm test` (full suite, background) | 0 | 38 files, 367 tests, 0 unhandled errors — baseline holds | No (log written to `%TEMP%`, outside repo; removed in final pass) |
| 12 | `npx tsc --noEmit --incremental false` | 0 | Typecheck green with defect present (confirms `Model<any>`/`select()` typing gap, §11/§24); `--incremental false` prevents any `.tsbuildinfo` write | No |
| 13 | `rg` on `node_modules/mongoose` typings (`select` signature `query.d.ts:773`; `models: Readonly<{[index:string]: Model<any>}>` `connection.d.ts:180`; version 8.24.3) | 0 | Typing gap explained | No |
| 14 | `git diff --name-status; git diff --cached --name-status; git ls-files --others --exclude-standard` (mid-run snapshot) | 0 | Identical to initial state (§5); nothing staged; only pre-existing untracked set | No |
| 15 | `git check-ignore .next`; `.gitignore` inspection | 0 | `.next/` ignored — build artifacts carry no Git attribution risk | No |
| 16 | Doc reads: blueprint REL-003, Phase 1 report §647-703 and §41 (lines 4171-4350), Phase 2-4 reports (no REL-003 refs), `docs/PHASE_1_M1_SECURITY_REPORT.md` §2.2 | 0 | Directives and precedent recorded | No |
| 17 | Final pass: `git status --porcelain=v2 --branch`, `git diff --name-status`, `git diff --cached --name-status`, `git ls-files --others --exclude-standard`; temp-log cleanup | 0 | See §44-§46 | One new file (this report) |

Failed-command policy: the only nonzero exits were command #9's `merge-base --is-ancestor` (exit 1 = expected negative result, recorded) and two path-not-found probes while locating mongoose typings (harmless, re-issued successfully). No failure required or allowed a source/test repair.

## 44. Files Created, Modified, or Deleted (this phase)

- **Created (1):** `docs/reports/diagnostics/BUG-RECOMMENDATION-OWNED-ITEM-IDENTIFIER-DIAGNOSIS.md` (this report) — the only new repository file attributable to this phase.
- **Modified (0). Deleted (0).**
- Temporary log `fullsuite.log` was written to the OS temp directory (`%TEMP%`, outside the repository) and removed during the final pass; no temporary logs remain in the repository.

## 45. Commit and Deployment Status

- **Commits:** none created; nothing staged (`git diff --cached --name-status` empty); HEAD unchanged at `70fe77655467f5105f5d0e9b02594ba1c62b2952`.
- **Deployments:** none. No external systems contacted (no TMDB, Gemini, MongoDB, Redis, or network service calls; all test runs used repository mocks/fixtures).

## 46. Final Git State

Captured after report write (identical to §5 plus the new untracked report):

- Branch `main` @ `70fe77655467f5105f5d0e9b02594ba1c62b2952`, `origin/main` +2/-0.
- Staged: none.
- Unstaged modified (19) / deleted (1): exactly the pre-existing set in §5 — untouched.
- Untracked (8): the 7 pre-existing paths in §5 **plus** `docs/reports/diagnostics/BUG-RECOMMENDATION-OWNED-ITEM-IDENTIFIER-DIAGNOSIS.md`.
- No source, test, config, package, lockfile, environment, or generated file changed by this phase; `.next/` is gitignored; no secrets or user data appear in this report (only synthetic example ids and fixture-style values in the test recommendations).

## 47. Requirement Traceability Matrix

| Requirement ID | Diagnostic evidence | Command or validation evidence | Status |
|---|---|---|---|
| RID-DIAG-1 — Establish current persisted identifier contracts | §9-§10: `itemId` required in both models (since first commit), strict `.strict()` `listItemSchema` accepts `itemId` only, unique indexes on `itemId`, no write path ever persists `tmdbId`, strict Mongoose mode, TS interfaces accurate | `git show bcd9c60:lib/models/*` (#6); full reads of models/route files (#3); `git log --follow` (#4); typecheck exit 0 (#12) | **PASS** |
| RID-DIAG-2 — Trace recommendation identifier usage end to end | §19: 16-step trace from queries → projection → unified list → sort/hash → prompt → parsing → TMDB enrichment → dedup → exclusion → balancing → cache write; identifier role map per stage | Full read of `app/api/ai-recommendations/route.ts` (#3); `lib/gemini-payload.ts`, `lib/cache-namespace.ts` reads (#3); targeted tests exit 0 (#10) | **PASS** |
| RID-DIAG-3 — Identify the first incorrect state | §20: `route.ts:183-184` — `id` assigned from nonexistent `tmdbId` (F1) with `itemId` absent from projection (F2); `item.id === undefined` for all current-schema items; dead guard at `:357` | Source reads (#3); static chain §21; typecheck gap verified via mongoose typings (#13) + tsc exit 0 (#12) | **PASS** |
| RID-DIAG-4 — Determine exclusion impact | §17-§18: three active title-based layers; single id-based check dead; concrete failure classes enumerated (remakes/editions/<70% subtitles/search mismatch); complete leakage path to H8 | Source read of `isTitleSimilar`/enrichment loop (#3); no existing test covers id-exclusion (§22) — targeted suite exit 0 (#10) | **PASS** |
| RID-DIAG-5 — Determine cache hash and cache-key impact | §13-§14, §38: identifier absent from hash input today (no current cache effect); fix changes keys for users with owned content; ≤3600s natural expiry; email-scoped isolation preserved; key normalization/length bounded | Source read of `sortedItems`/`snapshotHash`/`buildCacheKey` (#3); `lib/cache-namespace.ts` full read (#3); targeted cache test exit 0 (#10) | **PASS** |
| RID-DIAG-6 — Determine prompt and AI-flow impact | §15-§16: prompt is title/type-only (`preferences`), no identifier ever sent to Gemini; parsing/fallback/balancing unaffected by the identifier | Full read of route + `lib/gemini-payload.ts` (#3); `performance-m4.test.ts` timeout/fallback behavior green (#10) | **PASS** |
| RID-DIAG-7 — Assess legacy `tmdbId` compatibility evidence | §23: PROBABLY HISTORICAL (first-commit seed script `tmdbId` in a differently-named collection; deleted `Movie.ts`; documented fallback at `time-based:167`); app-read collections UNKNOWN WITHOUT DATA INSPECTION; Step 2 uses read-time fallback, no migration | `git log --all -S "tmdbId" -- lib/models/` (#9); `git show bcd9c60:scripts/setupDatabase.ts` (#6); orphan-commit ancestry check exit 1 (#9); doc reads (#16) | **PASS WITH WARNING** (live-data prevalence unresolvable without prohibited DB access) |
| RID-DIAG-8 — Evaluate competing hypotheses | §30: H1 CONFIRMED; H5/H8 SUPPORTED; H2/H3/H4/H6/H7/H9 REJECTED, each with recorded contradicting evidence | Commands #3-#9, #13 (source, history, typings) | **PASS** |
| RID-DIAG-9 — Classify root cause, reproducibility, impact, user impact, confidence | §25-§29: PRODUCTION FIELD-NAME CONTRACT DEFECT; DETERMINISTIC STATIC; EXCLUSION ONLY; PROBABLE; HIGH (impact-frequency/legacy MEDIUM) | Static proof §21; full suite 38 files/367 tests exit 0 (#11); typecheck exit 0 (#12) | **PASS** |
| RID-DIAG-10 — Recommend the smallest complete fix and regression tests | §32-§37: Option A preferred (one production file; `itemId`+fallback+projection+hash); 9-case regression spec with RED→GREEN; targeted and broader validation gates | §34-§37 (designed against verified source line numbers and existing test patterns from #3/#10) | **PASS** |
| RID-DIAG-11 — Preserve repository state; create only the diagnostic report | §5/§44-§46: initial state captured pre-work; final state identical except the one new report; nothing staged/committed; temp log outside repo and removed; no secrets/user data | Final `git status --porcelain=v2 --branch`, `git diff --name-status`, `git diff --cached --name-status`, `git ls-files --others --exclude-standard` (#17) | **PASS** |

---

*End of diagnosis. Step 2 entry criteria are satisfied: effective identifier (`itemId` with evidence-justified `tmdbId` fallback) and cache-hash inclusion are agreed (§23/§32-§33); fixture/mocking strategy exists (§35, modeled on `performance-m4`/`cache-personalization` patterns); first incorrect state, impact scope, and regression tests are specified.*
