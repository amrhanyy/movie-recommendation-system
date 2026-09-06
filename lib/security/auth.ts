/**
 * Central server-only authorization module.
 *
 * Every server route that requires authentication must use these helpers
 * instead of calling getServerSession directly or trusting middleware.
 *
 * Security principles:
 * - Session identity is always derived on the server via getServerSession(authOptions).
 * - Never trust user ID, email, role, admin, or owner values from the frontend.
 * - Return 401 for unauthenticated, 403 for authenticated-but-unauthorized.
 * - Role is always loaded fresh from the database, not from the JWT alone,
 *   to prevent stale elevated roles after demotion.
 */

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authOptions, type AuthUserRecord, type UserRole } from "@/lib/auth";
import { User } from "@/lib/models/User";
import connectToMongoDB from "@/lib/mongodb";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  role: UserRole;
  preferences?: {
    favorite_genres?: string[];
    selected_moods?: string[];
    historyTrackingEnabled?: boolean;
  };
}

export interface AuthResult {
  ok: true;
  user: AuthenticatedUser;
}

export interface AuthDenied {
  ok: false;
  response: NextResponse;
}

/**
 * Require an authenticated session. Returns the user or a 401 response.
 */
export async function requireSession(): Promise<AuthResult | AuthDenied> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        ),
      };
    }
    return {
      ok: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        role: session.user.role,
        preferences: session.user.preferences,
      },
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }
}

/**
 * Require an authenticated user with a fresh role from the database.
 * This prevents stale elevated roles from remaining usable after demotion.
 */
export async function requireUser(): Promise<AuthResult | AuthDenied> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) return sessionResult;

  try {
    await connectToMongoDB();
    const dbUser = await User.findOne(
      { email: sessionResult.user.email },
      { role: 1, email: 1, name: 1, image: 1, preferences: 1 }
    ).lean<AuthUserRecord>();

    if (!dbUser) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        ),
      };
    }

    return {
      ok: true,
      user: {
        id: dbUser._id.toString(),
        email: dbUser.email,
        name: dbUser.name,
        image: dbUser.image,
        role: dbUser.role,
        preferences: dbUser.preferences as
          | {
              favorite_genres?: string[];
              selected_moods?: string[];
              historyTrackingEnabled?: boolean;
            }
          | undefined,
      },
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentication failed" },
        { status: 500 }
      ),
    };
  }
}

/**
 * Require an admin or owner. Returns 401 for unauthenticated, 403 for regular users.
 */
export async function requireAdmin(): Promise<AuthResult | AuthDenied> {
  const userResult = await requireUser();
  if (!userResult.ok) return userResult;

  if (userResult.user.role !== "admin" && userResult.user.role !== "owner") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      ),
    };
  }

  return userResult;
}

/**
 * Require an owner. Returns 401 for unauthenticated, 403 for non-owners.
 */
export async function requireOwner(): Promise<AuthResult | AuthDenied> {
  const userResult = await requireUser();
  if (!userResult.ok) return userResult;

  if (userResult.user.role !== "owner") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: owner access required" },
        { status: 403 }
      ),
    };
  }

  return userResult;
}

/**
 * Check if a user has an elevated role (admin or owner).
 */
export function hasElevatedRole(role: UserRole | undefined): boolean {
  return role === "admin" || role === "owner";
}

/**
 * Assert that a user owns a resource identified by email.
 * Use for personal resources (favorites, watchlist, history, chats).
 */
export function assertResourceOwner(
  userEmail: string,
  resourceOwnerEmail: string
): boolean {
  return userEmail === resourceOwnerEmail;
}

/**
 * Prevent demotion or removal of the last owner.
 * Returns true if the operation would leave the system without an owner.
 */
export async function wouldRemoveLastOwner(
  targetUserId: string,
  newRole: UserRole
): Promise<boolean> {
  if (newRole === "owner") return false;
  if (newRole !== "user" && newRole !== "admin") return false;

  try {
    await connectToMongoDB();
    const ownerCount = await User.countDocuments({ role: "owner" });
    if (ownerCount <= 1) {
      const target = await User.findById(targetUserId);
      if (target && target.role === "owner") {
        return true;
      }
    }
    return false;
  } catch {
    return true; // fail safe: assume this is the last owner
  }
}
