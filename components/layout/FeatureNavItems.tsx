'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, TrendingUp, Grid, Film, Bookmark, Heart } from 'lucide-react'
import { useFeatures } from '@/hooks/useFeatures'
import { useLanguage } from '@/contexts/LanguageContext'

// Original navItems structure from the layout
const navItems = [
  { href: '/', label: 'home', icon: Home, feature: null },
  { href: '/trending', label: 'trending', icon: TrendingUp, feature: null },
  { href: '/top-rated', label: 'topRated', icon: TrendingUp, feature: null },
  { href: '/genres', label: 'genres', icon: Grid, feature: null },
  { href: '/watchlist', label: 'watchlist', icon: Bookmark, feature: null },
  { href: '/favorites', label: 'favorites', icon: Heart, feature: null },
  { href: '/ai-assistant', label: 'aiAssistant', icon: Film, feature: 'aiAssistant' },
]

// Core items that are always shown (even during loading)
const coreItems = ['home', 'trending', 'topRated', 'genres', 'watchlist', 'favorites']

export function FeatureNavItems() {
  const pathname = usePathname()
  const { loading, isEnabled } = useFeatures()
  const { t } = useLanguage()
  
  return (
    <>
      {navItems.map(({ href, label, icon: Icon, feature }) => {
        // When loading, only show core items
        if (loading && !coreItems.includes(label)) {
          return null
        }
        
        // Skip disabled features
        if (!loading && feature && !isEnabled(feature as any)) {
          return null
        }
        
        // Check if this item is the current active page
        const isActive = pathname === href || 
                         (href !== '/' && pathname?.startsWith(href));
        
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 relative group overflow-hidden",
              isActive 
                ? "text-white bg-white/15 font-semibold shadow-sm" 
                : "text-gray-300 hover:text-white hover:bg-white/10"
            )}
          >
            {/* Active page indicator */}
            {isActive && (
              <span className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent opacity-50" />
            )}
            
            {/* Left accent bar for active page */}
            <span 
              className={cn(
                "absolute left-0 top-0 bottom-0 w-1 rounded-full transition-all duration-300",
                isActive 
                  ? "bg-cyan-500 shadow-[0_0_8px_2px_rgba(8,145,178,0.5)]" 
                  : "bg-transparent group-hover:bg-cyan-500/40"
              )}
            />
            
            <Icon className={cn(
              "w-4 h-4 transition-transform duration-300",
              isActive ? "text-cyan-400" : "group-hover:text-cyan-400",
              "group-hover:scale-110"
            )} />
            
            <span className={cn(
              "font-medium transition-colors duration-300",
              isActive && "text-cyan-50"
            )}>
              {t(label)}
            </span>
          </Link>
        )
      })}
    </>
  )
} 