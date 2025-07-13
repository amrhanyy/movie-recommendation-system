import type { Metadata } from "next"
import { Inter } from "next/font/google"
import React from "react"
import "./globals.css"
import { Providers } from "@/components/providers"
import Link from "next/link"
import { Film } from "lucide-react"
import { AuthButton } from "@/components/AuthButton"
import { SearchBar } from "@/components/SearchBar"
import { Toaster } from 'react-hot-toast'
import { AdminNavLink } from "@/components/AdminNavLink"
import { FeatureNavItems } from "@/components/layout/FeatureNavItems"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Movie Recommendation System",
  description: "Get personalized movie recommendations based on your preferences",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="flex flex-col min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            <header className="sticky top-0 z-50 bg-gradient-to-b from-gray-900/95 to-gray-800/95 backdrop-blur-xl border-b border-gray-700/50 shadow-lg">
              <div className="container-fluid">
                <div className="flex items-center justify-between h-20 gap-6">
                  <Link 
                    href="/" 
                    className="flex items-center space-x-3 flex-shrink-0 group"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center transform group-hover:scale-105 transition-all duration-300 shadow-lg shadow-blue-500/25">
                      <Film className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                      MovieMind
                    </span>
                  </Link>
                  
                  <div className="flex-1 max-w-2xl">
                    <SearchBar />
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0">
                    <nav className="hidden md:flex items-center space-x-1">
                      {/* Feature-aware navigation items */}
                      <FeatureNavItems />
                      <AdminNavLink />
                    </nav>
                    <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-700 to-transparent" />
                    <AuthButton />
                  </div>
                </div>
              </div>
            </header>

            <main className="flex-grow">
              <div className="">{children}</div>
            </main>

            
          </div>
        </Providers>
        <Toaster position="bottom-center" />
      </body>
    </html>
  )
}

