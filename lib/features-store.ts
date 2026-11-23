// Phase 25 (F): the ONLY definition of the FeatureSettings collection.
//
// Source-of-truth audit result: aiAssistant is owned by MongoDB
// (MONGODB_DYNAMIC_SOURCE_OF_TRUTH with a documented default). The admin API
// wrote with a schema declared inline in the route; this module is the single
// declaration so the admin writer and every reader share one collection,
// one default and one sort order. Node runtime only - never import it from
// Edge middleware.

import mongoose from 'mongoose'

export interface FeatureSettingsDocument {
  features: {
    aiAssistant: boolean
  }
}

const FeatureSettingsSchema = new mongoose.Schema(
  {
    features: {
      aiAssistant: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
)

export const FeatureSettingsModel =
  mongoose.models.FeatureSettings ||
  mongoose.model('FeatureSettings', FeatureSettingsSchema)

/**
 * Newest settings document, or null when the collection is empty.
 * Mirrors the admin read: `sort({ createdAt: -1 })` then `lean()`.
 */
export async function findLatestFeatureDoc(): Promise<FeatureSettingsDocument | null> {
  const doc = await FeatureSettingsModel.findOne({}).sort({ createdAt: -1 }).lean()
  return (doc as unknown as FeatureSettingsDocument | null) ?? null
}
