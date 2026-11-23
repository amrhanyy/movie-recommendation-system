# Phase 25 - Reflectionbot and Vercel Amplification Mitigation

| Field | Value |
|---|---|
| Repository | `amrhanyy/movie-recommendation-system` |
| Branch | `fix/reflectionbot-and-vercel-amplification-mitigation` |
| Code commit | `2ea4374` (parent `d0184c9`) |
| Documentation commit | `docs: record Reflectionbot and Vercel mitigation` (Commit B) |
| Pull request | #28, OPEN, base `main` |
| Production URL | https://moviemind-re.vercel.app |
| Report date | 2026-11-23 |
| Phase status | **PASS WITH WARNINGS - MERGE NOT AUTHORIZED - PROJECT STILL PAUSED** |

This report records only what was executed and measured on this host. Where evidence
could not be obtained (blocked preview, owner-reported account state), the item is
labelled `owner-reported` or `UNVERIFIED` instead of being asserted.

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

Result summary: 62 files changed (51 modified, 11 added, 0 deleted), +2677 / -1694.
Focused suite 99/99 green. Full suite 5 failed / 654 passed, with those exact five
failures reproduced on the untouched baseline. Build, typecheck and lint exit clean.
The Vercel preview could not be verified because the project is manually paused.

## 2. Final phase status

**PASS WITH WARNINGS - MERGE NOT AUTHORIZED - PROJECT STILL PAUSED.**

- Code and documentation work: complete, committed, pushed non-force.
- Local verification: complete, with pre-existing failures disclosed.
- Deployed verification: **not obtained**. The preview deployment for `2ea4374` is
  `BLOCKED` because the project is paused.
- Merge: not authorized, not attempted.
- Production: unchanged and still paused.

A phase that cannot observe its own effect in a deployed environment is not a clean
pass. It is a pass on everything the environment allowed, with the environmental gap
named rather than hidden.

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
| `origin/main` | `d0184c9` ("Merge pull request #26 from amrhanyy/docs/add-moviemind-logo-to-readme") |
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

Verified through the Vercel API during this phase:

| Field | Value |
|---|---|
| Project | `movie-recommendation-system` |
| Project ID | `prj_lG0moC9gDG0HmzNZsXs3toGEA4LO` |
| Team ID | `team_VYGxgaHqU3ebmL7BFKEbiNH0` |
| `paused` | **true** |
| Deployment for `2ea4374` | `movie-recommendation-system-4use6dzba.vercel.app` - **BLOCKED** |
| Older dependabot deployment `c4f860a` | `movie-recommendation-system-853ybuxy7.vercel.app` - `READY` |

The paused flag is the hard evidence for why the preview is blocked. It is a project
setting, not a build failure, and it was not changed by this phase.

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

| Route | Build mode | Revalidate | Requests | Cached |
|---|---|---|---|---|
| `/movie/[id]` | `ƒ` dynamic (ISR) | 900 s | 309 | 0% |
| `/tv/[id]` | `ƒ` dynamic (ISR) | 900 s | 116 | 0% |

Both routes are dynamic per the build output, so each request that reaches the origin
runs the page function. With ISR at 900 seconds a warmed entry can be served from the
cache, but the captured requests show no reuse - consistent with a client requesting
many distinct title IDs, each one a cold key.

Phase 25 does not change the rendering mode of these pages. It removes the prefetch
fan-out that created the burst and makes the supporting JSON APIs cacheable, so a cold
page render no longer implies four uncached data calls.

## 12. Protected-route middleware amplification

`middleware.ts` is modified in Commit A. The resulting matcher covers only the
protected surface: `auth`, `ai-recommendations`, `chat`, `history`, `watchlist`,
`favorites`, `user`, `admin`, and the `ai-similar` leaf. Those matches are stamped
`private, no-store`.

Effect on cost: public content routes are no longer in the middleware's scope, so a
crawler request for a public page does not pay for an auth check and does not produce
a middleware-generated redirect that would itself count as an edge request. The
protected paths keep the strict behaviour, because their responses are user-specific
and must never be cached.

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
state must not be cached by a shared CDN.

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
TTL window issue none. Static correlation confirms the consolidation: across `app`,
`components`, `lib`, `contexts` and `hooks`, the literal `/api/features` appears in
only three places - the server resolver, the shared public-path constants module, and
this hook.

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
| Build classification | `ƒ` Dynamic (server-rendered on demand, ISR) |
| `revalidate` | 900 seconds |
| Route size / First Load JS | 4.71 kB / 165 kB |
| Prefetch on related-title links | Disabled (`prefetch={false}`) |
| API dependencies | detail, similar, recommendations, ai-similar (ai-similar stays private) |

