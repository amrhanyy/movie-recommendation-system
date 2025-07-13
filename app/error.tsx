'use client'

import React, { useEffect } from 'react'
import { Button } from '../components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Error details:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="p-8 text-center bg-gray-800 rounded-xl border border-gray-700 max-w-lg">
        <h2 className="text-2xl font-semibold text-red-400 mb-4">
          Something went wrong!
        </h2>
        
        <div className="bg-gray-900 p-4 rounded text-left mb-6 overflow-auto max-h-40">
          <p className="text-gray-300 font-mono text-sm">
            {error.message || 'An unexpected error occurred'}
          </p>
          {error.stack && (
            <details className="mt-2">
              <summary className="text-gray-400 cursor-pointer">Stack trace</summary>
              <pre className="text-gray-400 text-xs mt-2 overflow-auto">
                {error.stack}
              </pre>
            </details>
          )}
        </div>
        
        <div className="space-y-4">
          <Button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            Try again
          </Button>
          
          <div>
            <a 
              href="/"
              className="text-blue-400 hover:text-blue-300 block mt-4"
            >
              Return to home page
            </a>
          </div>
        </div>
      </div>
    </div>
  )
} 