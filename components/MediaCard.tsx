import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Bookmark, Heart, Star, Calendar, Clock, Film, Tv2, Info } from 'lucide-react';

export interface MediaCardItem {
  _id: string;
  itemId: number;
  userId?: string;
  title: string;
  type: 'movie' | 'tv';
  posterPath: string | null;
  addedAt: string;
  releaseDate?: string;
  voteAverage?: number;
  runtime?: number;
  overview?: string;
  genres?: string[];
}

interface MediaCardProps {
  item: MediaCardItem;
  onRemove: (itemId: number, type: string) => void;
  variant?: 'grid' | 'detailed' | 'compact';
  accent?: 'cyan' | 'pink';
}

const palette = {
  cyan: {
    shadowHover: 'group-hover:shadow-cyan-900/20',
    gradientHover: 'group-hover:from-cyan-950/20',
    bgGradient: 'from-cyan-950/5',
    spinnerTop: 'border-t-cyan-500',
    btnText: 'text-cyan-500 hover:border-cyan-500/50 hover:text-cyan-400',
    plainText: 'text-cyan-500 hover:text-cyan-400',
    titleHover: 'group-hover:text-cyan-300',
    calText: 'text-cyan-400/70',
    borderHover: 'hover:border-cyan-700/30',
    ring: 'focus-visible:ring-cyan-500',
    listName: 'Watchlist',
  },
  pink: {
    shadowHover: 'group-hover:shadow-pink-900/20',
    gradientHover: 'group-hover:from-pink-950/20',
    bgGradient: 'from-pink-950/5',
    spinnerTop: 'border-t-pink-500',
    btnText: 'text-pink-500 hover:border-pink-500/50 hover:text-pink-400',
    plainText: 'text-pink-500 hover:text-pink-400',
    titleHover: 'group-hover:text-pink-300',
    calText: 'text-pink-400/70',
    borderHover: 'hover:border-pink-700/30',
    ring: 'focus-visible:ring-pink-500',
    listName: 'Favorites',
  },
} as const;