The page is not prerendered - the build output lists it as dynamic. Cost reduction
comes from removing the prefetch fan-out and from CDN-caching the supporting JSON
APIs, not from changing the page's rendering mode. The detail component itself was
extracted into `app/movie/[id]/MovieDetailPage.tsx` (one of the 11 added files).

## 19. TV page result

| Property | Value |
|---|---|
| Build classification | `ƒ` Dynamic (server-rendered on demand, ISR) |
| `revalidate` | 900 seconds |
| Route size / First Load JS | 3.99 kB / 164 kB |
| Prefetch on related-title links | Disabled (`prefetch={false}`) |
| API dependencies | detail, similar, recommendations |

Same treatment as the movie page: dynamic render preserved, prefetch fan-out removed,
supporting APIs made CDN-cacheable, component extracted to
`app/tv/[id]/TVDetailPage.tsx`.

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

Status: **PROPOSED - NOT APPLIED, NOT PUBLISHED**. The Vercel Firewall was not modified.

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

Reconciliation note: the PR #28 body still carries an earlier figure of "5 affected
files / 74 tests". That predates the final selection. The authoritative measured result
is the 8-file / 99-test run above; the PR body is stale and should be refreshed (a body
edit, not a history rewrite).

## 34. Full suite

| Metric | Value |
|---|---|
| Test files | 2 failed / 51 passed (53) |
| Tests | 5 failed / 654 passed (659) |
| Duration | 97.19 s |
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

Build exit 0 in 91.28 s. The route table contains 65 rows: 50 dynamic (`ƒ`) and 15
static (`○`).

| Route | Size | First Load JS | Mode |
|---|---|---|---|
| `/movie/[id]` | 4.71 kB | 165 kB | `ƒ` |
| `/tv/[id]` | 3.99 kB | 164 kB | `ƒ` |
| `/api/features` | 251 B | 103 kB | `ƒ` |
| `/robots.txt` | - | - | `○` |

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
| `middleware.ts` | 1 | Matcher narrowed to protected paths, `private, no-store` stamp |
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
| Project paused | **true** (unchanged) |
| Firewall rules | none applied, none published |
| Environment Variables | unchanged |
| Build settings | unchanged |
| Deployment for `2ea4374` | `BLOCKED` |
| Preview URL | `movie-recommendation-system-4use6dzba.vercel.app` |

No production setting was touched, and the project was not resumed.

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

## 50. Pull Request

| Field | Value |
|---|---|
| Number | #28 |
| Title | Contain Reflectionbot-driven Vercel request amplification |
| State | OPEN |
| Draft | false |
| Mergeable | MERGEABLE |
| Commits at report time | 1 (`2ea4374`) |
| Base | `main` |
| Head | `fix/reflectionbot-and-vercel-amplification-mitigation` |

Commit B raises the commit count to 2. One accuracy defect is disclosed in section 33:
the PR body still quotes "5 affected files / 74 tests" from an earlier draft, which the
measured 8-file / 99-test run supersedes.

## 51. Preview

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
`movie-recommendation-system-2trzdwqj1.vercel.app`, also in state `BLOCKED`.
The project still reports `paused: true`, so no READY preview exists for either
commit and no live response-headers verification was possible.

## 52. Merge authorization state

`MERGE = NOT AUTHORIZED`.

PR #28 is mergeable by GitHub's assessment, but the brief reserves the merge decision to
the owner after the pre-merge gate. No merge was attempted, no auto-merge was enabled,
and no merge queue entry was created.

## 53. Production deployment state

No Production deployment was created from this branch: the branch is not `main`, the
merge is not authorized, and the project is paused so new deployments cannot be created
regardless. `https://moviemind-re.vercel.app` therefore still serves the pre-Phase-25
build. The current Production deployment ID was not re-verified in this phase because no
action in this phase could change it.

## 54. Resume state

The project remains paused. Resume is an owner action and is **not** part of the
authorized work. Recommended order when the owner is ready:

1. Review this report and PR #28.
2. Merge PR #28 (owner decision).
3. Resume the project.
4. Apply Firewall stages 1 and 3 from section 30.
5. Run the monitoring checkpoints in section 55 before considering stage 4.

Resuming before the Firewall rules exist would expose the project to the same crawler
with only the code-level mitigations active; the mitigations are strong but unproven in
production.

## 55. Monitoring thresholds

Mandated checkpoints and pass criteria, to be evaluated without post-hoc adjustment:

