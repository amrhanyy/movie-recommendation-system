import mongoose, { Schema } from "mongoose";

export interface IRevokedSession {
  jti: string;
  expiresAt: Date;
}

const RevokedSessionSchema = new Schema<IRevokedSession>({
  jti: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true },
});

// TTL: Mongo auto-removes the revocation when the original JWT would expire.
RevokedSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RevokedSession =
  mongoose.models.RevokedSession ||
  mongoose.model<IRevokedSession>("RevokedSession", RevokedSessionSchema);
