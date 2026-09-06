import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/security/auth';
import connectToMongoDB from '@/lib/mongodb';
import { ChatHistory } from '@/lib/models/ChatHistory';
import { chatCutoffDate } from '@/lib/privacy-retention';

export async function GET() {
  try {
    const authResult = await requireUser();
    if (!authResult.ok) {
      return authResult.response;
    }

    await connectToMongoDB();

    // R6: ownership-scoped and retention-filtered list.
    const chats = await ChatHistory.find({
      userId: authResult.user.email,
      updatedAt: { $gte: chatCutoffDate() },
    })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json(chats);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch chat history' },
      { status: 500 }
    );
  }
}
