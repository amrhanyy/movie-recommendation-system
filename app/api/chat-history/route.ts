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
    
    const history = await ChatHistory.findOne({ userId: session.user.email })
      .sort({ updatedAt: -1 })
      .limit(1);

    return NextResponse.json(history?.messages || []);
  } catch (error) {
    console.error('Chat History GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, response, chatId } = await request.json();
    
    await connectToMongoDB();

    let history;
    
    if (chatId) {
      // Update existing chat
      history = await ChatHistory.findOneAndUpdate(
        { _id: chatId, userId: session.user.email },
        {
          $push: {
            messages: [
              {
                role: 'user',
                content: message,
                timestamp: new Date()
              },
              {
                role: 'assistant',
                content: response,
                timestamp: new Date()
              }
            ]
          },
          $set: { updatedAt: new Date() }
        },
        { new: true }
      );
    } else {
      // Create new chat
      history = await ChatHistory.create({
        userId: session.user.email,
        messages: [
          {
            role: 'user',
            content: message,
            timestamp: new Date()
          },
          {
            role: 'assistant',
            content: response,
            timestamp: new Date()
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    return NextResponse.json(history);
  } catch (error) {
    console.error('Chat History POST error:', error);
    return NextResponse.json({ error: 'Failed to save chat history' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToMongoDB();
    
    await ChatHistory.findOneAndDelete({ userId: session.user.email });

    return NextResponse.json({ message: 'Chat history cleared' });
  } catch (error) {
    console.error('Chat History DELETE error:', error);
    return NextResponse.json({ error: 'Failed to clear chat history' }, { status: 500 });
  }
}
