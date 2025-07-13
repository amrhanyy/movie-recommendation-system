'use client'

import React, { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'

interface AdminCheckProps {
  children: React.ReactNode
}

export function AdminCheck({ children }: AdminCheckProps) {
  const { data: session, status } = useSession()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkAdminStatus() {
      if (status === 'authenticated' && session?.user?.email) {
        try {
          const response = await fetch('/api/user')
          const userData = await response.json()
          setIsAdmin(userData.role === 'admin' || userData.role === 'owner')
        } catch (error) {
          console.error('Error checking admin status:', error)
          setIsAdmin(false)
        }
      } else if (status !== 'loading') {
        setIsAdmin(false)
      }
    }

    checkAdminStatus()
  }, [session, status])

  if (status === 'loading' || isAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-cyan-500 shadow-lg shadow-cyan-500/50"></div>
      </div>
    )
  }

  if (!isAdmin) {
    redirect('/')
  }

  return <>{children}</>
} 