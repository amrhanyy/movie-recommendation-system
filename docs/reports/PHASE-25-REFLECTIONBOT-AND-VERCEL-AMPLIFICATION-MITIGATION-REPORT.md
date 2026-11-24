# Phase 25 - Reflectionbot and Vercel Amplification Mitigation

| Field | Value |
|---|---|
| Repository | `amrhanyy/movie-recommendation-system` |
| Branch | `fix/reflectionbot-and-vercel-amplification-mitigation` |
| Code commit | `2ea4374` (parent `d0184c9`) |
| Documentation commit | `94810eb` "docs: record Reflectionbot and Vercel mitigation" (Commit B) |
| Commits on branch | 6 (sections 47-49 and 60 list every one) |
| Pull request | #28, MERGED 2026-11-24 by Merge Commit `ab57763` (section 61.5), base `main` |
| Production URL | https://moviemind-re.vercel.app |
| Report date | 2026-11-23 |
| Post-release reconciliation | 2026-11-24 (section 61) |
| Phase status | **PASS WITH WARNINGS - MERGE COMPLETED - PROJECT RESUMED - RELEASE VERIFIED (section 61)** |

This report records only what was executed and measured on this host. Where evidence
could not be obtained (blocked preview, owner-reported account state), the item is
labelled `owner-reported` or `UNVERIFIED` instead of being asserted.

**Evidence boundary (reconciled 2026-11-24):** sections 1-60 preserve the measured
evidence and status statements as they stood on 2026-11-23, before the owner-authorized
release. Section 61 is the verified post-release record added on 2026-11-24 and governs
the current status; sections 1-60 are the historical phase record.

## 1. Executive summary

A crawler identifying itself as `Reflectionbot/1.0 (+https://reflection.ai/bot)`
dominated the captured request sample and drove function invocations against routes
that could not be cached.

Measured in the current burst:

| Metric | Value |
|---|---|
| CDN requests in sample | 1,310 |
| Requests from Reflectionbot | 994 |
| Reflectionbot share | 75.9% |
| Overall cache hit rate | 27.7% |
| Edge Function requests | 32 (0% cached) |
| Firefox requests | 240 (18.5%, 57.6% cached) |

Three of the five hottest routes had a **0% cache rate**: `/movie/[id]` (309 requests),
`/api/features` (134 requests) and `/tv/[id]` (116 requests). Only `/auth/signin`
(100 requests, 100% cached) and `/_next/image` (67 requests, 89.6% cached) were
served cheaply.

The traffic pattern is consistent with link prefetching: captured request metadata
shows `Prefetch: Yes`, RSC parameters, `nxtPid`, and `Path Type: stream`, i.e. a
client following every related-title link from a detail page and triggering
concurrent server renders of the next detail pages.

Root cause of the cost: pages and APIs that are deterministic for every anonymous
visitor were being rendered per request, and the feature endpoint was fetched by each
page independently. Phase 25 makes those surfaces cacheable, stops the prefetch fan-out,
deduplicates the feature fetch, narrows the middleware matcher, blocks the crawler in
`robots.txt`, and makes the Redis client stop issuing commands against an exhausted
quota.

Result summary: Commit A alone changed 62 files (51 modified, 11 added, 0 deleted),
+2677 / -1694; the whole branch (six commits) changed 64 files (51 modified, 13 added,
0 deleted), +4697 / -1694. Focused suite 104/104 green. Full suite 5 failed / 659
passed (664), with those exact five failures reproduced on the untouched baseline.
Build, typecheck and lint exit clean. Sections 11, 12, 15, 36 and 51 were corrected in
section 60 after this report's claims were re-measured against a fresh build. When this
section was written the project was manually paused and no Preview could be verified;
the owner later published the Firewall, resumed the project and completed the
owner-authorized release. The verified post-release record is section 61.

## 2. Final phase status

The bullets below are the phase status **as committed on 2026-11-23**, before the
owner-authorized release. They are preserved as the historical record and are superseded
for current status by the verified release record that follows and by section 61.

**PASS WITH WARNINGS - MERGE NOT AUTHORIZED - PROJECT STILL PAUSED.**
(historical phase status at commit time; superseded by the verified release record below)

- Code and documentation work: complete, committed, pushed non-force.
- Local verification: complete, with pre-existing failures disclosed.
- Deployed verification: **not obtained** at that time. The preview deployment for
  `2ea4374` was `BLOCKED` because the project was paused.
- Merge: not authorized, not attempted at that time.
- Production: unchanged and paused at that time.

A phase that cannot observe its own effect in a deployed environment is not a clean
pass. It is a pass on everything the environment allowed, with the environmental gap
named rather than hidden.

### Verified release record (2026-11-24, post-release)

RELEASE COMPLETE - INCIDENT MITIGATION VERIFIED IN PRODUCTION

The owner-authorized release executed after this report was committed: Firewall v6
published (AI Crawlers Deny, AI Assistants Log, Reflectionbot Deny; broad rate limit left
disabled), project resumed (`paused: false`), a READY Preview for `eeebe7d` verified,
PR #28 merged by Merge Commit as `ab57763` (two parents), Production deployment
`dpl_A7TAM5bHTcxqe4ri1u86sX3KKrvQ` READY/PROMOTED at `ab57763`, the bounded
five-request production smoke passed 5/5, and the first 15-minute monitoring window stayed
within the section 55 thresholds. Section 61 carries every identifier, measurement and
residual risk.

The mitigation claim is bounded to what was verified: the specific Reflectionbot /
amplification paths, the CDN caching behaviours, the middleware 401 boundary and the first
15-minute telemetry. The 1-hour, 24-hour and 72-hour section 55 checkpoints remain open
(section 61.10); no broader site-wide or long-horizon incident-resolution claim is made.

## 3. Owner authorization

Authorized for this phase:

- Source, test, and configuration changes inside the repository.
- Commit A (code) and Commit B (documentation) on the feature branch.
- Non-force push of that branch and updates to PR #28.
- Read-only inspection of Vercel project state through the CLI.
- Documenting a Firewall plan and monitoring thresholds without applying them.

Not authorized, and therefore not done:

- Applying or publishing any Firewall rule.
- Changing any Vercel Environment Variable.
- Merging the pull request.
- Resuming the paused project.
- Creating a Production deployment.
- Pushing to `main`, squash-merging, or rebasing.

The temporary 3x account limits described in section 5 were granted by the owner
outside this repository; they are recorded as owner-reported, not as verified state.

## 4. Git baseline

| Item | Value |
|---|---|
| HEAD at start | `2ea4374` (Commit A) |
| Parent of Commit A | `d0184c9` |
| `origin/main` | `d0184c9` ("Merge pull request #26 from amrhanyy/docs/add-moviemind-logo-to-readme") - historical baseline; later `ab57763` (section 61.5) |
| Commit A size | 62 files, +2677 / -1694 |
| Staged before Commit B | empty |
| Untracked before Commit B | 17 entries (first: `.chunks/`) |

The 17 untracked entries are pre-existing scratch artifacts (`.chunks/`, PDFs, probe
outputs). They are deliberately left untracked; Commit B stages its two documentation
paths explicitly and never runs `git add -A`.

Baseline comparison used the same two failing test files checked out at `d0184c9` and
at `2ea4374`; both produced 5 failed / 79 passed (84) with identical failure titles
(section 34).

## 5. Account unblock and temporary 3x limits

Owner-reported state: the account was unblocked and temporary 3x limits were applied
so the project could serve during the investigation.

Verification status: `owner-reported / UNVERIFIED`. The APIs available to this phase
expose project state (paused flag, deployment state) and deployment metadata, not the
billing or fair-use limit overrides on the account. No plan change, upgrade, or
billing action was performed by this phase, and none is recorded as a repository
change.

## 6. Project manual-pause state

**Historical snapshot** - this section records the project state during the phase
(2026-11-23). The owner later resumed the project; the current state and the release
record are in section 61.

Verified through the Vercel API during the phase:

| Field | Value |
|---|---|
| Project | `movie-recommendation-system` |
| Project ID | `prj_lG0moC9gDG0HmzNZsXs3toGEA4LO` |
| Team ID | `team_VYGxgaHqU3ebmL7BFKEbiNH0` |
| `paused` | **true** (at the time of the phase; now `false`, section 61.2) |
| Deployment for `2ea4374` | `movie-recommendation-system-4use6dzba.vercel.app` - **BLOCKED** |
| Older dependabot deployment `c4f860a` | `movie-recommendation-system-853ybuxy7.vercel.app` - `READY` |

The paused flag is the hard evidence for why the preview was blocked. It is a project
setting, not a build failure, and it was not changed by this phase. (Historical: the
owner resumed the project post-release; `paused` is now `false`, verified in section 61.2.)

## 7. Current Reflectionbot attribution

Classification: **`CONFIRMED_REFLECTIONBOT`** for the current burst.

Evidence: 994 of 1,310 sampled CDN requests carry the user agent
`Reflectionbot/1.0 (+https://reflection.ai/bot)` (75.9%). Attribution here is
identity-based, not inferred from timing or volume: the client states who it is.

Before this phase, `robots.txt` did not disallow that agent, so nothing at the
application layer asked it to stop, and every followed link produced a fresh render.

## 8. Historical attribution boundary

Historical platform counters show the scale of the incident:

| Metric | Value |
|---|---|
| Edge/CDN requests | 1,296,827 |
| Included allowance | 1,000,000 |
| Overshoot | +296,827 (+29.68%) |
| Team CDN total | 1,298,624 |
| Other projects | 1,797 |
| CDN responses not backed by a function | 268,838 (20.73%) |
| CDN requests per invocation | 1.262 |
| Regional coverage | 99.57% |

Those counters do not carry a user-agent breakdown. Therefore the historical volume is
classified **`HIGH_CONFIDENCE_PROBABLE_REFLECTIONBOT`**, not confirmed.

Explicit statement of the limit, for the record: this report does **not** claim that
all historical 1.296M requests are proven to come from Reflectionbot. The proven
claim is narrower - in the captured sample, 75.9% of requests identify as that agent.

## 9. Current route aggregation

| Route | Requests | Cache hit rate |
|---|---|---|
| `/movie/[id]` | 309 | 0% |
| `/api/features` | 134 | 0% |
| `/tv/[id]` | 116 | 0% |
| `/auth/signin` | 100 | 100% |
| `/_next/image` | 67 | 89.6% |

The three uncached routes account for 559 of 1,310 requests (42.7%) and effectively
all of the function cost, because the cached routes were answered at the edge.

## 10. Confirmed prefetch evidence

Captured request metadata for the uncached page requests:

- `Prefetch: Yes` header present.
- RSC query parameters present on the document request.
- `nxtPid` parameter present (Next.js prefetch identifier).
- `Path Type: stream` - the request asks for a streamed server render, not a static
  asset.

Combined with the route pattern (detail pages linking to related detail pages), this
describes a client that follows many links concurrently and pays for a full server
render on each. The crawler did not need to attack the site; ordinary navigation was
enough to generate the load.

## 11. Dynamic movie and TV amplification

| Route | Build classification before Phase 25 | Build classification after Phase 25 | Requests | Cached |
|---|---|---|---|---|
| `/movie/[id]` | `ƒ` (accidental dynamic: a `use client` page cannot export route config) | `● (SSG)` shell + on-demand ISR, `revalidate = 900` | 309 | 0% |
| `/tv/[id]` | `ƒ` (accidental dynamic, same cause) | `● (SSG)` shell + on-demand ISR, `revalidate = 900` | 116 | 0% |

