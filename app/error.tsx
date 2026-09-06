'use client'

import React, { useEffect } from 'react'
import { Button } from '../components/ui/button'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log only to the server console (not exposed to the client UI)
    // Do not log error.message or error.stack in production
    if (process.env.NODE_ENV === 'development') {
      console.error('Application error:', error)
    } else {
      // In production, log only the digest (a stable, non-sensitive identifier)
      console.error('Application error, digest:', error.digest || 'unknown')
    }
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="p-8 text-center bg-gray-800 rounded-xl border border-gray-700 max-w-lg">
        <h2 className="text-2xl font-semibold text-red-400 mb-4">
          Something went wrong!
        </h2>

        <p className="text-gray-400 mb-6">
          An unexpected error occurred. Please try again.
          {error.digest && (
            <span className="block mt-2 text-xs text-gray-500">
              Error reference: {error.digest}
            </span>
          )}
        </p>

        <div className="space-y-4">
          <Button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            Try again
          </Button>

          <div>
            <Link
              href="/"
              className="text-blue-400 hover:text-blue-300 block mt-4"
            >
              Return to home page
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
