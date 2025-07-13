'use client'

import { useRouter } from 'next/navigation'

const genres = [
  { id: 28, name: 'Action', icon: '💥', color: 'from-red-500/20 to-orange-500/20' },
  { id: 35, name: 'Comedy', icon: '😆', color: 'from-yellow-500/20 to-amber-500/20' },
  { id: 18, name: 'Drama', icon: '🎭', color: 'from-blue-500/20 to-indigo-500/20' },
  { id: 27, name: 'Horror', icon: '👻', color: 'from-purple-500/20 to-pink-500/20' },
  { id: 10749, name: 'Romance', icon: '💝', color: 'from-pink-500/20 to-rose-500/20' },
  { id: 878, name: 'Sci-Fi', icon: '🚀', color: 'from-cyan-500/20 to-blue-500/20' },
  { id: 53, name: 'Thriller', icon: '🔪', color: 'from-gray-500/20 to-slate-500/20' },
  { id: 16, name: 'Animation', icon: '🎨', color: 'from-green-500/20 to-emerald-500/20' },
]

export function GenreGrid() {
  const router = useRouter()

  return (
    <div className="w-full">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-1 h-8 bg-cyan-500 rounded-full shadow-[0_0_8px_0px] shadow-cyan-500/50" />
        <div>
          <h2 className="text-2xl font-bold text-white">Browse by Genre</h2>
          <p className="text-gray-400 mt-1">Discover movies and shows in your favorite categories</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {genres.map((genre) => (
          <button
            key={genre.id}
            onClick={() => router.push(`/genre/${genre.id}?type=movie&name=${genre.name}`)}
            className={`relative p-6 rounded-xl overflow-hidden group cursor-pointer
                     bg-gradient-to-br ${genre.color} backdrop-blur-sm
                     border border-gray-700/50 hover:border-cyan-500/50
                     transition-all duration-300 hover:scale-105`}
          >
            <div className="text-3xl mb-2">{genre.icon}</div>
            <h3 className="text-sm font-medium text-white group-hover:text-cyan-400 
                        transition-colors duration-300">
              {genre.name}
            </h3>
          </button>
        ))}
      </div>
    </div>
  )
}
