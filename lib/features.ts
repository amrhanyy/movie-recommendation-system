// Phase 25 (F/G): server-only feature-state evaluation.
//
// One place decides whether a flag is on, for route handlers and server
// components. The Edge middleware no longer evaluates features at all: it only
// authenticates and authorizes. That removes a per-request internal HTTP
// self-request to /api/features (the reflectionbot amplifier) and keeps
// Mongoose out of the Edge bundle.
//
// Failure policy: fail CLOSED. A database that is down, slow, or throwing is
// reported as `source: 'unavailable'` with aiAssistant disabled, so a gated
// feature can never be silently enabled by an outage (F-039).

import connectToMongoDB from '@/lib/mongodb'
import { findLatestFeatureDoc } from '@/lib/features-store'

export type FeatureStateSource = 'database' | 'default' | 'unavailable'

export interface SystemFeatures {
  aiAssistant: boolean
}

export interface FeatureState {
  ok: boolean
  source: FeatureStateSource
  features: SystemFeatures
}

/** Documented default when the collection has no row yet. */
export const DEFAULT_FEATURES: Readonly<SystemFeatures> = Object.freeze({ aiAssistant: true })

/** Fail-closed answer for an unreachable or unresponsive database. */
export const FAIL_CLOSED_FEATURES: Readonly<SystemFeatures> = Object.freeze({ aiAssistant: false })

const DEFAULT_TIMEOUT_MS = 1500

// Phase 25 (I.12): one in-flight gate evaluation at a time. Concurrent checks
// (several handlers evaluating the same request in the same runtime) share the
// work instead of issuing parallel identical reads. This is deliberately NOT a
// time-based cache: the promise is cleared the moment it settles, so the very
// next admin toggle decision reads the store again (I.6 propagation).
let inflightState: Promise<FeatureState> | null = null

type Deadline<T> = { timedOut: false; value: T } | { timedOut: true }

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<Deadline<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race<Deadline<T>>([
      promise.then((value) => ({ timedOut: false as const, value })),
      new Promise<Deadline<T>>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function readFeatureState(
  options: { timeoutMs?: number } = {}
): Promise<FeatureState> {
  if (inflightState) return inflightState

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  inflightState = resolveFeatureState(timeoutMs).finally(() => {
    inflightState = null
  })
  return inflightState
}

async function resolveFeatureState(timeoutMs: number): Promise<FeatureState> {
  try {
    const connect = await withDeadline(connectToMongoDB(), timeoutMs)
    if (connect.timedOut) {
      return { ok: false, source: 'unavailable', features: { ...FAIL_CLOSED_FEATURES } }
    }

    const doc = await withDeadline(findLatestFeatureDoc(), timeoutMs)
    if (doc.timedOut) {
      return { ok: false, source: 'unavailable', features: { ...FAIL_CLOSED_FEATURES } }
    }
    if (!doc.value) {
      return { ok: true, source: 'default', features: { ...DEFAULT_FEATURES } }
    }

    const aiAssistant = doc.value.features?.aiAssistant
    return {
      ok: true,
      source: 'database',
      features: { aiAssistant: typeof aiAssistant === 'boolean' ? aiAssistant : DEFAULT_FEATURES.aiAssistant },
    }
  } catch {
    return { ok: false, source: 'unavailable', features: { ...FAIL_CLOSED_FEATURES } }
  }
}

/**
 * A flag counts as enabled only when the read succeeded AND the stored value is
 * true. An unavailable database therefore disables the feature (fail closed).
 */
export function isAiAssistantEnabled(state: FeatureState): boolean {
  return state.ok && state.features.aiAssistant === true
}
