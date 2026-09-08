'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

// Map of language codes to their display names
// M6 i18n honesty: only locales with a real translation catalog below are
// listed. Additional display-name stubs were removed (no setLanguage call
// site exists, and the app's html lang stays "en" until a real switch ships).
export const LANGUAGES = {
  'en-US': 'English (US)',
  'es-ES': 'Spanish (Spain)',
  'fr-FR': 'French (France)',
  'de-DE': 'German (Germany)',
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
  // Default to English immediately so the app never renders blank while the
  // system language is resolved in the background (Phase 3: no blocking gate).
  const [language, setLanguage] = useState('en-US')

  useEffect(() => {
    // Best-effort: adopt a server-configured default language without holding
    // the DOM hostage. Failures are silent (we simply keep en-US).
    let cancelled = false
    const fetchSystemLanguage = async () => {
      try {
        const response = await fetch('/api/features')
        if (response.ok) {
          const data = await response.json()
          if (!cancelled && data.content?.defaultLanguage) {
            setLanguage(data.content.defaultLanguage)
          }
        }
      } catch {
        // Ignore — keep the default language.
      }
    }

    fetchSystemLanguage()
    return () => {
      cancelled = true
    }
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
      {children}
    </LanguageContext.Provider>
  )
}