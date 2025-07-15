import { NextResponse } from "next/server";
import mongoose from 'mongoose';
import connectToMongoDB from "@/lib/mongodb";

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  preferences: { type: Object }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export async function POST(req: Request) {
  await connectToMongoDB();
  
  const { email, name, preferences } = await req.json();
  
  try {
    const user = await User.create({ email, name, preferences });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}