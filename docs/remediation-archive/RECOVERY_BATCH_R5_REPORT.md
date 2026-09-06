# RECOVERY_BATCH_R5_REPORT.md

- **Date:** 2026-08-20 (UTC+3)
- **Scope:** R5 only - Gemini, AI output, Markdown, XSS, CSP, and browser-security hardening.
- **Status:** **COMPLETE** - every required command exits 0; previous 56 tests plus all R5 tests pass (117/117); no live external service contacted; no later remediation batch started.

---

## 1. Initial Git state

- Branch: `main`
- HEAD: `b4e8023`
- Dirty tree from R1-R4 preserved (not reset).
- Baseline recorded before R5 edits:
  - `npm run lint`: exit 0
  - `npm run typecheck`: exit 0
  - `npm test`: exit 0 (56/56)
  - `npm run test:coverage`: exit 0
  - `npm run build`: exit 0
  - `git diff --check`: exit 0
- No TypeScript or ESLint build bypass remained from prior batches.
- Redis FLUSHDB / FLUSHALL / KEYS already removed; cache operations already namespace-scoped.

---

## 2. Initial AI/browser attack surface

| Area | Before R5 |
|------|-----------|
| AI assistant Markdown | Custom string-to-HTML renderer + `dangerouslySetInnerHTML` |
| Chat history | Client could send `previousMessages`; persistence via `POST /api/chat-history` with a client-supplied assistant `response` |
| Gemini request | System policy mixed into contents; API key historically at risk of query-string transport |
| Structured AI output | `JSON.parse` / type assertions without strict Zod |
| Errors / logs | Upstream bodies, prompts, and content-bearing logs were historically present (partially reduced in R1-R3) |
| CSP | Absent (`F-048`) |
| YouTube | Embed URLs constructed from TMDB keys without a strict ID allowlist; `youtube.com` possible |
| External links | Movie/TV homepage `href` assigned from TMDB strings without HTTPS-only validation |
| Redis docs | Section 2 of the deployment checklist had previously contradicted R4 `REDIS_URL` precedence (already corrected by R4; verified in R5) |

---

## 3. Initial dangerous-sink inventory

| Sink | Location | Status before R5 |
|------|----------|------------------|
| `dangerouslySetInnerHTML` | `app/ai-assistant/page.tsx` assistant HTML | Active for model text |
| `dangerouslySetInnerHTML` | `components/ChatAssistant.tsx` | Active for model text |
| Custom HTML-string Markdown | `formatAssistantMessage` in AI assistant page | Active |
| `rehype-raw` | not installed | Absent |
| `eval(` / `new Function` | application TS/TSX | Absent |
| YouTube iframe `src` | trailer components | Built from TMDB `key` without ID allowlist |
| External `href` | movie/TV homepage | TMDB string assigned directly |
| `dangerouslySetInnerHTML` | `components/ui/chart.tsx` (shadcn/Recharts CSS variables) | Present; not AI/user/TMDB/DB text (see section 21) |

---

## 4. Final Markdown rendering architecture

- Package: `react-markdown@9.0.3` (maintained React renderer).
- Module: `lib/ai-markdown.tsx` (`SafeMarkdown`).
- Raw HTML is disabled. `rehype-raw` is not a dependency and is not imported.
- Markdown is rendered as React elements. No HTML string is constructed. `dangerouslySetInnerHTML` is not used on this path.
- Allowlist: `p`, `h1`-`h3`, `ul`, `ol`, `li`, `em`, `strong`, `code`, `pre`, `blockquote`, `a`.
- Disallowed (omitted / not in allowlist): `iframe`, `script`, `style`, `object`, `embed`, `form`, `input`, `button`, `video`, `audio`, `svg`, MathML, event handlers, inline styles, Markdown images (`img` component returns `null`).
- Consumers: `app/ai-assistant/page.tsx`, `components/ChatAssistant.tsx`.
- User messages remain plain text (`<p>` / string), not Markdown.

---

## 5. URL validation rules

Implemented in `lib/ai-security.ts` (`isSafeExternalUrl` / `safeExternalHref`):

