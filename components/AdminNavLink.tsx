'use client'

import React, { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Shield } from 'lucide-react'

export function AdminNavLink() {
  const { data: session, status } = useSession()
  const [isAdmin, setIsAdmin] = useState<boolean>(false)

  useEffect(() => {
    async function checkAdminStatus() {
      if (status === 'authenticated' && session?.user?.email) {
        try {
          const response = await fetch('/api/user')
          const userData = await response.json()
          setIsAdmin(userData.role === 'admin' || userData.role === 'owner')
        } catch (error) {
          console.error('Error checking admin status:', error)
        }
      }
    }

    checkAdminStatus()
  }, [session, status])

  if (!isAdmin) {
    return null
  }

  return (
    <Link
      href="/admin"
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-all duration-300"
    >
      <Shield className="w-4 h-4" />
      <span className="font-medium">Admin</span>
    </Link>
  )
} 