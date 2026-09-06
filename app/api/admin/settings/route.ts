import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import connectToMongoDB from "@/lib/mongodb";
import mongoose from "mongoose";
import { z } from "zod";

interface FeatureSettings {
  features: {
    aiAssistant: boolean;
  };
}

const FeatureSettingsSchema = new mongoose.Schema(
  {
    features: {
      aiAssistant: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

const FeatureSettingsModel =
  mongoose.models.FeatureSettings ||
  mongoose.model("FeatureSettings", FeatureSettingsSchema);

const DEFAULT_CONFIG: FeatureSettings = {
  features: {
    aiAssistant: true,
  },
};

const settingsPostSchema = z.object({
  config: z
    .object({
      features: z
        .object({
          aiAssistant: z.boolean(),
        })
        .strict(),
    })
    .strict(),
});

export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (!authResult.ok) {
      return authResult.response;
    }

    await connectToMongoDB();

    const rawSettings = await FeatureSettingsModel.findOne({})
      .sort({ createdAt: -1 })
      .lean();

    if (!rawSettings) {
      return NextResponse.json({
        success: true,
        config: DEFAULT_CONFIG,
      });
    }

    const settings = rawSettings as Partial<FeatureSettings>;

    return NextResponse.json({
      success: true,
      config: {
        features: {
          aiAssistant:
            settings.features?.aiAssistant ??
            DEFAULT_CONFIG.features.aiAssistant,
        },
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (!authResult.ok) {
      return authResult.response;
    }

    let data: unknown;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parseResult = settingsPostSchema.safeParse(data);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid configuration", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    // Rate limit admin mutations (F-011)
    const rateLimitResponse = await applyRateLimitUser(
      request,
      authResult.user.email,
      RATE_LIMITS.adminMutation
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    await connectToMongoDB();

    // Upsert a single document instead of creating a new one each save
    const sanitizedConfig: FeatureSettings = {
      features: {
        aiAssistant: Boolean(parseResult.data.config.features.aiAssistant),
      },
    };

    const savedSettings = await FeatureSettingsModel.findOneAndUpdate(
      {},
      { $set: sanitizedConfig },
      { new: true, upsert: true }
    ).lean();

    const result = savedSettings as unknown as FeatureSettings;

    return NextResponse.json({
      success: true,
      message: "Settings saved successfully",
      config: {
        features: result.features,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
