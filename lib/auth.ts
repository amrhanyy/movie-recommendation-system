import { getServerSession } from "next-auth/next"
import { authConfig } from "@/app/auth.config"
import { NextAuthOptions, Session } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { User } from "@/lib/models/User";
import connectToMongoDB from "@/lib/mongodb";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async signIn({ user, account, profile }) {
      try {
        await connectToMongoDB();
        
        // Find existing user or create new one
        const existingUser = await User.findOne({ email: user.email });
        
        if (!existingUser) {
          console.log("Creating new user:", user.email);  // Add this line
          await User.create({
            email: user.email,
            name: user.name,
            image: user.image,
            preferences: {
              favorite_genres: [],
              selected_moods: []
            },
            created_at: new Date()
          });
        } else {
          console.log("User already exists:", user.email);  // Add this line
        }
        
        return true;
      } catch (error) {
        console.error("Error in signIn callback:", error);
        return true; // Still allow sign in even if DB save fails
      }
    },
    async session({ session, token }) {
      try {
        if (token?.id) {
          await connectToMongoDB();
          const dbUser = await User.findById(token.id);
          if (dbUser) {
            session.user = {
              ...session.user,
              id: dbUser._id.toString(),
              preferences: dbUser.preferences,
              role: dbUser.role
            };
          }
        }
      } catch (error) {
        console.error("Error in session callback:", error);
      }
      return session;
    }
  },
  // ...other options...
};

export async function getSession(): Promise<Session | null> {
  return await getServerSession(authConfig)
}

export async function getCurrentUser() {
  const session = await getSession()
  return session?.user
}

