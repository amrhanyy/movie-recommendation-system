import mongoose, { Schema } from "mongoose";

export interface IRating {
  userId: Schema.Types.ObjectId;
  mediaId: number;
  rating: number;
  createdAt: Date;
}

const RatingSchema = new Schema<IRating>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  mediaId: { type: Number, required: true },
  rating: { type: Number, required: true, min: 0, max: 10 },
  createdAt: { type: Date, default: Date.now }
});

// Create compound index for unique ratings per user and media
RatingSchema.index({ userId: 1, mediaId: 1 }, { unique: true });

export const Rating = mongoose.models.Rating || mongoose.model<IRating>('Rating', RatingSchema);
