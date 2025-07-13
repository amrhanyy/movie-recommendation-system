'use client'

interface LoadingSpinnerProps {
  message?: string
  className?: string
  fullHeight?: boolean
}

export function LoadingSpinner({ 
  message = 'Loading...', 
  className = '',
  fullHeight = false 
}: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${fullHeight ? 'min-h-screen' : 'h-64'} ${className}`}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      {message && (
        <p className="text-gray-400 mt-4 text-sm font-medium tracking-wide">{message}</p>
      )}
    </div>
  )
}
