/**
 * W3-006b: Cardinality cap with trim.
 *
 * After creating/updating a document, if the user has more than maxCount
 * documents, keep only the newest maxCount by sortField and delete the rest.
 */
import { connectToMongoDB } from '@/lib/mongodb';
import type { Model } from 'mongoose';

export interface TrimOptions {
  userId: string;
  maxCount: number;
  sortField: string; // e.g. 'updatedAt' or 'viewedAt'
}

/**
 * Trim a collection for a user to keep only the newest maxCount documents.
 * Returns true if trimming occurred.
 */
export async function trimCollection(
  model: Model<unknown>,
  opts: TrimOptions
): Promise<boolean> {
  const { userId, maxCount, sortField } = opts;

  const count = await model.countDocuments({ userId });
  if (count <= maxCount) {
    return false;
  }

  // Find IDs to keep (newest maxCount)
  const keepDocs = await model
    .find({ userId })
    .sort({ [sortField]: -1 })
    .limit(maxCount)
    .lean();

  const keepIds = keepDocs.map((doc) => (doc as Record<string, unknown>)._id);

  if (keepIds.length === 0) {
    return false;
  }

  // Delete the oldest documents
  await model.deleteMany({
    userId,
    _id: { $nin: keepIds },
  });

  return true;
}
