# INC-VERCEL-HOBBY-FAIR-USE-PAUSE-2026-11 - Read-Only Vercel Usage Forensics

Investigator: Hermes (external AI architect), read-only mandate.
Incident date of pause: 2026-11-20T00:36:14Z.
Report status: PARTIAL - attribution blocked by log retention; classification UNRESOLVED_DUE_TO_LOG_RETENTION.
Report file: docs/reports/diagnostics/INC-VERCEL-HOBBY-FAIR-USE-PAUSE-2026-11-DIAGNOSIS.md (untracked, not committed).

---

## 1. Executive summary

On 2026-11-20T00:36:14Z Vercel paused the Hobby project `movie-recommendation-system` for fair-use
exceedance. Three included amounts were exceeded inside the same 30-day billing window:

| Resource | MovieMind | Limit | Over by |
|---|---|---|---|
| Edge/CDN requests | 1,296,827 | 1,000,000 | +296,827 (+29.68%) |
| Function invocations | 1,027,989 | 1,000,000 | +27,989 (+2.80%) |
| Fluid Active CPU | 4h29m (16,140 s) | 4h (14,400 s) | +1,740 s (+12.08%) |

What the investigation could establish, with evidence:

1. The function figure reconciles exactly: 849,311 Node + 178,678 Edge = 1,027,989. There is no
   unexplained residue inside the project total (team total is 1,028,678; 689 invocations belong to
   other projects on the team).
2. All Edge invocations must be middleware executions, because the repository declares
   `runtime = 'edge'` in zero of its 44 route handlers and 19 pages. Middleware matches 28
   authenticated/personal/AI path patterns only, so the majority of Node invocations
   (57.9% to 79.0%, depending on which matched-path model is assumed) came from public,
   non-middleware surfaces.
3. The traffic was not browser-shaped. Only 20.73% of CDN responses were non-function responses
   (268,838 of 1,296,827). A browser population rendering Next.js App Router pages pulls roughly one
   to three dozen sub-resources per document, which would make the static share dominant. A
   non-browser client (bot, script, or monitor) is the shape the ratios describe.
4. The application has systemic, source-verified amplification: `/api/health/live` and
   `/api/health/ready` are `Cache-Control: no-store` (every probe is one billed invocation plus one
   origin transfer, never cacheable), 19 public read-only data endpoints declare no cache header at
   all, no page declares `revalidate` or `dynamic`, and middleware performs an internal
   `fetch('/api/features')` on AI routes (middleware.ts line 28), adding one Node invocation per AI
   request.
5. Route-level, user-agent-level, IP-level and timestamp-level attribution is not obtainable from
   this account. Every runtime log query returned zero rows (relative windows, HTTP 200) or
   `ExceedsBillingLimitError` HTTP 400 (absolute/ISO windows). `vercel usage` returns
   `Costs not found (404)`. Vercel Metrics sub-endpoints are payment-gated on Hobby
   (`payment_required`). No per-path table exists anywhere in the account surface this investigator
   can read.

What the investigation could not establish: the top route, its percentage, the top source or agent,
the exact spike onset, and whether traffic remains active. Those five answers are the ones the brief
asks for first, and they are exactly the five that require retained request-level telemetry.

Root-cause classification (section 21): UNRESOLVED_DUE_TO_LOG_RETENTION. Confidence in the
mechanism-level findings above: MEDIUM to HIGH (they are source-code facts). Confidence in any
specific traffic attribution: LOW (below the confirmation bar of brief section 13).

---

## 2. Status

PARTIAL.

| Dimension | Result |
|---|---|
| Capacity metrics captured | YES (owner-provided, transcribed in section 4) |
| Metrics independently re-read from Vercel API | NO - usage/costs endpoints are 404 or payment-gated on this Hobby team |
| Route-level attribution | NO - no retained request logs |
| Source/agent attribution | NO - no retained request logs |
| Repository-side exclusion analysis | YES - source inspection, 44 API routes, 19 pages, middleware, workflows |
| Root cause confirmed | NO - classification is UNRESOLVED_DUE_TO_LOG_RETENTION |
| Remediation applied | NO - none, by mandate |
| Tracking state changed | NO - report is untracked, nothing staged, nothing committed |

---

## 3. Incident identity

| Field | Value |
|---|---|
| Incident ID | INC-VERCEL-HOBBY-FAIR-USE-PAUSE-2026-11 |
| Provider | Vercel, Hobby plan |
| Team | amrkoky5000-gmailcoms-projects (team_VYGxgaHqU3ebmL7BFKEbiNH0) |
| Project | movie-recommendation-system (prj_lG0moC9gDG0HmzNZsXs3toGEA4LO) |
| Production domain | https://moviemind-re.vercel.app |
| Production deployment at pause | dpl_9cW98MHZ3LpfsVnNe6qcoUpg9oXb |
| Project metadata flag | `"paused": true` (read from /v9/projects JSON) |
| Pause timestamp | 2026-11-20T00:36:14Z |
| Automatic unpause timestamp | 2026-12-20T00:36:14Z |
| Configured function region | iad1 (project metadata) |
| Node runtime | 22.x |
| Repository HEAD at investigation | 38e73a01adc389f030bdd2e025b5c0c9e8539c62 |

---

## 4. Owner-provided evidence

All quantities in this report trace to the values the owner transcribed from the Vercel dashboard
and supplied in the incident brief. They were NOT independently re-read from the usage API (see
section 5 for why).

| Metric | Team total | MovieMind | Included | Exceeded |
|---|---|---|---|---|
| Edge/CDN requests | 1,298,624 | 1,296,827 | 1,000,000 | YES |
| Function invocations | 1,028,678 | 1,027,989 | 1,000,000 | YES |
| Fluid Active CPU | 4h30m | 4h29m | 4h | YES |
| Fast Origin Transfer | - | 3.74 GB | 10 GB | no |
| Fast Data Transfer | - | 4.93 GB | 100 GB | no |

Runtime split, owner-provided: Node 849,311 / Edge 178,678 (sum 1,027,989, exact).

Region split, owner-provided: cle1 1,248,461 / iad1 39,581 / fra1 4,996 (sum 1,293,038 of
1,298,624; 5,586 unlisted, i.e. the table is a partial top-3 list, not a full partition).

Suspected surge window, owner-provided: approximately 2026-11-14 to 2026-11-20.

---

## 5. Data limitations

Every one of the following is a measured result, not an assumption:

1. `vercel logs <deployment> --since 1h|3h|6h|12h|24h|36h|48h|7d -j -n 100` returned HTTP 200 with
   zero rows in every case.
