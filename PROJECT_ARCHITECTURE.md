# PROJECT_ARCHITECTURE.md

**Project:** movie-recommendation-system  
**Audit date:** 19 August 2026  
**Scope:** Source code and observed build output. Runtime behavior of live third-party services was not exercised.  
**Source of truth:** Application source, not README.

---

## 1. Executive architecture summary

This is a **Next.js 15.1.7 App Router** application (no `pages/` directory). Almost every user-facing page is a Client Component that fetches JSON from Route Handlers under `app/api/`. Authentication is **NextAuth.js v4.24.11** with Google OAuth and **JWT sessions**. Persistence is **MongoDB via Mongoose 8.11.0**, with a second unused native `MongoClient` path. Caching is **Redis (`redis` v4.7.0)** plus an in-process memory fallback. Movie metadata comes from **TMDB**. Generative features call **Google Gemini 2.0 Flash** with the API key in the query string.

The live recommendation path does **not** use the Mongoose `Movie` / `Rating` models, Prisma, ioredis, or `lib/settings.ts`. Those exist as abandoned or duplicate layers. README claims Prisma and `REDIS_URL` / ioredis; the running code uses Mongoose and `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`.

```
Browser (Client Components)
    |  fetch('/api/...')
    v
Next.js App Router
    |-- middleware.ts (narrow matcher; incomplete)
    |-- Route Handlers (app/api/**)
    |     |-- NextAuth  (/api/auth/*)
    |     |-- TMDB proxy
    |     |-- Gemini (chat, recommendations, similar)
    |     |-- Mongo mutations (favorites, watchlist, history, chat, users, admin)
    |     +-- Redis cache get/set/invalidate
    v
MongoDB collections + Redis (optional) + TMDB + Gemini
```

---

## 2. Frontend architecture

### 2.1 Router and rendering

- **Router:** App Router only (`app/`).
- **Root layout:** `app/layout.tsx` (server component) wraps `Providers`, sticky header, `SearchBar`, `FeatureNavItems`, `AdminNavLink`, `AuthButton`.
- **Font:** Google Inter via `next/font/google` (`app/layout.tsx` lines 14, 31).
- **Almost all pages are `'use client'`**, including home (`app/page.tsx` line 1). Data is loaded in `useEffect` with `fetch`, not as Server Components.
- **Images:** `next/image` against `https://image.tmdb.org/...` with `images.unoptimized: true` in `next.config.mjs` lines 16-18.
- **No Server Actions** (`"use server"` not present in the repository).
- **Error UI:** `app/error.tsx` renders `error.message` and `error.stack` to the user (lines 24-35).

### 2.2 Provider tree

`components/providers.tsx`:

- `SessionProvider` from `next-auth/react` (`refetchInterval={0}`, `refetchOnWindowFocus={false}`, `basePath="/api/auth"`).
- `LanguageProvider` (`contexts/LanguageContext.tsx`) with hardcoded UI strings. Disconnected from admin feature flags.

A second unused wrapper exists: `components/SessionProvider.tsx`.

### 2.3 Page map (UI)

| URL | File | Auth in UI | Notes |
|-----|------|------------|-------|
| `/` | `app/page.tsx` | Public; For You / chat degrade if unsigned | Client fetch `/api/trending` |
| `/trending` | `app/trending/page.tsx` | Public | |
| `/top-rated` | `app/top-rated/page.tsx` | Public | |
| `/genres` | `app/genres/page.tsx` | Public | |
| `/genre/[id]` | `app/genre/[id]/page.tsx` | Public | |
| `/movie/[id]` | `app/movie/[id]/page.tsx` | Public; history/favorites need session | |
| `/tv/[id]` | `app/tv/[id]/page.tsx` | Public | |
| `/actor/[id]` | `app/actor/[id]/page.tsx` | Public | |
| `/[mediaType]/[id]` | `app/[mediaType]/[id]/page.tsx` | Public | Client redirect only |
| `/celebrities` | `app/celebrities/page.tsx` | Public | |
| `/auth/signin` | `app/auth/signin/page.tsx` | Public | Google providers |
| `/profile` | `app/profile/page.tsx` | Client session check + middleware | |
| `/watchlist` | `app/watchlist/page.tsx` | `AuthCheck` only | Not in middleware matcher |
| `/favorites` | `app/favorites/page.tsx` | `AuthCheck` only | Not in middleware matcher |
| `/ai-assistant` | `app/ai-assistant/page.tsx` | `AuthCheck` + feature flag | Middleware + fail-open feature check |
| `/admin` | `app/admin/page.tsx` | `AdminCheck` client only | **Not in middleware** |
| `/redis-demo` | `app/redis-demo/page.tsx` | None | Demo TMDB+Redis |
| `/feature-unavailable` | `app/feature-unavailable/page.tsx` | Public | Dead-ish; middleware redirects AI to `/` |

