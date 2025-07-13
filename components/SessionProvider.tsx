"use client"
import React from "react"
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"

export function SessionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return <NextAuthSessionProvider refetchInterval={0}>{children}</NextAuthSessionProvider>
}