2. Absolute/ISO windows returned exit 1 with
   `handling error: ExceedsBillingLimitError: Response Error (400)` from
   `fetchRequestLogs` (commands-bulk.js). Two independent ISO windows reproduced it.
3. Direct call to
   `https://vercel.com/api/logs/request-logs?projectId=...&ownerId=team_...&page=0&startDate=1795425118631&endDate=1795428718631&deploymentId=dpl_9cW98MHZ3LpfsVnNe6qcoUpg9oXb`
   returned `200 OK` in 1.26 s with zero `"timestamp"` records.
4. `vercel usage` returned `Fetching usage data for amrkoky5000-gmailcoms-projects` then
   `Error: Costs not found (404)`.
5. `vercel metrics` exposes no usable metric schema for this team; metric queries that would return
   durations/percentiles are payment-gated (`payment_required`).
6. `vercel firewall overview --json` returned HTTP 402:
   `IP Bypass is unavailable for team amrkoky5000-gmailcoms-projects. Pro and Enterprise plans include it.`
7. Web Analytics and Speed Insights are not a fallback: Speed Insights was disabled for this project
   at 2026-09-16T00:00:00Z, and no analytics data exists for the window.
8. The owner metrics are 30-day rolling aggregates with no time series. The surge window
   (2026-11-14 to 2026-11-20) is therefore owner-reported, not independently verifiable here.
9. The region table covers 99.57% of CDN requests; 0.43% is unlisted. It is a truncated list.
10. No request-level, path-level, UA-level, IP-level or ASN-level surface exists in any endpoint
    this investigator was permitted to read. Nothing in this report is derived from inspecting
    production.

Consequence: sections 8, 9 (route part), 10, 11, 13, 14 and 15 of the required report cannot be
answered with measurement. They are answered with explicit "not observable" plus the strongest
non-attributive evidence available, and each is labelled as inference where it is inference.

---

## 6. Time windows

| ID | Requested window (UTC) | What was returned | Returned window | Timezone | Retention limit | Truncation/sampling | Completeness |
|---|---|---|---|---|---|---|---|
| W1 | 2026-10-23T14:00:00Z to 2026-11-22 | nothing (no usage time series API) | n/a | UTC assumed by provider | unknown | none | NOT OBSERVABLE |
| W2 | 2026-11-14T00:00:00Z to 2026-11-20T23:59:59Z | log query HTTP 400 ExceedsBillingLimitError | n/a | UTC | query range rejected | none | NOT OBSERVABLE |
| W3 | equal-length window immediately preceding W2 | log query HTTP 400 / 0 rows | n/a | UTC | query range rejected | none | NOT OBSERVABLE |
| W4 | pause instant to investigation time | log query HTTP 200, 0 rows | empty | UTC | unknown | none | EMPTY, not evidence of no traffic |

Additional probes actually executed and their results are recorded in section 29. The brief requires
the requested window, returned window, timezone, retention restriction, truncation/sampling, maximum
row count and completeness for each result; where the provider returned nothing, "NOT OBSERVABLE" is
the honest value and is not silently substituted with an estimate. Unlike windows were never compared
as if they were alike: all comparisons in this report are between project-total aggregates from the
same 30-day billing window.

---

## 7. Usage totals

| Measure | Value | Derivation |
|---|---|---|
| Project CDN requests | 1,296,827 | owner |
| Team CDN requests | 1,298,624 | owner |
| Other projects on team (CDN) | 1,797 | 1,298,624 - 1,296,827 |
| Project function invocations | 1,027,989 | owner |
| Team function invocations | 1,028,678 | owner |
| Other projects on team (functions) | 689 | 1,028,678 - 1,027,989 |
| Node invocations | 849,311 | owner |
| Edge invocations | 178,678 | owner |
| Node share of invocations | 82.62% | 849,311 / 1,027,989 |
| Edge share of invocations | 17.38% | 178,678 / 1,027,989 |
| Node : Edge ratio | 4.753 : 1 | 849,311 / 178,678 |
| CDN responses not backed by a function | 268,838 (20.73%) | 1,296,827 - 1,027,989 |
| CDN requests per invocation | 1.262 | 1,296,827 / 1,027,989 |
| Fluid Active CPU per invocation | 15.70 ms | 16,140 s / 1,027,989 |
| Fluid Active CPU per Node invocation | 19.00 ms | 16,140 s / 849,311 |
| Fast Origin Transfer per invocation | 3,638 bytes | 3.74e9 / 1,027,989 |
| Fast Data Transfer per invocation | 4,796 bytes | 4.93e9 / 1,027,989 |

Headroom existed on both transfer meters (3.74/10 GB and 4.93/100 GB). The incident is a
request-count and CPU event, not a bandwidth event.

---

## 8. Usage timeline

Not constructible. No endpoint this investigator may read returns a time series for request counts,
invocations, or CPU; the dashboard graph the owner saw is not exported and the usage API is
unavailable on this plan (section 5, items 4 and 8).

Therefore: first visible increase, peak day, peak hour, and CDN-versus-invocation correlation over
time are all NOT OBSERVABLE. The "2026-11-14 to 2026-11-20" surge is owner-reported and is treated in
this report as an unverified hypothesis about shape, never as measured fact. Section 15 shows what
the averages imply if that window is correct, and explicitly labels the result an arithmetic
scenario.

---

## 9. Top paths

NOT AVAILABLE. No retained request logs, no path aggregation endpoint, no Web Analytics.

Top route: UNRESOLVED. Top route percentage: UNRESOLVED.

What can be said without fabricating a path name is structural, and is stated as such:

