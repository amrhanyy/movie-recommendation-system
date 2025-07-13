'use client'
import React from "react"
import { TopRatedMovies } from "../../components/TopRatedMovies"
import { TopRatedTVShows } from "../../components/TopRatedTVShows"

export default function TopRatedPage() {
  return (
    <div className="container mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
        <h1 className="text-3xl font-bold text-white tracking-wider">TOP RATED</h1>
      </div>

      {/* Top Rated Movies Section */}
      <div className="bg-gray-800/30 rounded-3xl border border-gray-700/50 p-6
                    shadow-[0_0_50px_-12px] shadow-cyan-500/10">
        <TopRatedMovies />
      </div>

      {/* Top Rated TV Shows Section */}
      <div className="bg-gray-800/30 rounded-3xl border border-gray-700/50 p-6
                    shadow-[0_0_50px_-12px] shadow-cyan-500/10">
        <TopRatedTVShows />
      </div>
    </div>
  )
}
