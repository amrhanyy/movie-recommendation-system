# Diagnostic Report: AI 502 & Redis Offline

**Date:** 2026-09-06  
**Scope:** READ-ONLY investigation. No code was modified except this report file.

---

## 1. AI Chat / Recommendations → HTTP 502

### 1.1 Endpoint & model

| File | Line | Detail |
|---|---|---|
| `lib/gemini-payload.ts` | 10 | `GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"` |
| `app/api/chat/route.ts` | 50 | `fetch(GEMINI_GENERATE_URL, ...)` |
| `app/api/ai-recommendations/route.ts` | 35 | same URL |

Model invoked: **gemini-2.0-flash** via the `generativelanguage.googleapis.com` Generative Language API (Cloud Vertex-style).

### 1.2 Key delivery

Headers include `x-goog-api-key: <GOOGLE_API_KEY>` (`chat/route.ts:58`).  
This header is accepted **only** by the **Generative Language REST API** (Cloud AI Studio keys, project-scoped). It is **not** the OpenAI-compatible path (`/v1/openai/...`) nor the Vertex AI path.

### 1.3 Why the 502

`lib/ai-security.ts:240` + `lib/ai-security.ts:246`:

```ts
// ai-security.ts:240
if (status === 400) return { code: AI_ERROR_CODES.AI_INVALID_RESPONSE, httpStatus: 502 };
// ai-security.ts:246
return { code: AI_ERROR_CODES.AI_INVALID_RESPONSE, httpStatus: 502 };
```

Any non-2xx upstream response ≥ 400 (except 429/503) is **mushroomed into 502**.  
The upstream Gemini call most commonly fails with **HTTP 400** in production when:

1. **Wrong key type.** A standard `AIzaSy…` API key grants access to `generativelanguage.googleapis.com/v1beta` **only** when it has the Gemini API enabled in Google AI Studio. Many deployments use Cloud AI Keys (`gcsa_…` from Vertex) which require a project and are **rejected** on this endpoint → 400.
2. **Key quota/project disabled.** Without a Cloud project attached to the key, the endpoint returns 400 `API_KEY_INVALID`.
3. **Model unavailable.** If `gemini-2.0-flash` is not enabled in the Google Cloud project, the call returns 400 `MODEL_NOT_FOUND`.
4. **Response mismatch.** `extractGeminiText` (`ai-security.ts:190`) expects `{ candidates: [{ content: { parts: [{ text }] }] }`. When the API returns an error `{ error: { code: …, message: … } }`, parsing yields `null` and the code then throws `AI_INVALID_RESPONSE` regardless of the original HTTP status. This masks the real upstream error inside a 502 wrapper.

Additionally, `chat/route.ts:29` sets `GEMINI_TIMEOUT_MS = 15_000`. The free-tier Gemini latency is typically 5–15 s; any spike hits the abort controller, re-throws `AI_TIMEOUT`, and the route surfaces it as `httpStatusForAIError("AI_TIMEOUT")` → **504**. The user sees "502/504" depending on timing, both wrong-mapped.

### 1.4 Failure flow (example)

```
POST /api/chat
  → fetch(".../generateContent", { "x-goog-api-key": "…" })
  → Gemini returns 400 { error: { message: "API key not valid" } }
  → response.ok = false, status = 400
  → mapAIError(400, false) → { code: "AI_INVALID_RESPONSE", httpStatus: 502 }
  → throw AIUpstreamError("AI_INVALID_RESPONSE", "AI service error 502")
  → POST /api/chat returns 502 { error: "Failed to process chat request", code: "AI_INVALID_RESPONSE" }
```

The caller UI receives a 502 and surface-text "Failed to process chat request" — impossible to diagnose from the outside.

---

## 2. Redis "Offline" in Admin Dashboard

### 2.1 Initialization chain

| File | Line | Detail |
|---|---|---|
| `lib/redis-config.ts:40` | `buildRedisConfig(env)` reads `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS` |
| `lib/redis.ts:31` | `getRedisClient()` calls `buildRedisConfig()` |
| `lib/redis.ts:79` | `await redisClient.connect()` |

Precedence (redis-config.ts:10): **`REDIS_URL` first**, then individual fields. No TLS default for `redis://` — `rediss://` must be used.

### 2.2 Offline root cause