### 2.4 State management

No Redux/Zustand. State is:

- NextAuth session (`useSession`)
- Local React state
- `localStorage` recent searches (`components/SearchBar.tsx` lines 37-39, 151, 164)
- Custom hooks: `hooks/useFavorites.ts`, `hooks/useWatchlist.ts`, `hooks/useFeatures.ts`, `hooks/useDebounce.ts`, `hooks/useInfiniteScroll.ts`

`useFavorites` / `useWatchlist` download the **entire** list to test membership of one item (N+1 at page scale).

### 2.5 Component organization

- Feature components under `components/`
- shadcn-style primitives under `components/ui/` (large unused surface: calendar, sidebar, input-otp, menubar, etc.)
- Admin: `components/admin/*`
- Duplicate loading: `components/LoadingSpinner.tsx` re-exports `components/ui/LoadingSpinner.tsx`
- Duplicate mobile hooks: `hooks/use-mobile.tsx` and `components/ui/use-mobile.tsx`
- Broken unused hook: `app/hooks/useWatchlistSort.ts` imports missing `@/app/components/watchlist/*`

---

## 3. Backend architecture

### 3.1 API style

All backend logic is **Next.js Route Handlers** (`app/api/**/route.ts`). There is no separate Nest/Express server, no tRPC, no Server Actions.

### 3.2 Cross-cutting libraries

| Concern | Implementation | Path |
|---------|----------------|------|
| Auth options | NextAuth v4 | `lib/auth.ts` (live), `app/auth.config.ts` (**unused**) |
| Mongo (Mongoose) | Cached global connection | `lib/mongodb.ts` |
| Mongo (native) | Second cached client | `lib/db.ts` used by `createOrUpdateUser` only |
| Redis | `redis` package, hardcoded username `default` | `lib/redis.ts` |
| Cache API | Redis + memory map | `lib/cache.ts` |
| Cache ops | Invalidate / KEYS / FLUSHDB | `lib/cacheManager.ts` |
| TMDB helper | Retry wrapper | `lib/tmdb.ts`, `lib/fetchWithRetry.ts` |
| Feature flags | Mongo `FeatureSettings` | `app/api/features/route.ts` |
| File settings | Unused JSON | `lib/settings.ts`, `config/settings.json` |

### 3.3 Next config that shapes runtime

`next.config.mjs`:

- `eslint.ignoreDuringBuilds: true` (lines 10-12)
- `typescript.ignoreBuildErrors: true` (lines 13-15)
- `images.unoptimized: true` (lines 16-18)
- Experimental webpack/parallel build flags (lines 19-23)
- Optional merge of missing `v0-user-next.config`

**Observed `next build` (19 Aug 2026):** compiled successfully; **Skipping validation of types** and **Skipping linting**. 45 static pages generated. Middleware bundle 53.1 kB.

---

## 4. Authentication flow

Live handler: `app/api/auth/[...nextauth]/route.ts` exports GET/POST wrapping `NextAuth(authOptions)` from `lib/auth.ts`.

