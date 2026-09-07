import { NextRequest, NextResponse } from "next/server";
import { requireUser, assertSameOriginOrReject } from "@/lib/security/auth";
import { applyRateLimitUser, RATE_LIMITS } from "@/lib/security/rateLimit";
import { historyItemSchema } from "@/lib/security/schemas";
import connectToMongoDB from "@/lib/mongodb";
import { History } from "@/lib/models/History";
import { historyCutoffDate } from "@/lib/privacy-retention";

/**
 * Whether viewing-history collection is currently enabled for the user.
 * The server is the source of truth; a client cannot toggle collection by
 * itself. Defaults to enabled when the value is absent (preserves existing
 * behavior; the R6 migration is documented). No title/email is logged.
 */
function isHistoryTrackingEnabled(preferences: unknown): boolean {
  if (!preferences || typeof preferences !== "object") return true;
  const enabled = (preferences as Record<string, unknown>).historyTrackingEnabled;
  return enabled !== false;
}

/**
 * Resolve the authenticated email and the server-side tracking preference.
 * Consent is always re-read here (never trusted from the client).
 */
async function resolveHistoryContext(): Promise<
  | { ok: true; email: string; trackingEnabled: boolean }
  | { ok: false; response: NextResponse }
> {
  const authResult = await requireUser();
  if (!authResult.ok) return { ok: false, response: authResult.response };

  let trackingEnabled = true;
  try {
    await connectToMongoDB();
    const { User } = await import("@/lib/models/User");
    const doc = await User.findOne({ email: authResult.user.email })
      .select({ preferences: 1 })
      .lean<{ preferences?: unknown }>();
    trackingEnabled = isHistoryTrackingEnabled(doc?.preferences);
  } catch {
    // DB read of the preference failed; fail open for reads but still honor the
    // caller's explicit GET/POST path via the same helper. Nothing is logged.
    trackingEnabled = true;
  }

  return { ok: true, email: authResult.user.email, trackingEnabled };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveHistoryContext();
    if (!ctx.ok) return ctx.response;

    const readLimit = await applyRateLimitUser(request, ctx.email, RATE_LIMITS.read);
    if (readLimit) return readLimit;

    await connectToMongoDB();

    const history = await History.find({
      userId: ctx.email,
      viewedAt: { $gte: historyCutoffDate() },
    })
      .sort({ viewedAt: -1 })
      .limit(20)
      .lean();

    return NextResponse.json(history || []);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveHistoryContext();
    if (!ctx.ok) return ctx.response;

    const originRejection = assertSameOriginOrReject(request);
    if (originRejection) return originRejection;

    const writeLimit = await applyRateLimitUser(request, ctx.email, RATE_LIMITS.listWrite);
    if (writeLimit) return writeLimit;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Strict validation rejects unknown fields, including any client-supplied
    // userId/email/role identity.
    const parseResult = historyItemSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Server-verified consent: do not record history when tracking is off.
    if (!ctx.trackingEnabled) {
      return NextResponse.json(
        { success: false, reason: "tracking_disabled" },
        { status: 200 }
      );
    }

    await connectToMongoDB();

    const result = await History.findOneAndUpdate(
      {
        userId: ctx.email,
        itemId: parseResult.data.itemId,
        type: parseResult.data.type,
      },
      {
        $set: {
          title: parseResult.data.title,
          posterPath: parseResult.data.posterPath ?? null,
          viewedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to save to history" },
      { status: 500 }
    );
  }
}

// DELETE all viewing history for the authenticated user.
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await resolveHistoryContext();
    if (!ctx.ok) return ctx.response;

    const originRejection = assertSameOriginOrReject(request);
    if (originRejection) return originRejection;

    const rateLimitResponse = await applyRateLimitUser(
      request,
      ctx.email,
      RATE_LIMITS.historyDelete
    );
    if (rateLimitResponse) return rateLimitResponse;

    await connectToMongoDB();

    await History.deleteMany({ userId: ctx.email });

    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to clear history" },
      { status: 500 }
    );
  }
}