Captured-burst behaviour: every request that reached the origin ran the page function,
and the capture shows no cache reuse - consistent with a client requesting many
distinct title IDs, each one a cold key (call it `MOVIE_TV_DYNAMIC_FUNCTION_AMPLIFICATION=CONFIRMED`).

Phase 25 **does** change the classification of these two routes (section 60
correction: the original draft of this table read `ƒ` for both rows, which was wrong).
Before, the pages were bare `use client` modules with no way to export segment config,
so Next classified them as fully dynamic. Now the server wrapper exports
`revalidate = 900` plus an explicit `generateStaticParams()`, and the Production build
reports `● (SSG)`; `dynamicParams` stays true, so an uncached id renders on demand and
is then reused for 900 s. The prefetch fan-out removal and CDN-cached supporting APIs
complete the cost story.

## 12. Protected-route middleware amplification

`middleware.ts` is modified in Commit A - but the matcher itself was **not**
narrowed (section 60 correction: the original draft of this section implied it had
been). The baseline matcher already covered only the protected surface: auth pages,
`ai-recommendations`, `chat`, `chat-history`, `history`, `watchlist`, `favorites`,
`user`/`users`, `admin`, `profile`, `ai-assistant`, and the `ai-similar` leaf; the
matcher was left byte-identical to `d0184c9`.

What did change in middleware, and what it costs or saves:

1. The internal HTTP self-fetch to `/api/features` for `/ai-assistant` and
   `/api/ai-recommendations` is gone - that fetch was a request amplifier (every
   middleware hit produced a second request) and is now impossible at the Edge
   boundary. The feature decision moved into the Node handlers.
2. Authenticated API matches are stamped `private, no-store`, so a per-user response
   can never be stored by the shared CDN.
3. Protected navigation links (`/favorites`, `/watchlist`, `/ai-assistant`,
   `/profile`, `/admin`) now render with `prefetch={false}`, so a reflected crawl of a
   detail page no longer triggers middleware auth checks and `/auth/signin` redirect
   chains before any user interaction.

The `<a>`-level protection on public content routes (`/movie/[id]`, `/tv/[id]`) is
provided by the prefetch containment, not by the matcher, because those paths were
never in the matcher's scope.

## 13. FeatureSettings source of truth

Phase 25 introduced a single server-side read path for feature state: `lib/features.ts`
(public resolver) and `lib/features-store.ts` (storage access), and rewired
`app/api/features/route.ts` to delegate to it instead of resolving flags inline.

Evidence of the behaviour change, from the TDD RED run: the pre-fix route answered
`503` where the Phase 25 gate test expected `200` (`expected 503 to be 200`). The
route now returns `200` with the resolved state once the server-side resolver exists,
and still fails closed with `503` when the store cannot be resolved.

`FeatureSettings` storage semantics are unchanged: no schema change, no migration, no
admin API change, and no Environment Variable was added or modified. The
`/api/features` response remains `private, no-store`, because per-deployment feature
state must not be cached by a shared CDN. As of the section 60 corrections the server
resolver additionally coalesces concurrent evaluations into one in-flight promise
(no TTL; the promise clears on settle), so parallel gate checks share one MongoDB read
while any later admin update is still observed by the next decision.

## 14. Feature-gate migration

Rule applied: client components must not import Mongoose, MongoDB, Redis, or Node-only
FeatureSettings modules. Feature state is resolved on the server and consumed through
the existing context boundary.

Measured scope of the rewiring in Commit A: 24 `app/api/**/route.ts` modules, 7 page
modules (`actor`, `genre`, `movie`, `profile`, `search`, `trending`, `tv`), 12
components, 1 context, 1 hook, plus `middleware.ts`, with the two new detail page
components carrying the client-side split. No feature-flag default changed, so a build
with an unreachable store still resolves the same effective defaults as before.

## 15. Feature-state client deduplication

Before: every page or component that needed flags issued its own `/api/features`
request, which is why the endpoint appears at 134 requests with a 0% cache rate.

After: `hooks/useFeatures.ts` owns the fetch with a bounded TTL cache and a single
in-flight promise, so concurrent consumers share one request and remounts inside the
TTL window issue none. Static correlation confirms the consolidation (section 60
correction: the original draft said "three places - the server resolver, the shared
public-path constants module, and this hook"; measured exactly, the literal
`/api/features` appears in **two functional call sites** - `hooks/useFeatures.ts`
(the fetch) and `lib/public-api-paths.ts` (the Edge-safe constant list) - plus one
comment mention in `lib/features.ts`. There is no third functional caller.), and
across `app`, `components`, `lib`, `contexts` and `hooks` no other module performs
the request.

## 16. Complete page classification

19 page modules were classified: 17 are client components and 2 declare
`revalidate = 900` with `generateStaticParams`; no page declares `noStore`.

| # | Page file | Client component | revalidate | generateStaticParams |
|---|---|---|---|---|
| 1 | `app/[mediaType]/[id]/page.tsx` | yes | - | no |
| 2 | `app/actor/[id]/page.tsx` | yes | - | no |
| 3 | `app/admin/page.tsx` | no | - | no |
| 4 | `app/ai-assistant/page.tsx` | yes | - | no |
| 5 | `app/auth/signin/page.tsx` | yes | - | no |
| 6 | `app/celebrities/page.tsx` | yes | - | no |
| 7 | `app/favorites/page.tsx` | yes | - | no |
| 8 | `app/feature-unavailable/page.tsx` | yes | - | no |
| 9 | `app/genre/[id]/page.tsx` | yes | - | no |
| 10 | `app/genres/page.tsx` | yes | - | no |
| 11 | `app/movie/[id]/page.tsx` | yes | 900 | yes |
| 12 | `app/page.tsx` | yes | - | no |
| 13 | `app/privacy/page.tsx` | no | - | no |
| 14 | `app/profile/page.tsx` | yes | - | no |
| 15 | `app/search/page.tsx` | yes | - | no |
| 16 | `app/top-rated/page.tsx` | yes | - | no |
| 17 | `app/trending/page.tsx` | yes | - | no |
| 18 | `app/tv/[id]/page.tsx` | yes | 900 | yes |
| 19 | `app/watchlist/page.tsx` | yes | - | no |

Section K vocabulary mapping, taken from the Production build route table (section 60
addition; the build is the evidence, not this prose):

| Classification | Pages |
|---|---|
| `STATIC` | `privacy` (server component, no request data), `_not-found`, `robots.txt` |
| `STATIC_CLIENT_SHELL` (build `○`) | `/`, `ai-assistant`, `auth/signin`, `celebrities`, `favorites`, `feature-unavailable`, `genres`, `profile`, `search`, `top-rated`, `trending`, `watchlist` - prerendered HTML, personalization happens in the client after mount |
| `ISR_SAFE` (build `●`) | `movie/[id]`, `tv/[id]` - static shell, `revalidate = 900`, `generateStaticParams()` returns `[]` so unknown ids render on demand and are reused for 900 s |
| `DYNAMIC_REQUIRED` (build `ƒ`, server) | `admin` - server component reading admin-only state; dynamic on purpose |
| `DYNAMIC_ACCIDENTAL` (build `ƒ`, client page) | `[mediaType]/[id]`, `actor/[id]`, `genre/[id]` - `use client` pages cannot export route segment config, so Next builds them dynamic |
| `PERSONALIZED` | none at the server HTML level: every personalized surface is a static shell whose data is fetched client-side behind authentication |
| `UNRESOLVED` | none |

