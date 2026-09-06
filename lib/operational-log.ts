/**
 * Small structured operational-event utility (R7).
 *
 * Emits one JSON line per event for plain log aggregation, with strict
 * PII/sensitive-field rejection. Correlation IDs are validated server-side and
 * contain no PII. This is platform-neutral; an error-monitoring provider may be
 * recommended in docs but is not integrated here.
 */

export type OperationalStatus = "ok" | "error" | "warn";

export const OPERATIONAL_EVENTS = [
  "health.liveness",
  "health.readiness",
  "ops.secret_scan_review",
  "ops.deploy",
  "ops.rollback",
] as const;

export type OperationalEventName = (typeof OPERATIONAL_EVENTS)[number];

// Field names that must never appear in safe metadata, regardless of value.
// All entries are lowercase; keys are compared after lowercasing.
const BLOCKED_KEYS = new Set([
  "email",
  "user",
  "userid",
  "chat",
  "message",
  "title",
  "token",
  "cookie",
  "authorization",
  "password",
  "secret",
  "apikey",
  "connectionstring",
  "uri",
]);

// Correlation IDs are server-generated; when a client provides one it must be
// a short, plain, safe string. We only accept a validated length/alphabet.
const CORRELATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface OperationalEvent {
  ts: string;
  event: OperationalEventName;
  status: OperationalStatus;
  durationMs?: number;
  correlationId?: string;
  meta: Record<string, string | number | boolean>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate/normalize a correlation id. Rejects anything with PII or non-safe
 * characters. Returns undefined when invalid (so the server never echoes a
 * hostile client value verbatim).
 */
export function safeCorrelationId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!CORRELATION_ID_RE.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Normalize optional metadata: allow only scalar values, drop blocked key
 * names, and redact values that look like secrets/authorization.
 */
export function sanitizeMeta(meta?: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!isPlainObject(meta)) return out;
  for (const [key, value] of Object.entries(meta)) {
    const lower = key.toLowerCase();
    if (BLOCKED_KEYS.has(lower)) continue;
    if (lower.includes("token") || lower.includes("secret") || lower.includes("password")) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
    if (typeof value === "string" && looksSensitive(value)) continue;
    out[key] = value as string | number | boolean;
  }
  return out;
}

function looksSensitive(value: string): boolean {
  const lower = value.toLowerCase();
  if (lower.includes("key=") || lower.includes("secret=") || lower.includes("password=")) return true;
  if (/^(mongodb(\+srv)?|redis|rediss|https):\/\//.test(lower)) return true;
  return false;
}

/**
 * Emit a single structured operational event. Platform-neutral: writes one JSON
 * line to stdout/stderr. `console.error` is only used for error status.
 */
export function logOperationalEvent(event: OperationalEvent): void {
  const line = JSON.stringify(event);
  // Events are JSON-serializable and sanitized; plain line output is safe.
  if (event.status === "error") {
    console.error("ops", line);
  } else {
    console.log("ops", line);
  }
}

export function buildOperationalEvent(params: {
  event: OperationalEventName;
  status: OperationalStatus;
  durationMs?: number;
  correlationId?: string;
  meta?: Record<string, unknown>;
}): OperationalEvent {
  return {
    ts: new Date().toISOString(),
    event: params.event,
    status: params.status,
    ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
    ...(params.correlationId ? { correlationId: safeCorrelationId(params.correlationId) } : {}),
    meta: sanitizeMeta(params.meta),
  };
}