- Absolute `https:` only.
- Reject: `http:`, `javascript:`, `data:`, `vbscript:`, `file:`, protocol-relative (`//…`), scheme-less, credentials in the URL, control characters, whitespace, quotes, malformed URLs.
- Malformed input returns `false` / `undefined` and does not throw.
- Markdown links: only HTTPS survive; rendered with `target="_blank"` and `rel="noopener noreferrer nofollow"`. Unsafe URLs become plain text.
- Homepage / other dynamic external links: `SafeExternalLink` uses the same helper with `rel="noopener noreferrer"`.
- Internal navigation continues to use Next `Link` with static app paths (`FeatureNavItems` and similar).

---

## 6. Chat trust-boundary changes

Preferred design implemented:

1. Client sends `message` and optional `chatId` only.
2. Server authenticates (`requireSession`), rate-limits (`RATE_LIMITS.chat`), validates with `chatRequestSchema` (`.strict()`).
3. `chatId` must be a valid MongoDB ObjectId.
4. History is loaded with `{ _id: chatId, userId }` where `userId` is the authenticated session email.
5. Gemini context is built server-side (`buildChatGeminiPayload`).
6. Response is extracted and size-capped (`extractGeminiText`).
7. User + assistant messages are persisted only after a valid model reply.
8. Response returns `{ response, chatId, status }`.

Compatibility:

- `previousMessages` is still accepted by the schema (max 20 unknown items) so old clients do not 400, then **ignored**. Residual risk: a client can still *send* the field; it cannot affect model context or persistence.
- Extra field `response` is rejected by `.strict()`.
- `POST /api/chat-history` now returns **403** and does not persist. Persistence lives only in `POST /api/chat`.
- API contract: `GET /api/chat-history` returns `{ chatId, messages }`. `app/ai-assistant/page.tsx` was updated to consume `chatId`.

No idempotency key is implemented. Retries can duplicate persisted turns. Documented in remaining risks.

---

## 7. Conversation ownership behavior

- Every chat lookup/update uses `_id` + authenticated `userId`.
- Invalid ObjectId → 400 before query.
- Foreign or missing `chatId` on `POST /api/chat` → 403 (`Chat not found`); model is not called.
- `GET`/`DELETE /api/chat-history/[id]` already filtered by `{ _id, userId }` (ObjectId validated). Foreign IDs return 404 on GET.
- `DELETE /api/chat-history` still deletes only the authenticated user's documents.

---

## 8. Context and output limits

| Limit | Value |
|-------|--------|
| User message | 2000 characters |
| History messages used | 20 |
| Approximate context size | 8000 characters (oldest dropped first after the 20-cap) |
| Assistant output | 4000 characters |
| Messages stored per chat | last 200 (`$slice`) |
| Structured recs / similar | max 12 items |
| Title | 200 characters |
| Similar reasoning | 300 characters |
| TMDB overview sent to Gemini | 500 characters |
| Preference JSON sent to Gemini | 8000 characters |

Gemini is not given tools, function-calling, email, user IDs as prompt fields, roles, OAuth images, tokens, or exact watch dates.

---

## 9. Gemini `systemInstruction` structure

`lib/gemini-payload.ts` builds generateContent bodies with:

- Top-level `systemInstruction.parts[].text` (fixed server policy).
- `contents[]` with Gemini roles `user` / `model` only.
- Untrusted user chat text in user parts.
- Untrusted preferences labeled `UNTRUSTED_USER_PREFERENCE_DATA`.
- Untrusted TMDB fields labeled `UNTRUSTED_TMDB_MOVIE_DATA`.
- No secrets, internal URLs, role/permission metadata, or API keys in the JSON body.
- Safety settings: harassment / hate / sexually explicit / dangerous content at `BLOCK_MEDIUM_AND_ABOVE`.
- Auth header: `x-goog-api-key` (not `?key=`).

---

## 10. Prompt-injection residual-risk statement

Prompt injection is **not fully solved**.