| Window | Metric | Threshold |
|---|---|---|
| First 15 minutes | Total CDN requests | <= 500 |
| First 15 minutes | Function invocations | <= 200 |
| First 15 minutes | Sustained rate | <= 10 requests/second, and explained |
| First hour | CDN requests | <= 5,000 |
| First hour | Function invocations | <= 1,000 |
| First hour | Middleware redirects caused by automated clients | <= 100 |
| First hour | Public cacheable routes | predominantly HIT after initial fill |
| First 24 hours | CDN requests | <= 25,000 |
| First 24 hours | Function invocations | <= 10,000 |

Checkpoints: 15 minutes, 1 hour, 24 hours, 72 hours. A breach is reported as a breach;
thresholds are not to be relaxed after seeing results.

## 56. Remaining risks

| Risk | Severity | Status |
|---|---|---|
| Cache headers unverified against the live CDN (preview BLOCKED) | Medium | UNVERIFIED - needs a deployed environment |
| `robots.txt` is advisory; an ignoring client is unaffected | Medium | Accepted - Firewall plan is the enforcement path |
| Redis quota still exhausted externally | Medium | Owner action outside this phase |
| Detail pages remain dynamic per request (ISR 900) | Low | Accepted - prefetch fan-out removed instead |
| Pre-existing full-suite failures (4 README contract + 1 audit assertion) | Low | Pre-existing, disclosed, not fixed here |
| 1 moderate `next` advisory with non-major fix available | Low | Disclosed, upgrade deferred |
| Account 3x limit and unblock are owner-reported only | Low | UNVERIFIABLE via the APIs used here |
| No production learning while paused | Low | Accepted - owner decision |

No claim is made that this mitigation prevents every abusive client. It removes the
specific amplification paths measured in section 9 and makes the remaining paths
cheaper to serve.

## 57. Requirement Traceability Matrix

| # | Requirement | Evidence | Outcome |
|---|---|---|---|
| 1 | Identify current amplifying actor | 994/1310 requests, `Reflectionbot/1.0` UA | PASS |
| 2 | Bound historical attribution | labelled HIGH_CONFIDENCE_PROBABLE, not proven | PASS |
| 3 | Route-level aggregation | 5 hottest routes tabulated | PASS |
| 4 | Prefetch evidence | `Prefetch: Yes`, `nxtPid`, stream path | PASS |
| 5 | Movie amplification | 309 requests, 0% cached | PASS |
| 6 | TV amplification | 116 requests, 0% cached | PASS |
| 7 | Middleware amplification reduced | matcher narrowed to protected paths | PASS |
| 8 | Single server FeatureSettings source | `lib/features.ts` + store, route rewired | PASS |
| 9 | No client DB/Redis/Node-only imports | gate test + 24 API / 7 page rewires | PASS |
| 10 | `/api/features` deduplicated | TTL + single-flight hook, 3 references total | PASS |
| 11 | Complete page classification | 19 modules classified | PASS |
| 12 | Root layout classified, unmodified | 88-line server component, absent from manifest | PASS |
| 13 | Movie page result documented | 4.71 kB / 165 kB, `ƒ`, 900 | PASS |
| 14 | TV page result documented | 3.99 kB / 164 kB, `ƒ`, 900 | PASS |
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
| 27 | TDD GREEN | 8 files, 99 passed | PASS |
| 28 | Focused suite | exit 0, 42.25 s | PASS |
| 29 | Full suite executed | 5 failed / 654 passed (659) | PASS |
| 30 | Pre-existing failures proven | identical 5 titles at `d0184c9` | PASS |
| 31 | Coverage measured | 60.88 / 51.94 / 72.19 / 62.04 | PASS |
| 32 | Build and route output | exit 0, 91.28 s, 65 rows (50 `ƒ` / 15 `○`) | PASS |
| 33 | Audits executed | 1 moderate, fix `15.5.29`, 0 high/critical | PASS |
| 34 | Secret scan | 0 matches, 0 sensitive files | PASS |
| 35 | Changed files documented | section 39 manifest | PASS |
| 36 | Commit A created | `2ea4374`, 62 files | PASS |
| 37 | Commit B docs commit | this file + appendix, explicit staging | PARTIAL - created after this report |
| 38 | Non-force push | Commit A verified `0 0`; Commit B after report | PARTIAL - Commit B pending at write time |
| 39 | PR opened/updated | #28 OPEN, MERGEABLE, 1 commit | PASS |
| 40 | Preview verified READY | deployment BLOCKED by pause | BLOCKED |
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

## 58. Todo reconciliation

