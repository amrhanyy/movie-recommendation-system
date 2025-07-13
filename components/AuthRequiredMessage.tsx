'use client'
import React from "react"
import { Lock, LogIn, Sparkles } from 'lucide-react'
import { signIn } from 'next-auth/react'

export function AuthRequiredMessage() {
  return (
    <div className="w-full bg-gradient-to-br from-gray-800/30 via-gray-800/20 to-gray-900/30 
                    rounded-3xl border border-gray-700/50 p-12 text-center
                    shadow-[0_0_50px_-12px] shadow-cyan-500/10 backdrop-blur-sm">
      <div className="flex flex-col items-center max-w-2xl mx-auto">
        <Lock className="w-16 h-16 text-cyan-500 mb-6" />
        <h2 className="text-2xl font-bold text-white mb-4">
          Unlock Personalized Recommendations
        </h2>
        <p className="text-gray-400 mb-8 leading-relaxed">
          Sign in to access personalized movie recommendations based on your time preferences, 
          current mood, and watching history. Our AI-powered system will help you discover 
          your next favorite movies and shows.
        </p>
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => signIn()}
            className="flex items-center gap-2 px-8 py-3 bg-cyan-500 hover:bg-cyan-600
                     text-white rounded-lg font-medium transition-all duration-300
                     transform hover:translate-y-[-2px]"
          >
            <LogIn className="w-4 h-4" />
            Sign In to Continue
          </button>
          <div className="flex items-center gap-2 text-sm text-cyan-400/80">
            <Sparkles className="w-4 h-4" />
            <span>Powered by AI Recommendations</span>
          </div>
        </div>
      </div>
    </div>
  )
}