* The application exposes 44 API route handlers and 19 pages.
* 28 path patterns are middleware-matched: /profile, /admin, /favorites, /watchlist, /ai-assistant,
  /api/auth/*, /api/ai-recommendations, /api/chat/*, /api/favorites*, /api/watchlist*,
  /api/user/*, /api/admin/*, /api/movie/[id]/ai-similar and related personal routes.
* Public browse surfaces are NOT middleware-matched: /, /movies, /movie/[id], /tv/[id], /search,
  /trending, /genres, /celebrities, /api/movies, /api/trending*, /api/search, /api/genres*,
  /api/health/*, /api/features.
* Because Edge invocations are exactly middleware executions (section 11), every one of the 178,678
  Edge invocations corresponds to a request into the matched set above, while the 491,955 to 670,633
  Node invocations that remain correspond to requests into the public set.

A single dominant public endpoint hit ~850k times in 30 days, a monitor looping on health endpoints,
and a crawler walking movie detail pages all remain compatible with the totals. They are not
distinguishable without logs. No candidate is named as "the" route.

---

## 10. Function attribution

Measured identity (arithmetic, exact):

849,311 (Node) + 178,678 (Edge) = 1,027,989 = project function invocations.

Team total 1,028,678 differs by 689, attributed to other projects on the same team.

Not observable for either runtime: per-function names, invocation counts per function, error counts,
error rate, p50/p95/p99 durations, memory used, and cold starts. None of these are exposed on this
plan's readable surface. The brief's requirement to reconcile the Node/Edge split is met only at the
aggregate level; the split cannot be pushed down to named functions.

Independent cross-check that does exist: 3.74 GB of Fast Origin Transfer over 1,027,989 invocations
averages 3.6 KB of origin payload per invocation. Function responses stream from origin, so this is
the population-average response size actually served. It is consistent with small JSON payloads
(movie list pages, health JSON) and inconsistent with a population of full server-rendered HTML
documents, which run one to two orders of magnitude larger.

---

## 11. Runtime split

| Runtime | Invocations | Share | Mechanism |
|---|---|---|---|
| Node | 849,311 | 82.62% | App Router route handlers and server-rendered pages (default runtime) |
| Edge | 178,678 | 17.38% | middleware.ts only |

Proof that Edge equals middleware only: a recursive scan of all 44 `app/**/route.ts` and all 19
`app/**/page.tsx` files found zero occurrences of `runtime = 'edge'` (and zero `export const runtime`
declarations of any value). With no edge-runtime route or page in the codebase, the only code
executed on the Edge runtime is the root middleware.

Consequence, and it is the strongest attribution constraint available without logs:

* Every Edge invocation is a request to one of the 28 middleware-matched patterns. 178,678 such
  requests existed in the window.
* If that traffic were entirely AI routes (middleware -> handler -> internal /api/features fetch),
  the Node cost would be 2 x 178,678 = 357,356, leaving 491,955 Node invocations (57.9% of Node) on
  public, non-middleware surfaces.
* If it were entirely auth/personal routes (one Node per matched request), the Node cost would be
  178,678, leaving 670,633 (79.0% of Node) on public, non-middleware surfaces.

Either model puts the majority of Node invocations outside middleware. Therefore the claim "middleware
runs on every request and is the whole problem" is refuted: middleware cannot have executed on more
than 17.38% of the population, because it never executed on the public majority at all.

Also refuted by the same numbers: the hypothesis that the surge came from authenticated user sessions
in a browser. Authenticated browsing produces asset traffic and Edge invocations together; here Edge is
a minority and static responses are a minority.

---

## 12. Region analysis

Owner-provided: cle1 1,248,461 (96.14%), iad1 39,581 (3.05%), fra1 4,996 (0.38%), unlisted 5,586
(0.43%).

Two statements must be kept separate:

1. The brief forbids inferring traffic origin from processing region. This report does not do that.
   A region is where Vercel processed a request, not where the client was.
2. There is a genuine tension in the data that must be disclosed rather than smoothed: the project's
   configured `serverlessFunctionRegion` is **iad1**, yet 96.14% of the region-split requests are
   attributed to **cle1**. Under a "function execution region" reading of that table this would be
   contradictory; under a "CDN/edge POP that served the request" reading it is unremarkable. The
   dashboard label for that table was not captured in the evidence available here, so the metric
   identity itself is unverified. This is recorded as an open inconsistency (section 20, H10) and is
   not resolved by guessing which reading is right.

What the split does support, weakly: the traffic was heavily concentrated in one processing
location, which is consistent with a single dominant client population rather than many geographically
distributed human users. That is a shape inference, not attribution, and it carries LOW confidence on
its own.

---

## 13. User-agent analysis

NOT AVAILABLE. No UA field exists in any readable surface for the window.

The only UA-adjacent evidence is indirect, and it is stated as inference: only 20.73% of CDN responses
were non-function responses. A Next.js App Router document pulls a substantial bundle of JS, CSS,
fonts and images; a browser-dominant population therefore yields a static share far above 20%. A plain
HTTP client that requests a JSON endpoint, or a crawler that reads HTML without executing it, produces
exactly the observed pattern: nearly one CDN request per function invocation, no asset fan-out.

Inference: the dominant client was not a rendering browser. Confidence: MEDIUM. This constrains the
bot-versus-user question without naming a UA string, and no UA string is invented here.

---

## 14. Source / ASN analysis

NOT AVAILABLE. No IP data is exposed in any readable surface, no request log exists, and the firewall
event log is not readable on this plan (section 19). No hashing of client IPs was possible because no
IPs were obtainable; consequently no source table, ASN table, or country table appears in this report.

The brief's prohibition on printing full client IPs was therefore never at risk of being violated in
this report, because no client IP was ever returned to this investigator.

---

## 15. Periodicity

No timestamps were available, so periodicity could not be measured. What follows is arithmetic on
aggregates, labelled as such.

| Assumption | Rate | Interval if a single loop |
|---|---|---|
| Invocations spread evenly over 30 days | 34,266 / day = 1,428 / h = 23.8 / min | one every 2.52 s |
| Invocations confined to W2 (7 days) | 146,856 / day = 6,119 / h | 1.70 / s |

Two arithmetic coincidences worth recording, because they bound the search rather than prove it:

* Two health endpoints polled every 5 s for 30 days = 1,036,800 requests, which is within 0.86% of
  the observed 1,027,989.
* One endpoint every 3 s, or two endpoints every 6 s, = 864,000 requests, 15.9% below observed.

These are compatibility checks, not evidence. A coincidence of this kind is only meaningful combined
with a per-request timeline, which does not exist. The uniform average rate (23.8 invocations per
minute sustained over a month) is nevertheless a shape signal that human-driven browsing would not
produce; it is consistent with an automated loop or a crawler, and inconsistent with organic
user traffic.

---

## 16. Cache analysis

Classification for the incident window: **DYNAMIC_UNCACHED_DOMINANT** (source-inspected). Per-request
HIT/MISS/BYPASS distribution: NOT OBSERVABLE.

Source facts (measured by reading the repository):

| Observation | Count | Consequence |
|---|---|---|
| API route handlers | 44 | each request is dynamic by construction |
| Handlers declaring Cache-Control / s-maxage | 7 | the rest rely on Next.js defaults |
| `/api/health/live`, `/api/health/ready` | `Cache-Control: no-store` | every probe is a billed invocation and an origin transfer; never cacheable |
| `/api/movies` | `public, max-age=21600` | cacheable, but only browser cache (no s-maxage) |
| Public read-only data endpoints with NO cache header | 19 | trending, trending/movie, trending/tv, movies/top-rated, movies/time-based, genres, genre/[id], genre/[id]/content, celebrities, search, trailers, mood-recommendations, movie/[id], tv/[id], movie/[id]/similar, tv/[id]/similar, movie/[id]/recommendations, tv/[id]/recommendations, actor/[id] |
| Pages declaring `export const revalidate` or `export const dynamic` | 0 of 19 | no deliberate ISR strategy anywhere |
| `next.config.mjs` | 106 lines, `images.remotePatterns` + security headers + `experimental`; no `headers` rule adding cache policy to API responses | no global mitigation exists |

Interpretation: the application is structurally incapable of absorbing repeated reads. A client that
repeats the same GET a million times receives a million function invocations, because neither the CDN
nor the browser is given a licence to cache the answer by the code itself (health endpoints explicitly
forbid it with `no-store`). Query-string cardinality could not be examined (no logs), so whether query
variation defeated even the default caching is unknown.

This is a real amplifier and a real defect. It is not proof of what triggered the surge: an amplifier
only matters if a repeating client exists, and the existence of that client is what the logs would
have shown.

---

## 17. Repository automation audit

Everything below was read from the working tree, not inferred.

| Check | Result |
|---|---|
| `middleware.ts` matcher | 28 patterns, authenticated/personal/AI only; public pages and public APIs excluded |
| middleware self-fetch | line 28: `await fetch(request.nextUrl.origin + '/api/features')` on AI route access, i.e. one extra Node invocation per AI request |
| `vercel.json` | does not exist; therefore no `crons`, no rewrites, no header overrides at platform level |
| Vercel Cron jobs | none (no vercel.json, no cron configuration in project metadata) |
| GitHub Actions | `.github/workflows/ci.yml` triggers on `workflow_dispatch` only; no schedule, no production calls |
| Dependabot | schedule and opens PRs; creates preview deployments, does not call production |
| Hermes cron jobs on this host | one, `artnest-daily-post`, unrelated to MovieMind; no MovieMind job exists |
| Client-side polling | one `setInterval(fetchStats, 300000)` in components/admin/DashboardOverview.tsx (5 min, admin dashboard, auth-protected) |
| robots.txt | absent (no app/robots.ts, no public/robots.txt) |
| `runtime = 'edge'` | 0 declarations |
| Long-running retry amplification | lib/fetchWithRetry.ts, lib/gemini-provider.ts, lib/tmdb.ts contain retry/timeout logic that multiplies upstream calls inside one invocation, not request count |

Conclusion: nothing in the repository self-generates ~1.03M invocations. The automation that exists is
either disabled (CI), out of scope (artnest), auth-gated (admin poller), or server-side amplification
that multiplies a single request's upstream work rather than creating new requests.

One caveat that cannot be closed: absence of a schedule in the committed tree does not prove absence of
an external monitor owned by the operator (an uptime service, a phone widget, a bookmark checker, a
status page). No evidence of one was found on this host, and no evidence of absence can be produced.

---

## 18. Deployment correlation

| Event | Timestamp (UTC) | Relation to surge |
|---|---|---|
| Merged PR #14, #15 | 2026-11-03 | before |
| Merged PR #16 | 2026-11-04 | before |
| Merged PR #17 to #22 | 2026-11-05 to 2026-11-06 | before |
| Merged PR #24, #25 | 2026-11-08 | before |
| Merged PR #26 | 2026-11-09T00:09Z | before |
| Dependabot PR #27 opened | 2026-11-15T11:44Z | inside the reported surge window; preview deployment only, not merged |
| Repository `pushedAt` | 2026-11-15T11:43:59Z | matches PR #27 branch push |
| Pause | 2026-11-20T00:36:14Z | end of window |

No production deployment occurred between 2026-11-09 and the pause. A deploy-triggered traffic event
(a new client bundle, a new polling loop shipped to users, a broken cache header introduced by a
release) is therefore not supported by the timeline: there was no release in the window. PR #27's
preview deployment is the one construction inside the window that could in principle have been
crawled, and project-scoped metrics include preview traffic, so this remains a live but unmeasured
possibility (H9, WEAK).

---

## 19. Firewall state

| Read attempt | Result |
|---|---|
| `vercel firewall rules ls` | empty (no custom rules) |
| `vercel firewall ip-blocks ls` | empty |
| `vercel firewall attack-mode` / `system-mitigations` / `system-bypass` | exit 2, help text only; these are write-side subcommands with no readable value on this surface |
| `vercel firewall events` | exit 2, help text only; no event reader exposed |
| `vercel firewall overview --json` | HTTP 402, `IP Bypass is unavailable for team amrkoky5000-gmailcoms-projects. Pro and Enterprise plans include it.` |

Findings: at the time of investigation the project had no custom firewall rules and no IP blocks, so
nothing was mitigated by configuration, and no rule can be credited with or blamed for the traffic.
W2 firewall event data (blocked/challenged counts, top offending ASNs) is not readable on Hobby, so
the question "was bot mitigation firing and failing" cannot be answered.

---

## 20. Hypothesis matrix

Status vocabulary: CONFIRMED / SUPPORTED / WEAK / REJECTED / UNRESOLVED. Confidence: HIGH / MEDIUM / LOW.

| ID | Hypothesis | Supporting evidence | Contradicting evidence | Status | Confidence | Decisive missing evidence |
|---|---|---|---|---|---|---|
| H1 | External bot/crawler traffic | Non-browser shape (static share 20.73%); 3.6 KB average response; uniform sustained rate; public repo and public domain; no robots.txt | No UA data; region table concentrated in one location | SUPPORTED | MEDIUM | Request logs with UA and path |
| H2 | Single-source abuse (one client hammering) | Rate is uniform (23.8/min over 30 days); one-region concentration; Node:Edge ratio stable | No IP/ASN data; total could be composed of many small clients | WEAK | LOW | Per-source aggregation |
| H3 | Client-side polling loop shipped in the app | One `setInterval` exists | It is admin-only, 5-minute, auth-gated; a user-browser poll would carry asset traffic and Edge invocations; only one such loop in the codebase | REJECTED | MEDIUM | - |
| H4 | External health-check/monitor loop on `/api/health/*` | Both health endpoints are `no-store`, so every probe bills an invocation; two endpoints at 5 s equals 1,036,800/30d, within 0.86% of observed; health paths are not middleware-matched, matching the low Edge share | Average origin payload 3.6 KB is larger than a minimal health JSON; a monitor is not required to exist; nothing on this host proves one | WEAK | LOW | Timestamps or path aggregation |
| H5 | Local/Hermes/CLI diagnostic loop against production | None found: no MovieMind Hermes job, CI is manual-only, this investigation made zero requests to the deployment | Local shell history/process table was not exhaustively searched for third-party tools | REJECTED | MEDIUM | Process/network trace on owner machine |
| H6 | Middleware/auth runs on every static request | Middleware exists and self-fetches `/api/features` | Matcher covers 28 authenticated/AI patterns only; public pages and static assets are excluded; Edge is only 17.38% of invocations | REJECTED | HIGH | - |
| H7 | Image optimization high cardinality | `images.remotePatterns` configured | No image-optimization figure appears in any evidence; 3.6 KB average payload is inconsistent with image responses | WEAK | LOW | Image Optimization metric |
| H8 | Cache-control / dynamic-rendering defect amplifies traffic | 19 public data endpoints with no cache header; health endpoints `no-store`; zero `revalidate`/`dynamic` declarations; no platform-level header rules | An amplifier needs a repeating client; amplification alone cannot create 1M requests from organic users | CONFIRMED (as defect) / contributing (as cause) | HIGH (defect) / LOW (share) | Traffic mix to quantify the share |
| H9 | Preview/deployment crawler | PR #27 preview deployment existed 2026-11-15; project metrics include previews | Previews are protected by Vercel Authentication for this project (measured on both known preview URLs in earlier work); no preview-specific metric | WEAK | LOW | Per-deployment or per-host breakdown |
| H10 | Vercel accounting/aggregation anomaly | Region table conflicts with configured function region (section 12) | Node+Edge sums exactly to the project total; CDN total exceeds functions by a plausible 20.73% static share; the pause is a standard fair-use action | WEAK | LOW | Vercel support review of raw counts |
| H11 | Multiple concurrent causes | Bot-shaped ratios plus a confirmed uncached architecture plus an unmeasured monitor candidate | Nothing excludes composition; nothing proves it | SUPPORTED | MEDIUM | Anything with per-request dimensions |

---

## 21. Root-cause classification

Classification: **UNRESOLVED_DUE_TO_LOG_RETENTION**.

Justification against the brief's confirmation standard. A confirmed classification must explain,
simultaneously: ~1.296M CDN requests, ~1.028M function invocations, the Node/Edge split, the
2026-11-14 to 2026-11-20 surge, the regional concentration, and the CPU exceedance.

| Required element | Can it be explained? |
|---|---|
| CDN request total | Only as arithmetic (functions + 20.73% static). No source. |
| Function total | Reconciled exactly (849,311 + 178,678). No attribution. |
| Node/Edge split | Explained structurally: Edge = middleware = 17.38%. Does not name the workloads. |
| Surge window | Owner-reported; no time series to confirm onset, peak, or end. |
| Regional concentration | Described; metric identity itself is ambiguous (section 12). |
| CPU exceedance | Consistent with 19 ms per Node invocation at this volume; not independently verifiable. |

Five of six elements are either arithmetic restatements or unverifiable, and none can be tied to a
route or a source. The brief forbids marking a cause confirmed when the evidence explains only a small
fraction, and forbids guessing route, UA, IP, region or timestamp facts. Under those rules the only
honest classification is UNRESOLVED_DUE_TO_LOG_RETENTION. PROBABLE_CAUSE_WITH_LIMITED_RETENTION was
considered and rejected: it requires a probable cause, and the evidence supports a probable *mechanism*
(uncached dynamic surfaces hit by a non-browser repeating client) without supporting a probable
*actor* or *path*.

Separate finding, which stands on its own and does not depend on logs:
CONFIRMED DEFECT - the application cannot absorb repeated reads (section 16) and performs a
self-inflicted extra Node invocation on AI routes (section 17). This defect is not proven to be the
trigger, but it guarantees that any repeating client becomes a quota incident, and it converts
legitimate moderate traffic into billable invocations at 1:1.

---

## 22. Impact

| Area | Impact |
|---|---|
| Availability | Production is paused from 2026-11-20T00:36:14Z; all requests receive the provider pause response. Effective total outage of the public product. |
| Duration | Until unpause: automatic at 2026-12-20T00:36:14Z, or earlier at provider discretion after review. Approximately 30 days if untouched. |
| Data | No evidence of data loss or corruption. The pause is an edge-level enforcement; MongoDB Atlas and Redis were not written to by this incident. |
| Users | Public demo product with 3 GitHub stars, 0 forks; GitHub traffic in the last 14 days was 6 views / 5 unique visitors and 62 clones / 39 unique cloners, so the human audience is small and the traffic that caused the pause is not explained by GitHub referrals. |
| Reputation/SEO | Domain returns a provider notice, not the app. Search indexing will degrade over the pause. |
| Cost | No overage billing on Hobby; the consequence is enforcement, not invoice. Risk on return: if the client is still active, the project re-pauses after another exceedance, and repeated violations can escalate. |
| Security | No security impact identified. No credentials were exposed by this investigation; all reads were control-plane metadata. |

---

## 23. Immediate containment options (NOT APPLIED)

Ranked by risk of doing harm, all requiring owner authorization and none executed:

1. **Do nothing until the automatic unpause, while preparing the fix.** Zero risk, zero cost, but
   guarantees ~30 days of outage and a probable immediate re-pause if the client is still active.
2. **Ask Vercel support for early unpause together with an attribution pack** (section 26). No code
   change, no setting change; the only requirement is honesty about the metrics. Recommended.
3. **Before unpausing, ship cache headers and the health-endpoint fix** (section 24). This is the only
   containment that reduces the blast radius on return. It requires a deploy, which the current
   mandate forbids; it is an owner decision to schedule.
4. **Firewall rules / rate limits**: availability on Hobby was not verifiable (overview 402, no event
   reader). Do not assume a rate-limit rule can be created on this plan; verify in the dashboard
   before promising it. Not applied.
5. **Rotate the production hostname / disable the preview alias**: not recommended. It breaks the
   product's canonical URL, discards SEO, and does not remove the underlying quota exposure.
6. **Delete or disable preview deployments**: marginal, unmeasured effect (H9 WEAK), breaks the PR
   workflow.

---

## 24. Durable remediation options (NOT APPLIED)

Ranked by expected effect on the exceeded meters. All are code or configuration changes requiring
owner approval, review, and a deploy window; none were implemented.

| ID | Change | Meters addressed | Expected effect | Effort | Risk | Rollback |
|---|---|---|---|---|---|---|
| R1 | Add `Cache-Control: public, s-maxage=..., stale-while-revalidate=...` to the 19 uncached public read-only endpoints | CDN, invocations, CPU | Largest single lever: repeat reads stop being invocations. If the client repeats identical GETs, this alone can remove most of the ~850k. Zero effect if query cardinality is unique per request. | M | Stale data window; must be tuned per endpoint | Revert header |
| R2 | Change `/api/health/live` and `/api/health/ready` from `no-store` to a short `s-maxage` (or serve a static liveness file) | invocations, CPU | Neutralizes monitor-driven load entirely; a 5 s monitor then costs ~0 invocations | S | A cached health answer can mask a real outage for the cache TTL (1 to 5 s is acceptable) | Revert header |
| R3 | Remove the middleware self-fetch of `/api/features` (import the flag or read it from config/edge-cache) | invocations (Node) | Removes exactly one Node invocation per AI request; 178,678 Edge implies up to 178,678 Node saved | S-M | Feature-gate semantics must be preserved | Restore fetch |
| R4 | Application-level rate limiting on public APIs (Redis token bucket, per-IP and per-route) | invocations, CPU, CDN | Hard ceiling on abuse; protects the quota regardless of client identity | M | False positives for legitimate users behind shared NAT | Disable limiter |
| R5 | Platform WAF/rate-limit rules in the dashboard (owner action) | CDN, invocations | Blocks automated clients at the edge before they bill functions | S | Plan availability unverified; can block real users if too aggressive | Delete rule |
| R6 | Add `robots.txt` and `noindex` on non-public routes | CDN | Reduces well-behaved crawler load; no effect on abusive clients | S | Minor SEO considerations | Revert |
| R7 | Retain observability: enable analytics/log retention adequate to attribute a future event | none directly | Makes the next incident diagnosable; this incident was undiagnosable | S (config) / cost | Cost | Disable |

Ordering recommendation: R2 and R3 first (small, surgical, low risk), then R1 (largest effect), then
R4/R5 as defence in depth, then R7 so the next event is not a repeat of this blind investigation.

---

## 25. Upgrade decision

Recommendation: **do not upgrade to Pro now as the primary response.**

Reasoning:

* The exceedance is 29.68% on CDN requests, 2.80% on invocations and 12.08% on CPU. Pro moves the
  included amounts, but the client that produced ~34,000 invocations per day would keep producing
  them, and on a metered plan the same traffic becomes a bill rather than a pause. Upgrading converts
  an enforcement problem into a spending problem without removing the cause.
* Without attribution, an upgrade buys capacity for an unknown workload. That is the definition of
  paying to keep a blind spot.
* The one legitimate upgrade argument is diagnostic: Pro unlocks the usage/log/observability surfaces
  that would have answered sections 8 through 15 of this report. If the owner values attribution more
  than the monthly fee, upgrading for one month, measuring, then deciding, is defensible. That is a
  different decision from "upgrade because we hit the limit".

Sequencing: apply R2/R3/R1, unpause, watch the meters for 72 hours. If the meters stay flat, the cause
was the client and the fix worked. If they climb again at the same rate, the client is still active and
the decision becomes block-or-upgrade with data in hand.

---

## 26. Vercel Support case evidence

A support case is recommended. Suggested content:

* Team: amrkoky5000-gmailcoms-projects (team_VYGxgaHqU3ebmL7BFKEbiNH0)
* Project: movie-recommendation-system (prj_lG0moC9gDG0HmzNZsXs3toGEA4LO), Hobby
* Pause: 2026-11-20T00:36:14Z; auto-unpause 2026-12-20T00:36:14Z
* Exceeded: CDN 1,296,827/1,000,000; invocations 1,027,989/1,000,000 (Node 849,311 + Edge 178,678);
  Fluid Active CPU 16,140 s/14,400 s
* Questions to ask:
  1. Provide per-path request aggregation for 2026-11-14T00:00:00Z to 2026-11-20T23:59:59Z (top 20
     paths, method, status).
  2. Provide per-user-agent and per-ASN aggregation for the same window.
  3. Confirm which resource triggered the enforcement action and at what timestamp.
  4. Confirm whether preview-deployment traffic is included in the project's counted requests.
  5. Confirm the log retention policy for Hobby and why every `vercel logs` query returned 0 rows
     while absolute windows returned HTTP 400 `ExceedsBillingLimitError`.
  6. Confirm whether the pause can be lifted early once cache headers are deployed, and whether a
     fair-use review is available.
* Attach: this report, the two screenshots of the usage dashboard, and the metrics table.

Do not include in the case: IP addresses, cookies, tokens, or user data - none are present in this
report to begin with.

---

## 27. Private-data handling

| Data class | Handling |
|---|---|
| Client IP addresses | never obtained; none printed, none stored |
| Email addresses | one appeared in the team metadata response; the scratch copy was redacted in place to `[REDACTED_EMAIL]` immediately after retrieval |
| Physical address | redacted in place to `"[REDACTED]"` |
| Cookies / authorization headers / API keys / bypass tokens | never printed, never persisted |
| MongoDB host / connection string | never read, never printed |
| Session IDs | never obtained |
| Request bodies / user recommendation preferences | never obtained (no request logs exist) |
| Owner screenshots | referenced by value only; treated as private owner evidence |

Scratch directory contents are outside the repository and contain only redacted metadata, log-query
results (empty), and the brief copy.

---

## 28. Files inspected

| File | Purpose |
|---|---|
| middleware.ts (147 lines) | matcher (28 patterns), self-fetch of /api/features at line 28, sensitive-leaf handling |
| next.config.mjs (106 lines) | images.remotePatterns, security headers, experimental flags; no API cache policy |
| app/**/api/**/route.ts (44 files) | route inventory; Cache-Control, searchParams, auth usage per route |
| app/**/page.tsx (19 files) | runtime declarations (0 edge), revalidate/dynamic declarations (0) |
| app/api/health/live/route.ts | `Cache-Control: no-store` |
| app/api/health/ready/route.ts | `no-store` on both branches |
| app/api/movies/route.ts | `public, max-age=21600` |
| components/admin/DashboardOverview.tsx | setInterval(fetchStats, 300000) |
| lib/fetchWithRetry.ts, lib/gemini-provider.ts, lib/tmdb.ts, lib/redis.ts | retry/timeout amplification |
| .github/workflows/ci.yml | workflow_dispatch only |
| package.json, package-lock.json | stack and version confirmation |
| README.md and docs/reports/PHASE-19/20/21-*.md | only files containing the production domain (documentation, not runtime) |
| .vercel/project.json | linked project id |
| scratch: brief.txt | incident brief (19,437 bytes) |
| scratch: probe2/project.txt (34,920 bytes), team.txt (2,410 bytes, redacted) | project and team metadata |
| scratch: probe2/L_*, L2_*, fw_*, usage*, version.txt, deps.txt | log queries, firewall queries, usage queries, tool versions |

