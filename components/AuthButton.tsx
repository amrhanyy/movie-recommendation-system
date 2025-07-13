"use client"

import { useSession, signIn, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { UserRound, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/contexts/LanguageContext'

export function AuthButton() {
  const { data: session } = useSession()
  const { t } = useLanguage()
  
  if (session) {
    return (
      <div className="flex items-center gap-2">
        <Link 
          href="/profile" 
          className="flex items-center gap-2 bg-gray-800/50 hover:bg-gray-700/50 
                     px-3 py-2 rounded-lg text-gray-200 hover:text-white 
                     border border-gray-700/50 hover:border-gray-600/50 
                     transition-all duration-300"
        >
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center overflow-hidden">
            {session.user?.image ? (
              <img 
                src={session.user.image} 
                alt="User avatar" 
                className="h-full w-full object-cover" 
              />
            ) : (
              <UserRound className="h-4 w-4 text-white" />
            )}
          </div>
          <span className="text-sm">{session.user?.name?.split(' ')[0]}</span>
        </Link>
        
        <Button 
          variant="ghost" 
          size="icon" 
          className="border border-transparent hover:border-gray-700/50 bg-transparent hover:bg-gray-800/50 text-gray-400 hover:text-white rounded-lg"
          onClick={() => signOut()}
          aria-label={t('signOut')}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    )
  }

  return (
    <Button 
      className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white 
                 rounded-lg px-5 py-2 text-sm hover:from-blue-500 hover:to-cyan-400
                 shadow-md hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-0.5
                 transition-all duration-300"
      onClick={() => signIn()}
    >
      {t('signIn')}
    </Button>
  )
}