/**
 * Server-only privacy/retention configuration (R6).
 *
 * Gives retention durations for behavioral personal data (viewing history and
 * chat history). Values are read from strict, bounded environment
 * configuration with conservative documented defaults.
 *
 * Environments must never be logged or returned to the client. Retention values
 * are not secrets, but they are server configuration, not client data.
 */

export const HISTORY_RETENTION_DAYS_DEFAULT = 180;
export const CHAT_RETENTION_DAYS_DEFAULT = 365;

export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3650;

export interface RetentionConfig {
  historyRetentionDays: number;
  chatRetentionDays: number;
}

/**
 * Parse a retention value from an environment string.
 * Invalid, empty, or out-of-bounds input safely falls back to `fallback`.
 * Bounds are enforced (MIN..MAX). Returns a whole number of days.
 */
export function parseRetentionDays(
  raw: string | undefined,
  fallback: number
): number {
  if (raw === undefined || raw === null || raw.trim() === "") {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || !Number.isFinite(n)) return fallback;
  if (n < MIN_RETENTION_DAYS) return MIN_RETENTION_DAYS;
  if (n > MAX_RETENTION_DAYS) return MAX_RETENTION_DAYS;
  return n;
}

/**
 * Build the effective retention configuration from process.env.
 * Used server-side only.
 */
export function buildRetentionConfig(
  env: NodeJS.ProcessEnv = process.env
): RetentionConfig {
  return {
    historyRetentionDays: parseRetentionDays(
      env.HISTORY_RETENTION_DAYS,
      HISTORY_RETENTION_DAYS_DEFAULT
    ),
    chatRetentionDays: parseRetentionDays(
      env.CHAT_RETENTION_DAYS,
      CHAT_RETENTION_DAYS_DEFAULT
    ),
  };
}

/**
 * Oldest viewing-history timestamp that should still be returned.
 * Records whose `viewedAt` is older than this cutoff are considered expired.
 */
export function historyCutoffDate(
  config: RetentionConfig = buildRetentionConfig()
): Date {
  return new Date(
    Date.now() - config.historyRetentionDays * 24 * 60 * 60 * 1000
  );
}

/**
 * Oldest chat `updatedAt` timestamp that should still be returned.
 */
export function chatCutoffDate(
  config: RetentionConfig = buildRetentionConfig()
): Date {
  return new Date(Date.now() - config.chatRetentionDays * 24 * 60 * 60 * 1000);
}

/**
 * A document is within retention if its reference timestamp is at or after the
 * cutoff. Used when a consumer already has a document in hand (e.g. export)
 * rather than filtering at query time.
 */
export function isWithinRetention(
  referenceDate: Date | string | number | null | undefined,
  cutoff: Date
): boolean {
  if (referenceDate === null || referenceDate === undefined) return false;
  const t = new Date(referenceDate).getTime();
  if (Number.isNaN(t)) return false;
  return t >= cutoff.getTime();
}
