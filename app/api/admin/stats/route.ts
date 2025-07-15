import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { getUserByEmail } from '@/lib/models/User';
import connectToMongoDB from '@/lib/mongodb';
import { User } from '@/lib/models/User';
import cacheManager from '@/lib/cacheManager';

async function isAdmin(session: any) {
  if (!session?.user?.email) return false;
  
  // Ensure MongoDB connection
  await connectToMongoDB();
  
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
    
    await connectToMongoDB();
    
    // Get total users count
    const totalUsers = await User.countDocuments({});
    
    // Get cache statistics
    let cacheKeys = 0;
    try {
      const cacheStats = await cacheManager.getCacheStats();
      cacheKeys = cacheStats.totalKeys || 0;
    } catch (error) {
      console.error('Error fetching cache stats:', error);
    }
    
    // Get API requests in the last 24 hours
    // This is a placeholder. In a real app, you would have a database table/collection
    // that logs API requests with timestamps
    const apiRequests24h = await getApiRequests24h();
    
    // Get user growth data
    const growthData = await getUserGrowthData();
    
    return NextResponse.json({
      totalUsers,
      cacheKeys,
      apiRequests24h,
      growthData
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

// Placeholder function to get API requests in the last 24 hours
// In a real application, you would implement this with actual database queries
async function getApiRequests24h() {
  // This is just a placeholder for demonstration
  // In a real app, you would have a database collection tracking API requests
  // and would query it with a date range filter
  
  try {
    // Example: if you had an ApiLog collection
    // return await ApiLog.countDocuments({
    //   timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    // });
    
    // For now, just return a random number as a placeholder
    return Math.floor(Math.random() * 1000) + 500;
  } catch (error) {
    console.error('Error calculating API requests:', error);
    return 0;
  }
}

// Placeholder function to get user growth data
// In a real application, you would aggregate user signups by month from your database
async function getUserGrowthData() {
  // In a real app, you would aggregate user registrations by month
  // For example with MongoDB:
  // const result = await User.aggregate([
  //   {
  //     $group: {
  //       _id: { 
  //         year: { $year: "$createdAt" },
  //         month: { $month: "$createdAt" }
  //       },
  //       count: { $sum: 1 }
  //     }
  //   },
  //   { $sort: { "_id.year": 1, "_id.month": 1 } },
  //   { $limit: 7 }
  // ]);
  
  // For now, return mock data
  const mockData = [
    { month: 'Jan', users: 1200, trend: 5 },
    { month: 'Feb', users: 1500, trend: 25 },
    { month: 'Mar', users: 1750, trend: 16.7 },
    { month: 'Apr', users: 2100, trend: 20 },
    { month: 'May', users: 2400, trend: 14.3 },
    { month: 'Jun', users: 3100, trend: 29.6 },
    { month: 'Jul', users: 3500, trend: 12.9 },
  ];
  
  return mockData;
} 