```
User -> /auth/signin
     -> getProviders() + signIn('google')
     -> Google OAuth
     -> signIn callback (lib/auth.ts:33-61)
          connect Mongo
          User.findOne({ email })
          if missing: User.create({ email, name, image, preferences, created_at })
          on DB error: still return true  // sign-in succeeds without a user row
     -> jwt callback (lib/auth.ts:18-32)
          token.id = Mongo _id (only on initial sign-in when `user` is set)
     -> session callback (lib/auth.ts:62-81)
          reload User by email
          attach id, email, name, image, preferences, role
     -> JWT cookie session (strategy: 'jwt', no maxAge in live config)
```

**Documented vs actual:**

- README describes NextAuth + Google. That matches `lib/auth.ts`.
- `app/auth.config.ts` is Auth.js v5-style (`NextAuthConfig`, `NEXTAUTH_SECRET`, cookie options, `createOrUpdateUser`). **Nothing imports it.** Dead code.
- `createOrUpdateUser` (`lib/dbUtils.ts` 67-114) writes a **native driver** `users` collection with different preference keys (`favoriteGenres` / `contentType`) and is only referenced by the unused auth config.
- Live `lib/auth.ts` does **not** set `secret`, `cookies`, or `session.maxAge`. NextAuth v4 will read `NEXTAUTH_SECRET` from the environment if present.
- `signIn` allows login even when Mongo insert fails (`lib/auth.ts` 57-59). JWT then has no Mongo id; session callback may omit `session.user.id`.

**Pages:** custom sign-in at `/auth/signin`. Middleware skips `/auth/*` (middleware.ts 15).

---

## 5. Authorization flow

Roles in Mongoose: `'user' | 'admin' | 'owner'`, default `'user'` (`lib/models/User.ts` 19).

Hierarchy intended by `app/api/admin/users/route.ts`:

- `owner` > `admin` > `user`
- Owners can assign owner
- Admins cannot modify other admins/owners
- Users cannot self-demote elevated role via that admin API

**Enforcement is inconsistent:**

| Control | Where | Effective? |
|---------|-------|------------|
| JWT/session role | Loaded from DB in session callback | Display only |
| Admin UI | `AdminCheck` fetches `/api/user` and compares `role` | Client-only; `/admin` is public HTML |
| Admin APIs | `getServerSession()` **without** `authOptions` | Likely broken or unreliable in App Router |
| User self-update | `PUT /api/user` `$set: data` | **No field allowlist; role can be set** |
| Bootstrap owner | `POST /api/admin/promote` | Any authenticated caller if no owner exists |
| Middleware | Matcher omits `/admin`, `/api/admin`, `/api/user`, `/api/favorites`, `/api/history`, most TMDB/AI routes | Incomplete |

There is **no** RBAC middleware, **no** central `requireAdmin()` used everywhere, and **no** permission matrix module.

---

## 6. Session / JWT flow

```
Cookie: next-auth.session-token (NextAuth v4 default)
Strategy: JWT
getServerSession(authOptions)  -> used by user-data APIs
getServerSession()             -> used by admin APIs and promote (no options)
getToken({ req })              -> middleware.ts:22
```

Middleware does not pass a secret to `getToken`. In production this depends on `NEXTAUTH_SECRET`.

Session user shape is forced with `as any` (`lib/auth.ts` 75). There is **no** `types/next-auth.d.ts` module augmentation.

---

## 7. User creation and account linking

1. **Primary path:** Google `signIn` callback creates a Mongoose `User` if email is new. No password. No email verification beyond Google.
2. **No account linking** for other providers.
3. **Unauthenticated path:** `POST /api/users` (`app/api/users/route.ts` 13-24) creates a user from JSON `{ email, name, preferences }` with **no session check**. It redeclares a **different** User schema (no `role`). If `mongoose.models.User` already exists, the compiled schema from `lib/models/User.ts` is reused.
4. **`PUT /api/user`:** upsert by session email with `$set: data` (entire body).
5. **`scripts/promote-owner.js`:** CLI to set `role: 'owner'` if none exists. Destructive operational script, not an HTTP route.
6. **`scripts/setupDatabase.ts`:** drops `users` (and other collections) then recreates. Must not be run against shared data.

