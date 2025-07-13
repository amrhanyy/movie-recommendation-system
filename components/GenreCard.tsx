'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface GenreCardProps {
  id: number
  name: string
  count?: number
  backdrop_path?: string | null
  sample_movie?: string | null
}

export function GenreCard({ id, name, count, backdrop_path, sample_movie }: GenreCardProps) {
  const router = useRouter()
  const [isHovered, setIsHovered] = useState(false)
  
  const imagePath = backdrop_path 
    ? `https://image.tmdb.org/t/p/w780${backdrop_path}`
    : '/images/default-backdrop.svg'

  // Generate a unique color tint based on genre ID
  const genreColors: Record<number, string> = {
    28: 'from-red-500/30 to-transparent', // Action
    12: 'from-amber-500/30 to-transparent', // Adventure
    16: 'from-blue-500/30 to-transparent', // Animation
    35: 'from-yellow-500/30 to-transparent', // Comedy
    80: 'from-gray-500/30 to-transparent', // Crime
    99: 'from-green-500/30 to-transparent', // Documentary
    18: 'from-purple-500/30 to-transparent', // Drama
    10751: 'from-orange-500/30 to-transparent', // Family
    14: 'from-indigo-500/30 to-transparent', // Fantasy
    36: 'from-stone-500/30 to-transparent', // History
    27: 'from-rose-600/30 to-transparent', // Horror
    10402: 'from-pink-500/30 to-transparent', // Music
    9648: 'from-slate-500/30 to-transparent', // Mystery
    10749: 'from-pink-400/30 to-transparent', // Romance
    878: 'from-cyan-500/30 to-transparent', // Science Fiction
    10770: 'from-lime-500/30 to-transparent', // TV Movie
    53: 'from-emerald-500/30 to-transparent', // Thriller
    10752: 'from-zinc-500/30 to-transparent', // War
    37: 'from-amber-700/30 to-transparent', // Western
  }
  const colorTint = genreColors[id] || 'from-cyan-500/20 to-transparent'

  // Assign unique pattern backgrounds based on genre ID remainder
  const patterns = ['bg-dots', 'bg-grid-white', 'bg-circuit', 'bg-diagonal-lines', 'bg-plus']
  const patternClass = patterns[id % patterns.length]

  return (
    <div
      onClick={() => router.push(`/genre/${id}`)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative overflow-hidden rounded-xl cursor-pointer transition-all duration-500 transform hover:-translate-y-2 hover:shadow-[0_10px_20px_-10px_rgba(8,145,178,0.3)]"
    >
      <div className="relative aspect-[16/9]">
        <Image
          src={imagePath}
          alt={`${name} - ${sample_movie || 'genre'}`}
          fill
          className="object-cover transition-transform duration-700 ease-in-out group-hover:scale-110"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-gray-900/10 transition-opacity duration-300 group-hover:opacity-80" />
        
        {/* Unique Color Tint Overlay based on genre ID */}
        <div className={`absolute inset-0 bg-gradient-to-tr ${colorTint} opacity-30 group-hover:opacity-50 transition-opacity duration-500`} />
        
        {/* Unique Pattern Overlay based on genre ID */}
        <div className={`absolute inset-0 ${patternClass} opacity-10 group-hover:opacity-20 transition-opacity duration-500`}></div>
        
        {/* Content Overlay */}
        <div className="absolute inset-0 flex flex-col justify-end p-5">
          <div className="transform transition-all duration-500 ease-out">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-5 bg-cyan-500 rounded-full opacity-60 group-hover:opacity-100 group-hover:h-6 transition-all duration-300" />
              <h3 className="text-xl font-bold text-white tracking-wide group-hover:text-cyan-300 transition-colors duration-300">{name}</h3>
            </div>
            
            {/* Explore Button - Only visible on hover */}
            <div className="mt-4 overflow-hidden h-0 group-hover:h-8 transition-all duration-300 ease-out">
              <div className="flex items-center gap-2 text-cyan-400 font-medium text-sm">
                <span>EXPLORE GENRE</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transform group-hover:translate-x-1 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-cyan-400/0 group-hover:border-cyan-400/60 transition-colors duration-500" />
        <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-cyan-400/0 group-hover:border-cyan-400/60 transition-colors duration-500" />
        
        {/* Glowing Dot - Top Left Corner */}
        <div className="absolute top-2 left-2 w-1 h-1 rounded-full bg-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500 shadow-[0_0_5px_2px_rgba(34,211,238,0.4)]" />
        
        {/* Scanning Line Animation - Only visible on hover */}
        {isHovered && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent animate-scanline" />
          </div>
        )}
      </div>
    </div>
  )
}
