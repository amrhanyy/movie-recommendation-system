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
 *   check `mongoose.connection.readyState === 1`, then `admin().ping()` with a
 *   strict 2-second timeout. This is the lightest reliable liveness signal.
 *
 * Component states are generic only: ready / unavailable / disconnected.
 * The response NEVER contains connection strings, server names, credentials,
 * or internal error text.
 *
 * - 200 when config is valid AND the database probe succeeds.
 * - 503 (status "degraded") when config is valid but the DB is down.
 * - 503 (status "unavailable") when required configuration is invalid.
 *
 * Redis remains optional (memory fallback); its absence never affects readiness.
 */

// Shallow ping timeout (ms). Never blocks readiness for long.
const DB_PING_TIMEOUT_MS = 2000;

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
  try {
    // readyState: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting.
    if (mongoose.connection.readyState !== 1) {
      return false;
    }
    const db = mongoose.connection.db;
    if (!db) {
      return false;
    }
    // Shallow, bounded liveness check. No query, no data, no secrets.
    await withTimeout(db.admin().ping(), DB_PING_TIMEOUT_MS);
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
