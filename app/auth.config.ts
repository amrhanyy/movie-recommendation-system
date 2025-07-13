import type { NextAuthConfig } from "@auth/core/types"
import GoogleProvider from "next-auth/providers/google"
import { createOrUpdateUser } from "@/lib/dbUtils"

// Define types for session and JWT
interface ExtendedSession {
  user: {
    id: string
    email: string
    name?: string | null
    image?: string | null
  }
}

interface ExtendedToken {
  sub?: string
  email?: string
  name?: string | null
  image?: string | null
}

export const authConfig: NextAuthConfig = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      }
    }
  },
  callbacks: {
    session: async ({ session, token }: { 
      session: ExtendedSession, 
      token: ExtendedToken 
    }) => {
      if (session?.user) {
        session.user.id = token.sub as string
      }
      return session
    },
    jwt: async ({ token, user }: {
      token: ExtendedToken,
      user: any
    }) => {
      if (user) {
        // Store the user ID in the token
        token.sub = user.id
        console.log(token.name)
        console.log(token.email)
        console.log(token.image)
        console.log(token.sub)
        // Create/update user in database
        await createOrUpdateUser({
          email: token.email!,
          name: token.name,
          image: token.image
        })
      }
      return token
    },
  },
}