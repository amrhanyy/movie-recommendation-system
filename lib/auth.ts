import { getServerSession } from "next-auth/next";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { User } from "@/lib/models/User";
import connectToMongoDB from "@/lib/mongodb";

export type UserRole = "user" | "admin" | "owner";

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
    // Explicit maxAge: 30 days (NextAuth default). Documented for clarity.
    maxAge: 30 * 24 * 60 * 60,
  },
  // Explicitly set the secret. In production, NEXTAUTH_SECRET must be set.
  // If it is missing, NextAuth will throw on sign-in attempts.
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
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
          if (dbUser) {
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
        }
      } catch (err) {
        console.error("JWT callback error:", err);
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
      if (token?.email) {
        session.user = {
          id: token.id ?? token.sub ?? "",
          email: token.email,
          name: token.name,
          image: token.picture,
          role: (token.role ?? "user") as "user" | "admin" | "owner",
          preferences: token.preferences,
        };
      }
      return session;
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