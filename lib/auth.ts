import { getServerSession } from "next-auth/next"
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
      // When a user signs in, `user` is defined. Store the MongoDB _id, not the provider id.
      try {
        if (user?.email) {
          await connectToMongoDB();
          const dbUser = await User.findOne({ email: user.email });
          if (dbUser) {
            token.id = dbUser._id.toString();
          }
        }
      } catch (err) {
        console.error('JWT callback error:', err);
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
        if (token?.email) {
          await connectToMongoDB();
          const dbUser = await User.findOne({ email: token.email });
          if (dbUser) {
            session.user = {
              id: dbUser._id.toString(),
              email: dbUser.email,
              name: dbUser.name,
              image: dbUser.image,
              preferences: dbUser.preferences,
              role: dbUser.role,
            } as any;
          }
        }
      } catch (error) {
        console.error("Error in session callback:", error);
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin',
  },
  // ...other options...
};

export async function getSession(): Promise<Session | null> {
  return await getServerSession(authOptions as any)
}

export async function getCurrentUser() {
  const session = await getSession()
  return session?.user
}

