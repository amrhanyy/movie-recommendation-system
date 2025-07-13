'use client'

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Lock, LogIn, Bookmark } from 'lucide-react';
import { useSession, signIn } from 'next-auth/react';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const moodToGenreMap = {
  happy: { genres: [35, 10751], keywords: 'feel-good,happy,comedy,uplifting' },
  melancholic: { genres: [18], keywords: 'emotional,drama,touching,melancholy' },
  excited: { genres: [28, 12], keywords: 'action,adventure,thrilling,exciting' },
  relaxed: { genres: [99, 10751], keywords: 'calm,relaxing,peaceful,gentle' },
  tense: { genres: [53, 9648], keywords: 'suspense,thriller,mystery,intense' },
  romantic: { genres: [10749], keywords: 'romance,love,romantic,relationship' },
  thoughtful: { genres: [18, 99], keywords: 'thought-provoking,philosophical,deep,meaningful' },
  energetic: { genres: [28, 12, 16], keywords: 'action,fast-paced,dynamic,energetic' }
}

const moods = [
  { id: 'happy', name: 'Happy', icon: '😊', color: 'from-yellow-500/20 to-orange-500/20' },
  { id: 'melancholic', name: 'Melancholic', icon: '😢', color: 'from-blue-500/20 to-indigo-500/20' },
  { id: 'excited', name: 'Excited', icon: '🤩', color: 'from-pink-500/20 to-rose-500/20' },
  { id: 'relaxed', name: 'Relaxed', icon: '😌', color: 'from-green-500/20 to-emerald-500/20' },
  { id: 'tense', name: 'Tense', icon: '😰', color: 'from-red-500/20 to-orange-500/20' },
  { id: 'romantic', name: 'Romantic', icon: '🥰', color: 'from-pink-500/20 to-purple-500/20' },
  { id: 'thoughtful', name: 'Thoughtful', icon: '🤔', color: 'from-cyan-500/20 to-blue-500/20' },
  { id: 'energetic', name: 'Energetic', icon: '⚡', color: 'from-amber-500/20 to-yellow-500/20' }
]

interface Movie {
  id: number;
  title: string;
  poster_path: string;
  overview: string;
}

