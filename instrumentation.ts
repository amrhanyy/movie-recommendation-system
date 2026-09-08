/**
 * W1-013: Boot-time environment enforcement.
 *
 * Next.js 15 instrumentation hook that runs at server startup (not build time).
 * Validates core environment variables in production and logs boot status.
 */
import { runtimeEnv } from './lib/env';
import { setBootRedisState } from './lib/boot-state';
import { buildOperationalEvent, logOperationalEvent } from './lib/operational-log';

// Boot validation error names that MUST fail production boot. Enumerated from
// lib/env.ts validateEnv source: required core vars (MONGODB_URI,
// NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TMDB_API_KEY,
// NEXTAUTH_URL), NEXTAUTH_SECRET length, NEXTAUTH_URL https, MONGODB_URI
// scheme, every NEXT_PUBLIC_* guard name, TRUSTED_PROXY_CIDRS, retention
// bounds. Everything else (REDIS_URL, REDIS_PORT) is OPTIONAL-DEGRADED.
const REDIS_DEGRADED_NAMES = new Set(["REDIS_URL", "REDIS_PORT"]);

export async function register(): Promise<void> {
  // Only enforce in Node.js runtime (server-side, not during build)
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  // Only enforce in production
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  try {
    const result = runtimeEnv();
    if (!result.parsed) {
      const coreErrors = result.errors.filter((e) => !REDIS_DEGRADED_NAMES.has(e.name));
      if (coreErrors.length === 0) {
        // Redis-class ONLY: degrade to memory fallback, never throw.
        setBootRedisState('misconfigured');
        logOperationalEvent(
          buildOperationalEvent({
            event: 'health.readiness',
            status: 'warn',
            meta: { redis: 'misconfigured', fallback: 'memory' },
          })
        );
        console.error('[BOOT] Redis misconfigured; memory fallback active');
        console.log('[BOOT] Environment validated successfully');
        console.log(`[BOOT] NODE_ENV=${process.env.NODE_ENV}`);
        return;
      }
      const errorMessages = result.errors
        .map(e => `${e.name}: ${e.issue}`)
        .join('; ');
      console.error('[BOOT] Environment validation failed:', errorMessages);
      throw new Error(`Boot environment validation failed: ${errorMessages}`);
    }

    // Log one boot event (no secrets)
    console.log('[BOOT] Environment validated successfully');
    console.log(`[BOOT] NODE_ENV=${process.env.NODE_ENV}`);
  } catch (error) {
    console.error('[BOOT] Critical environment error:', error instanceof Error ? error.message : String(error));
    throw error; // Let the server fail to start
  }
}
