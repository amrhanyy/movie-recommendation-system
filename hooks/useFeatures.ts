'use client'

import { useState, useEffect } from 'react'

interface SystemFeatures {
  aiAssistant: boolean
}

interface SystemConfig {
  features: SystemFeatures
}

/**
 * Hook to check feature availability
 */
export function useFeatures() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [features, setFeatures] = useState<SystemFeatures>({
    aiAssistant: true,
  })

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/features')
        // Parse body even on 503 (database offline) so client gets the
        // server-provided fallback { aiAssistant: false } instead of the
        // stale default { aiAssistant: true }.
        const data: SystemConfig = await response.json().catch(
          () => ({ features: { aiAssistant: false } })
        )

        if (data?.features) {
          setFeatures(data.features)
        } else {
          setFeatures({ aiAssistant: false })
        }
      } catch (err) {
        console.error('Error fetching features:', err)
        setError('Failed to load feature settings')
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

  /**
   * Check if a feature is enabled
   * @param featureName Name of the feature to check
   * @returns boolean indicating if feature is enabled
   */
  const isEnabled = (featureName: keyof SystemFeatures): boolean => {
    return features[featureName] || false
  }

  return {
    loading,
    error,
    features,
    isEnabled,
  }
} 