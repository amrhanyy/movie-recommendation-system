import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getUserByEmail } from '@/lib/models/User';
import connectToMongoDB from '@/lib/mongodb';
import mongoose from 'mongoose';

// Define the settings interface
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

// Helper function to check if user is admin
async function isAdmin(session: any) {
  if (!session?.user?.email) return false;
  
  try {
    // Ensure MongoDB connection
    await connectToMongoDB();
    
    // Get user details from MongoDB
    const user = await getUserByEmail(session.user.email);
    
    // Check if user is admin or owner
    return user?.role === 'admin' || user?.role === 'owner';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Helper to save settings
async function saveSettings(config: Partial<FeatureSettings>) {
  try {
    await connectToMongoDB();
    // Validate and sanitize config
    const sanitizedConfig: FeatureSettings = {
      features: {
        aiAssistant: Boolean(config.features?.aiAssistant),
      },
    };
    
    // Save to database - create a new document each time
    const savedSettings = await FeatureSettingsModel.create(sanitizedConfig);
    return savedSettings;
  } catch (error) {
    console.error('Error saving settings:', error);
    throw new Error('Failed to save settings');
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication and authorization
    const session = await getServerSession();
    const authorized = await isAdmin(session);
    
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Connect to database
    await connectToMongoDB();
    
    // Get latest settings
    const rawSettings = await FeatureSettingsModel.findOne({}).sort({ createdAt: -1 }).lean();
    
    // If no settings exist, use default
    if (!rawSettings) {
      return NextResponse.json({ 
        success: true, 
        config: DEFAULT_CONFIG
      });
    }
    
    // Cast the document to our interface and handle any missing properties
    const settings: Partial<FeatureSettings> = rawSettings as any;
    
    return NextResponse.json({ 
      success: true, 
      config: {
        features: {
          aiAssistant: settings.features?.aiAssistant ?? DEFAULT_CONFIG.features.aiAssistant,
        },
      }
    });
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication and authorization
    const session = await getServerSession();
    const authorized = await isAdmin(session);
    
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    // Get request body
    const data = await request.json();
    
    if (!data.config) {
      return NextResponse.json({ error: 'No configuration provided' }, { status: 400 });
    }
    
    // Save new settings
    const savedConfig = await saveSettings(data.config);
    const result = savedConfig.toObject();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Settings saved successfully',
      config: {
        features: result.features,
      }
    });
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
} 