The model still reads untrusted user text, TMDB overviews, and preference titles. Structural separation and labeling reduce accidental instruction-following; they do not make it impossible. A determined prompt in a movie overview or chat message can still influence wording. The model has no tools and cannot execute database, role, admin, cache, or fetch actions in this application, but it can still produce misleading text. Callers must keep treating model output as untrusted.

---

## 11. Structured-response schemas

`lib/ai-security.ts`, all `.strict()`:

- `aiRecommendationsSchema`: `{ recommendations: [{ title, confidence?, "sub-genre"?, type: "movie"|"tv" }] }` length 1-12.
- `aiSimilarMoviesSchema`: `{ similar_movies: [{ title, year?, reasoning? }] }` length 1-12; year `^\d{4}$`.
- Unknown fields rejected. Missing required fields rejected.
- Chat: Gemini envelope parsed with Zod; text bounded; empty/malformed candidates → `null` → generic `AI_INVALID_RESPONSE`.
- Fenced JSON extraction is deterministic and capped (`MAX_FENCED_JSON_CHARS`); malformed JSON is not repaired; validation failure uses the safe fallback.

---

## 12. TMDB validation behavior

- Recommendation titles are searched on TMDB (`search/multi`). Displayed IDs, posters, and media types come from TMDB matches, not from Gemini.
- Similar-movie titles are searched on TMDB (`search/movie`). Rows without a TMDB `id` are dropped.
- Model-generated URLs and extra ID fields are rejected by the strict schemas.
- Gemini cannot choose arbitrary image URLs; posters come from TMDB metadata through existing UI.

---

## 13. AI key transport and redaction behavior

- Gemini REST generateContent supports `x-goog-api-key`. R5 uses that header. The request URL is `GEMINI_GENERATE_URL` with **no** query key.
- `GOOGLE_API_KEY` exists only in server route handlers (`app/api/chat`, `app/api/ai-recommendations`, `app/api/movie/[id]/ai-similar`). It is not imported by client components.
- `redactSensitive()` strips `key=` query fragments and `x-goog-api-key` header values before any log of an error string.
- Client JSON never includes the key, `?key=`, `systemInstruction`, or upstream bodies.

---

## 14. Error mapping

| Condition | Code | HTTP |
|-----------|------|------|
| Invalid client JSON / schema | - | 400 |
| Unauthenticated | - | 401 |
| Foreign / missing chat ownership | - | 403 |
| Local rate limit | - | 429 |
| Invalid upstream / failed schema | `AI_INVALID_RESPONSE` | 502 |
| Temporary upstream / missing key | `AI_UNAVAILABLE` | 503 |
| Abort / timeout | `AI_TIMEOUT` | 504 |
| Gemini 429 | `AI_RATE_LIMITED` | 429 |

Messages to the client are generic (`Failed to process chat request`, `Failed to generate recommendations`, etc.). Upstream bodies, stacks, prompts, and keys are not returned.

---

## 15. Logging changes

AI routes now log only short fixed strings (for example `AI request failed`, `Recommendation error`, `TMDB lookup failed`) or `redactSensitive(String(error))` on chat fetch failures.

Removed from the AI path: full chat text, full recommendation payloads, emails, complete prompts, `systemInstruction`, stack traces, and key-bearing URLs.

Unrelated non-AI `console.log` / `console.error` calls (TMDB cache misses, Redis health, auth) were left in place because they are outside R5 scope.

---

## 16. CSP policy and origin justification

Enforced in `next.config.mjs` `headers()` for `/(.*)`:

