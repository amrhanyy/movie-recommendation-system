'use client'
import React from 'react'
import { getProviders, signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { LogIn,  Mail } from 'lucide-react'

interface Provider {
  id: string
  name: string
  type: string
}

export default function SignInPage() {
  const [providers, setProviders] = useState<Record<string, Provider> | null>(null)

  useEffect(() => {
    const fetchProviders = async () => {
      const providers = await getProviders()
      setProviders(providers)
    }
    fetchProviders()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Background Effects */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute inset-0 bg-gradient-to-tr from-gray-900 via-gray-900/95 to-gray-800/90" />
      </div>

      {/* Sign In Card */}
      <div className="w-full max-w-md transform hover:scale-[1.02] transition-all duration-300">
        <div className="text-center p-8 bg-gray-800/50 rounded-2xl backdrop-blur-sm border border-gray-700/50 shadow-xl">
          {/* Logo and Title */}
          <div className="mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-2xl mx-auto mb-4 
                         flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Welcome Back
            </h1>
            <p className="text-gray-400 mt-2">
              Sign in to access all features
            </p>
          </div>

          {/* Provider Buttons */}
          <div className="space-y-4">
            {providers && Object.values(providers).map((provider) => (
              <button
                key={provider.id}
                onClick={() => signIn(provider.id, { callbackUrl: '/' })}
                className="w-full flex items-center justify-center gap-3 px-6 py-3 
                         bg-gray-700/50 hover:bg-gray-700/70 border border-gray-600/50
                         text-white rounded-xl transition-all duration-300
                         hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10"
              >
                
                {provider.id === 'google' && 
                  <Image src="/google.svg" alt="Google" width={20} height={20} />
                }
                {provider.id === 'email' && <Mail className="w-5 h-5" />}
                <span>Sign in with {provider.name}</span>
              </button>
            ))}
          </div>

          {/* Footer Text */}
          <p className="mt-8 text-sm text-gray-400">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}