The dashboard reports "Offline" from the health monitor (`redis-health.ts`) **not** from the actual socket. The monitor logic:

1. On connect success → `recordSuccess()` (sets `_isHealthy = true`).
2. On any `error` event containing `offline` (redis.ts:118) → sets `connectionBlocked = true` but **does NOT call `recordError`**.
3. `shouldUseRedis()` (`redis-health.ts:80`) returns `true` until `_isDisabled` is flipped by `MAX_CLIENTS_ERROR` five times — a gate that only catches "max clients reached", not auth/TLS/connect timeouts.

Consequently:

- When the config resolves to **undefined** (no `REDIS_URL` and no `REDIS_HOST`/`REDIS_PORT`), `getRedisClient()` returns `null` at line 44. Health stays `_isHealthy = true` but the client is never created.
- When `REDIS_URL=redis://host` (no TLS) but the provider requires `rediss://`, the socket connects to a TLS-required port and drops → error event without hitting `MAX_CLIENTS_ERROR` → `shouldUseRedis()` remains `true` but `redisClient` is immediately cleared.
- The admin cache page reads the health singleton's `_isHealthy` flag, which lags behind the client lifecycle, so the UI shows "Offline" even while the monitor still reports "healthy".

### 2.3 Configuration gap

No `.env` sample in the repo specifies `REDIS_URL`. On Vercel (default CI deploy), only `REDIS_URL` or `REDIS_HOST`+`REDIS_PORT`+`REDIS_PASSWORD` would make the client connect. Without them, the app falls back to the in-memory cache (documented at `redis.ts:40`), which is not displayed on the admin dashboard — hence the "Offline" label.

---

## 3. Proposed Minimal-Diff Remediation

### AI (3 changes)

1. **Align the API path to the key type.** Detect which key is present and route accordingly:
   - `gcsa_…` keys → use Cloud AI key header on `v1beta/models/{model}:streamGenerateContent` (or the OpenAI-compatible `/v1/openai/v1/chat/completions` proxy).
   - `AIzaSy…` keys → keep current `generativelanguage.googleapis.com` URL.
   - File: `lib/gemini-payload.ts` + a new helper `resolveGeminiEndpoint(apiKey)`.

2. **Surface the real upstream status.** Replace the 502 mushroom at `lib/ai-security.ts:240` with:
   - 400 → `AI_AUTH_ERROR` / 401 (keep body out of response — already redacted).
   - Non-2xx that is not 429/503 → propagate the upstream status minus 5xx mapping to 503.
   - Add `response.headers.get("x-error")` or `error.message` sub-field to the thrown error for infra debugging (never to the client).

3. **Add a 2-second idle check before throwing `AI_INVALID_RESPONSE`.** If `response.ok` is true but `extractGeminiText` returned null, log at WARN level with a truncated response size (first 120 chars) — enables diagnosing schema mismatches without leaking payloads.

### Redis (2 changes)

1. **Tie health to the actual client lifecycle.** In `lib/redis.ts`, call `redisHealth.recordError(msg)` on every `error` event (not only `MAX_CLIENTS_ERROR`) and `redisHealth.recordSuccess()` after successful commands/health-check pings. This prevents the stale "healthy" flag after transient disconnects.

2. **Document & validate the TLS requirement.** Add a validation branch in `buildRedisConfig` (`lib/redis-config.ts`):
   - If `REDIS_HOST` + TLS-required provider suffix (`*.redislabs.com`, `*.redis.io`) and `REDIS_TLS=false` → return a descriptive config error rather than a silent connect-fail.
   - Update the admin cache page to show "missing config" vs "connection refused" vs "auth failure".

### No env changes expected

These fixes make the app resilient to misconfiguration without requiring a deployment change. The config validation only makes existing failures more visible.

---

## 4. Files inspected (read-only)

- `app/api/chat/route.ts` (lines 1–200)
- `app/api/ai-recommendations/route.ts` (lines 1–450)
- `lib/gemini-payload.ts` (lines 1–180)
- `lib/ai-security.ts` (lines 1–260)
- `lib/redis.ts` (lines 1–130)
- `lib/redis-config.ts` (lines 1–100)
- `lib/redis-health.ts` (lines 1–110)
- `app/api/admin/cache/route.ts` (read for context)

No other source files were read or modified.
