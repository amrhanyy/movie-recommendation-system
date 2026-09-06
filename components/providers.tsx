'use client'

import { SessionProvider } from "next-auth/react"
import { LanguageProvider } from "@/contexts/LanguageContext"
import { WatchlistProvider } from "@/contexts/WatchlistContext"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={0}
      refetchOnWindowFocus={false}
      basePath="/api/auth"
    >
      <LanguageProvider>
        <WatchlistProvider>
          {children}
        </WatchlistProvider>
      </LanguageProvider>
    </SessionProvider>
  )
}
