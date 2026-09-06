import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: "user" | "admin" | "owner";
      preferences?: {
        favorite_genres?: string[];
        selected_moods?: string[];
      };
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    email?: string;
    name?: string | null;
    picture?: string | null;
    role?: "user" | "admin" | "owner";
    preferences?: {
      favorite_genres?: string[];
      selected_moods?: string[];
      historyTrackingEnabled?: boolean;
    };
  }
}
