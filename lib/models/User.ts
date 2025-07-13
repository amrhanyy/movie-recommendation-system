import mongoose, { Schema } from "mongoose";

export interface IUser {
  email: string;
  name?: string;
  image?: string;
  role?: string;
  preferences?: {
    favorite_genres: string[];
    selected_moods: string[];
  };
  created_at: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  name: String,
  image: String,
  role: { type: String, enum: ['user', 'admin', 'owner'], default: 'user' },
  preferences: {
    favorite_genres: [String],
    selected_moods: [String]
  },
  created_at: { type: Date, default: Date.now }
});

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export async function getUserByEmail(email: string) {
  return await User.findOne({ email });
}