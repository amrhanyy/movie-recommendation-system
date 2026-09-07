/**
 * W1-013: Boot-time environment enforcement.
 *
 * Next.js 15 instrumentation hook that runs at server startup (not build time).
 * Validates core environment variables in production and logs boot status.
 */
import { runtimeEnv } from './lib/env';

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
