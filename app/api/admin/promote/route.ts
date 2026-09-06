import { NextResponse } from "next/server";

/**
 * POST /api/admin/promote
 *
 * DISABLED — owner bootstrap is no longer available through HTTP.
 *
 * Owner creation must be an explicit operational command, not an API endpoint.
 * Use the CLI: `node scripts/promote-owner.js <email>`
 *
 * This route always returns 404 and never reveals whether an owner exists
 * or what the owner's email is.
 */

export async function POST() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404 }
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404 }
  );
}