| Directive | Value | Why |
|-----------|--------|-----|
| `default-src` | `'self'` | No wildcard default |
| `base-uri` | `'self'` | |
| `object-src` | `'none'` | |
| `frame-ancestors` | `'none'` | Clickjacking |
| `form-action` | `'self'` | |
| `script-src` | `'self'` | No `unsafe-eval`; no `unsafe-inline` for scripts |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind / styled-jsx / shadcn dynamic styles. **Documented limitation.** |
| `img-src` | `'self' data: https://image.tmdb.org https://lh3.googleusercontent.com` | App assets, CSS `data:` backgrounds, TMDB posters, Google OAuth avatars used by `AuthButton` |
| `font-src` | `'self'` | No Google Fonts CDN in this app |
| `connect-src` | `'self'` | Browser talks only to same-origin Route Handlers. Gemini and TMDB APIs are **not** allowed from the browser |
| `frame-src` | `https://www.youtube-nocookie.com` | Validated embeds only |
| `media-src` | `'none'` | |
| `manifest-src` | `'self'` | |
| `upgrade-insecure-requests` | present | |

Existing headers retained: HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-DNS-Prefetch-Control`, and `X-Frame-Options: DENY` (defense in depth with `frame-ancestors`).

CSP browser compatibility was **not** live-verified. Staging validation is required (section 33). This report does not claim CSP was confirmed in a real browser.

---

## 17. YouTube embed hardening

- `isValidYouTubeVideoId`: exactly 11 characters `[A-Za-z0-9_-]`.
- `buildYouTubeEmbedUrl`: `https://www.youtube-nocookie.com/embed/{id}` only after validation. Full URLs, `javascript:`, quotes, and extra query strings are rejected.
- `SafeYouTubeEmbed`: iframe only when the ID is valid; otherwise no iframe (parents show a text unavailable state).
- iframe attributes: `title`, `loading="lazy"`, `referrerPolicy="strict-origin-when-cross-origin"`, restricted `allow`, `allowFullScreen`.
- Trailer components (`MovieTrailer`, `MovieTrailerPreview`, `TVShowTrailer`, `LatestTrailers`) pass only validated IDs.

---

## 18. Tests added and exact test names

Initial count: **56**. Final count: **117**. Previous 56 all still pass.

### `tests/ai-markdown-security.test.tsx` (R5-A, R5-H, R5-B)

- `script tag never executes or renders as HTML`
- `img onerror is not rendered as active HTML`
- `svg onload is not active`
- `javascript: link is inert (text only)`
- `data: link is rejected`
- `protocol-relative link is rejected`
- `malformed URL does not crash and produces no anchor`
- `safe HTTPS Markdown link renders with correct rel attributes`
- `markdown basics still render (headings, bold, lists, code)`
- `markdown image syntax is not rendered`
- `valid YouTube ID creates expected origin`
- `invalid or malicious ID creates no iframe`
- `full arbitrary URLs are rejected`
- `quote/attribute injection is rejected`
- `renders https links with noopener noreferrer`
- `does not render javascript or protocol-relative hrefs`

### `tests/ai-browser-security.test.ts` (R5-B through R5-H)

- `accepts absolute https URLs`
- `rejects http (https only)`
- `rejects javascript/data/vbscript/file schemes`
- `rejects protocol-relative and scheme-less URLs`
- `rejects URLs with credentials`
- `rejects non-string and malformed values without throwing`
- `safeExternalHref returns undefined for unsafe input`
- `accepts a valid 11-char ID`
- `rejects invalid IDs, full URLs, and injection payloads`
- `buildYouTubeEmbedUrl constructs youtube-nocookie origin only from validated IDs`
- `quote/attribute injection is rejected`
- `buildChatGeminiPayload separates systemInstruction from user content`
- `does not place email, user id, role, token, or API secret in the JSON body`
- `untrusted TMDB overview cannot become the system instruction`
- `client-supplied role fields do not alter prompt role data`
- `recommendation preferences stay in user content, not systemInstruction`
- `boundChatHistory caps count and approximate size`
- `extractFencedJson returns bounded fenced block deterministically`
- `accepts valid recommendations and rejects unknown fields (strict)`
- `rejects too many recommendations`
- `rejects invalid media type and oversized title`
- `rejects missing required fields`
- `missing candidate content yields null (safe fallback path)`
- `aiSimilar schema enforces title/year/reason bounds`
- `HTML in reason remains text and is not a trusted field`
- `rejects oversized reasoning`
- `rejects model-generated URL or fake TMDB ID fields`
- `malformed JSON follows the safe fallback`
- `maps upstream statuses to stable codes`
- `AIUpstreamError carries a stable code`
- `redactSensitive removes key-bearing URL fragments`
- `next.config defines CSP with required properties`
- `existing security headers are preserved`
- `dangerouslySetInnerHTML is absent from the AI rendering path`

