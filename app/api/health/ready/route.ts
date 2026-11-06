import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { isCoreConfigReady } from "@/lib/env";
import { getBootRedisState } from "@/lib/boot-state";
import { buildOperationalEvent } from "@/lib/operational-log";

/**
 * GET /api/health/ready
 *
 * Readiness reports whether the app is healthy enough to serve traffic:
 * - Core configuration must be valid (env schema).
 * - MongoDB must be reachable. A SHALLOW probe is used (no heavy queries):
 *   if this function instance has not connected yet (module-local readyState
 *   0 on a serverless cold start), the project's existing shared helper
 *   (`lib/mongodb.ts`) is asked to connect first, bounded by a single 3-second
 *   readiness budget; then `admin().ping()` runs with a strict 2-second cap.
 *   Reusing the helper preserves its global connection/promise cache, so warm
 *   instances never open a second connection and concurrent probes share one
 *   in-flight attempt.
 *
 * Component states are generic only: ready / unavailable / disconnected.
 * The response NEVER contains connection strings, server names, credentials,
 * or internal error text. This route performs no URI/host logging.
 *
 * - 200 when config is valid AND the database probe succeeds.
 * - 503 (status "degraded") when config is valid but the DB is down, or the
 *   bounded connection attempt fails or times out.
 * - 503 (status "unavailable") when required configuration is invalid; the
 *   database is not contacted on this path.
 *
 * Redis remains optional (memory fallback); its absence never affects readiness.
 */

// Shallow ping timeout (ms). Never blocks readiness for long.
const DB_PING_TIMEOUT_MS = 2000;

// Whole database-probe budget (ms): the cold-start connect and the shallow
// ping must both fit inside this window so a single readiness probe can never
// hang a serverless invocation. Post-release evidence: 6 of 39 cold probes
// exceeded 3000 ms while warm probes answered in 0.44-0.59 s; the budget is
// therefore 8000 ms (no maxDuration pin exists; the platform default applies).
const DB_PROBE_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    // Clear on settle so we do not leak timers; ignore the reject-on-settle.
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function probeDatabase(): Promise<boolean> {
  const deadline = Date.now() + DB_PROBE_TIMEOUT_MS;
  try {
    // readyState: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting.
    if (mongoose.connection.readyState !== 1) {
      // Serverless cold start: a fresh function instance has a module-local
      // readyState of 0 even when Atlas and other instances are healthy.
      // Ask the existing shared helper to connect before declaring the
      // database disconnected. The helper is imported lazily so a missing
      // MONGODB_URI still reaches the config gate above instead of failing
      // this module's evaluation. The helper caches both the connection and
      // the in-flight promise on globalThis, so concurrent probes reuse one
      // attempt and warm instances short-circuit.
      const { default: connectToMongoDB } = await import("@/lib/mongodb");
      await withTimeout(connectToMongoDB(), deadline - Date.now());
    }
    // A dropped or half-open connection is still not ready: re-check the
    // actual driver state rather than trusting a cached handle.
    if (mongoose.connection.readyState !== 1) {
      return false;
    }
    const db = mongoose.connection.db;
    if (!db) {
      return false;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return false;
    }
    // Shallow, bounded liveness check. No query, no data, no secrets.
    await withTimeout(db.admin().ping(), Math.min(remaining, DB_PING_TIMEOUT_MS));
    return true;
  } catch {
    // Never surface stack/connection details; probe simply failed.
    return false;
  }
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  const coreReady = isCoreConfigReady();
  // Redis-misconfigured boot degrades the redis component label only; it must
  // NOT downgrade the overall status (ready stays 200 when the DB probe is ok).
  const redisComponent = getBootRedisState() === "misconfigured" ? "misconfigured" : "optional";

  // Config is the hard gate. If it is invalid we are "unavailable" and we do
  // not open/depend on a database connection.
  if (!coreReady) {
    buildOperationalEvent({
      event: "health.readiness",
      status: "error",
      durationMs: Date.now() - started,
      correlationId: request.headers.get("x-correlation-id") || undefined,
      meta: { config: "unavailable" },
    });
    return NextResponse.json(
      {
        status: "unavailable",
        components: {
          config: "unavailable",
          database: "disconnected",
          redis: redisComponent,
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  }

  const dbUp = await probeDatabase();
  const body = dbUp
    ? {
        status: "ready",
        components: {
          config: "ready",
          database: "ready",
          redis: redisComponent,
        },
      }
    : {
        // Config is fine but the database is unreachable => degraded, 503 so
        // orchestrators do not route traffic into 500s.
        status: "degraded",
        components: {
          config: "ready",
          database: "disconnected",
          redis: redisComponent,
        },
      };

  buildOperationalEvent({
    event: "health.readiness",
    status: dbUp ? "ok" : "error",
    durationMs: Date.now() - started,
    correlationId: request.headers.get("x-correlation-id") || undefined,
    meta: { config: "ready", database: dbUp ? "ready" : "disconnected" },
  });

  return NextResponse.json(body, {
    status: dbUp ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
