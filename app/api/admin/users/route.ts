import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { getUserByEmail } from '@/lib/models/User';
import connectToMongoDB from '@/lib/mongodb';
import { User } from '@/lib/models/User';

// Define an interface for user document
interface UserDocument {
  _id: mongoose.Types.ObjectId;
  email: string;
  name?: string;
  image?: string;
  role?: 'user' | 'admin' | 'owner';
  created_at: Date;
  preferences?: {
    favorite_genres: string[];
    selected_moods: string[];
  };
}

// Renamed to reflect that it checks for elevated permissions
async function hasElevatedPermissions(session: any) {
  if (!session?.user?.email) return { authorized: false, role: null };
  
  // Ensure MongoDB connection
  await connectToMongoDB();
  
  // Get user details from MongoDB
  const user = await getUserByEmail(session.user.email);
  
  // Check if user has elevated permissions (admin or owner)
  const isAuthorized = user?.role === 'admin' || user?.role === 'owner';
  return { 
    authorized: isAuthorized, 
    role: user?.role || null,
    userId: user?._id.toString() || null
  };
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication and authorization
    const session = await getServerSession();
    const { authorized } = await hasElevatedPermissions(session);
    
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    await connectToMongoDB();
    
    // Get all users with pagination support
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;
    
    const users = await User.find({})
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await User.countDocuments({});
    
    return NextResponse.json({ 
      users, 
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('User management error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Check authentication and authorization
    const session = await getServerSession();
    const { authorized, role, userId: currentUserId } = await hasElevatedPermissions(session);
    
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Get user data from request body
    const data = await request.json();
    const { userId, updates } = data;
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    await connectToMongoDB();
    
    // Get the target user to determine current role
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Handle the role with safer type assertions
    const targetUserRole = (targetUser as any).role || 'user';
    
    // Permission checks based on roles
    
    // Current user can't demote themselves
    if (userId === currentUserId) {
      if ((targetUserRole === 'owner' && updates.role !== 'owner') || 
          (targetUserRole === 'admin' && updates.role !== 'admin')) {
        return NextResponse.json({ error: 'You cannot remove your own elevated role' }, { status: 403 });
      }
    }
    
    // Only owners can modify owner role
    if (targetUserRole === 'owner' && role !== 'owner') {
      return NextResponse.json({ error: 'Only owners can modify other owners' }, { status: 403 });
    }
    
    // Only owners can assign owner role
    if (updates.role === 'owner' && role !== 'owner') {
      return NextResponse.json({ error: 'Only owners can assign the owner role' }, { status: 403 });
    }
    
    // Admins can't modify other admins (only owners can)
    if (targetUserRole === 'admin' && role === 'admin' && userId !== currentUserId) {
      return NextResponse.json({ error: 'Only owners can modify other admins' }, { status: 403 });
    }
    
    // Explicitly prevent admins from modifying any admin or owner (except themselves)
    if (role === 'admin' && 
        userId !== currentUserId && 
        (targetUserRole === 'admin' || targetUserRole === 'owner')) {
      return NextResponse.json({ error: 'Admins can only modify regular users' }, { status: 403 });  
    }
    
    // Only allow updating certain fields
    const allowedUpdates = {
      role: updates.role,
      ...(updates.preferences && { preferences: updates.preferences })
    };
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: allowedUpdates },
      { new: true }
    );
    
    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('User update error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
} 