import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { User } from '@/lib/models/User';

let ownerCreated = false; // Simple in-memory flag to prevent multiple uses

export async function POST(request: NextRequest) {
  try {
    // This endpoint should only work once to create the initial owner
    if (ownerCreated) {
      return NextResponse.json({ error: 'An owner has already been created' }, { status: 403 });
    }

    // Get session to verify the user is authenticated
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get the email from request body
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    await connectDB();

    // Check if any owner already exists
    const existingOwner = await User.findOne({ role: 'owner' });
    if (existingOwner) {
      ownerCreated = true; // Update the flag
      return NextResponse.json({ 
        error: 'An owner already exists', 
        ownerEmail: existingOwner.email 
      }, { status: 403 });
    }

    // Find the user to promote
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update the user to owner role
    user.role = 'owner';
    await user.save();

    // Set the flag to prevent future owner creation through this endpoint
    ownerCreated = true;

    return NextResponse.json({ 
      success: true, 
      message: `User ${email} has been promoted to owner`, 
      user: {
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error promoting user to owner:', error);
    return NextResponse.json({ error: 'Failed to promote user' }, { status: 500 });
  }
} 