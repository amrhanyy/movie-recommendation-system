import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { User } from "@/lib/models/User";
import connectDB from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    await connectDB();
    const user = await User.findOne({ email: session.user.email });
    
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user data" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const data = await request.json();
    await connectDB();

    const user = await User.findOneAndUpdate(
      { email: session.user.email },
      { $set: data },
      { new: true, upsert: true }
    );

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user data" },
      { status: 500 }
    );
  }
}
