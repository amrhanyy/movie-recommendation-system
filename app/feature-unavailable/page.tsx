'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

export default function FeatureUnavailable() {
  const router = useRouter()

  return (
    <div className="container mx-auto flex justify-center items-center min-h-[70vh] px-4">
      <div className="w-full max-w-md border border-gray-700 bg-gray-800/40 backdrop-blur-sm shadow-xl rounded-lg overflow-hidden">
        <div className="p-6 pb-4">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-amber-600/20 rounded-full">
              <AlertTriangle className="h-10 w-10 text-amber-500" />
            </div>
          </div>
          <h2 className="text-center text-xl font-semibold text-white">Feature Unavailable</h2>
          <p className="text-center text-gray-400 mt-1">
            This feature has been disabled by the system administrator.
          </p>
        </div>
        <div className="text-center text-gray-300 pb-6 px-6">
          <p>
            The feature you are trying to access is currently unavailable. Please check back later or
            contact the administrator if you believe this is an error.
          </p>
        </div>
        <div className="flex justify-center gap-4 p-6 bg-gray-900/30 border-t border-gray-700">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-md border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            Go Back
          </button>
          
          <Link href="/">
            <button className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white">
              Go Home
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
} 