---

## 29. External systems queried

| System | Interface | Queries | Result |
|---|---|---|---|
| Vercel control plane | CLI 59.10.0 (Node v24.21.0) | `projects ls`, `inspect`, `ls`, `logs` (8 relative + 2 absolute windows), `usage`, `metrics`, `firewall rules/ip-blocks/attack-mode/system-*/events/overview` | metadata OK; logs 0 rows or 400; usage 404; metrics gated; firewall read-only surface empty or 402 |
| Vercel REST | api.vercel.com / vercel.com/api/logs | `/v9/projects`, `/v2/teams`, `/v6/deployments` (limit 100), `/logs/request-logs` | 200 with metadata; log endpoint 200 with 0 records |
| GitHub | `gh` CLI, authenticated as amrhanyy | repo metadata, traffic/views, traffic/clones, PR list and merge timeline | PUBLIC repo, 3 stars, 0 forks; views 6/5 unique, clones 62/39 unique over 14 days |
| GitHub | REST traffic API | views, clones | same as above |
| Local Hermes state | `state.db` messages table, read-only | recover the incident brief after attachment loss | brief recovered (19,437 bytes) |
| Local filesystem | attachments directory | keyword scan for metric literals | see section 5; no additional metric source found |
| Local git | `C:/Program Files/Git/cmd/git.exe` | rev-parse, branch, status, log, grep | see section 31 |
| Production endpoint | - | ZERO requests | no probe, no curl, no readiness check, no API call, no login attempt |

