'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

// Map of language codes to their display names
export const LANGUAGES = {
  'en-US': 'English (US)',
  'es-ES': 'Spanish (Spain)',
  'fr-FR': 'French (France)',
  'de-DE': 'German (Germany)',
  'it-IT': 'Italian (Italy)',
  'ja-JP': 'Japanese (Japan)',
  'ko-KR': 'Korean (Korea)',
  'zh-CN': 'Chinese (Simplified)',
  'pt-BR': 'Portuguese (Brazil)',
  'ar-SA': 'Arabic (Saudi Arabia)',
  'hi-IN': 'Hindi (India)',
  'ru-RU': 'Russian (Russia)',
}

// Default translations for common UI elements
// In a real app, you would have more comprehensive translation files
const translations = {
  'en-US': {
    home: 'Home',
    trending: 'Trending',
    topRated: 'Top Rated',
    genres: 'Genres',
    watchlist: 'Watchlist',
    favorites: 'Favorites',
    aiAssistant: 'AI Assistant',
    settings: 'Settings',
    search: 'Search for movies...',
    signIn: 'Sign in',
    signOut: 'Sign out',
  },
  'es-ES': {
    home: 'Inicio',
    trending: 'Tendencias',
    topRated: 'Mejor Valorados',
    genres: 'Géneros',
    watchlist: 'Lista',
    favorites: 'Favoritos',
    aiAssistant: 'Asistente IA',
    settings: 'Ajustes',
    search: 'Buscar películas...',
    signIn: 'Iniciar sesión',
    signOut: 'Cerrar sesión',
  },
  'fr-FR': {
    home: 'Accueil',
    trending: 'Tendances',
    topRated: 'Mieux Notés',
    genres: 'Genres',
    watchlist: 'À voir',
    favorites: 'Favoris',
    aiAssistant: 'Assistant IA',
    settings: 'Paramètres',
    search: 'Rechercher des films...',
    signIn: 'Se connecter',
    signOut: 'Se déconnecter',
  },
  'de-DE': {
    home: 'Startseite',
    trending: 'Trends',
    topRated: 'Bestbewertet',
    genres: 'Genres',
    watchlist: 'Merkliste',
    favorites: 'Favoriten',
    aiAssistant: 'KI-Assistent',
    settings: 'Einstellungen',
    search: 'Filme suchen...',
    signIn: 'Anmelden',
    signOut: 'Abmelden',
  },
  // Additional languages can be added here with their translations
}

type LanguageContextType = {
  language: string
  setLanguage: (lang: string) => void
  t: (key: string) => string
  getDisplayName: (langCode: string) => string
}

const defaultContext: LanguageContextType = {
  language: 'en-US',
  setLanguage: () => {},
  t: (key: string) => key,
  getDisplayName: (langCode: string) => langCode,
}

const LanguageContext = createContext<LanguageContextType>(defaultContext)

export const useLanguage = () => useContext(LanguageContext)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState('en-US')
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    // Fetch the system default language on first load
    const fetchSystemLanguage = async () => {
      try {
        const response = await fetch('/api/features')
        if (response.ok) {
          const data = await response.json()
          if (data.content?.defaultLanguage) {
            setLanguage(data.content.defaultLanguage)
          }
        }
      } catch (error) {
        console.error('Failed to fetch system language:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchSystemLanguage()
  }, [])
  
  // Function to translate a key
  const t = (key: string): string => {
    const currentTranslations = translations[language as keyof typeof translations]
    
    if (!currentTranslations) {
      // Fallback to English if the language is not supported
      return translations['en-US'][key as keyof typeof translations['en-US']] || key
    }
    
    return currentTranslations[key as keyof typeof currentTranslations] || key
  }
  
  // Get the display name for a language code
  const getDisplayName = (langCode: string): string => {
    return LANGUAGES[langCode as keyof typeof LANGUAGES] || langCode
  }
  
  return (
    <LanguageContext.Provider 
      value={{ 
        language, 
        setLanguage, 
        t,
        getDisplayName
      }}
    >
      {!isLoading && children}
    </LanguageContext.Provider>
  )
}