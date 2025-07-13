import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';
import { FavoritesModel } from '@/lib/models/FavoritesModel';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToMongoDB();
    
    const items = await FavoritesModel.find({ userId: session.user.email })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(items);
  } catch (error) {
    console.error('Favorites GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
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

    const favorite = await FavoritesModel.findOneAndUpdate(
      { 
        userId: session.user.email,
        itemId: body.itemId,
        type: body.type
      },
      {
        $set: {
          title: body.title,
          posterPath: body.posterPath,
        }
      },
      { upsert: true, new: true }
    );

    return NextResponse.json(favorite);
  } catch (error) {
    console.error('Favorites POST error:', error);
    return NextResponse.json({ error: 'Failed to update favorites' }, { status: 500 });
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

    await FavoritesModel.findOneAndDelete({
      userId: session.user.email,
      itemId: parseInt(itemId),
      type
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Favorites DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove from favorites' }, { status: 500 });
  }
}
