import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';
import { History } from '@/lib/models/History';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToMongoDB();
    
    const history = await History.find({ userId: session.user.email })
      .sort({ viewedAt: -1 })
      .limit(20)
      .lean();

    if (!history) {
      return NextResponse.json([]);
    }

    return NextResponse.json(history);
  } catch (error) {
    console.error('History GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    await connectToMongoDB();

    const result = await History.findOneAndUpdate(
      { 
        userId: session.user.email,
        itemId: body.itemId,
        type: body.type
      },
      {
        $set: {
          userId: session.user.email,
          title: body.title,
          posterPath: body.posterPath,
          viewedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('History POST error:', error);
    return NextResponse.json({ error: 'Failed to save to history' }, { status: 500 });
  }
}
