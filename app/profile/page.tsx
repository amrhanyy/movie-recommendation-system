'use client'

import React from 'react'
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Heart, ExternalLink } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar"
import { LoadingSpinner } from "../../components/LoadingSpinner"
import WatchHistory from "../../components/WatchHistory"
import Watchlist from "../../components/Watchlist"
import { Favorites } from '../../components/Favorites'
import Link from 'next/link'

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  if (status === "loading") {
    return <LoadingSpinner message="Loading your profile..." />
  }

  if (!session) {
    router.push('/auth/signin')
    return null
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-8">
        {/* Profile Header */}
        <div className="bg-gray-800/30 rounded-3xl border border-gray-700/50 p-8
                      shadow-[0_0_50px_-12px] shadow-cyan-500/10">
          <div className="flex items-center gap-6">
            <Avatar className="h-24 w-24 ring-4 ring-cyan-500/20">
              <AvatarImage src={session.user?.image ?? undefined} />
              <AvatarFallback className="bg-cyan-500/10 text-cyan-400 text-2xl">
                {session.user?.name?.[0] ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold text-white mb-2">
                {session.user?.name}
              </h1>
              <p className="text-gray-400">
                {session.user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Recently viewed*/}
        <div className="bg-gray-800/30 rounded-3xl border border-gray-700/50 p-6
                      shadow-[0_0_50px_-12px] shadow-cyan-500/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Recently Viewed</h2>
          </div>
          <WatchHistory limit={6} />
        </div>

        {/* Watchlist */}
        <div className="bg-gray-800/30 rounded-3xl border border-gray-700/50 p-6
                      shadow-[0_0_50px_-12px] shadow-cyan-500/10">
          <div className="flex items-center justify-between mb-4">
            <Link href="/watchlist" className="group flex items-center gap-2 hover:text-cyan-400 transition-colors">
              <h2 className="text-xl font-semibold text-white group-hover:text-cyan-400 transition-colors">Your Watchlist</h2>
              <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-cyan-400 transition-colors" />
            </Link>
            <Link href="/watchlist" className="text-sm text-cyan-400 hover:underline">
              View all
            </Link>
          </div>
          <Watchlist limit={6} />
        </div>

        {/* Favorites Section */}
        <div className="bg-gray-800/30 rounded-3xl border border-gray-700/50 p-6
                shadow-[0_0_50px_-12px] shadow-cyan-500/10">
          <div className="flex items-center justify-between mb-4">
            <Link href="/favorites" className="group flex items-center gap-2 hover:text-pink-400 transition-colors">
              <Heart className="w-5 h-5 fill-current text-pink-500 group-hover:text-pink-500" />
              <h2 className="text-xl font-semibold text-white group-hover:text-pink-400 transition-colors">Your Favorites</h2>
              <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-pink-400 transition-colors" />
            </Link>
            <Link href="/favorites" className="text-sm text-cyan-400 hover:underline">
              View all
            </Link>
          </div>
          <Favorites limit={6} />
        </div>
      </div>
    </div>
  )
}
