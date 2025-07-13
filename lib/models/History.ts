import mongoose, { Schema } from 'mongoose';

export interface IHistory {
  userId: string;
  itemId: number;
  type: 'movie' | 'tv' | 'person';
  title: string;
  posterPath: string | null;
  viewedAt: Date;
}

const HistorySchema = new Schema<IHistory>({
  userId: { type: String, required: true },
  itemId: { type: Number, required: true },
  type: { type: String, enum: ['movie', 'tv', 'person'], required: true },
  title: { type: String, required: true },
  posterPath: { type: String },
  viewedAt: { type: Date, default: Date.now }
});

// Create compound index for unique history entries per user
HistorySchema.index({ userId: 1, itemId: 1, type: 1 }, { unique: true });

export const History = mongoose.models.History || mongoose.model<IHistory>('History', HistorySchema);