### `tests/chat-trust-boundary.test.ts`

- `unauthenticated chat rejected before model call`
- `foreign chatId rejected`
- `invalid chatId rejected`
- `client-supplied assistant response is ignored or rejected`
- `client previousMessages cannot inject another user history`
- `history is loaded only with authenticated ownership criteria`
- `oversized message rejected`
- `model is not called on validation or ownership failure`
- `user and assistant messages are persisted only after valid response`
- `failed model response does not persist a fabricated assistant message`
- `POST /api/chat-history rejects client-supplied assistant responses`

All new tests use mocks, no `.env`, no live Gemini/TMDB/MongoDB/Redis. No snapshot-only security tests. No skipped tests.

---

## 19. Finding IDs covered

| ID | Topic | R5 result |
|----|--------|-----------|
| F-007 | XSS via unsanitized AI Markdown/HTML | Closed: React Markdown, no `dangerouslySetInnerHTML` on AI path |
| F-005 related | Chat trust / client history / client assistant persistence | Closed for persistence and history injection; handler auth already present from earlier batches |
| F-006 | Unauthenticated AI similar | Preserved (not weakened) |
| F-011 | Rate limits on chat / AI | Preserved |
| F-048 | Missing CSP / security headers | CSP added in enforcement; prior headers kept |
| F-050 | `errorDetails` / upstream leak | Preserved generic errors; AI codes only |

Prompt injection is **not** claimed as a closed finding.

---

## 20. Proof no external service was contacted

- Tests mock `fetch` and Mongo models. Assertions check that `fetch` is **not** called on auth/validation/ownership failure.
- Not run: `setupDatabase.cts`, `testRedisConnection.ts`, owner-provisioning scripts, `npm audit fix`.
- `.env` / `.env.local` were not modified. Next.js printed `Environments: .env.local, .env` during `next build` (local file presence). That is not an outbound call to Gemini, TMDB, MongoDB, Redis, Google OAuth, or YouTube.
- No R5 test or implementation step issued a live request to `generativelanguage.googleapis.com`, `api.themoviedb.org`, MongoDB, Redis, accounts.google.com, or YouTube.

---

## 21. Security-search results

Post-implementation search (application + tests + config). Intentional remaining matches:

| Pattern | Remaining matches | Explanation |
|---------|-------------------|-------------|
| `dangerouslySetInnerHTML` | `components/ui/chart.tsx` (Recharts CSS variables from local `ChartConfig` colors/IDs); tests asserting **absence** on the AI path; historical audit Markdown | Chart CSS is not user/AI/TMDB/DB text. AI files do not assign `dangerouslySetInnerHTML=` |
| `innerHTML` | Markdown tests reading `container.innerHTML` to prove `<script>`/`<img>` are absent | Test assertion only |
| `outerHTML` / `insertAdjacentHTML` / `eval(` / `new Function` | none in TS/TSX/JS | |
| `javascript:` / `vbscript:` / `data:` / `file:` | validators, tests, CSP `img-src data:`, comments | Rejection tests and CSS data-URI images |
| `rehypeRaw` / `rehype-raw` | tests asserting they are not imported | Not a dependency |
| `GOOGLE_API_KEY` | server routes + test placeholder `test-placeholder-key` | Server-only; tests assert it is not in request URLs/bodies |
| `?key=` | redaction helper + tests asserting absence on Gemini fetch URL | Gemini uses header auth |
| `systemInstruction` | payload builder + tests | Required Gemini field; never returned to the client |
| `previousMessages` | schema (ignored) + tests | Compatibility field, not used as history |
| `console.log` / `console.error` | many non-AI files; AI routes use generic strings | See section 15 |
| `error.stack` / `error.message` | `app/error.tsx` documents not logging them in production; other non-AI routes | Not on the Gemini error path |
| `iframe` | `SafeYouTubeEmbed` only (validated ID) + tests | |
| `youtube.com` | tests rejecting `www.youtube.com` in CSP/frame construction | Embeds use `youtube-nocookie.com` |
| `youtube-nocookie.com` | builder, CSP `frame-src`, tests | Intended |
| `unsafe-eval` | tests asserting absence | Not in CSP |
| `unsafe-inline` | `style-src` only | Documented limitation |
| `Content-Security-Policy` | `next.config.mjs` + tests | Intended |

