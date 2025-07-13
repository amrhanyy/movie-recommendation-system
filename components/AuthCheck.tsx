'use client'

import React, { useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { SignInButton } from './SignInButton'

interface AuthCheckProps {
  children: React.ReactNode
}

export function AuthCheck({ children }: AuthCheckProps) {
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status !== 'loading' && !session) {
      signIn()
    }
  }, [session, status])

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-cyan-500 shadow-lg shadow-cyan-500/50"></div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return <>{children}</>
}
