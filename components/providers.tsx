'use client'

import { SessionProvider } from "next-auth/react"
import { LanguageProvider } from "@/contexts/LanguageContext"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider 
      refetchInterval={0} 
      refetchOnWindowFocus={false}
      basePath="/api/auth"
    >
      <LanguageProvider>
        {children}
      </LanguageProvider>
    </SessionProvider>
  )
}