---

## 22. Documentation correction

`DEPLOYMENT_SECURITY_CHECKLIST.md` section 2 already stated (from R4):

- `REDIS_URL` is supported and takes precedence.
- `rediss://` implies TLS.
- Fallback: `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS`.
- `redis://` combined with `REDIS_TLS=true` is rejected.

R5 re-read section 2 and section 6. No remaining “REDIS_URL must not be set” contradiction. No real Redis values were added. Unrelated checklist items were not rewritten.

---

## 23. Dependencies added or removed

- **Added:** `react-markdown@^9.0.3` (and its lockfile transitive graph).
- **Removed:** none.
- No sanitizer-bypass packages. No `rehype-raw`.

---

## 24. Exact commands and exit codes

Runtime: Node `v22.17.0`, npm `11.5.2`.

Final verification (after the `tsconfig` ESM fix), in required order:

| Command | Exit code |
|---------|-----------|
| `node -v` | 0 |
| `npm -v` | 0 |
| `npm run lint` | 0 |
| `npm run typecheck` | 0 |
| `npm test` | 0 |
| `npm run test:coverage` | 0 |
| `npm run build` | 0 |
| `git diff --check` | 0 |

---

## 25. Lint result

- Exit **0**.
- 0 errors, 107 warnings (pre-existing unused-variable / hooks / `no-img-element` warnings). No new `eslint-disable`. No rule suppressions added for R5.

---

## 26. Type-check result

- Exit **0** (`tsc --noEmit`).
- Extra file: `tsconfig.json` `module` / `moduleResolution` changed from `NodeNext`/`NodeNext` to `ESNext`/`bundler`.
- Reason: `react-markdown` is ESM-only. Under `NodeNext` with a CommonJS `package.json`, `tsc` and `next build` reported TS1479 on `import ReactMarkdown from 'react-markdown'`. Next.js 15 already bundles ESM. This is the framework-recommended setting, not a `@ts-ignore` or `skipLibCheck` expansion. `skipLibCheck` was already `true` before R5.

---

## 27. Test result

- Exit **0**.
- 7 files, **117/117** passing.
- Previous 56 preserved.

---

## 28. Coverage result

- Exit **0**.
- 117/117 tests under coverage.
- Focused R5 modules (v8): `lib/ai-security.ts` 96% statements; `lib/gemini-payload.ts` 100%; `lib/ai-markdown.tsx` 87.67%; `components/SafeExternalLink.tsx` 100%; `components/SafeYouTubeEmbed.tsx` 100%; `app/api/chat/route.ts` 86.06%.
- Aggregate “All files” percentage is low because `vitest` `coverage.include` still lists the whole `app/api/**` tree. That is a reporting glob, not a test failure.

---

## 29. Build result

- Exit **0**.
- Next.js 15.5.23 production build compiled, type-checked, and finished.
- No `ignoreBuildErrors` / `ignoreDuringBuilds`.

---

## 30. `git diff --check` result

- Exit **0**.
- CRLF/LF warnings only; no trailing-whitespace errors.

---

## 31. Files modified by R5

**Allowed / in-scope**

