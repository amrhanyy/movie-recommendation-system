'use client'

import { SessionProvider } from "next-auth/react"
import { LanguageProvider } from "@/contexts/LanguageContext"
import { WatchlistProvider } from "@/contexts/WatchlistContext"
import { FavoritesProvider } from "@/contexts/FavoritesContext"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={0}
      refetchOnWindowFocus={false}
      basePath="/api/auth"
    >
      <LanguageProvider>
        <WatchlistProvider>
          <FavoritesProvider>
            {children}
          </FavoritesProvider>
        </WatchlistProvider>
      </LanguageProvider>
    </SessionProvider>
  )
}
