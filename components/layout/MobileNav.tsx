'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Menu, X, TrendingUp, Grid, Bookmark, Heart, Film, UserRound, LogOut } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet'
import { useFeatures } from '@/hooks/useFeatures'
import { useLanguage } from '@/contexts/LanguageContext'
import { cn } from '@/lib/utils'

type MobileNavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  feature: 'aiAssistant' | null
}

const items: MobileNavItem[] = [
  { href: '/trending', label: 'trending', icon: TrendingUp, feature: null },
  { href: '/top-rated', label: 'topRated', icon: TrendingUp, feature: null },
  { href: '/genres', label: 'genres', icon: Grid, feature: null },
  { href: '/watchlist', label: 'watchlist', icon: Bookmark, feature: null },
  { href: '/favorites', label: 'favorites', icon: Heart, feature: null },
  { href: '/ai-assistant', label: 'aiAssistant', icon: Film, feature: 'aiAssistant' },
]

/**
 * Mobile navigation drawer (< 768px). Uses the Radix-backed Sheet for free
 * focus trapping, Escape-to-close, and screen-reader announcement. The trigger
 * is a real <button> with aria-expanded/aria-controls for keyboard users.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const { isEnabled } = useFeatures()
  const { t } = useLanguage()

  const isAuthenticated = status !== 'loading' && !!session
  const close = () => setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        id="mobile-navigation"
        side="left"
        className="bg-gray-950/95 backdrop-blur-md border-r border-gray-800 w-full sm:max-w-xs"
      >
        <SheetTitle className="text-white">Menu</SheetTitle>
        <SheetDescription className="text-gray-400">
          Browse {t('trending')}, {t('genres')}, and your lists.
        </SheetDescription>

        {/* Brand header + explicit close (aria-labelled) */}
        <div className="mt-2 flex items-center justify-between">
          <Link
            href="/"
            onClick={close}
            className="flex items-center space-x-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
          >
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              MovieMind
            </span>
          </Link>
          <SheetClose
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            aria-label="Close navigation menu"
          >
            <X className="w-6 h-6" />
          </SheetClose>
        </div>

        <nav aria-label="Mobile navigation" className="mt-6 flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon, feature }) => {
            // Respect feature flags (AI Assistant) and loading state.
            if (feature && !isEnabled(feature)) return null
            const isActive =
              pathname === href || (href !== '/' && pathname?.startsWith(href))

            return (
              <SheetClose asChild key={href}>
                <Link
                  href={href}
                  onClick={close}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500',
                    isActive
                      ? 'bg-white/10 text-white font-semibold'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  )}
                >
                  <Icon
                    className={cn('w-5 h-5', isActive ? 'text-cyan-400' : 'text-gray-400')}
                  />
                  <span>{t(label)}</span>
                </Link>
              </SheetClose>
            )
          })}
        </nav>

        {/* Auth state */}
        <div className="mt-auto pt-6 border-t border-gray-800">
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <SheetClose asChild>
                <Link
                  href="/profile"
                  onClick={close}
                  className="flex-1 flex items-center gap-2 px-4 py-3 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-gray-200 hover:text-white border border-gray-700/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                >
                  <UserRound className="w-5 h-5 text-cyan-400" />
                  <span className="truncate">{session?.user?.name?.split(' ')[0] || 'Profile'}</span>
                </Link>
              </SheetClose>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  void signOut({ callbackUrl: '/' })
                }}
                aria-label={t('signOut')}
                className="p-3 rounded-lg border border-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <SheetClose asChild>
              <Link
                href="/auth/signin"
                onClick={close}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium transition-colors hover:from-blue-500 hover:to-cyan-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              >
                {t('signIn')}
              </Link>
            </SheetClose>
          )}
        </div>
      </SheetContent>

      {/* Trigger: hamburger, mobile-only (md:hidden) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        className="md:hidden p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
      >
        <Menu className="w-7 h-7" />
      </button>
    </Sheet>
  )
}
