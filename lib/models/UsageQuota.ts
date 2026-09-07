import mongoose, { Schema } from 'mongoose';

export interface IUsageQuota {
  userId: string;
  day: string; // "YYYY-MM-DD" UTC
  chats: number;
  recs: number;
  expiresAt: Date;
}

const UsageQuotaSchema = new Schema<IUsageQuota>({
  userId: { type: String, required: true },
  day: { type: String, required: true },
  chats: { type: Number, default: 0 },
  recs: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

// Unique compound index for atomic upsert
UsageQuotaSchema.index({ userId: 1, day: 1 }, { unique: true });

// TTL index on expiresAt (expire after 0 seconds means immediate expiry)
UsageQuotaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UsageQuota = mongoose.models.UsageQuota ||
  mongoose.model<IUsageQuota>('UsageQuota', UsageQuotaSchema);
