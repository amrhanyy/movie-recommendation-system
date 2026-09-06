import { getServerSession } from "next-auth/next";
import type { NextAuthOptions } from "next-auth";
import { randomUUID } from "node:crypto";
import GoogleProvider from "next-auth/providers/google";
import { User } from "@/lib/models/User";
import { RevokedSession } from "@/lib/models/RevokedSession";
import connectToMongoDB from "@/lib/mongodb";
import { buildOperationalEvent, logOperationalEvent } from "@/lib/operational-log";

export type UserRole = "user" | "admin" | "owner";

// Server-only session identifier for JWT revocation (signOut blocklist).
// Additive only: existing session JSON gains an optional top-level `jti`.
declare module "next-auth" {
  interface Session {
    jti?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    jti?: string;
  }
}

// Minimal projected authentication-user type (matches session/JWT usage).
export interface AuthUserRecord {
  _id: { toString(): string };
  email: string;
  name?: string;
  image?: string;
  role: UserRole;
  preferences?: {
    favorite_genres?: string[];
    selected_moods?: string[];
    historyTrackingEnabled?: boolean;
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
    // W1-001: 24h sliding window. maxAge bounds stolen-JWT reuse; updateAge
    // re-issues the session at most once per hour to spread rotation cost.
    maxAge: 86400,
    updateAge: 3600,
  },
  // Explicitly set the secret. In production, NEXTAUTH_SECRET must be set.
  // If it is missing, NextAuth will throw on sign-in attempts.
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      // W1-001: assign jti once at creation; preserve on every later update
      // so signOut-time revocation of the same jti invalidates this JWT.
      // Random value: never derived from email/token/PII. crypto.randomUUID
      // is stdlib (no new dependency).
      if (typeof token.jti !== "string" || token.jti.length === 0) {
        token.jti = randomUUID();
      }
      // Snapshot after jti assignment: catch must return the pre-DB token
      // unchanged (never a partially-mutated id/role), or throw.
      const fallbackToken = { ...token };
      // When a user signs in, `user` is defined. Persist every claim the
      // session needs onto the JWT so the `session` callback can project it
      // without hitting MongoDB on the request hot path (R1).
      try {
        if (user?.email) {
          await connectToMongoDB();
          const dbUser = await User.findOne(
            { email: user.email },
            { role: 1, email: 1, name: 1, image: 1, preferences: 1 }
          ).lean<AuthUserRecord>();
          if (!dbUser) {
            // W1-003 fail-closed: DB reachable but no user record (or the
            // lookup lost) — never mint/keep a JWT with an empty/missing id.
            // Return the token unchanged only when it already carries a valid
            // id; otherwise throw so sign-in fails instead of yielding id="".
            if (
              typeof fallbackToken.id === "string" &&
              fallbackToken.id.length > 0
            ) {
              return fallbackToken;
            }
            throw new Error("JWT callback: user record unavailable");
          }
          // Mongo ObjectId is the canonical identity used across the app
          // (e.g. admin "callerId", account deletion). Keep it, not the
          // provider's `sub`, so session.user.id stays behavior-stable.
          token.id = dbUser._id.toString();
          token.role = dbUser.role;
          token.name = dbUser.name ?? user.name ?? null;
          token.picture = dbUser.image ?? user.image ?? null;
          token.preferences = dbUser.preferences as
              | {
                  favorite_genres?: string[];
                  selected_moods?: string[];
                  historyTrackingEnabled?: boolean;
                }
              | undefined;
        }
      } catch (err) {
        // W1-003 fail-closed: never return a partially-mutated token and
        // never let a caller fall back to id="". Valid prior id => return
        // the pre-DB snapshot unchanged; otherwise throw to fail sign-in.
        console.error("JWT callback error:", err);
        if (
          typeof fallbackToken.id === "string" &&
          fallbackToken.id.length > 0
        ) {
          return fallbackToken;
        }
        throw new Error("JWT callback: authentication unavailable");
      }
      // W1-003: no path yields a usable token with empty/missing id when a
      // sign-in lookup was attempted. Update-path calls (no `user`) keep
      // their existing id by construction.
      if (user?.email) {
        if (typeof token.id !== "string" || token.id.length === 0) {
          throw new Error("JWT callback: missing token id");
        }
      }
      return token;
    },
    async signIn({ user }) {
      // Find existing user or create new one.
      // If the database save fails, sign-in MUST fail (return false).
      // Previously this returned true on failure, allowing cookies
      // without a database user record.
      try {
        await connectToMongoDB();

        const existingUser = await User.findOne({ email: user.email });

        if (!existingUser) {
          await User.create({
            email: user.email,
            name: user.name,
            image: user.image,
            role: "user",
            preferences: {
              favorite_genres: [],
              selected_moods: [],
            },
            created_at: new Date(),
          });
        }

        return true;
      } catch (error) {
        console.error("Sign-in error: user creation failed for", user.email);
        // Do NOT log the full error (may contain PII or connection details)
        // Fail sign-in if the user record cannot be created.
        return false;
      }
    },
    async session({ session, token }) {
      // R1: project the session purely from the signed JWT. No MongoDB query
      // on the request hot path. Privileged routes (requireUser/requireAdmin/
      // requireOwner) still re-read a fresh role from the DB as designed.
      // W1-003: session.user.id must never be "" — a missing id means the JWT
      // callback failed closed. Reject the session so no route trusts it.
      if (token?.email) {
        const resolvedId =
          typeof token.id === "string" && token.id.length > 0
            ? token.id
            : typeof token.sub === "string" && token.sub.length > 0
              ? token.sub
              : null;
        if (!resolvedId) {
          throw new Error("Session callback: missing token id");
        }
        session.user = {
          id: resolvedId,
          email: token.email,
          name: token.name,
          image: token.picture,
          role: (token.role ?? "user") as "user" | "admin" | "owner",
          preferences: token.preferences,
        };
        // W1-001: surface the stable token jti so requireUser can enforce
        // server-side revocation on the signOut blocklist.
        if (typeof token.jti === "string" && token.jti.length > 0) {
          session.jti = token.jti;
        }
      }
      return session;
    },
  },
  events: {
    // W1-001: server-side signOut revocation. The JWT strategy is stateless,
    // so clearing the client cookie alone leaves a stolen token reusable
    // until maxAge. Inserting the jti blocklist entry closes that window.
    // Never throws (would break the signOut redirect); never logs PII/token.
    // Uses an existing ops event name: meta carries only a boolean outcome
    // (sanitizeMeta strips PII keys/values by construction).
    async signOut({ token }) {
      try {
        const jti =
          token && typeof token.jti === "string" && token.jti.length > 0
            ? token.jti
            : null;
        if (!jti) {
          logOperationalEvent(
            buildOperationalEvent({
              event: "health.readiness",
              status: "warn",
              meta: { revoked: false },
            })
          );
          return;
        }
        const exp =
          token && typeof token.exp === "number" && Number.isFinite(token.exp)
            ? token.exp
            : null;
        // Bound the blocklist row by the JWT's own expiry (or session maxAge
        // fallback); the TTL index reaps it so the collection stays bounded.
        const expiresAt = new Date((exp ?? Date.now() / 1000 + 86400) * 1000);
        await connectToMongoDB();
        await RevokedSession.updateOne(
          { jti },
          { $setOnInsert: { jti, expiresAt } },
          { upsert: true }
        );
        logOperationalEvent(
          buildOperationalEvent({
            event: "health.readiness",
            status: "ok",
            meta: { revoked: true },
          })
        );
      } catch {
        // Swallow: signOut must still clear the cookie and redirect.
        logOperationalEvent(
          buildOperationalEvent({
            event: "health.readiness",
            status: "error",
            meta: { revoked: false },
          })
        );
      }
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  // Secure cookies in production; use standard names in dev to avoid
  // __Host-/__Secure- prefix rejections over HTTP localhost.
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.callback-url" : "next-auth.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === "production" ? "__Host-next-auth.csrf-token" : "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    pkceCodeVerifier: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.pkce.code-verifier" : "next-auth.pkce.code-verifier",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
};

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user;
}