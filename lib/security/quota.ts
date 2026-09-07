/**
 * Daily usage quota helper backed by MongoDB UsageQuota collection.
 *
 * Uses a single atomic findOneAndUpdate with upsert to increment the counter
 * and return post-inc value — this is safe across concurrent requests on the
 * same user+day because MongoDB update operators are atomic.
 */
import { connectToMongoDB } from '@/lib/mongodb';
import { UsageQuota } from '@/lib/models/UsageQuota';

export interface QuotaResult {
  allowed: boolean;
  /** Seconds until the user may retry (used in Retry-After header). */
  retryAfterSeconds?: number;
}

/**
 * Consume one unit of quota for the given user on the current UTC day.
 *
 * - If the counter is below the limit: increment atomically, return allowed=true.
 * - If the counter reaches/exceeds the limit after increment: return allowed=false
 *   with retryAfterSeconds computed from the document's expiresAt.
 *
 * @param userId - authenticated user email
 * @param kind - 'chats' | 'recs'
 * @param limit - max allowed per day
 */
export async function consumeQuota(
  userId: string,
  kind: 'chats' | 'recs',
  limit: number
): Promise<QuotaResult> {
  await connectToMongoDB();

  const now = new Date();
  const utcDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = utcDate.toISOString().slice(0, 10); // "YYYY-MM-DD"

  // expiresAt = end of UTC day + 2 days grace
  const expiresAt = new Date(utcDate);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 2);
  expiresAt.setUTCHours(23, 59, 59, 999);

  const result = await UsageQuota.findOneAndUpdate(
    { userId, day },
    {
      $inc: { [kind]: 1 },
      $setOnInsert: { expiresAt },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  const count = result![kind] as number;
  if (count > limit) {
    const msLeft = result!.expiresAt.getTime() - Date.now();
    const retryAfterSeconds = Math.max(1, Math.ceil(msLeft / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true };
}