Identity key used by favorites/watchlist/history/chat is **email string**, not Mongo `_id`.

---

## 8. Database connection lifecycle

### Mongoose (`lib/mongodb.ts`)

- Throws at **module load** if `MONGODB_URI` is missing (lines 5-7).
- Caches `{ conn, promise }` on `global.mongoose`.
- `bufferCommands: false`.
- Logs "MongoDB connected successfully."

### Native driver (`lib/db.ts`)

- Separate `global.mongo` cache.
- Pool size 10, long timeouts (30s/45s).
- Used only by unused `createOrUpdateUser`.

Two clients can coexist in one process.

---

## 9. MongoDB collections and Mongoose models

| Collection (default) | Model file | Indexes | Used by live routes? |
|----------------------|------------|---------|----------------------|
| `users` | `lib/models/User.ts` | unique email | Auth, `/api/user`, admin users, stats |
| `favorites` | `lib/models/FavoritesModel.ts` | unique `{userId,itemId,type}` | `/api/favorites` |
| `watchlists` | `lib/models/WatchlistModel.ts` | unique `{userId,itemId,type}` | `/api/watchlist`, details, AI recs, time-based |
| `histories` | `lib/models/History.ts` | unique `{userId,itemId,type}` | `/api/history`, AI recs |
| `chathistories` | `lib/models/ChatHistory.ts` | none besides `_id` | `/api/chat-history*` |
| `featuresettings` | inline in features/settings routes | none | `/api/features`, `/api/admin/settings` |
| `movies` | `lib/models/Movie.ts` | unique tmdbId | **Only** `lib/dbUtils.ts` (dead for HTTP) |
| `ratings` | `lib/models/Rating.ts` | unique `{userId,mediaId}` | **Only** `lib/dbUtils.ts` (dead for HTTP) |

`lib/models/index.ts` exports User/Movie/Rating only (not Favorites/Watchlist/History/Chat).

`userId` on personal collections is the **email address**.

---

## 10. Redis connection lifecycle

`lib/redis.ts`:

- Singleton `redis` v4 client.
- `username: 'default'` hardcoded (line 75).
- `password: REDIS_PASSWORD`, `host: REDIS_HOST`, `port: REDIS_PORT`.
- **No `REDIS_URL`.** README documents `REDIS_URL` only.
- Connect timeout 3s, reconnect max 3, `disableOfflineQueue: true`.
- On "max number of clients reached", blocks reconnect 60-120s (`redis-health.ts`).
- Returns `null` if unhealthy; callers fall back to memory.
- **No TLS option** in socket config. Redis Cloud typically requires TLS.

`ioredis` is in `package.json` and unused in source.

---

## 11. Cache read/write/invalidation

`lib/cache.ts` `RedisCache`:

- `set`: always writes memory map, then Redis `SET` with `EX` (default 3600s).
- `get`: Redis first, then memory.
- `delete`: both.
- `clear`: clears memory **and** `redis.flushDb()` (entire Redis DB 0).
- `getOrSet`: stampede-prone (no lock); concurrent misses all hit origin.

Keys observed:

- `movies:home`, `tv:top-rated`
- `movie:{id}:details|recommendations|similar|ai-similar`
- `tv:{id}:details|recommendations|similar`
- `movie:{id}` (redis-example)

Admin:

- GET `/api/admin/cache?action=stats|list|clear` (`app/api/admin/cache/route.ts` 36-58). **`clear` is a GET.**
- POST invalidate movie/tv/home.
- `findCacheKeys` uses Redis `KEYS pattern` (can be `*`).

Memory fallback is **per Node process**, unbounded, not shared across instances.

---

## 12. TMDB request flow

```
Page/hook
  -> /api/{movies|trending|movie/[id]|tv/[id]|search|...}
  -> process.env.TMDB_API_KEY in query string
  -> https://api.themoviedb.org/3/...
  -> optional redisCache.getOrSet
  -> JSON to client
```

`lib/tmdb.ts` wraps retries (`fetchWithRetry`, 8s timeout, 2 retries, `next.revalidate: 3600`). Many routes **bypass** this helper and `fetch` TMDB directly.

