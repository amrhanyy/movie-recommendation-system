'use client'

// Phase 25 (H): ONE client-side feature-state store.
//
// Before: every consumer of useFeatures() fired its own request, and the
// language provider fired a second, dead request to the same endpoint (it read
// a `content.defaultLanguage` field the endpoint never returned). A page with
// three feature-aware components therefore produced several identical
// requests per navigation.
//
// Now: concurrent consumers share one in-flight promise, a successful answer is
// reused for a bounded TTL, and a transport failure is deliberately NOT cached
// so recovery is possible on the next call. There is no polling loop.

import { useEffect, useState } from 'react'

export interface SystemFeatures {
  aiAssistant: boolean
}

export type ClientFeatureSource = 'server' | 'fallback'

export interface ClientFeatureState {
  features: SystemFeatures
  source: ClientFeatureSource
}

const FALLBACK_STATE: ClientFeatureState = Object.freeze({
  features: Object.freeze({ aiAssistant: false }),
  source: 'fallback' as const,
})

const CACHE_TTL_MS = 60_000

let cachedState: ClientFeatureState | null = null
let cachedAt = 0
let inFlight: Promise<ClientFeatureState> | null = null
let currentState: ClientFeatureState | null = null
const listeners = new Set<(state: ClientFeatureState) => void>()

function remember(state: ClientFeatureState): ClientFeatureState {
  cachedState = state
  cachedAt = Date.now()
  currentState = state
  for (const listener of listeners) listener(state)
  return state
}

/**
 * Shared loader. Satisfies one of: bounded cache, in-flight promise, or a new
 * request. A non-ok response body (the server's fail-closed 503) is
 * authoritative and IS cached; a thrown transport error is not.
 */
export async function loadFeatureState(): Promise<ClientFeatureState> {
  if (cachedState && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedState
  }
  if (inFlight) {
    return inFlight
  }

  inFlight = (async () => {
    try {
      const response = await fetch('/api/features', { headers: { accept: 'application/json' } })
      const body = await response.json().catch(() => null)
      const stored = body?.features?.aiAssistant
      const aiAssistant = typeof stored === 'boolean' ? stored : false
      const state: ClientFeatureState = {
        features: { aiAssistant },
        source: response.ok ? 'server' : 'fallback',
      }
      return remember(state)
    } catch {
      // Transport failure: fall back for this call only, keep retries open.
      return FALLBACK_STATE
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Test-only reset. Not exported to application code paths. */
export function resetFeatureStateForTests(): void {
  cachedState = null
  cachedAt = 0
  inFlight = null
  currentState = null
  listeners.clear()
}

export function useFeatures() {
  const [state, setState] = useState<ClientFeatureState | null>(currentState)
  const [loading, setLoading] = useState(currentState === null)

  useEffect(() => {
    let active = true
    const listener = (next: ClientFeatureState) => {
      if (!active) return
      setState(next)
      setLoading(false)
    }
    listeners.add(listener)

    loadFeatureState()
      .then((next) => {
        if (!active) return
        setState(next)
        setLoading(false)
      })
      .catch(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      listeners.delete(listener)
    }
  }, [])

  const features = state?.features ?? FALLBACK_STATE.features
  const isEnabled = (featureName: keyof SystemFeatures): boolean => features[featureName] ?? false

  return { features, loading, isEnabled }
}
