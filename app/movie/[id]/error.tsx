'use client'
import React from "react"
import { useEffect } from 'react'
import { Button } from '../../../components/ui/button'

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
    <div className="min-h-screen flex items-center justify-center">
      <div className="p-4 text-center">
        <h2 className="text-lg font-semibold text-red-500 mb-4">
          Failed to load movie details
        </h2>
        <div className="space-x-4">
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