API key is server-only (`TMDB_API_KEY`, not `NEXT_PUBLIC_*`). Exposure risk is log/error leakage and unauthenticated proxying (quota theft).

---

## 13. Gemini request flow

Provider: Google Generative Language REST, model **`gemini-2.0-flash`**.  
SDK `@google/generative-ai` is a dependency but **not imported**; routes use `fetch`.

Key: `GOOGLE_API_KEY` as query parameter (`?key=`).

Call sites:

1. `app/api/chat/route.ts` — chat, temperature 0.7, maxOutputTokens 1000. System text is prepended as a **user part**, not `systemInstruction`. Conversation is concatenated into one `contents[0].parts` array.
2. `app/api/ai-recommendations/route.ts` — JSON recommendations, temperature 0.5, maxOutputTokens 2000, 3 retries with backoff.
3. `app/api/movie/[id]/ai-similar/route.ts` — similar titles JSON, cached 24h.

No `safetySettings` override, no output schema enforcement beyond `JSON.parse` of model text, no token accounting, no per-user quota.

---

## 14. Recommendation generation flow

**Entry:** GET `/api/ai-recommendations`  
**UI:** `components/ForYouSection.tsx` (home), requires session for useful results.

```
GET /api/ai-recommendations
  getServerSession(authOptions)
  if no email -> 401
  load History (10), Watchlist, Favorites by email
  if watchlist and favorites empty -> needsContent
  build preferences JSON (titles + dates)
  Gemini prompt (user prefs inlined)
  parse JSON recommendations (12 titles)
  for each title: TMDB search/multi, take results[0]
  filter titles already in user lists
  balance movie/tv, shuffle
  return { recommendations, needsContent }
```

Fallback: TMDB popular movie+TV if Gemini fails (`route.ts` 349-384).  
Handler auth exists; middleware matcher is `/api/ai-recommendations/:path*` **without** the bare path (same class of matcher bug as chat).

`getRecommendedMovies` in `lib/dbUtils.ts` (ratings/genres in Mongo) is **not** called by any route.

Mood recommendations (`/api/mood-recommendations`) are TMDB discover by hardcoded genre IDs, **not** Gemini, **no auth**.

Time-based (`/api/movies/time-based`) uses TMDB discover + optional session to exclude watchlist/favorites. Middleware treats `/api/movies*` as public even in the unused broad-API branch.

---

## 15. AI assistant flow

Two UIs:

1. **Dedicated:** `app/ai-assistant/page.tsx` wrapped in `AuthCheck`, feature flag `aiAssistant`.
2. **Home widget:** `components/ChatAssistant.tsx` on `app/page.tsx` — **no AuthCheck**.

```
POST /api/chat { message, previousMessages }
  NO getServerSession in the handler
  Gemini 2.0 Flash
  logs message and full API JSON
  returns { response, status }
```

Then the assistant page POSTs `/api/chat-history` to persist.

Middleware matcher lists `/api/chat/:path*` but **not** `/api/chat`. The codebase duplicates bare paths for watchlist and `/ai-assistant`, which is evidence the authors knew `:path*` may not match the leaf. **Chat leaf is likely public.**

Markdown rendering: `formatAssistantMessage` (`app/ai-assistant/page.tsx` 152-243) converts model text to HTML (including `[text](url)` -> `<a href="$2">`) and injects via `dangerouslySetInnerHTML` **without sanitization**.

---

## 16. Chat-history persistence flow

