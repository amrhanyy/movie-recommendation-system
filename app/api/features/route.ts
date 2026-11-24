import { NextResponse } from 'next/server'
import { readFeatureState } from '@/lib/features'

// Phase 25 (G): public read of the feature flags, served from the shared Node
// feature service. The response is private and non-cacheable: it is read on
// demand by the client store, must reflect an admin toggle immediately, and a
// shared CDN copy would pin a stale flag for every visitor.
const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  const state = await readFeatureState()

  return NextResponse.json(
    { features: state.features, source: state.source },
    { status: state.ok ? 200 : 503, headers: PRIVATE_NO_STORE }
  )
}
