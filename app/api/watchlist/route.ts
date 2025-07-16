import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';
import { WatchlistModel } from '@/lib/models/WatchlistModel';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToMongoDB();
    
    const items = await WatchlistModel.find({ userId: session.user.email })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(items);
  } catch (error) {
    console.error('Watchlist GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 });
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

    const item = await WatchlistModel.findOneAndUpdate(
      { 
        userId: session.user.email,
        itemId: body.itemId,
        type: body.type
      },
      {
        $set: {
          title: body.title,
          posterPath: body.posterPath,
          addedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    return NextResponse.json(item);
  } catch (error) {
    console.error('Watchlist POST error:', error);
    return NextResponse.json({ error: 'Failed to update watchlist' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');
    const type = searchParams.get('type');

    if (!itemId || !type) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    await connectToMongoDB();

    await WatchlistModel.findOneAndDelete({
      userId: session.user.email,
      itemId: parseInt(itemId),
      type
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Watchlist DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove from watchlist' }, { status: 500 });
  }
}