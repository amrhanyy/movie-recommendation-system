import { NextRequest, NextResponse } from 'next/server'
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

export async function GET(request: NextRequest) {
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
    const settings: Partial<FeatureSettings> = rawSettings as any;
    
    // Return settings with fallbacks to default values if properties are missing
    return NextResponse.json({
      features: {
        aiAssistant: settings.features?.aiAssistant ?? DEFAULT_CONFIG.features.aiAssistant,
      }
    });
  } catch (error) {
    console.error('Features API error:', error);
    // If there's an error, return default config
    return NextResponse.json(DEFAULT_CONFIG);
  }
} 