- `app/ai-assistant/page.tsx`
- `components/ChatAssistant.tsx`
- `app/api/chat/route.ts`
- `app/api/ai-recommendations/route.ts`
- `app/api/movie/[id]/ai-similar/route.ts`
- `lib/security/schemas.ts`
- `lib/ai-markdown.tsx` (new)
- `lib/ai-security.ts` (new)
- `lib/gemini-payload.ts` (new)
- `next.config.mjs`
- `components/SafeYouTubeEmbed.tsx` (new)
- `components/SafeExternalLink.tsx` (new)
- `components/MovieTrailer.tsx`
- `components/MovieTrailerPreview.tsx`
- `components/TVShowTrailer.tsx`
- `components/home/LatestTrailers.tsx`
- `tests/ai-markdown-security.test.tsx` (new)
- `tests/ai-browser-security.test.ts` (new)
- `tests/chat-trust-boundary.test.ts` (new)
- `package.json` / `package-lock.json` (`react-markdown` only)
- `DEPLOYMENT_SECURITY_CHECKLIST.md` (verified; no further Redis contradiction)
- `RECOVERY_BATCH_R5_REPORT.md` (this file)

**Extra files (reason documented before/with the edit)**

- `app/api/chat-history/route.ts` - persistence moved to `/api/chat`; client `response` must not be stored. Required by Part 2 item 12.
- `app/movie/[id]/page.tsx`, `app/tv/[id]/page.tsx` - homepage URLs are dynamic TMDB strings; must use `SafeExternalLink` (Part 8).
- `tsconfig.json` - ESM `module`/`moduleResolution` so `react-markdown` typechecks and builds without suppressions (Part 1 + no `@ts-ignore` rule).
- `vitest.config.mts` - jsdom for `*.test.tsx`; coverage includes new AI modules.

`.env` and `.env.local` were not modified.

---

## 32. Remaining risks

1. Prompt injection remains possible (section 10).
2. No chat idempotency: client retries after a success can duplicate stored turns.
3. `previousMessages` is still accepted then ignored (compat). It cannot inject history, but the field exists.
4. `style-src 'unsafe-inline'` is required by the current CSS pipeline.
5. `script-src 'self'` without a nonce: Next.js 15 inline bootstrap scripts may fail in a real browser. Must be staging-tested; do not weaken CSP to make the app load without evidence.
6. `img-src` includes `data:` (CSS) and `lh3.googleusercontent.com` (OAuth avatars only; other avatar hosts would break images).
7. TMDB title search can attach the wrong catalog row to a Gemini title (pre-existing matching heuristic).
8. Generic UI error strings may appear locally in chat after a failed request; they are not persisted as assistant output.
9. `components/ui/chart.tsx` still uses `dangerouslySetInnerHTML` for CSS variables (not AI content).
10. CSP was not live-verified in a browser.

---

## 33. Required staging tests

CSP and embeds cannot be proven from `next build` alone. Before production:

1. Load home, movie detail, TV detail, AI assistant, and sign-in with the new CSP; confirm no CSP violations in the browser console.
2. Confirm Next.js hydration/scripts run with `script-src 'self'` (no silent white screen).
3. Confirm TMDB posters (`image.tmdb.org`) and Google avatars (`lh3.googleusercontent.com`) load.
4. Play a trailer iframe on `youtube-nocookie.com`; confirm `www.youtube.com` frames are blocked.
5. Confirm Google OAuth redirect/callback still completes (navigation, not `connect-src`).
6. Send a chat message; confirm history reloads from the server `chatId` and that `POST /api/chat-history` returns 403.
7. Confirm a crafted Markdown payload (`<script>`, `javascript:` link) renders as text in the assistant bubble.

This report does **not** claim those browser checks were performed.

---

## 34. Manual deployment actions

- Deploy the R5 build with existing secrets unchanged (do not paste keys into docs).
- Confirm `GOOGLE_API_KEY` stays server-only on the host.
- After staging CSP tests (section 33), roll out.
- Do not enable Gemini/TMDB origins in browser `connect-src`.
- Operators should expect `POST /api/chat-history` to remain disabled; clients must use `POST /api/chat`.

---

## 35. Confirmation no later remediation batch started

R5 is the only batch executed in this work. No R6 or later batch was started. Privacy export/deletion, CI/CD, broad performance work, database migrations, unrelated dependency upgrades, and broad architecture cleanup were not performed.
