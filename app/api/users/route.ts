import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/security/auth";

/**
 * POST /api/users
 *
 * Previously: public, unauthenticated user creation with a duplicate User schema.
 * Now: owner-only user administration with strict validation.
 *
 * Regular user accounts are created automatically through the authenticated
 * NextAuth Google sign-in flow (see lib/auth.ts signIn callback).
 * This route is restricted to owners for administrative user management only.
 */

export async function POST() {
  // Require owner-level authentication
  const authResult = await requireOwner();
  if (!authResult.ok) {
    return authResult.response;
  }

  // User creation through this endpoint is intentionally disabled.
  // Users are created exclusively via the Google OAuth sign-in flow.
  // If administrative user creation is needed in the future, implement
  // it with strict validation and a separate User-admin schema.
  return NextResponse.json(
    {
      error:
        "User creation is handled through Google sign-in. This endpoint is restricted.",
    },
    { status: 403 }
  );
}
