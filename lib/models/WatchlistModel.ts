import mongoose, { Schema } from 'mongoose';

export interface IWatchlist {
  userId: string;
  itemId: number;
  type: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  createdAt: Date;
}

const WatchlistSchema = new Schema<IWatchlist>({
  userId: { type: String, required: true },
  itemId: { type: Number, required: true },
  type: { type: String, enum: ['movie', 'tv'], required: true },
  title: { type: String, required: true },
  posterPath: { type: String, nullable: true },
  createdAt: { type: Date, default: Date.now }
});

// Create a compound index to prevent duplicates
WatchlistSchema.index({ userId: 1, itemId: 1, type: 1 }, { unique: true });

export const WatchlistModel = mongoose.models.Watchlist || mongoose.model<IWatchlist>('Watchlist', WatchlistSchema);
