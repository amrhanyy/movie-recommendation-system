# Hotfix Report: AI 502 Transparency + Model Fallback & Redis Connection/Health Hardening

**Date:** 2026-09-06
**Basis:** `docs/DIAGNOSTIC_AI_REDIS_REPORT.md`
**Constraints honored:** no new dependencies; `docs/`-only report (nothing written to repo root).

---

## 1. Files modified

| File | Change |
|---|---|
| `lib/gemini-payload.ts` | Configurable model via `GEMINI_MODEL` env (default `gemini-2.0-flash`), `GEMINI_FALLBACK_MODELS = ['gemini-1.5-flash']`, `buildGeminiGenerateUrl(model)`, `getGeminiApiKey()` (trimmed, server-only) |
| `lib/ai-security.ts` | New `AI_AUTH_ERROR` code; `mapAIError(400/401/403)` → `AI_AUTH_ERROR`/502 instead of mushrooming into `AI_INVALID_RESPONSE`; `httpStatusForAIError` handles the new code |
| `app/api/chat/route.ts` | Split fetch into `postToGemini()` + fallback loop in `getGeminiResponse()`; `[Gemini Upstream Error] <status> <redacted body>` logging on every non-OK upstream; `x-goog-api-key` uses trimmed key; 503 retried once on primary, model-rejection falls back to `gemini-1.5-flash` |
| `app/api/ai-recommendations/route.ts` | Same logging (`readUpstreamErrorBody` + `[Gemini Upstream Error]`), same model fallback, trimmed key; removed stale `GOOGLE_API_KEY` module const; typed `postRecommendationsToGemini` return |
| `app/api/movie/[id]/ai-similar/route.ts` | Same logging + fallback + trimmed key |
| `lib/redis-config.ts` | Trims `REDIS_URL`/`REDIS_HOST`/`REDIS_USERNAME`; `REDIS_PASSWORD` without explicit username implies ACL user `default`; whitespace-only values treated as absent; `rediss://` passes through with top priority (TLS from scheme) |
| `lib/redis-health.ts` | `recordError()` now marks unhealthy immediately on auth/timeout/disconnect patterns (`auth`, `WRONGPASS`, `ECONNREFUSED`, `ETIMEDOUT`, `offline`, DNS, socket-closed), while max-clients still drives the disable+cooldown path |
| `lib/redis.ts` | `recordError()` invoked on **every** client `error` event and on connect-path exceptions (previously only max-clients) |
| `lib/cacheManager.ts` | `getCacheStats()` returns truthful `status: 'online' | 'fallback-memory' | 'error'` plus `backend: 'redis' | 'memory'`; fallback label replaces the misleading bare `'offline'` |
| `components/admin/CacheManagement.tsx` | `CacheStats` accepts `'fallback-memory'` + `backend`; new blue "Memory Fallback" badge + explanatory alert (tells operator to set `REDIS_URL`); key-list empty state distinguishes fallback from offline |
| `tests/ai-browser-security.test.ts` | R5-F updated: 400/401/403 → `AI_AUTH_ERROR` (502 preserved); added 404 and `httpStatusForAIError` assertions |
| `tests/redis-cache-security.test.ts` | R4-H extended: password-without-username, whitespace-env, `rediss://` passthrough (3 new tests, 27 → 30) |

## 2. Gemini model / logging changes

- **Model:** previously hardcoded `gemini-2.0-flash`. Now `process.env.GEMINI_MODEL || 'gemini-2.0-flash'` (trimmed), with automatic fallback to `gemini-1.5-flash` when the primary is rejected (`AI_AUTH_ERROR` on first URL → try fallback URL). Note: the task brief suggested defaulting to `gemini-3.7-flash`; that model id does not exist in the Generative Language API — defaulting to it would 404 every AI call. I kept the proven `gemini-2.0-flash` default (overridable via `GEMINI_MODEL`) and used the real legacy `gemini-1.5-flash` as fallback. Set `GEMINI_MODEL=gemini-2.5-flash` in Vercel when ready to move forward; no code change needed.
- **Key hygiene:** `getGeminiApiKey()` trims whitespace/newlines (common Vercel paste error); key still travels only in the `x-goog-api-key` header, never URL/body/logs.
- **502 blindness fixed:** every `!response.ok` now logs `[Gemini Upstream Error] <status> <first 500 chars, redacted>` server-side (visible in Vercel logs). Client responses still carry only `{ error, code }` — upstream bodies, keys, and prompts never leak (existing `chat-trust-boundary` assertions still pass; the one stderr line in that test's output is the new server log, expected).
- **Error semantics:** 400/401/403 → `AI_AUTH_ERROR` (HTTP 502 to client, unchanged status so no client breakage, but the `code` now tells operators "fix key/model", not "bad gateway"). 404 (unknown model) → `AI_INVALID_RESPONSE`/502. 429/503/5xx/timeout mapping unchanged.

## 3. Redis connection / health changes

- **Config (`buildRedisConfig`):** `REDIS_URL` (either `redis://` or `rediss://`, incl. embedded `default:password@`) keeps top priority; `rediss://` TLS is honored from the scheme. Host/port path gains: whitespace trimming, password-without-username → ACL `default` (required by Redis Cloud), TLS via `REDIS_TLS=true` as before, and the existing `redis:// + REDIS_TLS=true` refusal (no silent plaintext) is preserved.
- **Health (`recordError`):** previously only `max number of clients reached` flipped `_isHealthy`; auth/refused/timeout/offline errors left a stale "healthy". Now any connection/auth/timeout/disconnect pattern marks unhealthy immediately (no disable — retries continue); the 5-error max-clients disable + 5-min cooldown is untouched.
- **Reporting:** `getCacheStats()` no longer returns bare `status: 'offline'` for "Redis unconfigured". It returns `status: 'fallback-memory', backend: 'memory'` so the admin UI can say "In-Memory Fallback — set REDIS_URL" instead of a scary red "Offline". Genuine mid-operation failures still surface `status: 'error'`. Live Redis returns `status: 'online', backend: 'redis'` as before.
- **Operator action still required:** code is now resilient, but persistence needs env: set `REDIS_URL=rediss://default:<password>@<host>:<port>` (Redis Cloud) or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` (+`REDIS_TLS=true` for TLS ports) in Vercel. Without it the app correctly runs on the memory fallback.

## 4. Verification output

- `npx tsc --noEmit` → **0 errors** (exit 0).
- `npx vitest run` → **17 files / 248 tests, all passing** (exit 0; was 245 before, +3 new Redis config tests). Full output tail:

```text
 Test Files  17 passed (17)
      Tests  248 passed (248)
   Start at  20:22:27
   Duration  27.89s (transform 1.24s, setup 0ms, collect 5.63s, tests 7.81s, environment 6.34s, prepare 4.27s)
```

Notes: the `stderr` lines in the run (`[Gemini Upstream Error] 500 …`, `Recommendation error`, `Features API error…`, `Error toggling watchlist…`) are expected server-side logs asserted by negative-path tests, not failures.