Requests generated against the deployed application by this investigation: 0. All Vercel traffic went
to the control plane (api.vercel.com, vercel.com/api), which is not billed as project usage and does
not touch the deployment.

---

## 30. Files created / modified / deleted

| Path | Action | Tracked |
|---|---|---|
| docs/reports/diagnostics/INC-VERCEL-HOBBY-FAIR-USE-PAUSE-2026-11-DIAGNOSIS.md | created (this report) | NO - untracked |
| D:/AppData/hermes/cache/scratch/vercel-incident-2026-11/** | created outside the repository (brief copy, probe outputs, redacted metadata) | NO - outside repo |

Repository files modified: none. Repository files deleted: none. No `git add`, no `git commit`, no
`git push`. Nothing staged.

---

## 31. Git state

| Item | Before investigation | After investigation |
|---|---|---|
| Branch | docs/add-moviemind-logo-to-readme | unchanged |
| HEAD | 38e73a01adc389f030bdd2e025b5c0c9e8539c62 | unchanged |
| Last commit | 2026-11-09T02:01:56+02:00 "docs: add MovieMind logo to README hero" | unchanged |
| Tracked modifications | 0 | 0 |
| Staged files | 0 | 0 |
| Untracked files | 24 (pre-existing scratch artifacts: .chunks/, .my_tool_sandbox/, cqq.txt, route_dump.txt, logs/build-*.log and similar) | 25 (+ this report) |

The 24 pre-existing untracked entries were present before this investigation and were not touched,
cleaned, or committed.

---

## 32. Commit / push / deploy status

| Action | Performed |
|---|---|
| Commit | NO |
| Push | NO |
| Pull request | NO |
| Branch creation or deletion | NO |
| Deployment / redeployment / preview promotion | NO |
| Vercel project setting change | NO |
| Firewall rule creation or publication | NO |
| Environment variable change | NO |
| Database change (MongoDB Atlas) | NO |
| Cache/Redis change | NO |
| Upgrade to Pro | NO |
| Package installation | NO |
| Log or deployment deletion | NO |

The only state change produced by this investigation is one untracked Markdown file inside the
repository and a set of scratch files outside it.

---

## 33. Requirement Traceability Matrix

| Brief requirement | Status | Where |
|---|---|---|
| Strictly read-only investigation | MET | sections 29, 32 |
| Metrics per resource, project vs team vs limit | MET (owner-provided values) | sections 4, 7 |
| Define W1-W4 with window/returned-range/timezone/retention/completeness | MET | section 6 |
| Usage timeline with first increase, peak, correlation | NOT MET - no time series exists on this plan | section 8 |
| Top 20 paths (exact and normalized) with method/status/cache/function flag | NOT MET - no request logs | section 9 |
| Function attribution with runtime split and reconciliation | PARTIAL - totals reconciled exactly; per-function data unavailable | sections 10, 11 |
| User-agent / bot analysis | NOT MET - no UA data | section 13 |
| Source/IP/ASN analysis with redaction | NOT MET - no IP data available at all | section 14 |
| Periodicity detection | PARTIAL - average rate arithmetic only | section 15 |
| Cache analysis with source inspection | MET | section 16 |
| Repository automation audit | MET | section 17 |
| Deployment correlation | MET | section 18 |
| Firewall state read-only | PARTIAL - rules readable and empty; events and overview gated | section 19 |
| Hypothesis matrix H1-H11 with evidence and counter-evidence | MET | section 20 |
| Root-cause classification per the five allowed classes | MET (UNRESOLVED_DUE_TO_LOG_RETENTION) | section 21 |
| No guessed route, UA, IP, region or timestamp facts | MET - all gaps labelled | sections 5, 9, 13, 14, 15 |
| No inference of origin from processing region | MET | section 12 |
| Remediation options ranked, not applied | MET | sections 23, 24 |
| Upgrade decision with reasoning | MET | section 25 |
| Support case evidence package | MET | section 26 |
| Private-data exclusion | MET | section 27 |
| Final state: no tracked change, no staged file, no commit/push/PR/deploy/settings/env/DB change | MET | sections 30, 31, 32 |
| Report created untracked and not committed | MET | sections 30, 31 |

Acceptance criteria outcome: 15 MET, 4 PARTIAL, 4 NOT MET, 0 FAILED. The four NOT MET entries share
one physical cause: no retained request-level telemetry for the window on this plan.

---

## 34. Todo reconciliation

| # | Item | Status | Note |
|---|---|---|---|
| 1 | Capability check / load skills | COMPLETED WITH LIMITATION | Skill bodies were unavailable (pruned by context compression; archived copies not readable as text). The read-only protocol was taken from the brief itself. No skill instruction was followed blindly or ignored silently. |
| 2 | Baseline git state | COMPLETED | branch docs/add-moviemind-logo-to-readme, HEAD 38e73a01..., 24 untracked, 0 staged |
| 3 | Baseline Vercel identity and pause state | COMPLETED | project/team IDs, paused=true, blockedAt/unpauseAt, production deployment id |
| 4 | Vercel MCP capability and limitations | COMPLETED | connector scoped to a non-owning account, 403; CLI used instead; recorded in section 5 |
| 5 | Time windows W1-W4 | COMPLETED | section 6 |
| 6 | Usage attribution per resource | PARTIAL | owner-provided totals only; usage API 404 on Hobby |
| 7 | Usage timeline | BLOCKED | no time series available; owner-reported surge only |
| 8 | Top paths | BLOCKED | no retained request logs |
| 9 | Function attribution and Node/Edge reconciliation | PARTIAL | exact aggregate reconciliation; per-function blocked |
| 10 | User-agent analysis | BLOCKED | no UA data |
| 11 | Source/IP/ASN analysis | BLOCKED | no IP data |
| 12 | Periodicity | PARTIAL | average-rate arithmetic only |
| 13 | Cache analysis | COMPLETED | source inspection of all 44 routes and 19 pages |
| 14 | Repository automation audit | COMPLETED | middleware, cron, CI, dependabot, local jobs, pollers |
| 15 | Deployment correlation | COMPLETED | no production deploy inside the window |
| 16 | Firewall state | PARTIAL | rules empty; events/overview gated |
| 17 | Hypothesis matrix | COMPLETED | section 20 |
| 18 | Root-cause classification | COMPLETED | UNRESOLVED_DUE_TO_LOG_RETENTION |
| 19 | Remediation options | COMPLETED | sections 23, 24 |
| 20 | Security/privacy review | COMPLETED | section 27 |
| 21 | Write untracked report | COMPLETED | this file |
| 22 | Final state verification | COMPLETED | sections 30, 31, 32 |
| 23 | Reconcile and answer per section 18 | COMPLETED | final response |

Summary: 15 COMPLETED, 3 COMPLETED WITH LIMITATION/PARTIAL, 4 BLOCKED, 0 FAILED. All four BLOCKED items
are blocked by the same provider-side retention limitation, not by investigator error.

---

## 35. Recommended next owner decision

The decision that actually unblocks this incident is not technical. It is this:

**Open a Vercel support case requesting per-path and per-agent aggregation for 2026-11-14 to
2026-11-20, and ask for early unpause conditional on the cache fix being deployed.** Everything else
is guesswork until that data exists, and the report above deliberately refuses to guess.

Then, in order:

1. Approve the surgical remediation (R2 health endpoints, R3 middleware self-fetch) - small diffs, low
   risk, no product behavior change - and R1 cache headers for the 19 public endpoints.
2. Deploy that fix while the project is still paused, so the first request after unpause already hits
   a cacheable surface.
3. Unpause (early, via support, or automatically on 2026-12-20) and watch the meters for 72 hours.
4. Decide Pro only after that observation: upgrade if the traffic proves to be legitimate product
   usage, block if it proves to be an automated client. Do not upgrade to buy capacity for an
   unattributed workload.

Open inconsistencies carried forward, for the record: (a) the region table contradicts the configured
function region iad1 and the dashboard label for that metric was not captured; (b) the "surge window"
is owner-reported, never measured here; (c) the brief's requirement for top-20 paths cannot be
satisfied on this plan's retention and must be re-attempted with support-provided data.

End of report.


---

# Appendix - Phase 25 mitigation (2026-11-23)

This appendix is appended after the original diagnosis. Everything above this line is
preserved as written; no historical statement was edited, softened, or removed.

## A1. What Phase 25 changed

Commit `2ea4374` on branch `fix/reflectionbot-and-vercel-amplification-mitigation`
(62 files, 51 modified / 11 added / 0 deleted):

- 21 public deterministic GET APIs now emit a browser revalidation header plus a
  CDN-only TTL header; 8 private APIs keep `no-store`.
- `middleware.ts` matches only the protected surface and stamps `private, no-store`.
- 26 link sites no longer prefetch, removing the detail-page fan-out.
- `/api/features` is resolved server-side once and consumed through a TTL cache with a
  single in-flight fetch on the client.
- `app/robots.ts` disallows `Reflectionbot` site-wide and private surfaces for all
  agents.
- `lib/redis-health.ts` short-circuits on provider quota exhaustion instead of
  retrying metered commands.

## A2. What remains unverified

The Vercel project is still paused (`paused = true`), so the deployment for `2ea4374`
is `BLOCKED`. Therefore this incident record cannot yet show:

- the live CDN cache-hit behaviour of the new headers,
- the live single-fetch behaviour of `/api/features`,
- the live `/robots.txt` response served to the crawler.

These are stated as source-level contracts only. The Phase 25 report records the same
gap in its section 51.

## A3. Effect on the incident counters

No new platform counters were produced after the mitigation, because the project cannot
deploy while paused. The counters in the body of this diagnosis (1,296,827 CDN requests
against a 1,000,000 allowance; 268,838 non-function responses; 1.262 CDN requests per
invocation) remain the authoritative pre-mitigation measurement.

Expected direction after resume, labelled as expectation rather than measurement:
crawler requests should be answered at the edge (cache HIT) or refused by the Firewall,
so function invocations per CDN request should fall well below the recorded 1.262.

## A4. What was not changed

- No Vercel Environment Variable was added or modified.
- No Firewall rule was applied or published; the plan exists only on paper.
- No MongoDB schema, model, or Atlas configuration change.
- No Redis provider, plan, credential, or key change.
- The project was not resumed by this phase.

## A5. Reopening and monitoring

Recommended order: owner review, merge decision, resume, publish Firewall stages 1 and 3
(AI-bot crawlers deny, UA `Reflectionbot` deny), keep the per-IP rate limit in log-only
mode for 24 hours, then decide on enforcement.

Checkpoints and thresholds are defined in the Phase 25 report, section 55: 15 minutes
(<= 500 CDN / <= 200 function invocations), 1 hour (<= 5,000 / <= 1,000, plus <= 100
middleware redirects from automated clients), 24 hours (<= 25,000 / <= 10,000), with a
72-hour review. A breach is reported as a breach; thresholds are not adjusted after the
fact.

## A6. Cross-reference

Full evidence, gate results, and the requirement traceability matrix:
`docs/reports/PHASE-25-REFLECTIONBOT-AND-VERCEL-AMPLIFICATION-MITIGATION-REPORT.md` (59
sections).

End of appendix.