export function MoodBasedRecommendations() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [watchlistItems, setWatchlistItems] = useState<Set<number>>(new Set());

  const fetchWatchlistStatus = async () => {
    try {
      const response = await fetch('/api/watchlist');
      if (response.ok) {
        const data = await response.json();
        const itemIds = new Set<number>(data
          .filter((item: { itemId: number }) => typeof item.itemId === 'number')
          .map((item: { itemId: number }) => Number(item.itemId)));
        setWatchlistItems(itemIds);
      }
    } catch (error) {
      console.error('Error fetching watchlist status:', error);
    }
  };

  const handleMoodSelect = async (moodId: string) => {
    setSelectedMood(moodId);
    setIsLoading(true);
    setMovies([]); // Clear previous results

    try {
      const response = await fetch(`/api/mood-recommendations?mood=${moodId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch recommendations');
      }

      if (data && Array.isArray(data.results)) {
        setMovies(data.results.slice(0, 6));
      } else {
        console.warn('Invalid data format received:', data);
        setMovies([]);
      }
    } catch (error) {
      console.error('Error:', error);
      setMovies([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMovieClick = (movieId: number) => {
    router.push(`/movie/${movieId}`);
  };

  const handleWatchlistToggle = async (movie: Movie, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) {
      signIn();
      return;
    }

    try {
      // Check if movie is already in watchlist
      const isInWatchlist = watchlistItems.has(movie.id);
      
      if (isInWatchlist) {
        // If it's in watchlist, remove it
        const response = await fetch(`/api/watchlist?itemId=${movie.id}&type=movie`, {
          method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to remove from watchlist');
      } else {
        // If it's not in watchlist, add it
        const response = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: movie.id,
            type: 'movie',
            title: movie.title,
            posterPath: movie.poster_path
          }),
        });
        if (!response.ok) throw new Error('Failed to add to watchlist');
      }

      // Update local state
      setWatchlistItems(prev => {
        const newSet = new Set(prev);
        if (isInWatchlist) {
          newSet.delete(movie.id);
        } else {
          newSet.add(movie.id);
        }
        return newSet;
      });
    } catch (error) {
      console.error('Error toggling watchlist:', error);
    }
  };

  useEffect(() => {
    fetchWatchlistStatus();
  }, []);

  if (status === 'loading') {
    return (
      <div className="w-full">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-1 h-8 bg-cyan-500 rounded-full shadow-[0_0_8px_0px] shadow-cyan-500/50" />
          <div>
            <h2 className="text-2xl font-bold text-white">How are you feeling today?</h2>
            <p className="text-gray-400 mt-1">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-1 h-8 bg-cyan-500 rounded-full shadow-[0_0_8px_0px] shadow-cyan-500/50" />
          <div>
            <h2 className="text-2xl font-bold text-white">Personalized Mood Recommendations</h2>
            
          </div>
        </div>

      
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-12">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-1 h-8 bg-cyan-500 rounded-full shadow-[0_0_8px_0px] shadow-cyan-500/50" />
          <div>
            <h2 className="text-2xl font-bold text-white">What's Your Mood?</h2>
            <p className="text-gray-400 mt-1">Get recommendations based on how you feel</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {moods.map((mood) => (
            <button
              key={mood.id}
              onClick={() => handleMoodSelect(mood.id)}
              className={`relative p-6 rounded-xl overflow-hidden group cursor-pointer
                     bg-gradient-to-br ${mood.color} backdrop-blur-sm
                     border border-gray-700/50 hover:border-cyan-500/50
                     transition-all duration-300 hover:scale-105`}
            >
              <div className="text-3xl mb-2">{mood.icon}</div>
              <h3 className="text-sm font-medium text-white group-hover:text-cyan-400 
                        transition-colors duration-300">
                {mood.name}
              </h3>
            </button>
          ))}
        </div>
      </div>

      {selectedMood && !isLoading && movies.length > 0 && (
        <div className="mt-12">
          <div className="inline-flex items-center gap-3 px-4 py-2 mb-8
                       bg-gradient-to-r from-gray-800/50 to-gray-900/50
                       border border-gray-700/50 rounded-lg
                       backdrop-blur-sm">
            <div className="w-1 h-4 bg-cyan-500 rounded-full animate-pulse" />
            <h3 className="text-lg font-medium">
              <span className="text-gray-400">Neural Match:</span>
              {' '}
              <span className="bg-gradient-to-r from-cyan-400 to-cyan-200 bg-clip-text text-transparent">
                {selectedMood.charAt(0).toUpperCase() + selectedMood.slice(1)} Vibes
              </span>
            </h3>
            <div className="animate-ping-slow">
              <div className="w-2 h-2 rounded-full bg-cyan-500/50" />
            </div>
          </div>
          
          <div className="mt-8">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {movies.map((movie) => (
                <div
                  key={movie.id}
                  onClick={() => handleMovieClick(movie.id)}
                  className="group relative bg-gradient-to-br from-gray-800/80 to-gray-900/90
                         rounded-xl overflow-hidden hover:shadow-2xl hover:shadow-cyan-500/10
                         transform hover:-translate-y-1 transition-all duration-300
                         border border-gray-700/50"
                >
                  <div className="relative aspect-[2/3] overflow-hidden">
                    <Image
                      src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                      alt={movie.title}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent 
                                opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  
                  <button
                    onClick={(e) => handleWatchlistToggle(movie, e)}
                    className="absolute top-2 right-2 p-2 rounded-full
                              bg-black/50 backdrop-blur-sm border border-gray-700/50
                              text-white hover:bg-black/70 hover:scale-110
                              transition-all duration-300 z-10"
                  >
                    <Bookmark 
                      className={`w-4 h-4 ${watchlistItems.has(movie.id) ? 'fill-white' : ''}`} 
                    />
                  </button>

                  <div className="absolute bottom-0 left-0 right-0 p-4 transform translate-y-full 
                              group-hover:translate-y-0 transition-transform duration-300
                              bg-gradient-to-t from-gray-900/95 to-gray-900/0">
                    <h3 className="text-white font-medium text-sm truncate">{movie.title}</h3>
                    <p className="text-cyan-400/80 text-xs mt-2 line-clamp-2">{movie.overview}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
