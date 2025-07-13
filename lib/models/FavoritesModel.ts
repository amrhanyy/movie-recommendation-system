import mongoose, { Schema } from 'mongoose';

export interface IFavorite {
  userId: string;
  itemId: number;
  type: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  createdAt: Date;
}

const FavoriteSchema = new Schema<IFavorite>({
  userId: { type: String, required: true },
  itemId: { type: Number, required: true },
  type: { type: String, enum: ['movie', 'tv'], required: true },
  title: { type: String, required: true },
  posterPath: { type: String, nullable: true },
  createdAt: { type: Date, default: Date.now }
});

FavoriteSchema.index({ userId: 1, itemId: 1, type: 1 }, { unique: true });

export const FavoritesModel = mongoose.models.Favorites || mongoose.model<IFavorite>('Favorites', FavoriteSchema);