Pages intentionally kept dynamic outside the movie/TV priority scope:
`[mediaType]/[id]`, `actor/[id]` (high-cardinality but their links already carry
`prefetch={false}` and their supporting APIs carry CDN TTLs; converting them is not
authorized by this phase's priority list) and `admin`.

## 17. Root-layout classification

`app/layout.tsx` is an 88-line server component with no `use client` directive, and it
is **not** in Commit A's manifest - the root layout was not modified in this phase.

It reads no per-request data, sets no cache header of its own, and does not inherit a
`no-store` from any child. Feature-state deduplication lives in
`hooks/useFeatures.ts` at the client boundary, not in the layout, so layout caching is
unchanged by Phase 25.

## 18. Movie page result

| Property | Value |
|---|---|
| Build classification | `● SSG` - static shell, on-demand ISR (`dynamicParams` true, `revalidate = 900`) |
| `revalidate` | 900 seconds |
| Route size / First Load JS | 4.7 kB / 165 kB |
| Prefetch on related-title links | Disabled (`prefetch={false}`) |
| API dependencies | detail, similar, recommendations, ai-similar (ai-similar stays private) |

The build reports `● (SSG)` for this route: the server wrapper hands every id to the
on-demand path, where a first request renders and the result is reused for 900 s
(section 60 correction - the original draft said "not prerendered ... `ƒ`", which
contradicted the build it cited). Cost reduction combines three mechanisms: the
removed prefetch fan-out, the CDN-cached supporting JSON APIs, and the ISR shell. The
detail component itself was extracted into `app/movie/[id]/MovieDetailPage.tsx` (one
of the 11 added files). No user-specific server HTML is produced: the shell contains
no session, cookie, favorite or watchlist state, all of which is fetched client-side
behind authentication.

## 19. TV page result

| Property | Value |
|---|---|
| Build classification | `● SSG` - static shell, on-demand ISR (`dynamicParams` true, `revalidate = 900`) |
| `revalidate` | 900 seconds |
| Route size / First Load JS | 3.98 kB / 164 kB |
| Prefetch on related-title links | Disabled (`prefetch={false}`) |
| API dependencies | detail, similar, recommendations |

Same treatment as the movie page: prefetch fan-out removed, supporting APIs made
CDN-cacheable, ISR shell now reported as `● (SSG)` by the build (section 60
correction), component extracted to `app/tv/[id]/TVDetailPage.tsx`.

## 20. Link components changed

26 `prefetch={false}` sites were introduced across the card and link components that
appear on navigation surfaces: shared movie cards, shared TV cards, and similar-item
links. These are exactly the links that produced concurrent RSC prefetch requests from
detail pages.

No navigation semantic was removed: every link still renders an anchor and still
navigates on click. Only the speculative prefetch is suppressed.

## 21. Complete API route classification

44 API route modules were classified: 21 public-cacheable deterministic GET routes
(trending 8, similar 4, details 3, genres 3, celebrities 1, search 1, trailers 1),
23 private/dynamic/other routes, and 8 routes that explicitly emit `no-store`.

| # | Route file | Methods | Auth | Cache policy | no-store |
|---|---|---|---|---|---|
| 1 | `app/api/actor/[id]/route.ts` | GET | no | details | no |
| 2 | `app/api/admin/cache/route.ts` | GET, POST, DELETE | yes | None | yes |
| 3 | `app/api/admin/promote/route.ts` | POST, GET | no | None | no |
| 4 | `app/api/admin/settings/route.ts` | GET, POST | yes | None | no |
| 5 | `app/api/admin/stats/route.ts` | GET | yes | None | no |
| 6 | `app/api/admin/users/route.ts` | GET, PUT | yes | None | no |
| 7 | `app/api/ai-recommendations/route.ts` | GET | yes | None | yes |
| 8 | `app/api/auth/[...nextauth]/route.ts` | GET, POST | no | None | no |
| 9 | `app/api/celebrities/route.ts` | GET | no | celebrities | no |
| 10 | `app/api/chat-history/[id]/route.ts` | GET, DELETE | yes | None | no |
| 11 | `app/api/chat-history/list/route.ts` | GET | yes | None | no |
| 12 | `app/api/chat-history/route.ts` | GET, POST, DELETE | yes | None | yes |
| 13 | `app/api/chat/route.ts` | POST | yes | None | no |
| 14 | `app/api/favorites/route.ts` | GET, POST, DELETE | yes | None | no |
| 15 | `app/api/features/route.ts` | GET | no | None | yes |
| 16 | `app/api/genre/[id]/content/route.ts` | GET | no | genres | no |
| 17 | `app/api/genre/[id]/route.ts` | GET | no | genres | no |
| 18 | `app/api/genres/route.ts` | GET | no | genres | no |
| 19 | `app/api/health/live/route.ts` | GET | no | None | yes |
| 20 | `app/api/health/ready/route.ts` | GET | no | None | yes |
| 21 | `app/api/history/route.ts` | GET, POST, DELETE | yes | None | yes |
| 22 | `app/api/mood-recommendations/route.ts` | GET | no | trending | no |
| 23 | `app/api/movie/[id]/ai-similar/route.ts` | GET | yes | None | no |
| 24 | `app/api/movie/[id]/recommendations/route.ts` | GET | no | similar | no |
| 25 | `app/api/movie/[id]/route.ts` | GET | no | details | no |
| 26 | `app/api/movie/[id]/similar/route.ts` | GET | no | similar | no |
| 27 | `app/api/movies/route.ts` | GET | no | trending | no |
| 28 | `app/api/movies/time-based/route.ts` | GET | no | trending | no |
| 29 | `app/api/movies/top-rated/route.ts` | GET | no | trending | no |
| 30 | `app/api/search/route.ts` | GET | no | search | no |
| 31 | `app/api/trailers/route.ts` | GET | no | trailers | no |
| 32 | `app/api/trending/movie/route.ts` | GET | no | trending | no |
| 33 | `app/api/trending/route.ts` | GET | no | trending | no |
| 34 | `app/api/trending/tv/route.ts` | GET | no | trending | no |
| 35 | `app/api/tv/[id]/recommendations/route.ts` | GET | no | similar | no |
| 36 | `app/api/tv/[id]/route.ts` | GET | no | details | no |
| 37 | `app/api/tv/[id]/similar/route.ts` | GET | no | similar | no |
| 38 | `app/api/tv/top-rated/route.ts` | GET | no | trending | no |
| 39 | `app/api/user/account/route.ts` | DELETE | yes | None | no |
| 40 | `app/api/user/export/route.ts` | GET | yes | None | yes |
| 41 | `app/api/user/route.ts` | GET, PUT | yes | None | no |
| 42 | `app/api/users/route.ts` | POST | yes | None | no |
| 43 | `app/api/watchlist/details/route.ts` | GET | yes | None | no |
| 44 | `app/api/watchlist/route.ts` | GET, POST, DELETE | yes | None | no |

## 22. Browser cache policy

Public deterministic GET routes emit `Cache-Control: public, max-age=0, must-revalidate`.

The browser therefore revalidates on every reuse instead of holding a stale
representation, while conditional revalidation can still be answered cheaply. The
long-lived TTL is carried in the CDN-only header, so a stale entry is never served to a
browser that skipped revalidation off the origin.

Private routes (authentication, chat, history, watchlist, favorites, user, admin,
`ai-similar`, and `/api/features`) emit `private, no-store` and are never eligible for
the shared cache.

## 23. Vercel CDN cache policy

Public routes send a CDN-specific header (`Vercel-CDN-Cache-Control`) that the browser
ignores. TTLs are set per data class in `lib/public-cache.ts`:

| Policy | s-maxage | stale-while-revalidate | Applied to |
|---|---|---|---|
| trending | 300 | 1800 | trending lists |
| genres | 3600 | 86400 | genre catalogues |
| details | 900 | 3600 | movie/TV detail JSON |
| similar | 900 | 3600 | similar-title JSON |
| celebrities | 3600 | 86400 | person/celebrity data |
| search | 60 | 300 | search results |
| trailers | 1800 | 7200 | trailer metadata |

`stale-while-revalidate` lets the CDN answer from a stale copy while it refreshes in
the background, which is what converts a burst of identical crawler requests into CDN
hits instead of function invocations.

## 24. Explicitly private routes

Eight API modules emit `no-store` directly, and the middleware independently stamps
`private, no-store` on every matched protected path. The private surface is:
authentication, `ai-recommendations`, `ai-similar`, `chat`, chat history, `watchlist`,
`favorites`, `history`, `user`/`users`, `admin`, and `/api/features`.

The double declaration is intentional: the route owns its contract, and the middleware
guarantees the invariant if a route is refactored and its header is lost.

## 25. Health-route non-change

The health endpoints were deliberately left out of this phase. Commit A's manifest
contains no health route module (the only match for "health" is
`lib/redis-health.ts`), so `/api/health` and `/api/health/ready` keep their existing
behaviour, including the Phase 22 readiness probe budget. No cache header was added to
them, and they are not part of the public-cacheable set.

Rationale: a cached health response would report a stale readiness verdict, which is a
worse failure than the request cost. Health traffic is also driven by the owner and the
platform, not by the crawler.

## 26. Redis exhaustion evidence

Classification: `UPSTASH_REDIS_REQUEST_QUOTA_EXHAUSTION=CONFIRMED`.

Production evidence recorded the provider error `ERR max requests limit exceeded` with a
quota limit of `500000` and usage of `500000` - the metered request cap was fully
consumed. Under the previous client behaviour, every subsequent Redis-backed read kept
attempting a command against an exhausted quota, turning a capacity incident into a
repeated-error storm with no useful result.

No Redis provider, credential, plan, or Environment Variable was changed in this phase.

## 27. Redis operation inventory

Static inventory across `lib/` and `app/` (source pattern counts, not runtime counters):

| Operation | Call sites |
|---|---|
| `getOrSet` (cache wrapper) | 17 |
| `.get(` | 50 |
| `.set(` | 9 |
| `.del(` | 2 |
| `.incr(` | 1 |
| `.scan(` | 2 |

The pattern counts are textual and may include non-Redis objects exposing the same
method names; the Redis-specific surface is the 17 `getOrSet` sites plus the rate-limit
`incr` path. The wrapper count moved from 19 to 17 during this phase because the
features endpoint stopped reading through the cache wrapper.

## 28. Redis mitigations

`lib/redis-health.ts` now treats provider quota exhaustion as terminal for the process:
when a command error matches
`/max requests limit exceeded|ERR max requests|usage limit|quota.*exceeded/i`, the
client sets `_isDisabled = true`, marks itself unhealthy, and short-circuits further
work instead of retrying.

Effect: during an exhausted-quota window the application degrades to uncached reads and
in-process fallbacks rather than looping on a metered rejection. The guard does not
raise the quota, bypass the provider, or enable unmetered behaviour - it stops paying
for failures.

## 29. Robots policy

`app/robots.ts` now disallows the whole site for `Reflectionbot`, and separately
disallows private and non-content surfaces for all agents: `/api/`, `/admin/`,
`/profile/`, `/favorites/`, `/watchlist/`, `/ai-assistant/`, `/auth/`, and `/search`.
The sitemap is still advertised for legitimate crawlers.

Honest limitation: `robots.txt` is advisory. A client that ignores it is unaffected by
this change, which is why the Firewall plan (section 30) and the cache headers
(sections 22-23) carry the enforcement weight.

## 30. Firewall owner-action plan

Status: **EXECUTED BY THE OWNER AFTER THIS REPORT WAS COMMITTED - PUBLISHED (2026-11-24)**.
During this phase the Vercel Firewall was not modified; the owner later applied and
published stages 1 and 3 exactly as proposed (stage 2 kept in Log mode for observation,
stage 4 rate limit left disabled, stage 5 review pending). Verified against the active
Firewall config in section 61.1.

| Stage | Rule | Mode | Purpose |
|---|---|---|---|
| 1 | Managed AI Bots: crawlers | Deny | Block declared crawler traffic at the edge |
| 2 | Managed AI Bots: assistants | Log | Observe assistant traffic before enforcing |
| 3 | Custom rule: User-Agent contains `Reflectionbot` | Deny | Explicit deny even if classification changes |
| 4 | Rate limit: `/api/features` + detail JSON, per IP | 60 requests / minute | Bound a client that evades UA rules |
| 5 | Review after 24 h | - | Promote stage 2 from Log to Deny if volume justifies |

Sequencing rationale: stages 1 and 3 are deterministic identity blocks and are safe
first. Stage 4 is the only rule with a plausible false-positive risk for legitimate
heavy users, so it should follow a log-only observation window, not ship alongside the
deny rules.

## 31. TDD RED evidence

Tests were written first and failed for the intended reasons, not from environment
errors. RED run: **3 test files failed, 6 tests failed / 22 passed (28)**.

| Assertion | Meaning |
|---|---|
| `expected 503 to be 200` | `/api/features` had no working server-side resolver |
| `expected -1 to be greater than 1676` | no CDN cache header existed on public JSON |
| `expected 'use client' ... not to match /\/api\//` | a client module still imported the API path |
| `expected false to be true` | robots policy did not yet disallow the crawler |
| `expected [ Array(1) ] to deeply equal []` | a prefetch link was still enabled |

Each failure names the behaviour the phase intends to guarantee - the property a good
RED step must have.

## 32. TDD GREEN evidence

After the minimal fixes, the same focused selection passed: **8 test files passed (8),
99 tests passed (99)**, exit 0, 42.25 s. No test was skipped, no assertion weakened, and
no test deleted to reach green.

Section 60 additions (five Section I contract tests, one RED/GREEN cycle) take the same
selection to **8 files / 104 tests, all passing**, exit 0 - see sections 57, 60.

## 33. Focused tests

| File | Kind |
|---|---|
| `tests/phase25-cache-policy.test.ts` | new - CDN/browser header contract |
| `tests/phase25-detail-isr.test.ts` | new - detail pages stay ISR |
| `tests/phase25-feature-gate.test.ts` | new - server-side feature gate |
| `tests/phase25-robots-prefetch.test.ts` | new - robots + prefetch policy |
| `tests/ai-recommendations-degraded-fallback.test.ts` | modified - private-route behaviour |
| `tests/ai-recommendations-ownership-exclusion.test.ts` | modified - private-route behaviour |
| `tests/operational-security.test.ts` | modified - middleware matcher scope |
| `tests/performance-m4.test.ts` | modified - cache-cost assumptions |

Reconciliation note: the PR #28 body originally carried a figure of "5 affected
files / 74 tests", which was stale even when written. The authoritative measured
result is the 8-file selection above - **104 tests passing** after the section 60
gap closure. The PR body was refreshed (a body edit, not a history rewrite) as part
of section 60.

## 34. Full suite

| Metric | Value |
|---|---|
| Test files | 2 failed / 51 passed (53) |
| Tests | 5 failed / 659 passed (664); before the section 60 test additions it was 5 failed / 654 passed (659) - the same 5 failures either way |
| Duration | 97-113 s across runs |
| Exit code | 1 |

Baseline comparison: the two failing files checked out at `d0184c9` produced 5 failed /
79 passed (84); at HEAD `2ea4374` the same files produced 5 failed / 79 passed (84) with
the **same five failure titles**. The five are pre-existing, not introduced by Phase 25:

1. `P23-C12` live dependency-audit assertion (`expected 1 to be +0`).
2. README contract: does not instruct normal users to run `setup-db`.
3. README contract: recommends `npm ci`.
4. README contract: documents `REDIS_URL` precedence.
5. README contract: does not claim live external integration testing.

The four README failures trace to the hero/logo documentation refactor merged in PR #26:
the extractor returns an empty section body for the Testing anchor
(`expected '' to contain 'npm ci'`). The `P23-C12` failure is the direct consequence of
the one moderate advisory in section 37.

## 35. Coverage

| Metric | Percentage |
|---|---|
| Statements | 60.88% (1225/2012) |
| Branches | 51.94% (640/1232) |
| Functions | 72.19% (161/223) |
| Lines | 62.04% (1169/1884) |

Measured with the repository's v8 provider. One environment warning came from the native
config loader for `__dirname` at `vitest.config.mts:5:21`; it does not affect the numbers
and is pre-existing.

## 36. Build and route output

Build exit 0 - re-run twice during the section 60 reconciliation with identical
results (26.3 s and 28.0 s compile; the earlier 91.28 s figure includes page-data
collection on a cold cache). The route table contains 65 rows: **48 dynamic (`ƒ`),
15 static (`○`), 2 SSG (`●`)**. The original draft of this section reported "50
dynamic (`ƒ`) / 15 static", which folded the two `●` ISR routes into the dynamic
count and printed `ƒ` for them; corrected per the actual build output.

| Route | Size | First Load JS | Mode |
|---|---|---|---|
| `/movie/[id]` | 4.7 kB | 165 kB | `●` SSG + ISR 900 s |
| `/tv/[id]` | 3.98 kB | 164 kB | `●` SSG + ISR 900 s |
| `/api/features` | 251 B | 103 kB | `ƒ` |
| `/robots.txt` | 251 B | 103 kB | `○` |

`/robots.txt` became static in this phase, so the crawler policy is served without a
function invocation.

## 37. Audits

Production-only and full (`--include=dev`) audits produced identical results:

| Severity | Count |
|---|---|
| critical | 0 |
| high | 0 |
| moderate | 1 |
| total | 1 |

The single advisory is `next`, range `<=15.5.28`; the fix is `next@15.5.29`, not a
semver-major upgrade. Dependency census: 286 production, 485 dev, 85 optional, 9 peer,
807 total.

This report therefore says "1 moderate advisory with an available non-major fix", not
"zero vulnerabilities". The upgrade was not taken: it is a framework bump outside the
containment scope and would invalidate every gate result recorded here.

## 38. Secret scan

A diff-scoped scan of Commit A's added lines ran with six credential patterns: AWS
access key IDs, GitHub tokens, provider secret keys (`sk_live`/`sk_test`), PEM
private-key headers, Slack tokens, and JWT triples. Result: **0 matches**.

The same scan confirmed Commit A adds no `.env`, `.pem`, `.p12`, `.png`, `.pdf` or
`.jpg` file. No screenshot, PDF, scratch artifact, or environment file was committed.

## 39. Changed files

Commit A changes 62 files: 51 modified, 11 added, 0 deleted.

Added (11):

- `app/movie/[id]/MovieDetailPage.tsx`
- `app/robots.ts`
- `app/tv/[id]/TVDetailPage.tsx`
- `lib/features-store.ts`
- `lib/features.ts`
- `lib/public-api-paths.ts`
- `lib/public-cache.ts`
- `tests/phase25-cache-policy.test.ts`
- `tests/phase25-detail-isr.test.ts`
- `tests/phase25-feature-gate.test.ts`
- `tests/phase25-robots-prefetch.test.ts`

Modified (51):

- `app/actor/[id]/page.tsx`
- `app/api/actor/[id]/route.ts`
- `app/api/admin/settings/route.ts`
- `app/api/ai-recommendations/route.ts`
- `app/api/celebrities/route.ts`
- `app/api/features/route.ts`
- `app/api/genre/[id]/content/route.ts`
- `app/api/genre/[id]/route.ts`
- `app/api/genres/route.ts`
- `app/api/mood-recommendations/route.ts`
- `app/api/movie/[id]/recommendations/route.ts`
- `app/api/movie/[id]/route.ts`
- `app/api/movie/[id]/similar/route.ts`
- `app/api/movies/route.ts`
- `app/api/movies/time-based/route.ts`
- `app/api/movies/top-rated/route.ts`
- `app/api/search/route.ts`
- `app/api/trailers/route.ts`
- `app/api/trending/movie/route.ts`
- `app/api/trending/route.ts`
- `app/api/trending/tv/route.ts`
- `app/api/tv/[id]/recommendations/route.ts`
- `app/api/tv/[id]/route.ts`
- `app/api/tv/[id]/similar/route.ts`
- `app/api/tv/top-rated/route.ts`
- `app/genre/[id]/page.tsx`
- `app/movie/[id]/page.tsx`
- `app/profile/page.tsx`
- `app/search/page.tsx`
- `app/trending/page.tsx`
- `app/tv/[id]/page.tsx`
- `components/AdminNavLink.tsx`
- `components/AuthButton.tsx`
- `components/ForYouSection.tsx`
- `components/MoodBasedRecommendations.tsx`
- `components/MovieCard.tsx`
- `components/TimeBasedMovies.tsx`
- `components/TopRatedMovies.tsx`
- `components/TopRatedTVShows.tsx`
- `components/TrendingSection.tsx`
- `components/WatchHistory.tsx`
- `components/layout/FeatureNavItems.tsx`
- `components/layout/MobileNav.tsx`
- `contexts/LanguageContext.tsx`
- `hooks/useFeatures.ts`
- `lib/redis-health.ts`
- `middleware.ts`
- `tests/ai-recommendations-degraded-fallback.test.ts`
- `tests/ai-recommendations-ownership-exclusion.test.ts`
- `tests/operational-security.test.ts`
- `tests/performance-m4.test.ts`

Deleted (0).

## 40. Files created

The 11 added files, and why each exists:

| File | Purpose |
|---|---|
| `app/robots.ts` | Crawler policy: disallows Reflectionbot site-wide and private surfaces for all agents |
| `lib/public-cache.ts` | Single source of the browser and CDN cache-header contract plus the per-class TTL table |
| `lib/features.ts` | Server-side public feature resolver |
| `lib/features-store.ts` | Storage access for `FeatureSettings`, kept server-only |
| `lib/public-api-paths.ts` | Shared constant list of public API paths, used by the cache policy and the feature gate |
| `app/movie/[id]/MovieDetailPage.tsx` | Client detail view extracted from the movie page so the route module stays server-side |
| `app/tv/[id]/TVDetailPage.tsx` | Client detail view extracted from the TV page, same split |
| `tests/phase25-cache-policy.test.ts` | Cache-header contract |
| `tests/phase25-detail-isr.test.ts` | Detail pages remain ISR at 900 s |
| `tests/phase25-feature-gate.test.ts` | Feature resolution happens server-side only |
| `tests/phase25-robots-prefetch.test.ts` | Robots policy and prefetch suppression |

## 41. Files modified

| Area | Files | Nature of change |
|---|---|---|
| `app/api/**/route.ts` | 24 | Cache headers, public/private classification, `/api/features` delegation |
| `app/**` pages | 7 | Metadata/layout split, prefetch policy, feature-state consumption |
| `components/**` | 12 | `prefetch={false}` on card/link surfaces, feature-state consumption |
| `lib/**` | 1 | `lib/redis-health.ts` quota-exhaustion short-circuit |
| `contexts/**` | 1 | Feature state through the existing context boundary |
| `hooks/**` | 1 | `hooks/useFeatures.ts` TTL cache and single-flight fetch |
| `middleware.ts` | 1 | Matcher left byte-identical to baseline (already protected-only); feature self-fetch removed; `private, no-store` stamp added |
| `tests/**` | 4 | Existing behaviour tests updated for the new contracts |

## 42. Files deleted

None. No file was removed, renamed, or replaced, so no import path breaks from this
phase.

## 43. Environment Variables

**No Environment Variable was added, modified, or removed.** No Vercel environment
change was made, no variable was renamed, and no value was read into this report. The
Redis guard reads provider error text at runtime and needs no configuration.

## 44. Vercel settings

| Setting | State in this phase |
|---|---|
| Project paused | **true** (unchanged in the phase) - owner resumed post-release, `false` (section 61.2) |
| Firewall rules | none applied/published *by this phase* - owner published Firewall v6 post-release (section 61.1) |
| Environment Variables | unchanged |
| Build settings | unchanged |
| Deployment for `2ea4374` | `BLOCKED` (historical) - superseded by READY Preview `dpl_EGK7zzhrjczar2XNCrBM4EqEtuVG` for `eeebe7d` (section 61.3) |
| Preview URL | `movie-recommendation-system-4use6dzba.vercel.app` - superseded by `movie-recommendation-system-brzfccczq.vercel.app` (READY, section 61.3) |

No production setting was touched by this phase, and the project was not resumed by this phase. The owner later resumed the project and published the Firewall; see section 61.

## 45. MongoDB changes

None. No schema, model, index, query contract, connection string, or Atlas
configuration was changed. The new `lib/features-store.ts` reads the existing
`FeatureSettings` document through the existing model; it adds a read path, not a data
shape.

## 46. Redis external changes

None. The Redis provider, plan, credentials, database and Environment Variables are
untouched. The only change is client-side: `lib/redis-health.ts` stops issuing commands
once the provider reports quota exhaustion. No key was deleted and no cache flush was
performed by this phase.

## 47. Commit A

| Field | Value |
|---|---|
| SHA | `2ea4374` |
| Subject | `fix(perf): mitigate reflectionbot amplification and cache public routes` |
| Parent | `d0184c9` (baseline, equals `origin/main`) |
| Files | 62 (51 modified, 11 added, 0 deleted) |
| Lines | +2677 / -1694 |
| Secret scan | 0 findings, 0 sensitive files |
| Gates at this commit | typecheck 0, lint 0 errors, build 0, focused 99/99 |

**Subject deviation (disclosed).** The brief specified the commit subject
`fix(perf): contain crawler-driven Vercel amplification`. The commit actually created
and pushed carries `fix(perf): mitigate reflectionbot amplification and cache public
routes`. Amending a pushed subject would require a force-push / history rewrite,
which this phase explicitly forbids, so the original subject stands and the deviation
is recorded here rather than corrected by rewriting history.

## 48. Commit B

Commit B is the documentation commit containing this report and the Phase 25 appendix
to the incident diagnosis. Staging is explicit and path-scoped: only those two
documentation files are added, never `-A`, so the 17 pre-existing untracked entries
(including `.chunks/`) stay untracked.

A commit cannot contain its own SHA, so Commit B's SHA is recorded in the branch history
and the PR timeline rather than inside this file. Subject:
`docs: record Reflectionbot and Vercel mitigation`.

Commit B was created as `94810eb` (parent `2ea4374`): 2 files changed, 1921 insertions, 0 deletions. A file cannot truthfully contain the SHA of the commit that creates it, so this identity is recorded by the later corrective commit rather than inside Commit B itself.

## 49. Push

Commit A was pushed non-force to
`origin/fix/reflectionbot-and-vercel-amplification-mitigation`. The remote tip was
verified equal to local HEAD by two independent checks:

- `git ls-remote origin refs/heads/fix/reflectionbot-and-vercel-amplification-mitigation`
  returned the same full SHA as `git rev-parse HEAD` (`2ea4374` at that time);
- `git rev-list --left-right --count HEAD...@{u}` returned `0	0`.

The three-dot form is stated explicitly on purpose. On this host the git build
(2.50.1, Windows) returns a non-zero right-hand count for the two-argument form even when
both arguments name the same commit, so the two-dot invocation is not valid evidence here
and was not used to support this claim.

Commit B (`94810eb`, parent `2ea4374`, 2 files, +1921 / -0) was pushed with the same
non-force command. `git ls-remote` again returned a SHA equal to local HEAD, and
`HEAD...@{u}` returned `0	0`. PR #28 then reported 2 commits with head `94810eb`.

No force-push, no history rewrite, and no push to `main` occurred at any point.

The two reconciliation code commits (`4090069`, `a1993cf`) were pushed with the same
non-force command in the same session and passed the same two checks (`ls-remote`
equals local HEAD, `HEAD...@{u}` = `0\t0`). This documentation commit receives the
identical treatment after it leaves this host; a file cannot witness its own push, so
the verification for it lives in the session record and the PR timeline.

## 50. Pull Request

| Field | Value |
|---|---|
| Number | #28 |
| Title | Contain Reflectionbot-driven Vercel request amplification |
| State | OPEN (at inspection) - MERGED 2026-11-24 by Merge Commit `ab57763` (section 61.5) |
| Draft | false |
| Mergeable | MERGEABLE |
| Commits on branch | 6: `2ea4374`, `94810eb`, `4b5afa9`, `4090069`, `a1993cf`, and this documentation commit |
| Base | `main` |
| Head | `fix/reflectionbot-and-vercel-amplification-mitigation` |

Commit B raised the count to 2; the section 60 reconciliation added the two corrective
code commits (`4090069` whitespace, `a1993cf` feature-gate contract tests) and this
one. The PR body defect flagged in section 33 ("5 affected files / 74 tests") was
fixed during section 60 by editing the PR body - no history was rewritten.

## 51. Preview

**Post-release correction (2026-11-24):** the table below records the `2ea4374`
deployment during the phase (historical). The owner had resumed the project before the
release chain began, and one bounded redeploy built a READY Preview for the final branch
head `eeebe7d`: `dpl_EGK7zzhrjczar2XNCrBM4EqEtuVG`,
`movie-recommendation-system-brzfccczq.vercel.app`. All five bounded checks in that
Preview passed (cache MISS-to-HIT, robots, private 401 boundary, features); details are in
section 61.3. The remaining historical text describes the paused-project state as it was
on 2026-11-23.

| Field | Value |
|---|---|
| Deployment for `2ea4374` | `movie-recommendation-system-4use6dzba.vercel.app` |
| State | **BLOCKED** |
| Target | none |
| PR check `Vercel` | fail (0 checks reported) |
| PR check `Vercel Preview Comments` | pass |

The preview was **not** a build failure: the deployment was refused because the project
is manually paused (`paused = true`, section 6). For contrast, the older deployment
`c4f860a` remains `READY`, which confirms the pause affects new deployments rather than
retrospective state.

Consequence: the end-to-end preview verification required by the brief could not be
executed. Specifically, the live CDN behaviour of the new cache headers, the live
`/api/features` single-fetch behaviour, and the live robots response are **UNVERIFIED in
a deployed environment**. They are verified only as source contracts and as local
test/build results.

After Commit B was pushed, a second deployment record appeared: `94810eb` ->
`movie-recommendation-system-2trzdwqj1.vercel.app`, also in state `BLOCKED`/`UNKNOWN`.

Section 60 verification (Vercel CLI, control-plane metadata only - no HTTP request was
ever sent to a preview URL): every subsequent push produced one more preview record -
`movie-recommendation-system-ilboylxas.vercel.app` (1 h old), and
`movie-recommendation-system-6njuikwiw.vercel.app` (created by the reconciliation
pushes). All of them report status `UNKNOWN` with build duration `?`, and
`vercel inspect` shows a single `.` build line of `[0ms]` - i.e. the deployment was
never built, exactly as the paused project (`paused = true`, section 6) predicts. The
the project still reported paused, so **no READY preview existed for any Phase 25 commit**
and no live response-header verification was possible. (Historical: a READY Preview was
later built for `eeebe7d` and the live response-header verification passed - section 61.3.)

## 52. Merge authorization state

`MERGE = NOT AUTHORIZED` (historical, as of the recheck session; the owner later
authorized and executed the merge - section 61.5).

PR #28 is mergeable by GitHub's assessment, but the brief reserves the merge decision to
the owner after the pre-merge gate. No merge was attempted, no auto-merge was enabled,
and no merge queue entry was created.

## 53. Production deployment state

No Production deployment was created from this branch: the branch is not `main`, the
merge is not authorized, and the project is paused so new deployments cannot be created
regardless. `https://moviemind-re.vercel.app` therefore still served the pre-Phase-25
build at that time. The current Production deployment ID was not re-verified in this
phase because no action in this phase could change it.

**Post-release:** the owner authorized the release; PR #28 was merged as `ab57763` and
Production deployment `dpl_A7TAM5bHTcxqe4ri1u86sX3KKrvQ` (merge SHA `ab57763`) became
READY/PROMOTED on the production alias - section 61.6. No action in this phase created it.

## 54. Resume state

The project remained paused at the time of this section. Resume is an owner action and
was **not** part of the authorized work; the owner performed it after this report was
committed (`paused` is now `false`, section 61.2). Recommended order when the owner was
ready (historical; the owner's executed sequence is recorded in section 61):

1. Review this report and PR #28.
2. Merge PR #28 (owner decision).
3. Resume the project.
4. Apply Firewall stages 1 and 3 from section 30.
5. Run the monitoring checkpoints in section 55 before considering stage 4.

Resuming before the Firewall rules exist would expose the project to the same crawler
with only the code-level mitigations active; the mitigations were strong but unproven in
production at that time. (The owner published the Firewall before resuming, and the
bounded Production checks now pass - section 61.)

## 55. Monitoring thresholds

Mandated checkpoints and pass criteria, to be evaluated without post-hoc adjustment:

| Window | Metric | Threshold |
|---|---|---|
| First 15 minutes | Total CDN requests | <= 500 |
| First 15 minutes | Function invocations | <= 200 |
| First 15 minutes | Sustained rate | <= 10 requests/second, and explained |
| First 15 minutes | Reflectionbot requests Allowed instead of Denied | 0 - any occurrence is investigated, consider re-pausing |
| First 15 minutes | Redis quota errors | 0 - any occurrence is investigated |
| First hour | CDN requests | <= 5,000 |
| First hour | Function invocations | <= 1,000 |
| First hour | Middleware redirects caused by automated clients | <= 100 |
| First hour | Public cacheable routes | predominantly HIT after initial fill |
| First hour | Repeated Redis quota failures | none |
| First 24 hours | CDN requests | <= 25,000 |
| First 24 hours | Function invocations | <= 10,000 |
| First 24 hours | Reflectionbot observed after robots propagation and not denied | any occurrence is investigated |
| First 24 hours | Redis usage growth | proportional to real user sessions |

Checkpoints: 15 minutes, 1 hour, 24 hours, 72 hours. A breach is reported as a breach;
thresholds are not to be relaxed after seeing results.

## 56. Remaining risks

| Risk | Severity | Status |
|---|---|---|
| Cache headers unverified against the live CDN (preview BLOCKED) | Medium | RESOLVED - verified on the READY Preview and in the bounded Production smoke (sections 61.3, 61.7) |
| `robots.txt` is advisory; an ignoring client is unaffected | Medium | RESOLVED FOR THE NAMED ACTOR - Firewall v6 published with Reflectionbot Deny (section 61.1); the advisory limitation remains for other clients |
| Redis quota still exhausted externally | Medium | Owner action outside this phase - Upstash quota state remains owner-verifiable only; first 15-min window showed 0 quota-like errors, 6 pre-existing connection-error log entries (all HTTP 200), readiness `redis: optional` (section 61.9) |
| Cold-id detail renders (ISR 900 s shell, `\u25cf`) | Low | Accepted - prefetch fan-out removed instead |
| Pre-existing full-suite failures (4 README contract + 1 audit assertion) | Low | Pre-existing, disclosed, not fixed here |
| 1 moderate `next` advisory with non-major fix available | Low | Disclosed, upgrade deferred |
| Account 3x limit and unblock are owner-reported only | Low | UNVERIFIABLE via the APIs used here |
| 1-hour, 24-hour and 72-hour section 55 checkpoints not yet evaluated | Medium | OPEN - owner/monitoring follow-up; thresholds unchanged |
| The ~2-second, 33-request burst immediately after Production alias promotion has no recoverable requester identity in `vercel logs` (no User-Agent field; metrics API paywalled) | Low | DISCLOSED - bounded, all HTTP 200, no quota-like strings; carry into the 1-hour checkpoint (section 61.8) |
| Firewall analytics returned no events at query time and edge deny events are not surfaced in application logs | Low | DISCLOSED - zero events is not proof of zero attempts (section 61.1) |
| A documentation-only reconciliation merge triggers a new Production deployment | Low | DISCLOSED - confirm by Vercel API listing only; no app probe (section 61.11) |
| No production learning while paused | Low | RESOLVED - project resumed; first 15-minute telemetry recorded (section 61.8) |

No claim is made that this mitigation prevents every abusive client. It removes the
specific amplification paths measured in section 9 and makes the remaining paths
cheaper to serve.

## 57. Requirement Traceability Matrix

**Reading note (2026-11-24):** rows 25 and 40-43 and 46 record the phase's compliance
with its original authorization, which reserved Firewall changes, merge, Production
deployment and resume to the owner. Those statements remain accurate for the phase; the
owner-authorized release that followed is recorded in section 61. Row 40's BLOCKED
outcome is annotated in place; rows 41-43 and 46 are phase-compliance outcomes (the
phase correctly did not merge, deploy, resume or change the Firewall) and are not
rewritten. All evidence cells are preserved as measured.

| # | Requirement | Evidence | Outcome |
|---|---|---|---|
| 1 | Identify current amplifying actor | 994/1310 requests, `Reflectionbot/1.0` UA | PASS |
| 2 | Bound historical attribution | labelled HIGH_CONFIDENCE_PROBABLE, not proven | PASS |
| 3 | Route-level aggregation | 5 hottest routes tabulated | PASS |
| 4 | Prefetch evidence | `Prefetch: Yes`, `nxtPid`, stream path | PASS |
| 5 | Movie amplification | 309 requests, 0% cached | PASS |
| 6 | TV amplification | 116 requests, 0% cached | PASS |
| 7 | Middleware amplification reduced | feature self-fetch removed; matcher already protected-only (unchanged); protected links `prefetch={false}` | PASS - *wording corrected in section 60* |
| 8 | Single server FeatureSettings source | `lib/features.ts` + store, route rewired | PASS |
| 9 | No client DB/Redis/Node-only imports | gate test + 24 API / 7 page rewires | PASS |
| 10 | `/api/features` deduplicated | TTL + single-flight hook, 2 functional call sites + 1 comment (was mis-stated as 3 call sites) | PASS |
| 11 | Complete page classification | 19 modules classified | PASS |
| 12 | Root layout classified, unmodified | 88-line server component, absent from manifest | PASS |
| 13 | Movie page result documented | 4.7 kB / 165 kB, `●` SSG + ISR 900 | PASS |
| 14 | TV page result documented | 3.98 kB / 164 kB, `●` SSG + ISR 900 | PASS |
| 15 | Link prefetch disabled | 26 `prefetch={false}` sites | PASS |
| 16 | Complete API classification | 44 modules, 21 public / 23 other / 8 no-store | PASS |
| 17 | Browser cache policy | `public, max-age=0, must-revalidate` | PASS |
| 18 | CDN cache policy + TTLs | `Vercel-CDN-Cache-Control` table | PASS |
| 19 | Private routes explicit | middleware + route-level no-store | PASS |
| 20 | Health routes unchanged | absent from Commit A manifest | PASS |
| 21 | Redis exhaustion classified | `ERR max requests limit exceeded`, 500000/500000 | PASS |
| 22 | Redis inventory | 17 getOrSet + pattern counts | PASS |
| 23 | Redis mitigation | quota short-circuit in `lib/redis-health.ts` | PASS |
| 24 | Robots policy | Reflectionbot + private surfaces disallowed | PASS |
| 25 | Firewall plan documented, not applied | section 30; no change published | PASS |
| 26 | TDD RED with correct causes | 3 files, 6 failed / 22 passed | PASS |
| 27 | TDD GREEN | 8 files, 104 passed (99 at first GREEN, +5 in section 60) | PASS |
| 28 | Focused suite | exit 0, 8 files / 104 tests | PASS |
| 29 | Full suite executed | 5 failed / 659 passed (664), same 5 pre-existing | PASS |
| 30 | Pre-existing failures proven | identical 5 titles at `d0184c9` | PASS |
| 31 | Coverage measured | 60.88 / 51.94 / 72.19 / 62.04 | PASS |
| 32 | Build and route output | exit 0 (re-verified in section 60), 65 rows (48 `ƒ` / 15 `○` / 2 `●`) | PASS |
| 33 | Audits executed | 1 moderate, fix `15.5.29`, 0 high/critical | PASS |
| 34 | Secret scan | 0 matches, 0 sensitive files | PASS |
| 35 | Changed files documented | section 39 manifest | PASS |
| 36 | Commit A created | `2ea4374`, 62 files | PASS |
| 37 | Commit B docs commit | `94810eb`, this file + appendix, explicit staging | PASS |
| 38 | Non-force push | every push: `ls-remote` == HEAD, `HEAD...@{u}` = `0\t0` | PASS |
| 39 | PR opened/updated | #28 OPEN, MERGEABLE, 6 commits, body refreshed with measured numbers | PASS |
| 40 | Preview verified READY | deployment BLOCKED by pause | BLOCKED (phase) -> RESOLVED post-release (section 61.3) |
| 41 | Merge gate held | NOT AUTHORIZED, no merge attempt | PASS |
| 42 | No Production deployment | branch not main, project paused | PASS |
| 43 | No automatic resume | `paused = true` maintained | PASS |
| 44 | Monitoring thresholds proposed | section 55 | PASS |
| 45 | No Environment Variable change | section 43 | PASS |
| 46 | No Firewall change | nothing applied or published | PASS |
| 47 | No MongoDB change | section 45 | PASS |
| 48 | No Redis external change | section 46 | PASS |
| 49 | No push to main | branch-only push | PASS |
| 50 | No squash/rebase | merge commit not used, history linear | PASS |
| 51 | `git diff --check` clean on the branch | after `4090069`, exit 0 (44 trailing-whitespace findings removed) | PASS |
| 52 | Section I required-test gaps (I.2, I.6, I.8, I.12, I.15) | RED (`expected ... 1 times, but got 2 times`) then GREEN, sections 31/60 | PASS |
| 53 | PR body accuracy | refreshed in section 60: 8 files / 104 tests, baseline 5/79 (84) | PASS |
| 54 | Two-logical-commit rule | 6 commits instead of 2 (forced commits forbidden) - DEVIATION, disclosed | DEVIATION DISCLOSED |
| 55 | Commit A subject as specified by the brief | actual subject differs - DEVIATION, disclosed in section 47 | DEVIATION DISCLOSED |

## 58. Todo reconciliation

| Item | Work | Status |
|---|---|---|
| t08c | Write this 59-section report with measured numbers | completed by Commit B |
| t08d | Append Phase 25 appendix to the incident diagnosis | completed by Commit B |
| t09 | Commit B with explicit staging, cached diff review, secret scan | completed by Commit B |
| t10 | Non-force push and PR #28 update confirmation | completed after Commit B |
| t11 | Preview READY verification | BLOCKED at phase close - COMPLETED post-release: READY Preview `dpl_EGK7zzhrjczar2XNCrBM4EqEtuVG` for `eeebe7d` (section 61.3) |
| t12 | Firewall owner plan + monitoring thresholds documented | COMPLETE - sections 30 and 55 |
| t13 | Acceptance table, reconciliation, honest limitations | COMPLETE - sections 56-59 |

Session 2 (recheck after the first session stopped):

| Item | Work | Status |
|---|---|---|
| s1 | Re-verify baseline, branch, HEAD, remote equality | COMPLETE - branch from `origin/main` `d0184c9`, `0\t0` |
| s2 | Re-run typecheck / lint / focused / full / coverage / build | COMPLETE - all numbers re-measured, sections 32-37 |
| s3 | Re-run audits + secret scan + `git diff --check` | COMPLETE - audits 1 moderate (unchanged), secret 0, diff-check initially FAILED |
| s4 | Fix `git diff --check` (44 trailing-whitespace findings, 1 EOF blank line) | COMPLETE - commit `4090069` + this commit |
| s5 | Close Section I required-test gaps I.2 / I.6 / I.8 / I.12 / I.15 | COMPLETE - RED then GREEN, 5 new tests, section 60 |
| s6 | Correct report contradictions (build modes, matcher claim, references, counts, commits) | COMPLETE - corrected in place, each marked "section 60 correction" |
| s7 | Re-audit every `<Link>` for prefetch policy | COMPLETE - 38 links, 26 with `prefetch={false}`, 10 low-cardinality public without, 2 allowlist-conditional |
| s8 | Refresh PR #28 body | COMPLETE - measured figures, no history rewrite |
| s9 | Preview READY | BLOCKED at the recheck session - COMPLETED post-release (READY Preview, section 61.3) |
| s10 | Merge authorization | OWNER ACTION REQUIRED at the recheck session - OWNER AUTHORIZED AND MERGED (section 61.5) |

t11 was not marked complete at phase close. It was the one requirement that could not be
satisfied while the project was paused, and it was reported as BLOCKED rather than quietly
dropped. It was completed after the owner-authorized release (section 61.3); the BLOCKED
reporting above is preserved as the historical record.

## 59. Final recommendation

Recommendation (historical, as committed 2026-11-23; executed by the owner in the
post-release record of section 61): **merge PR #28 after owner review, then resume the
project with Firewall stages 1 and 3 already in place, and hold stage 4 until the
24-hour log-only observation window is complete.**

RELEASE COMPLETE - INCIDENT MITIGATION VERIFIED IN PRODUCTION

The recommendation above was executed in the owner-authorized release recorded in section
61: Firewall published, project resumed, PR #28 merged, Production READY from the merge
commit, bounded smoke passed, first 15-minute monitoring within thresholds. Stage 4
(broad rate limit) remains disabled and stage 5 (24-hour review) remains open.

Reasoning, restricted to measured facts:

- The amplification is real and measured: 994 of 1,310 requests (75.9%) came from a
  crawler that was not blocked, and three of the five hottest routes had a 0% cache
  rate.
- The mitigations target those exact routes and behaviours, not a guess: explicit CDN
  headers on 21 public APIs, prefetch disabled on 26 link sites, `/api/features` read
  once per session, middleware off the public path, `robots.txt` disallowing the
  crawler, and a Redis client that stops paying for rejected commands.
- The code is locally green under every gate the repository provides, and the only
  full-suite failures are proven pre-existing by an identical baseline run.
- The remaining gap was environmental, not architectural: the preview was `BLOCKED` by
  the manual pause, so no live CDN behaviour had been observed at that time. (Post-release:
  live CDN behaviour was observed on the READY Preview and in the bounded Production
  smoke - section 61.4.)

Do not merge on the strength of this report alone: the preview gate in section 51 was
unmet at that time. Merge was the owner's decision, and the honest state of the phase on
2026-11-23 was **PASS WITH WARNINGS - MERGE NOT AUTHORIZED - PROJECT STILL PAUSED**
(historical). The owner later authorized and executed the release; the post-release state
is stated above and evidenced in section 61.

### 中文最终总结

本阶段（PHASE 25）针对 Reflectionbot 引发的请求放大与 Vercel 配额超限做了代码层面的抑制，并完成本地全量验证。核心事实与结论如下：

1. **根因已实测确认**：在 1,310 次 CDN 请求样本中，UA 为 `Reflectionbot/1.0 (+https://reflection.ai/bot)` 的请求占 994 次（75.9%），整体缓存命中率仅 27.7%；Firefox 240 次（18.5%，缓存 57.6%）；Edge Functions 32 次（0%）。历史 1,296,827 次请求只能标注为"高度可能"，**不能**声称为全部来自 Reflectionbot。
2. **热点路由**：`/movie/[id]` 309 次（0% 缓存）、`/api/features` 134 次（0%）、`/tv/[id]` 116 次（0%），三者吞噬了主要函数调用成本；`/auth/signin`（100 次，100% 缓存）与 `/_next/image`（67 次，89.6% 缓存）成本极低。
3. **已实施的抑制措施**：21 条公共确定性 GET 接口增加 CDN 缓存头（`Vercel-CDN-Cache-Control`，TTL 按数据类别 60 秒至 24 小时）；8 条私有接口与中间件统一 `private, no-store`；26 处链接关闭 `prefetch`；`/api/features` 改为客户端 TTL 缓存 + 单飞请求（每次会话仅一次）；`app/robots.ts` 对 Reflectionbot 与私有路径全站 disallow；Redis 客户端在配额耗尽时熔断，不再对已拒绝的命令反复计费。
4. **门禁结果（实测）**：typecheck 退出码 0；lint 0 错误 / 93 条既有警告；build 退出码 0（65 条路由 = 48 动态 + 15 静态 + 2 SSG `●`，其中 `/movie/[id]`、`/tv/[id]` 为 ISR 900 秒外壳）；聚焦套件 8 文件 104/104 全绿；完整套件 5 失败 / 659 通过（664），这 5 条在基线提交 `d0184c9` 上以**完全相同的标题**复现，属既有问题，非本阶段回归；覆盖率 60.88 / 51.94 / 72.19 / 62.04；依赖审计 1 条 moderate（`next <=15.5.28`，可升级至 `15.5.29`，非大版本），0 high / 0 critical；密钥扫描 0 命中。
5. **状态与限制（2026-11-24 发布后更正）**：（历史，2026-11-23）Vercel 项目当时处于手动暂停（`paused = true`），本提交的预览部署状态为 `BLOCKED`，因此当时**缓存头、单飞请求、robots 在真实 CDN 上的行为均未验证**；PR #28 当时为 OPEN / MERGEABLE，**合并未获授权**。发布后（2026-11-24）：项目已恢复（`paused = false`），`eeebe7d` 的 Preview `dpl_EGK7zzhrjczar2XNCrBM4EqEtuVG` 已 READY 并通过有界验证，PR #28 已以 Merge Commit `ab57763` 合并，生产部署 `dpl_A7TAM5bHTcxqe4ri1u86sX3KKrvQ` 已 READY（第 61 节）；1 小时 / 24 小时 / 72 小时检查点仍待评估；未改动任何环境变量、Firewall 规则、MongoDB 配置或 Redis 方案；账户 3 倍临时额度与解封为所有者口述，无法通过本次使用的 API 独立核实。
6. **预览门禁的现实障碍（如实披露）**：项目暂停会使新预览无法构建（本阶段所有 Phase 25 预览记录状态均为 `UNKNOWN`、构建时长 0ms，即从未被构建），该现实障碍已由所有者恢复项目解决：`eeebe7d` 的 Preview 已构建为 READY 并通过有界验证（第 61.3 节）。
7. **建议（已执行，2026-11-24）**：所有者已发布 Firewall 第 1、3 阶段（第 2 阶段保持 Log、第 4 阶段限流保持禁用），恢复项目，合并 PR #28（Merge Commit `ab57763`），确认生产部署 `dpl_A7TAM5bHTcxqe4ri1u86sX3KKrvQ`（合并提交 SHA）READY，并完成 5 项有界冒烟与首个 15 分钟监控（第 61 节）。剩余：1 小时 / 24 小时 / 72 小时检查点与第 5 阶段 24 小时复核仍待执行（第 61.10 节）。

本报告不声称该方案能阻止所有滥用客户端，只声称它移除了本阶段实测到的放大路径，并显著降低了每条剩余请求的边际成本。


---

## 60. Section 60 - Recheck session: corrections, gap closure, disclosed deviations

This section records the work of the second (recheck) session, which was opened after
the first session stopped. Nothing in sections 1-59 was silently deleted; every number
below was re-measured on this host, and every correction made to an earlier section is
marked inline with a "section 60 correction" phrase.

### 60.1 Full gate re-verification (re-run, same host)

| Gate | Result |
|---|---|
| `git fetch origin main` | `origin/main` = `d0184c9` (unchanged since baseline) |
| Branch / HEAD / remote | `fix/reflectionbot-and-vercel-amplification-mitigation`, `HEAD...@{u}` = `0	0`, non-force pushes only |
| Typecheck | exit 0 |
| Lint | 0 errors, 93 warnings - identical to the pre-change baseline, no increase |
| Focused suites (8 files) | 104/104 passing (99 before the section 60 test additions) |
| Full suite | 2 failed files / 51 passed; 5 failed / 659 passed (664); the same pre-existing 5 |
| Coverage | 60.88% stmts / 51.94% branches / 72.19% funcs / 62.04% lines - unchanged, no regression |
| Production build | exit 0; 65 routes = 48 `ƒ` + 15 `○` + 2 `●`; `robots.txt` static |
| Production audit | 0 critical / 0 high / 1 moderate (`next <=15.5.28`, fix `15.5.29` non-major) |
| Full audit (`--omit=dev` off) | identical: 1 moderate |
| Secret scan (6 credential patterns over every added line) | 0 hits |
| `git diff --check` | FAILED first (44 trailing-whitespace lines in the two extracted detail views, 1 EOF blank line in this report), exit 0 after `4090069` and this commit |
| Changed-file inventory | 64 files: 51 modified, 13 added (11 code/test + 2 documentation), 0 deleted, +4697 / -1694 |
| Package / lockfile / env changes | none |
| Link prefetch re-audit | 38 `<Link>` sites: 26 with `prefetch={false}`, 2 nav entries behind the `PREFETCH_ALLOWED` allowlist, 10 without prefetch that are exclusively low-cardinality public targets (`/`, `/privacy`, `/trending`) - prompt J.8 compliant |

### 60.2 Corrections applied to earlier sections

| Section | What was wrong | Correction |
|---|---|---|
| 11, 18, 19, 36 | build mode printed as `ƒ` for `/movie/[id]` and `/tv/[id]`; "does not change the rendering mode" contradicted the build and the PR body | both routes are `● (SSG)` with on-demand ISR at 900 s; the pre-change classification was the accidental `ƒ` |
| 36 | "50 dynamic / 15 static" | 48 `ƒ` + 15 `○` + 2 `●` (65 rows); `/robots.txt` is 251 B / 103 kB, not `-` |
| 12, 41, row 7 of section 57 | claimed the matcher was narrowed | the matcher is byte-identical to `d0184c9`; the real middleware changes are the removed feature self-fetch, the `private, no-store` stamp, and protected-link prefetch suppression elsewhere |
| 15, row 10 | "`/api/features` in three places including the server resolver" | two functional call sites plus one comment in `lib/features.ts` |
| 16 | no Section K vocabulary | explicit classification table added (`STATIC` / `STATIC_CLIENT_SHELL` / `ISR_SAFE` / `DYNAMIC_REQUIRED` / `DYNAMIC_ACCIDENTAL` / `PERSONALIZED` / none `UNRESOLVED`) |
| 33, 50, row 39 | stale PR body figures, commit count | PR body refreshed (8 files / 104 tests, baseline 5 failed / 79 passed of 84); 6 commits |
| 34 | 654 / 659 | 5 failed / 659 passed (664) after the new tests |
| 51 | preview state | 5 preview records exist for the branch (`4use6dzba`, `2trzdwqj1`, `ilboylxas`, `6njuikwiw`, and the record for this commit); all `UNKNOWN`, never built (`vercel inspect`: `[0ms]`), no READY preview |
| 55 | threshold table missing rows mandated by section X | added: Reflectionbot-Allowed (15 min), Redis quota error (15 min / 1 h), 24 h Reflectionbot-not-denied, 24 h Redis-growth |
| 57 rows 37/38 | PARTIAL placeholders | PASS with verified SHAs |

### 60.3 Section I required-test gap closure (TDD)

The first session's focused suites did not cover five of the fifteen Section I
required tests. Added to `tests/phase25-feature-gate.test.ts`:

| Test | Requirement | RED evidence |
|---|---|---|
| concurrent gate checks share one DB read | I.12 | `AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times` - correct reason (no coalescing existed) |
| admin update changes next gate decision | I.6 | passed after the in-flight design (promise clears on settle; no TTL cache) |
| disabled decision precedes `consumeQuota` | I.2 | source-order assertion, passed |
| Redis not part of gate path | I.8 | passed - `lib/features.ts` / `lib/features-store.ts` reference no Redis module |
| no console output in feature code | I.15 | passed |

Implementation (commit `a1993cf`): `readFeatureState()` coalesces concurrent calls
into one in-flight evaluation; the promise clears on settle so admin propagation is
untouched. GREEN: 20/20 in the file, 104/104 across the focused selection.

### 60.4 Disclosed deviations

1. **Commit count.** The brief specifies two logical commits. The branch carries six:
   Commit A (`2ea4374`), Commit B (`94810eb`), the pinning commit (`4b5afa9`), the
   whitespace gate fix (`4090069`), the gate-contract fix (`a1993cf`), and this docs
   reconciliation commit. Squashing or rebasing them into two would require the
   force-push / history rewrite / squash / rebase that the same brief forbids, and the
   first two are already on the remote. The debris is therefore disclosed, not hidden:
   forced-history operations were treated as the harder constraint.
2. **Commit A subject.** See section 47 - actual subject differs from the brief's
   specified subject; amending a pushed subject is a history rewrite.
3. **Preview gate (U.3) cannot be satisfied by this phase.** Building a preview
   requires the project to be resumed (observed: every deployment record stays
   `UNKNOWN` / 0 ms while `paused = true`). Resume is an owner-only action, so the
   pre-merge gate resolves to one of the two owner decisions spelled out in Chinese
   item 6 above: temporary resume for preview verification, or an explicit
   preview-only-hold acceptance (U.8 option c).
4. **Audits are not zero.** 1 moderate (`next`), disclosed, upgrade out of scope.

### 60.5 Status at the end of the recheck session

**PASS WITH WARNINGS - MERGE NOT AUTHORIZED - PROJECT STILL PAUSED - PREVIEW BLOCKED
(OWNER ACTION).** (Historical status at the end of the recheck session, 2026-11-23;
superseded by the verified post-release state below.) All local gates pass with the
numbers above; the only unmet requirement at that time was the deployed-environment
preview, which no code change could produce while the project was paused.

RELEASE COMPLETE - INCIDENT MITIGATION VERIFIED IN PRODUCTION

The owner later published the Firewall, resumed the project, merged PR #28 as `ab57763`,
deployed Production from the merge commit, and passed the bounded smoke and the first
15-minute monitoring window. Section 61 is the verified post-release record and governs
the current status.

---

## 61. Verified post-release record (added 2026-11-24)

This section was added after the owner-authorized release completed. Sections 1-60 are the
historical phase record committed on 2026-11-23; their status statements describe that
moment and are preserved. This section carries the post-release identifiers, measurements
and residual risks, and governs the current status of this report.

No source code, test, configuration, lockfile, Environment Variable, deployment setting,
database, cache or provider behaviour was changed by this reconciliation pass. It modified
this report only. The release evidence quoted below was collected during the release chain
by control-plane reads and the bounded smoke; this pass made no new HTTP request to the
application and reran no suite, build, audit, smoke or readiness probe.

### 61.1 Firewall (published, verified against the active config)

- Active config at verification (re-read at the monitoring gate): version 6,
  `firewallEnabled: true`, `changes: []` (`vercel api /v1/security/firewall/config/active`);
  `vercel firewall diff` reported "No pending changes." - the owner published the draft.
- Managed AI Bots: `ai_crawlers` = **Deny** (active); `ai_assistants` = **Log** (active) -
  the stage 2 observation mode, not Deny.
- Custom rule `Block Reflectionbot` (`rule_block_reflectionbot_2TnYsb`): active, deny
  (User-Agent contains `Reflectionbot`).
- Broad rate-limit rule `Rate Limit Dynamic` (`rule_rate_limit_dynamic_yQBEEf`):
  **inactive** - the disabled rule was not enabled.
- Firewall events for the project returned `{"actions": [], "pagination": {"next": null,
  "hasMore": false}}` at both verification queries. The events endpoint requires
  `projectId` (a projectId-less query returns 400 "missing required property
  `projectId`"), so no project-less control comparison was possible. Zero events is not
  proof of zero attempts: the analytics endpoint is fire-and-forget, and edge deny events
  are not surfaced in application logs.

### 61.2 Project state (resumed)

- `paused = false`, `suspendedAt = null` (`vercel api /v9/projects/...`), re-read at
  2026-11-24T20:04Z - unchanged across the monitoring window. The release-chain baseline at
  18:24Z already read `paused: false`: the owner resumed the project between the report
  commit (2026-11-23) and the release chain. The phase did not touch the flag (section 44).

### 61.3 Preview (READY for the branch head `eeebe7d`)

- Deployment `dpl_EGK7zzhrjczar2XNCrBM4EqEtuVG`, URL
  `movie-recommendation-system-brzfccczq.vercel.app`, `readyState: READY`,
  `meta.githubCommitSha: eeebe7d...` (the PR head), real build (`buildSkipped: false`,
  `timeToReady: 103720` ms, build output "Build Completed in /vercel/output [2m]").
- Exactly one bounded redeploy was issued: the newest Preview record for the branch
  (`dpl_4XVXmHXAVxjmgxk9oj8cDHtVVBoZ`, created during the earlier paused period) was
  `BLOCKED`. No second redeploy, no empty commit, no source change.
- Build route classification from the Preview build events: 15 static (○), 2 SSG (●),
  48 dynamic (ƒ); `/movie/[id]` 4.68 kB / 165 kB and `/tv/[id]` 3.98 kB / 164 kB, both
  with `revalidate = 900`; the `DYNAMIC_ACCIDENTAL` trio is unchanged (section 36).
- Bounded checks (exactly 5 requests, no crawling): `/robots.txt` 200 with `s-maxage=300`,
  `X-Robots-Tag: noindex`, Reflectionbot `Disallow: /`; `/api/genres` 200 MISS then 200 HIT
  (`Age: 3`, byte-identical bodies); `/api/favorites` 401
  `{"error":"Authentication required"}` with `private, no-store`, `source: edge-middleware`
  and `cache: ""` - the authentication boundary working, not a degraded deployment; that
  401 proves no provider call, no quota consumption and no data change, and it is not
  acceptance evidence; `/api/features` 200 with `private, no-store` and a database-sourced
  payload. Deployment logs contained exactly those 5 requests, all `level: info`, with 0
  secret-like and 0 error/retry-like strings.

### 61.4 Cache headers (verified live)

- Genres: `Cache-Control: public, max-age=0, must-revalidate` plus
  `Vercel-CDN-Cache-Control: s-maxage=3600, stale-while-revalidate=86400`; the observed
  MISS→HIT transition (Age 3 s) is the platform consuming the CDN directive.
- Robots: `Cache-Control: s-maxage=300`, `X-Robots-Tag: noindex`, `x-vercel-cache:
  PRERENDER`.
- Private surfaces (favorites, features): `private, no-store`.
- The section 56 row "Cache headers unverified against the live CDN" is resolved.

### 61.5 Merge (Merge Commit, two parents)

- PR #28 merged by `amrhanyy` at 2026-11-24T19:13:31Z via
  `gh pr merge 28 --merge --delete-branch=false`: **Merge Commit**, no squash, no rebase;
  the branch `fix/reflectionbot-and-vercel-amplification-mitigation` was retained on the
  remote at `eeebe7d`.
- Merge commit `ab57763e057a1dadb2a8c0f1e3e0f90152b2461d`, parents
  `[d0184c94f93845fbaed19393a7b31622b30bd409, eeebe7db774e8b03db01cf1ac871b562f139cc08]`
  - parent count 2, verified with `git rev-list --parents -n 1`.
- The six branch commits were not amended, rebased, squashed or force-pushed. `origin/main`
  advanced from `d0184c9` to `ab57763`.

### 61.6 Production (from the merge commit)

- Deployment `dpl_A7TAM5bHTcxqe4ri1u86sX3KKrvQ`, `target: production`,
  `readyState: READY`, `readySubstate: PROMOTED`, `buildSkipped: false`, alias
  `moviemind-re.vercel.app` assigned (`aliasAssigned: true`, no alias error); `createdAt`
  2026-11-24T19:13:33Z, `ready` 19:14:59Z (server time).
- `meta.githubCommitSha = ab57763...` ties the deployment to the merge commit; the GitHub
  commit status on `ab57763` is `success` ("Deployment has completed", 19:14:59Z).
- Production build events: 270 events, "Compiled successfully in 43s", "Build Completed in
  /vercel/output [1m]", 65 route lines - 15 static (○), 2 SSG (●), 48 dynamic (ƒ), with
  `/movie/[id]` 4.68 kB / 165 kB and `/tv/[id]` 3.98 kB / 164 kB: identical to the Preview
  classification.
- Previous Production `dpl_9cW98MHZ3LpfsVnNe6qcoUpg9oXb` (@ `d0184c9`) was superseded; 0 log
  records remain retrievable for it (17-day-old deployment), so no live pre-release
  Redis-error baseline could be measured.

### 61.7 Bounded Production smoke (5/5 PASS)

Exactly five requests were sent to `https://moviemind-re.vercel.app` through
`vercel curl` (deployment-protection bypass; no AI request, no seeded media id, no media
crawl, no census, no page-by-page HTML fetch). Server `Date:` headers are the authoritative
timestamps (the local clock runs ~2 m 15 s behind server UTC).

| # | Server UTC | Request | Result |
| --- | --- | --- | --- |
| 1 | 19:40:08Z | `/` | 200, 40,148 B, redirects 0, title `Movie Recommendation System`, `x-vercel-cache: PRERENDER`, no Set-Cookie |
| 2 | 19:40:21Z | `/api/health/ready` | 200, exactly 88 bytes: `{"status":"ready","components":{"config":"ready","database":"ready","redis":"optional"}}`, `Cache-Control: no-store` |
| 3 | 19:40:26Z | `/api/genres` | 200, 2,447 B, `MISS`, public browser + CDN directives |
| 4 | 19:40:31Z | `/api/genres` | 200, **HIT**, `Age: 5`, body byte-identical to request 3 (`cmp` 0), log record `source: static` (no function invocation) |
| 5 | 19:40:36Z | `/robots.txt` | 200, 254 B, `s-maxage=300`, `X-Robots-Tag: noindex`, Reflectionbot `Disallow: /`, private-path disallows, no sitemap |

A first attempt at 19:35:41-19:36:06Z failed before sending any request: `curl: (23)`
(writing the header capture to an MSYS `/tmp` path), all five HTTP codes read 000 and all
response bodies were 0 bytes. The Production log census for that interval contained 0
records (section 61.8), so the five-request budget was not consumed and the smoke was
re-issued once, to a native Windows scratch path. The Set-Cookie scan across all
five header files returned 0.

### 61.8 First 15-minute monitoring (section 55 gate)

Measured with `vercel logs dpl_A7TAM5bHTcxqe4ri1u86sX3KKrvQ --json --limit 1000` at
2026-11-24T20:04Z (38 records total), plus a `--level error` query and a fresh re-query.

Window A = Production-ready `[1795547699356, +900000]` (the section 55 "First 15 minutes"
checkpoint, measured from the release):

| Section 55 threshold | Measured | Outcome |
| --- | --- | --- |
| Total CDN requests <= 500 | 33 log records | PASS |
| Function invocations <= 200 | 11 serverless records | PASS |
| Sustained rate <= 10 req/s, and explained | sustained 0.037 req/s over 900 s; one ~2-second burst of 33 requests immediately after alias promotion (peak 1-s bucket 19) | PASS on the sustained rate; the burst's requester identity is not recoverable from `vercel logs` (no User-Agent field; metrics API returns `payment_required` on Hobby) - disclosed, carried to the 1-hour checkpoint |
| Reflectionbot Allowed instead of Denied = 0 | 0 records containing a Reflectionbot string; Firewall events `actions: []` | PASS (best available evidence; log records carry no UA field, and the analytics endpoint may be incomplete - see 61.1) |
| Redis quota errors = 0 | 0 quota-like log strings; 6 `Redis connection error` entries (in 4 distinct request records), all HTTP 200 | PASS for quota errors; connection errors disclosed in 61.9 |

Window A source split: `serverless` 11, `static` 21, `edge-middleware` 1; cache split:
`PRERENDER` 5, `MISS` 12, `HIT` 3, none 13; status codes: `{200: 33}` - zero non-200.

Window B = smoke-end `[1795549236614, +900000]` (a live-observation window holding no
traffic after the smoke; its inclusive start boundary captures the robots record from
61.7): 1 record, 0 errors, 0 quota-like, 0 Reflectionbot strings. A fresh re-query after the gate returned only the five
smoke records, proving **zero Production requests from 19:40:37Z until the re-query** (~35
minutes). The full-hour picture from the two censuses: 33 requests at 19:14:59.8-19:15:01.9Z,
then nothing until the five smoke requests at 19:40:08-19:40:36Z, then nothing.

Methodology disclosure: `vercel metrics` queries return `payment_required` (Observability
Plus) on this Hobby plan, so "Total CDN requests" and "Function invocations" are measured
as `vercel logs` request records (the authoritative census available here), which may
under-count requests that never produce a log record. Handshake-duration percentiles are
unmeasurable without an upgrade.

### 61.9 Redis observations (pre-existing code path, safe degradation)

- 6 error-level log entries in window A (4 distinct request records per `--level error`):
  all the exact string `Redis connection error`, all HTTP 200, at
  1795547700536-1795547700877 (19:15:00-19:15:01Z), paths `/api/trending`,
  `/api/auth/session`, `/api/celebrities`. 0 quota-like strings; 0 error entries in the
  smoke or window B.
- Classification: connection errors, not the section 55 "quota errors" threshold. The app
  degraded safely: every affected response was 200, and `/api/health/ready` reported
  `redis: optional`.
- The logging statement is pre-existing and untouched by Phase 25:
  `lib/redis.ts:100 console.error('Redis connection error')` is byte-identical at the
  pre-Phase-25 baseline `d0184c9`, `git log -S` attributes it to the repository's first
  commit `bcd9c60`, and `git diff --name-only d0184c9 eeebe7d -- lib/redis.ts` is empty -
  the PR never modified `lib/redis.ts`. The client sets `connectionBlocked` and backs off
  after an error, so there is no retry storm.
- Upstash quota state remains owner-verifiable only (no provider API was queried; none is
  available to this role). No prior-Production log records remain to establish a live
  pre-release error baseline.

### 61.10 Remaining open items and risks

- Open: the section 55 1-hour, 24-hour and 72-hour checkpoints; stage 5 (24-hour Firewall
  review); stage 4 (broad rate limit) remains disabled by design.
- Disclosed: the unidentifiable post-promotion burst (38 requests total in the hour, all
  HTTP 200, no quota-like strings); Firewall analytics emptiness and the absence of edge
  deny events from application logs; the advisory nature of `robots.txt` for clients other
  than the named actor; Upstash quota state; the account 3x unblock being owner-reported.
- Not claimed: that the mitigation stops every abusive client, that zero Firewall events
  means zero attempts, or any long-horizon (24 h / 72 h) resolution.

### 61.11 Reconciliation release control (documentation-only)

- Change set: exactly this report, one documentation-only commit on
  `docs/phase-25-post-release-reconciliation`, branched from the latest `origin/main`
  (`ab57763`). Worktree inventories exclude the 16 pre-existing untracked junk paths and
  report tracked-modified / staged / untracked separately.
- Validation performed: report-content checks (status carriers corrected, mandated
  release-fact strings still present), Markdown structural checks, a six-pattern
  credential scan over the changed report (0 hits), `git diff --check`, and a `git diff
  -U0` hunk-span proof that no hunk's old-side start falls inside the historical
  gate-evidence sections (32-38, 60.2, 60.3) - the report carries no fenced command
  blocks. Changed-file inventory: one path. Per the documentation-only protocol, no suite, coverage, build, audit,
  production smoke, provider request or readiness probe was rerun.
- CI/secret-scan posture: automatic Actions triggers are removed
  (`.github/workflows/ci.yml` is `workflow_dispatch`-only), so this PR starts no Actions
  run; branch protection is OFF and repo rulesets are `[]`; the repository carries 7
  standing gitleaks `generic-api-key` findings (Phase 9/12 reports, `ci.yml` at 4 commits,
  `lib/redis.ts`) that predate this change and are out of scope.
- A documentation-only merge still auto-deploys Production: the current Production
  deployment ID will change while the code does not. The implementation-release record
  remains `dpl_A7TAM5bHTcxqe4ri1u86sX3KKrvQ` (section 61.6); the newer documentation
  deployment is confirmed by Vercel API listing only, and no HTTP request is sent to the
  application.