Models: `lib/models/ChatHistory.ts` — `{ userId, messages[], createdAt, updatedAt }`. No max message count.

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/chat-history` | Latest one document's messages (`findOne` + `limit(1)` is invalid for findOne; sorts then returns messages) |
| POST | `/api/chat-history` | If `chatId`, `$push` two messages if `_id` and email match; else create |
| DELETE | `/api/chat-history` | `findOneAndDelete` **one** chat, not all |
| GET | `/api/chat-history/list` | All chats for email |
| GET/DELETE | `/api/chat-history/[id]` | Ownership via `{ _id, userId: email }` |

Auth: `getServerSession(authOptions)` in handlers. Ownership on `[id]` is checked. POST trusts client `response` string (client can persist arbitrary assistant text).

---

## 17. Watchlist flow

**UI:** `/watchlist` (`AuthCheck`), profile snippet, `hooks/useWatchlist.ts`, movie/TV buttons.

**API:** `app/api/watchlist/route.ts`

- GET: all items for `session.user.email`
- POST: upsert `{ userId: email, itemId, type }` set title/posterPath/addedAt. **No zod validation** of `itemId`/`type`/`title`.
- DELETE: query `itemId` + `type`, scoped to email

**Details:** GET `/api/watchlist/details` hydrates TMDB in batches of 5 with 500ms delay (`app/api/watchlist/details/route.ts`). Logs session email (line 15).

Middleware matcher includes `/api/watchlist` and `/api/watchlist/:path*`. Page `/watchlist` is **not** in matcher.

---

## 18. Favorites flow

Same pattern as watchlist (`app/api/favorites/route.ts`). Unique index `{ userId, itemId, type }`.

**Not in middleware matcher.** Relies entirely on handler `getServerSession(authOptions)`.

Working tree shows deleted `app/api/favorites/enhanced-details/route.ts` (pre-existing local change, not this audit).

`useFavorites` GETs the full list on every card mount.

---

## 19. History flow

`components/HistoryTracker.tsx` POSTs on movie/TV/person page view if session exists (no consent UI).

`app/api/history/route.ts`: GET last 20; POST upsert `viewedAt`. No DELETE. Not in middleware matcher. No retention job.

---

## 20. Ratings flow

**Not implemented as a product feature.**

- Model: `lib/models/Rating.ts` (0-10, unique userId+mediaId).
- Helpers: `addRating`, `getRecommendedMovies` in `lib/dbUtils.ts` — **no Route Handler**.
- `config/settings.json` has `"reviews": false` but that file is unused by `/api/features`.

---

## 21. Search flow

`components/SearchBar.tsx` -> GET `/api/search?query=` -> TMDB `search/multi`. Query is `encodeURIComponent`'d. No auth, no rate limit, no length cap. Recent queries stored in `localStorage`.

---

## 22. Admin dashboard flow

```
/admin (static HTML)
  AdminCheck (client):
    useSession
    fetch /api/user
    if role admin|owner show tabs else redirect '/'
  tabs: DashboardOverview, CacheManagement, UserManagement, SystemSettings