function formatDate(dateString?: string) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return isNaN(date.getTime())
    ? 'N/A'
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function MediaCard({ item, onRemove, variant = 'grid', accent = 'cyan' }: MediaCardProps) {
  const router = useRouter();
  const [imageLoaded, setImageLoaded] = useState(false);
  const p = palette[accent];
  const RemoveIcon = accent === 'pink' ? Heart : Bookmark;
  const typeIcon = item.type === 'movie' ? <Film className="w-3.5 h-3.5" /> : <Tv2 className="w-3.5 h-3.5" />;

  const handleCardClick = () => {
    router.push(`/${item.type}/${item.itemId}`);
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(item.itemId, item.type);
  };

  // Edge-case-correct guards (NaN-safe): the Favorite* variants already had
  // these; the watchlist variants did not. One component uses the strict form.
  const hasValidRating =
    item.voteAverage !== undefined && item.voteAverage !== null && !isNaN(Number(item.voteAverage));
  const hasValidRuntime =
    item.runtime !== undefined &&
    item.runtime !== null &&
    !isNaN(Number(item.runtime)) &&
    Number(item.runtime) > 0;
  const releaseYear = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null;
  const hasValidYear = releaseYear !== null && !isNaN(releaseYear);

  // Remove buttons act on an item known to be in the list, so the pressed
  // state is explicitly "true" (M6 STEP 3: no bare aria-pressed).
  const removeLabel = `Remove ${item.title} from ${p.listName}`;

  if (variant === 'detailed') {
    const releaseDate = item.releaseDate ? formatDate(item.releaseDate) : 'N/A';
    const addedDate = formatDate(item.addedAt);
    return (
      <div
        onClick={handleCardClick}
        className={`group flex gap-6 p-4 rounded-xl border border-gray-700/50 bg-gray-800/30 hover:bg-gray-800/50 transition-all duration-300 cursor-pointer ${p.borderHover} relative overflow-hidden`}
      >
        <div className={`absolute inset-0 bg-gradient-to-r ${p.bgGradient} to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500`}></div>

        <div className="relative h-40 w-28 flex-shrink-0 rounded-lg overflow-hidden border border-gray-700/50">
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
              <div className={`w-6 h-6 border-2 border-gray-600 ${p.spinnerTop} rounded-full animate-spin`}></div>
            </div>
          )}
          <Image
            src={item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : '/images/placeholder-poster.png'}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
            loading="lazy"
            quality={80}
            className={`object-cover transition-all duration-300 group-hover:scale-105 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoadingComplete={() => setImageLoaded(true)}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0 relative">
          <div className="flex justify-between items-start gap-4">
            <h3 className={`text-lg font-medium text-white ${p.titleHover} transition-colors mr-auto`}>{item.title}</h3>
            <button
              type="button"
              onClick={handleRemoveClick}
              aria-label={removeLabel}
              aria-pressed="true"
              className={`flex-shrink-0 p-2 rounded-full bg-black/40 hover:bg-black/60 ${p.btnText} border border-gray-700/50 transition-all duration-300 transform hover:scale-105 z-10 focus:outline-none focus-visible:ring-2 ${p.ring}`}
            >
              <RemoveIcon className="w-4 h-4 fill-current" />
            </button>
          </div>

          {hasValidRating && (
            <div className="flex items-center gap-1 mb-2 mt-1">
              <Star className="w-4 h-4 text-yellow-400" />
              <span className="text-yellow-400 font-medium">{Number(item.voteAverage).toFixed(1)}/10</span>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-300 mb-2">
            <span className="flex items-center gap-1">
              {typeIcon}
              <span>{item.type === 'movie' ? 'Movie' : 'TV Series'}</span>
            </span>
            {item.releaseDate && releaseDate !== 'N/A' && (
              <span className="flex items-center gap-1">
                <Calendar className={`w-4 h-4 ${p.calText}`} />
                <span>{releaseDate}</span>
              </span>
            )}
            {hasValidRuntime && (
              <span className="flex items-center gap-1">
                <Clock className={`w-4 h-4 ${p.calText}`} />
                <span>{Number(item.runtime)} min</span>
              </span>
            )}
            <span className="flex items-center gap-1 text-gray-400 text-xs">
              <Info className="w-3 h-3" />
              <span>Added: {addedDate}</span>
            </span>
          </div>

          {item.genres && item.genres.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {item.genres.map((genre) => (
                <span
                  key={`${item._id}-${genre}`}
                  className="text-xs px-2 py-1 rounded-full bg-gray-700/50 text-gray-300 border border-gray-600/50"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {item.overview && (
            <p className="text-sm text-gray-400 line-clamp-2 mt-auto group-hover:text-gray-300 transition-colors">
              {item.overview}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        onClick={handleCardClick}
        className={`group flex items-center gap-3 p-2 rounded-lg border border-gray-700/50 bg-gray-800/20 hover:bg-gray-800/40 transition-all duration-300 cursor-pointer ${p.borderHover}`}
      >
        <div className="relative h-16 w-12 flex-shrink-0 rounded-md overflow-hidden border border-gray-700/50">
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
              <div className={`w-4 h-4 border-2 border-gray-600 ${p.spinnerTop} rounded-full animate-spin`}></div>
            </div>
          )}
          <Image
            src={item.posterPath ? `https://image.tmdb.org/t/p/w200${item.posterPath}` : '/images/placeholder-poster.png'}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
            loading="lazy"
            quality={70}
            className={`object-cover ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoadingComplete={() => setImageLoaded(true)}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-medium text-white truncate ${p.titleHover} transition-colors mr-auto`}>
              {item.title}
            </h3>
            {hasValidRating && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <Star className="w-3 h-3 text-yellow-400" />
                <span className="text-yellow-400 text-xs font-medium">{Number(item.voteAverage).toFixed(1)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
            <span className={`flex items-center gap-1 ${p.plainText}/70`}>{typeIcon}</span>
            {hasValidYear && (
              <span className="flex items-center gap-1">
                <Calendar className={`w-3 h-3 ${p.calText}`} />
                <span>{releaseYear}</span>
              </span>
            )}
            {hasValidRuntime && (
              <span className="flex items-center gap-1">
                <Clock className={`w-3 h-3 ${p.calText}`} />
                <span>{Number(item.runtime)}m</span>
              </span>
            )}
            {item.genres && item.genres.length > 0 && (
              <span className="text-gray-500 truncate max-w-[100px]">{item.genres[0]}</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleRemoveClick}
          aria-label={removeLabel}
          aria-pressed="true"
          className={`flex-shrink-0 p-1.5 rounded-full bg-transparent hover:bg-black/40 ${p.plainText} border border-transparent hover:border-gray-700/50 transition-all duration-300 transform hover:scale-110 focus:outline-none focus-visible:ring-2 ${p.ring}`}
        >
          <RemoveIcon className="w-4 h-4 fill-current" />
        </button>
      </div>
    );
  }

  return (
    <div onClick={handleCardClick} className="group relative cursor-pointer transform hover:-translate-y-1 transition-all duration-300">
      <div className={`relative aspect-[2/3] rounded-xl overflow-hidden mb-2 border border-gray-700/50 shadow-md shadow-black/20 ${p.shadowHover} group-hover:border-gray-600/70 transition-all duration-300`}>
        <div className={`absolute inset-0 bg-gradient-to-br from-gray-800/20 to-black/50 ${p.gradientHover} group-hover:to-gray-900/80 transition-colors duration-500`}></div>

        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
            <div className={`w-8 h-8 border-2 border-gray-600 ${p.spinnerTop} rounded-full animate-spin`}></div>
          </div>
        )}

        <Image
          src={item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : '/images/placeholder-poster.png'}
          alt={item.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
          loading="lazy"
          quality={85}
          className={`object-cover transform group-hover:scale-105 transition-transform duration-500 z-10 relative ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoadingComplete={() => setImageLoaded(true)}
        />

        <button
          type="button"
          onClick={handleRemoveClick}
          aria-label={removeLabel}
          aria-pressed="true"
          className={`absolute top-2 right-2 p-2 rounded-full bg-black/50 backdrop-blur-sm border border-gray-700/50 ${p.btnText} transition-all duration-300 z-30 hover:bg-black/70 hover:scale-110 focus:outline-none focus-visible:ring-2 ${p.ring}`}
        >
          <RemoveIcon className="w-4 h-4 fill-current" />
        </button>

        {hasValidRating && (
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1 border border-yellow-500/30 z-20">
            <Star className="w-3 h-3 text-yellow-400" />
            <span className="text-yellow-400 text-xs font-medium">{Number(item.voteAverage).toFixed(1)}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/70 to-black/10 opacity-0 group-hover:opacity-100 transition-all duration-300 z-20">
          <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col gap-2">
            <h3 className="text-white font-medium line-clamp-2 text-sm">{item.title}</h3>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300">
              <span className="flex items-center gap-1 bg-gray-800/80 px-2 py-1 rounded-full border border-gray-700/50">
                {typeIcon}
                <span>{item.type === 'movie' ? 'Movie' : 'TV'}</span>
              </span>
              {hasValidYear && (
                <span className="flex items-center gap-1">
                  <Calendar className={`w-3 h-3 ${p.calText}`} />
                  {releaseYear}
                </span>
              )}
              {hasValidRuntime && (
                <span className="text-gray-300">{Number(item.runtime)}min</span>
              )}
            </div>
            {item.genres && item.genres.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {item.genres.slice(0, 2).map((genre) => (
                  <span
                    key={`${item._id}-${genre}`}
                    className="bg-gray-800/60 text-gray-300 text-xs px-1.5 py-0.5 rounded border border-gray-700/50"
                  >
                    {genre}
                  </span>
                ))}
                {item.genres.length > 2 && (
                  <span className="text-gray-400 text-xs">+{item.genres.length - 2}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <h3 className={`text-sm text-gray-200 truncate ${p.titleHover} transition-colors`}>{item.title}</h3>
    </div>
  );
}
