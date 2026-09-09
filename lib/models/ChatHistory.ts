import mongoose, { Schema } from 'mongoose';

export interface IChatHistory {
  userId: string;
  messages: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const ChatHistorySchema = new Schema<IChatHistory>({
  userId: { type: String, required: true },
  messages: [{
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound index for cardinality trim (W3-006b)
ChatHistorySchema.index({ userId: 1, updatedAt: -1 });

// M7 retention decision (docs/RETENTION_MIGRATION_PLAN.md): TTL stays an
// OPERATOR migration, not a code change. Do NOT uncomment these lines in an
// app commit: enabling TTL physically deletes user data and must ship with
// backups, the documented pre-checks, and CHAT_RETENTION_DAYS set.
// ChatHistorySchema.index({ updatedAt: 1 }, { expireAfterSeconds: 0 });

export const ChatHistory = mongoose.models.ChatHistory || mongoose.model<IChatHistory>('ChatHistory', ChatHistorySchema);
