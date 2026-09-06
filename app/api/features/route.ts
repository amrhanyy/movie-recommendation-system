import { NextResponse } from 'next/server'
import connectToMongoDB from '@/lib/mongodb'
import mongoose from 'mongoose'

// Define the settings interface to help TypeScript
interface FeatureSettings {
  features: {
    aiAssistant: boolean;
  };
}

// Define a feature settings schema
const FeatureSettingsSchema = new mongoose.Schema({
  features: {
    aiAssistant: { type: Boolean, default: true },
  }
}, { timestamps: true });

// Get or create the model (prevent recompile errors)
const FeatureSettingsModel = mongoose.models.FeatureSettings || 
  mongoose.model('FeatureSettings', FeatureSettingsSchema);

// Default configuration
const DEFAULT_CONFIG: FeatureSettings = {
  features: {
    aiAssistant: true,
  }
};

export async function GET() {
  try {
    // Connect to database
    await connectToMongoDB();
    
    // Try to get settings from database
    const rawSettings = await FeatureSettingsModel.findOne({}).sort({ createdAt: -1 }).lean();
    
    // If no settings exist, create default
    if (!rawSettings) {
      await FeatureSettingsModel.create(DEFAULT_CONFIG);
      return NextResponse.json(DEFAULT_CONFIG);
    }
    
    // Cast the document to our interface and handle any missing properties
    const settings: Partial<FeatureSettings> = rawSettings as unknown as Partial<FeatureSettings>;
    
    // Return settings with fallbacks to default values if properties are missing
    return NextResponse.json({
      features: {
        aiAssistant: settings.features?.aiAssistant ?? DEFAULT_CONFIG.features.aiAssistant,
      }
    });
  } catch {
    // Log without the error object: never surface stack traces/DB details
    // to stdout/stderr (L-02 + no-PII logging policy).
    console.error('Features API error: database unavailable or misconfigured');
    // L-02: fail closed. On database failure, report 503 and force
    // aiAssistant to false so clients cannot read a stale "enabled" flag.
    return NextResponse.json(
      {
        features: {
          aiAssistant: false,
        },
      },
      { status: 503 }
    );
  }
} 