```

APIs:

- GET `/api/admin/stats` — user count + cache keys; **API request and growth charts are `Math.random()` / mock months** (`route.ts` 66-117).
- GET/PUT `/api/admin/users` — list/update role+preferences.
- GET/POST `/api/admin/settings` — FeatureSettings Mongo (creates a **new document every save**).
- GET/POST `/api/admin/cache` — stats, KEYS, FLUSH, invalidate.
- POST `/api/admin/promote` — first-owner bootstrap.

All admin APIs call `getServerSession()` without `authOptions`.

---

## 23. Role assignment and permission hierarchy

Intended: owner bootstrap (`promote` or `scripts/promote-owner.js`) then owners promote admins via PUT `/api/admin/users`.

Actual additional path: **any signed-in user** can `PUT /api/user` with `{ "role": "owner" }` because `$set: data` (`app/api/user/route.ts` 41-44) and User schema allows `owner`.

Admin PUT does restrict role changes **if** admin session resolution works.

---

## 24. Error handling

- Most APIs: try/catch, `console.error`, JSON 500 with generic message.
- Leaks: `app/api/users/route.ts` 22 returns `error.message`; `app/api/movie/[id]/route.ts` 114 returns `error.message`; `app/api/ai-recommendations/route.ts` 662 returns `errorDetails`; `app/api/chat/route.ts` 120-126 returns `error.message` (can include Google API body); `app/error.tsx` shows stack.
- Gemini/TMDB failures often become empty arrays rather than structured errors.
- `signIn` swallows DB errors and continues.

---

## 25. Logging

`console.log` / `console.error` only. No pino usage despite lockfile listing pino as a resolved package in an older lock snapshot; current `package.json` does not list a logger used in app code.

Sensitive logs:

- Sign-in emails (`lib/auth.ts` 41, 53)
- JWT name/email/image/sub in unused `auth.config.ts` 72-75
- Chat user message (`app/api/chat/route.ts` 101)
- Full Gemini JSON (`route.ts` 70)
- Watchlist session email
- AI recommendation titles

No log redaction, no request IDs, no access log collection (admin stats fake this).

---

## 26. Image and external media handling

- TMDB CDN URLs in `<Image>`.
- YouTube trailers from TMDB videos (`MovieTrailer`, `LatestTrailers`, `TVShowTrailer`).
- `images.unoptimized: true` disables Next image optimizer (avoids some optimizer CVEs; larger client payloads).
- No CSP. Gemini-generated markdown links can point anywhere, including `javascript:`.

---

## 27. Deployment assumptions

Inferred, not from Docker/CI (none in repo):

- Node `^18.18 || ^19.8 || >=20` (Next 15.1.7); README says v20+. Audit host: Node v22.17.0.
- Env files `.env` + `.env.local` present locally; both gitignored.
- MongoDB Atlas or similar (`MONGODB_URI`).
- Redis Cloud-style host/port/password.
- Google OAuth + Gemini + TMDB keys.
- `next start` after `next build`.
- No `Dockerfile`, `vercel.json`, or GitHub workflows found.
- `setup-db` and `promote-owner` are manual ops.

---

## Feature-by-feature contract (condensed)

### Watchlist add

- **Entry:** `useWatchlist.toggleWatchlist` / page buttons  
- **API:** POST `/api/watchlist`  
- **Auth:** session email required in handler; middleware matcher covers this API  
- **Authz:** resource keyed by session email  
- **Input:** JSON `itemId`, `type`, `title`, `posterPath` — unvalidated  
- **DB:** upsert Watchlist  
- **Cache:** none  
- **External:** none on POST; details route calls TMDB  
- **Matches docs:** yes, except missing server-side validation

### Favorites add

- Same as watchlist against `/api/favorites`  
- **Middleware:** **not** matched — handler-only auth  
- **Incomplete:** enhanced-details route deleted in working tree

### Personalized AI recs

- GET `/api/ai-recommendations`  
- Auth handler present  
- Sends watch history/favorites/watchlist titles to Gemini  
- Then many TMDB searches (fan-out)  
- Incomplete: Arabic comments, string concat bug in `normalizeTitle` (`route.ts` 294-296) still parses as JS string

### Chat

- POST `/api/chat` — **no handler auth**  
- Persisted separately  
- XSS surface on render  
- Does not match "secure sign-in required for AI" README implication for the homepage widget

---

## Incomplete, duplicated, or misleading pieces

| Item | Evidence |
|------|----------|
| Prisma | `package.json` + deleted `lib/prisma.ts`; no schema. README still lists Prisma |
| ioredis | Dependency unused; `redis` is used |
| `app/auth.config.ts` | Never imported |
| `lib/db.ts` + `createOrUpdateUser` | Unused by live NextAuth |
| `lib/settings.ts` / `config/settings.json` | File says all features false / `fr-FR`; live flags are Mongo `aiAssistant` only |
| Movie/Rating models | No HTTP surface |
| OpenRouter types | `types/openrouter.ts` unused |
| `@google/generative-ai` | Unused; raw fetch instead |
| zod / react-hook-form | Only shadcn form primitive; no API validation |
| `npm` and `install` packages | Accidental dependencies |
| `/redis-demo` | Leftover example |
| Admin stats | Random/mock metrics |
| Dual Chat UIs | Home vs `/ai-assistant` |
| Dual LoadingSpinner / use-mobile | Duplicates |
| `movie_model.ts` | Empty tracked file |
| `js/` | Empty directory |

These are architecture defects, not merely style.
