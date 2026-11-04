/**
 * Shared, reliable transport for the Gemini generateContent endpoint.
 *
 * PHASE 20 — consolidates the fetch + retry + timeout + error mapping +
 * redacted observability that previously duplicated across /chat,
 * /ai-recommendations, and /movie/[id]/ai-similar.
 *
 * The model and URL are resolved at CALL TIME from the validated
 * getGeminiModel() (GEMINI_MODEL env override honoured, safe default
 * gemini-3.5-flash-lite) — never a module-load static URL.
 *
 * Retry policy (single 3-attempt budget):
 *  - 5xx        -> retry, bounded exponential backoff + jitter
 *  - 429        -> retry (same budget), honouring a Retry-After header if present
 *  - timeout    -> NON-retryable (a hung upstream will not recover on retry)
 *  - 4xx(≠429)  -> NON-retryable (auth / bad request / retired model)
 *  - empty 200  -> NON-retryable (AI_INVALID_RESPONSE)
 *  - no API key -> NON-retryable, no fetch issued (AI_UNAVAILABLE)
 *
 * The API key is never included in any log line or thrown message.
 */
import {
  GEMINI_TIMEOUT_MS,
  buildGeminiGenerateUrl,
  getGeminiApiKey,
  getGeminiModel,
} from './gemini-payload';
import {
  AI_ERROR_CODES,
  AIUpstreamError,
  extractGeminiText,
  mapAIError,
  redactSensitive,
} from './ai-security';

// Single import surface for model/URL resolution (implemented in gemini-payload).
export {
  DEFAULT_GEMINI_MODEL,
  buildGeminiGenerateUrl,
  getGeminiModel,
  isSafeGeminiModel,
} from './gemini-payload';

export interface GeminiCallOptions {
  /** The generateContent body, built by the gemini-payload builders. */
  payload: Record<string, unknown>;
  /** Injectable fetch for deterministic tests; defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable backoff sleep (ms) for deterministic tests; defaults to a real delay. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter source in [0,1) for deterministic tests; defaults to Math.random. */
  rng?: () => number;
  /** Injectable structured logger; defaults to console. Every meta is redacted. */
  log?: (
    level: 'info' | 'warn' | 'error',
    message: string,
    meta: Record<string, unknown>
  ) => void;
}

const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 30_000;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 2_500;

/**
 * Parse a Retry-After header (integer seconds) into milliseconds.
 * Returns null when absent / empty / non-numeric / non-positive, and caps
 * absurd values at MAX_RETRY_AFTER_MS so a bad upstream cannot stall the app.
 */
export function parseRetryAfter(header: string | undefined): number | null {
  if (header == null) return null;
  const value = header.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(Math.round(seconds * 1000), MAX_RETRY_AFTER_MS);
}

/**
 * Send one generateContent request and return the bounded Markdown text, or
 * throw an AIUpstreamError with a stable code. See the module docblock for the
 * retry policy. All external I/O is dependency-injected so tests are
 * deterministic and perform no real network call.
 */
export async function callGemini(options: GeminiCallOptions): Promise<string> {
  const { payload } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const rng = options.rng ?? Math.random;
  const log =
    options.log ??
    ((level: 'info' | 'warn' | 'error', message: string, meta: Record<string, unknown>) => {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
      fn(message, JSON.stringify(meta));
    });

  // Model + URL resolved at call time (env override honoured, validated).
  const model = getGeminiModel();
  const url = buildGeminiGenerateUrl(model);
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    log('warn', 'gemini_call_skipped', { reason: 'missing_google_api_key', model });
    throw new AIUpstreamError(
      AI_ERROR_CODES.AI_UNAVAILABLE,
      'Gemini API key is not configured'
    );
  }

  let lastError: AIUpstreamError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let response: Response | undefined;
    let timedOut = false;
    try {
      timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      // Any AbortError here is our own timeout controller (the provider owns
      // the only signal passed to fetch). Match on Error.name so both undici's
      // DOMException and plain Error('aborted') stubs/impls classify as a
      // timeout — non-retryable — instead of retrying 3x on a 15s hang.
      timedOut = err instanceof Error && err.name === 'AbortError';
      if (timedOut) {
        const mapped = mapAIError(undefined, true);
        log('warn', 'gemini_call_failed', {
          model,
          attempt,
          status: undefined,
          code: mapped.code,
          reason: 'timeout',
          durationMs: GEMINI_TIMEOUT_MS,
        });
        // Timeout is NON-retryable: bail out immediately.
        throw new AIUpstreamError(mapped.code, 'Gemini request timed out');
      }
      // A non-timeout transport error (DNS, socket reset) is treated as
      // unavailable and may retry within the shared 3-attempt budget.
      const mapped = mapAIError(undefined, false);
      lastError = new AIUpstreamError(mapped.code, 'Gemini request failed');
      log('warn', 'gemini_call_failed', {
        model,
        attempt,
        status: undefined,
        code: mapped.code,
        reason: 'network_error',
        message: redactSensitive(err instanceof Error ? err.message : String(err)),
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    if (!response) continue;

    const status = response.status;
    if (status >= 200 && status < 300) {
      let text: string | null = null;
      try {
        const body: unknown = await response.json();
        text = extractGeminiText(body);
      } catch {
        text = null;
      }
      if (text) {
        log('info', 'gemini_call_ok', { model, attempts: attempt, status });
        return text;
      }
      // 200 but no usable candidate text -> invalid response, NON-retryable.
      const mapped = mapAIError(status, false);
      log('warn', 'gemini_call_failed', {
        model,
        attempt,
        status,
        code: mapped.code,
        reason: 'empty_response',
      });
      throw new AIUpstreamError(mapped.code, 'Gemini returned an empty response');
    }

    // Non-2xx upstream status.
    let redactedBody = '';
    try {
      const raw = await response.text();
      redactedBody = redactSensitive(raw).slice(0, 200);
    } catch {
      redactedBody = '';
    }
    const mapped = mapAIError(status, false);
    const retryable = status === 429 || status >= 500;

    if (!retryable || attempt === MAX_ATTEMPTS) {
      log('warn', 'gemini_call_failed', {
        model,
        attempt,
        status,
        code: mapped.code,
        reason: 'upstream_status',
        body: redactedBody || undefined,
      });
      throw new AIUpstreamError(mapped.code, `Gemini upstream error (${status})`);
    }

    // Retryable (429 or 5xx) and attempts remain: wait, then loop.
    const retryAfter = parseRetryAfter(response.headers.get('retry-after') ?? undefined);
    const delay =
      retryAfter ?? Math.min(Math.round(BASE_BACKOFF_MS * 2 ** (attempt - 1) + rng() * BASE_BACKOFF_MS), MAX_BACKOFF_MS);
    lastError = new AIUpstreamError(mapped.code, `Gemini upstream error (${status})`);
    log('info', 'gemini_call_retry', {
      model,
      attempt,
      status,
      code: mapped.code,
      delayMs: delay,
      retryAfter: retryAfter != null,
      body: redactedBody || undefined,
    });
    await sleep(delay);
  }

  throw lastError ?? new AIUpstreamError(AI_ERROR_CODES.AI_UNAVAILABLE, 'Gemini request failed');
}
