'use client'

import React, { useEffect } from 'react'
import { Button } from '../../components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="container-fluid py-4 px-2 sm:py-6 sm:px-4">
      <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl p-8 border border-gray-700">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-400 mb-4">
            Failed to load trending movies
          </h2>
          <Button
            onClick={reset}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Try again
          </Button>
        </div>
      </div>
    </div>
  )
}