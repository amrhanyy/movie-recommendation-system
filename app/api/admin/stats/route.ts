import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import { User } from "@/lib/models/User";
import connectToMongoDB from "@/lib/mongodb";
import cacheManager from "@/lib/cacheManager";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (!authResult.ok) {
      return authResult.response;
    }

    const readLimit = await applyRateLimitUser(request, authResult.user.email, RATE_LIMITS.read);
    if (readLimit) return readLimit;

    await connectToMongoDB();

    // Total users count — truthful metric
    const totalUsers = await User.countDocuments({});

    // Cache statistics — truthful metric from cacheManager
    let cacheKeys = 0;
    try {
      const cacheStats = await cacheManager.getCacheStats();
      cacheKeys = typeof cacheStats.totalKeys === 'number' ? cacheStats.totalKeys : 0;
    } catch {
      // cacheStats unavailable
    }

    // API requests: unavailable (no request logging collection exists)
    // Return null instead of mock/random data (F-046 fix)
    const apiRequests24h = null;

    // User growth: real aggregation from the database
    const growthData = await getUserGrowthData();

    return NextResponse.json({
      totalUsers,
      cacheKeys,
      apiRequests24h,
      growthData,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}

/**
 * Real user growth aggregation from MongoDB.
 * Groups user signups by month using the created_at field.
 */
async function getUserGrowthData() {
  try {
    const result = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$created_at" },
            month: { $month: "$created_at" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      { $limit: 12 },
    ]);

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    return result.map((entry, index) => {
      const prevCount = index > 0 ? result[index - 1].count : 0;
      const trend =
        prevCount > 0
          ? Math.round(((entry.count - prevCount) / prevCount) * 1000) / 10
          : 0;
      return {
        month: `${monthNames[entry._id.month - 1]} ${entry._id.year}`,
        users: entry.count,
        trend,
      };
    });
  } catch {
    return [];
  }
}
