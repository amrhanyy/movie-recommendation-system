'use client'

import { signIn } from 'next-auth/react'
import { LogIn } from 'lucide-react'

export function SignInButton() {
  return (
    <button
      onClick={() => signIn(undefined, { callbackUrl: '/ai-assistant' })}
      className="flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 
                text-white rounded-xl transition-colors duration-300"
    >
      <LogIn className="w-5 h-5" />
      <span>Sign In to Continue</span>
    </button>
  )
}
