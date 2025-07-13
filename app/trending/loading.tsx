import React from "react"
export default function Loading() {
  return (
    <div className="container-fluid py-4 px-2 sm:py-6 sm:px-4">
      <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl p-4 sm:p-8 border border-gray-700">
        <div className="text-center py-8 text-gray-300">
          Loading trending movies...
        </div>
      </div>
    </div>
  )
} 