import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import cacheManager from '../../../../lib/cacheManager';
import mongoose from 'mongoose';
import { getUserByEmail } from '../../../../lib/models/User';

async function isAdmin(session: any) {
  if (!session?.user?.email) return false;
  
  // Ensure MongoDB connection
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI!);
  }
  
  // Get user details from MongoDB
  const user = await getUserByEmail(session.user.email);
  
  // Check if user is admin or owner
  return user?.role === 'admin' || user?.role === 'owner';
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication and authorization
    const session = await getServerSession();
    const authorized = await isAdmin(session);
    
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Get stats about Redis cache
    const stats = await cacheManager.getCacheStats();
    
    // Get action from query params
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';
    const pattern = searchParams.get('pattern') || '*';
    
    if (action === 'stats') {
      return NextResponse.json({ success: true, stats });
    }
    
    if (action === 'list') {
      // List all keys matching the pattern
      const keys = await cacheManager.findCacheKeys(pattern);
      return NextResponse.json({ 
        success: true, 
        keys,
        count: keys.length
      });
    }
    
    if (action === 'clear') {
      // Clear the entire cache (admin only)
      await cacheManager.clearAllCache();
      return NextResponse.json({ success: true, message: 'Cache cleared' });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Cache management error:', error);
    return NextResponse.json({ error: 'Failed to manage cache' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication and authorization
    const session = await getServerSession();
    const authorized = await isAdmin(session);
    
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Get request body
    const body = await request.json();
    const { action, id, type } = body;
    
    if (action === 'invalidate') {
      if (!id || !type) {
        return NextResponse.json({ error: 'ID and type are required' }, { status: 400 });
      }
      
      if (type === 'movie') {
        await cacheManager.invalidateMovieCache(id);
        return NextResponse.json({ success: true, message: `Cache for movie ${id} invalidated` });
      } 
      
      if (type === 'tv') {
        await cacheManager.invalidateTVCache(id);
        return NextResponse.json({ success: true, message: `Cache for TV show ${id} invalidated` });
      }
      
      if (type === 'home') {
        await cacheManager.invalidateHomeCache();
        return NextResponse.json({ success: true, message: 'Home page cache invalidated' });
      }
      
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Cache management error:', error);
    return NextResponse.json({ error: 'Failed to manage cache' }, { status: 500 });
  }
} 