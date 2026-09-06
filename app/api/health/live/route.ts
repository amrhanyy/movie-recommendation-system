import { NextResponse } from "next/server";

/**
 * GET /api/health/live
 *
 * Liveness: confirms the process is responsive. Makes NO external calls and
 * never exposes env vars, package versions, hostnames, commit hashes, uptime,
 * or internal paths. Fast, deterministic, public, minimal.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", service: "movie-recommendation-system" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}