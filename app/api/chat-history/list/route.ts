import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';
import { ChatHistory } from '@/lib/models/ChatHistory';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToMongoDB();
    
    const chats = await ChatHistory.find({ userId: session.user.email })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json(chats);
  } catch (error) {
    console.error('Chat History List error:', error);
    return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 });
  }
}
