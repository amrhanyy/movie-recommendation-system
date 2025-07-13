import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';
import { ChatHistory } from '@/lib/models/ChatHistory';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    await connectToMongoDB();
    
    const chat = await ChatHistory.findOne({
      _id: id,
      userId: session.user.email
    }).lean();

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json(chat);
  } catch (error) {
    console.error('Chat History GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch chat' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    await connectToMongoDB();
    
    await ChatHistory.findOneAndDelete({
      _id: id,
      userId: session.user.email
    });

    return NextResponse.json({ message: 'Chat deleted successfully' });
  } catch (error) {
    console.error('Chat History DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
  }
}
