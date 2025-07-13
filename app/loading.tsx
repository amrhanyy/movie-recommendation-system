'use client'

import React from 'react'
import { LoadingSpinner } from '../components/LoadingSpinner'

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner />
    </div>
  )
}