| Item | Work | Status |
|---|---|---|
| t08c | Write this 59-section report with measured numbers | completed by Commit B |
| t08d | Append Phase 25 appendix to the incident diagnosis | completed by Commit B |
| t09 | Commit B with explicit staging, cached diff review, secret scan | completed by Commit B |
| t10 | Non-force push and PR #28 update confirmation | completed after Commit B |
| t11 | Preview READY verification | BLOCKED - deployment `BLOCKED` by pause |
| t12 | Firewall owner plan + monitoring thresholds documented | COMPLETE - sections 30 and 55 |
| t13 | Acceptance table, reconciliation, honest limitations | COMPLETE - sections 56-59 |

t11 is not marked complete. It is the one requirement that cannot be satisfied while the
project is paused, and it is reported as BLOCKED rather than quietly dropped.

## 59. Final recommendation

Recommendation: **merge PR #28 after owner review, then resume the project with
Firewall stages 1 and 3 already in place, and hold stage 4 until the 24-hour log-only
observation window is complete.**

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
- The remaining gap is environmental, not architectural: the preview is `BLOCKED` by
  the manual pause, so no live CDN behaviour has been observed.

Do not merge on the strength of this report alone: the preview gate in section 51 is
unmet. Merge is the owner's decision, and the honest state of the phase is
**PASS WITH WARNINGS - MERGE NOT AUTHORIZED - PROJECT STILL PAUSED**.

### 中文最终总结

本阶段（PHASE 25）针对 Reflectionbot 引发的请求放大与 Vercel 配额超限做了代码层面的抑制，并完成本地全量验证。核心事实与结论如下：

1. **根因已实测确认**：在 1,310 次 CDN 请求样本中，UA 为 `Reflectionbot/1.0 (+https://reflection.ai/bot)` 的请求占 994 次（75.9%），整体缓存命中率仅 27.7%；Firefox 240 次（18.5%，缓存 57.6%）；Edge Functions 32 次（0%）。历史 1,296,827 次请求只能标注为"高度可能"，**不能**声称为全部来自 Reflectionbot。
2. **热点路由**：`/movie/[id]` 309 次（0% 缓存）、`/api/features` 134 次（0%）、`/tv/[id]` 116 次（0%），三者吞噬了主要函数调用成本；`/auth/signin`（100 次，100% 缓存）与 `/_next/image`（67 次，89.6% 缓存）成本极低。
3. **已实施的抑制措施**：21 条公共确定性 GET 接口增加 CDN 缓存头（`Vercel-CDN-Cache-Control`，TTL 按数据类别 60 秒至 24 小时）；8 条私有接口与中间件统一 `private, no-store`；26 处链接关闭 `prefetch`；`/api/features` 改为客户端 TTL 缓存 + 单飞请求（每次会话仅一次）；`app/robots.ts` 对 Reflectionbot 与私有路径全站 disallow；Redis 客户端在配额耗尽时熔断，不再对已拒绝的命令反复计费。
4. **门禁结果（实测）**：typecheck 退出码 0；lint 0 错误 / 93 条既有警告；build 退出码 0（91.28 秒，65 条路由 = 50 动态 + 15 静态）；聚焦套件 8 文件 99/99 全绿（42.25 秒）；完整套件 5 失败 / 654 通过（659），这 5 条在基线提交 `d0184c9` 上以**完全相同的标题**复现，属既有问题，非本阶段回归；覆盖率 60.88 / 51.94 / 72.19 / 62.04；依赖审计 1 条 moderate（`next <=15.5.28`，可升级至 `15.5.29`，非大版本），0 high / 0 critical；密钥扫描 0 命中。
5. **未完成与限制（如实披露）**：Vercel 项目仍处于手动暂停（`paused = true`），本提交的预览部署状态为 `BLOCKED`，因此**缓存头、单飞请求、robots 在真实 CDN 上的行为均未验证**；PR #28 为 OPEN / MERGEABLE，但**合并未获授权**；未改动任何环境变量、Firewall 规则、MongoDB 配置或 Redis 方案；账户 3 倍临时额度与解封为所有者口述，无法通过本次使用的 API 独立核实。
6. **建议**：先恢复项目并生成预览完成验证，再按 15 分钟 / 1 小时 / 24 小时 / 72 小时四个检查点监控；Firewall 先启用"托管 AI 机器人 - 爬虫 Deny"与"UA 含 Reflectionbot 的自定义规则 Deny"，限流规则先观察 24 小时再启用；确认无异常后再由所有者决定合并与恢复生产。

本报告不声称该方案能阻止所有滥用客户端，只声称它移除了本阶段实测到的放大路径，并显著降低了每条剩余请求的边际成本。

