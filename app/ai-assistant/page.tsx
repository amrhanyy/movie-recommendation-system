'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Send, Bot, PlusCircle, Search, Film, Calendar, Tag, Star, Info, List, ExternalLink } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import ChatList from '@/components/ChatList'
import { BackgroundPattern } from '@/components/BackgroundPattern'
import { AuthCheck } from '@/components/AuthCheck'
import { useRouter } from 'next/navigation'
import { useFeatures } from '@/hooks/useFeatures'
import { SafeMarkdown } from '@/lib/ai-markdown'

interface MovieSection {
  type: 'movie' | 'tv' | 'person' | 'list'
  title: string
  items: {
    title: string
    year?: string
    description?: string
    rating?: string
    date?: string
  }[]
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  sections?: MovieSection[]
  isStructured?: boolean
}

// Helper function to parse message content and extract structured sections
const parseMessageContent = (content: string): { text: string, sections: MovieSection[] } => {
  let text = content
  const sections: MovieSection[] = []
  
  // Advanced content analysis that doesn't depend on explicit ### markers
  // Look for patterns that indicate a list of movies or organized content
  
  // Pattern 1: Lines with years in parentheses like "Movie Title (2023)"
  // Pattern 2: Lines with numbered items like "1. Movie Title"
  // Pattern 3: Sections with headers followed by lists
  
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim())
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i]
    const lines = paragraph.split('\n').filter(line => line.trim())
    
    // Skip short paragraphs or those that don't look like lists
    if (lines.length < 2) continue
    
    // Check if first line looks like a header (ends with : or doesn't have a year)
    const firstLine = lines[0].trim()
    const isHeader = firstLine.endsWith(':') || 
                    !firstLine.match(/\(\d{4}\)/) || 
                    firstLine.startsWith('#') ||
                    firstLine.toUpperCase() === firstLine
    
    // Check if subsequent lines look like list items
    const restLines = lines.slice(1)
    const looksLikeList = restLines.some(line => 
      line.match(/\(\d{4}\)/) || // Has year in parentheses
      line.match(/^-\s/) || // Bullet points
      line.match(/^\d+\./) || // Numbered list
      line.match(/^[A-Z][\w\s]+:/) // Title: format
    )
    
    if (isHeader && looksLikeList) {
      // Create a section for this content
      const title = firstLine.replace(/^#+ |:$/g, '').trim()
      const items = restLines.map(line => {
        // Clean the line
        const cleanLine = line.replace(/^-\s|\d+\.\s/g, '').trim()
        
        // Extract year if present
        const yearMatch = cleanLine.match(/^(.*?)\s*\((\d{4})\)/)
        const dateMatch = cleanLine.match(/\(([A-Za-z]+\s+\d{1,2},\s+\d{4})\)/)
        
        if (yearMatch) {
          return {
            title: yearMatch[1].trim(),
            year: yearMatch[2],
            description: cleanLine.replace(yearMatch[0], '').trim()
          }
        } else if (dateMatch) {
          return {
            title: cleanLine.replace(dateMatch[0], '').trim(),
            date: dateMatch[1]
          }
        }
        
        return { title: cleanLine.trim() }
      })
      
      // Determine the type based on the title
      const type = title.toLowerCase().includes('movie') ? 'movie' : 
                title.toLowerCase().includes('tv') ? 'tv' : 
                title.toLowerCase().includes('actor') || title.toLowerCase().includes('director') ? 'person' : 'list'
      
      sections.push({ type, title, items })
      
      // Remove this content from the text to avoid duplication
      text = text.replace(paragraph, '')
    }
  }
  
  // Look for lists with bullet points or numbers even without headers
  const remainingLines = text.split('\n').filter(line => line.trim())
  const bulletPoints = remainingLines.filter(line => line.match(/^-\s/) || line.match(/^\d+\.\s/))
  
  if (bulletPoints.length >= 3) {
    // Create an "Additional Items" section
    const items = bulletPoints.map(line => {
      const cleanLine = line.replace(/^-\s|\d+\.\s/g, '').trim()
      
      // Extract year if present
      const yearMatch = cleanLine.match(/^(.*?)\s*\((\d{4})\)/)
      if (yearMatch) {
        return {
          title: yearMatch[1].trim(),
          year: yearMatch[2],
          description: cleanLine.replace(yearMatch[0], '').trim()
        }
      }
      
      return { title: cleanLine.trim() }
    })
    
    sections.push({
      type: 'list',
      title: 'Additional Items',
      items
    })
    
    // Remove these bullet points from the text
    bulletPoints.forEach(point => {
      text = text.replace(point, '')
    })
  }
  
  // Clean up the remaining text
  text = text.split('\n').filter(line => line.trim()).join('\n')
  
  return { text: text.trim(), sections }
}

export default function AIAssistant() {
  const router = useRouter()
  const { isEnabled, loading: featuresLoading } = useFeatures()
  const { data: session } = useSession()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMovieId, setLoadingMovieId] = useState<string | null>(null)
  const messagesEndRef = useRef<null | HTMLDivElement>(null)
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Check if AI Assistant is enabled
  useEffect(() => {
    if (!featuresLoading && !isEnabled('aiAssistant')) {
      router.replace('/')
    }
  }, [featuresLoading, isEnabled, router])

  // Fetch chat history when component mounts
  useEffect(() => {
    fetchChatHistory();
  }, [session?.user?.email]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchChatHistory = async (chatId?: string) => {
    if (!session?.user?.email) return;
    
    try {
      const response = await fetch(chatId ? `/api/chat-history/${chatId}` : '/api/chat-history');
      if (!response.ok) throw new Error('Failed to fetch chat history');
      
      const data = await response.json();
      
      // Function to process messages and clean formatting
      const processMessages = (messages: Message[]) => {
        return messages.map((msg: Message) => {
          if (msg.role === 'assistant') {
            const { text, sections } = parseMessageContent(msg.content);
            return {
              ...msg,
              content: text.trim() || msg.content,
              sections,
              isStructured: sections.length > 0
            }
          }
          return msg;
        });
      };
      
      if (chatId) {
        const processedMessages = processMessages(data.messages || []);
        setMessages(processedMessages);
        setCurrentChatId(data._id);
      } else {
        const incoming = Array.isArray(data) ? data : data.messages;
        const nextChatId = !Array.isArray(data) && typeof data.chatId === 'string' ? data.chatId : null;
        if (Array.isArray(incoming) && incoming.length > 0) {
          setMessages(processMessages(incoming));
        } else {
          setMessages([]);
        }
        if (nextChatId) setCurrentChatId(nextChatId);
      }
    } catch {
      console.error('Chat history fetch failed');
    }
  };

  const handleSelectChat = (chatId: string) => {
    fetchChatHistory(chatId);
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      const response = await fetch(`/api/chat-history/${chatId}`, { 
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete chat');
      
      if (chatId === currentChatId) {
        startNewChat();
      }
    } catch {
      console.error('Chat delete failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

    try {
      // Get AI response. The client sends message + chatId only; history and
      // persistence are handled server-side (R5 trust boundary).
      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage,
          chatId: currentChatId || undefined
        }),
      })

      if (!chatResponse.ok) {
        console.error('Chat API error')
        throw new Error('failed')
      }
      
      let data: { response?: unknown; chatId?: unknown }
      try {
        data = await chatResponse.json() as { response?: unknown; chatId?: unknown }
      } catch {
        console.error('JSON parse error')
        throw new Error('invalid')
      }

      const assistantText = typeof data.response === 'string' ? data.response : ''
      if (typeof data.chatId === 'string' && data.chatId) {
        setCurrentChatId(data.chatId)
      }

      const { text, sections } = parseMessageContent(assistantText)

      const newMessages = [
        { role: 'user' as const, content: userMessage, timestamp: new Date() },
        {
          role: 'assistant' as const,
          content: text.trim() || assistantText,
          timestamp: new Date(),
          sections,
          isStructured: sections.length > 0
        }
      ];

      setMessages(prev => [...prev, ...newMessages]);
    } catch {
      console.error('Chat error')
      setMessages(prev => [...prev, { 
        role: 'user' as const, 
        content: userMessage, 
        timestamp: new Date()
      }, { 
        role: 'assistant' as const, 
        content: 'Sorry, I encountered an unexpected error. Please try again later.',
        timestamp: new Date()
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const startNewChat = () => {
    setMessages([]);
    setInput('');
    setCurrentChatId(null);
  };

  interface MovieCardItem {
  id?: number;
  title: string;
  year?: string;
  description?: string;
  date?: string;
}

  // Helper to render a movie/show card
  const renderMovieItem = (item: MovieCardItem, sectionType: string) => {
    // Check if the item is likely a movie title or just a description
    const isLikelyMovieTitle = () => {
      // If the text is too long, it's probably a description not a title
      if (item.title.length > 80) return false;
      
      // If it contains colons followed by explanations, it's likely a description
      if (item.title.includes(': ') && item.title.split(': ')[1].length > 30) return false;
      
      // If it starts with words like "Note", "Warning", "Inconsistency", etc.
      const descriptionPrefixes = ['note', 'warning', 'caution', 'inconsistency', 'be prepared', 'remember'];
      if (descriptionPrefixes.some(prefix => item.title.toLowerCase().startsWith(prefix))) return false;
      
      return true;
    };

    // Create a unique ID for this movie (using title if no ID available)
    const movieId = item.id || item.title;
    const isItemLoading = loadingMovieId === movieId;
    
    // Display non-interactive item
    return (
      <div 
        className="bg-gray-800/70 rounded-lg p-3 border border-gray-700/50 transition-all group relative"
      >
        <div className="flex items-start gap-3">
          {/* Icon based on type */}
          <div className="mt-1 p-2 rounded-md bg-cyan-500/10 border border-cyan-500/20 transition-colors">
            {sectionType === 'movie' ? (
              <Film className="w-4 h-4 text-cyan-400" />
            ) : sectionType === 'tv' ? (
              <PlusCircle className="w-4 h-4 text-cyan-400" />
            ) : (
              <Star className="w-4 h-4 text-cyan-400" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-white truncate">{item.title}</h4>
              {item.year && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/70 text-gray-300 flex items-center gap-1 whitespace-nowrap">
                  <Calendar className="w-3 h-3" /> {item.year}
                </span>
              )}
            </div>
            
            {item.description && (
              <p className="text-sm text-gray-300 mt-1 line-clamp-2">{item.description}</p>
            )}
            
            {item.date && (
              <div className="flex items-center mt-1.5 text-xs text-gray-400">
                <Calendar className="w-3 h-3 mr-1" /> 
                {item.date}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render a section of movies/shows/people
  const renderSection = (section: MovieSection) => (
    <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50 shadow-lg">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/20">
          {section.type === 'movie' ? (
            <Film className="w-4 h-4 text-cyan-400" />
          ) : section.type === 'tv' ? (
            <PlusCircle className="w-4 h-4 text-cyan-400" />
          ) : section.type === 'person' ? (
            <Star className="w-4 h-4 text-cyan-400" />
          ) : (
            <List className="w-4 h-4 text-cyan-400" />
          )}
        </div>
        <h3 className="text-sm font-semibold text-cyan-300">{section.title}</h3>
      </div>
      
      <div className="grid grid-cols-1 gap-2">
        {section.items.map((item, i) => (
          <div key={i} className="text-sm text-gray-300">
            {renderMovieItem(item, section.type)}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <AuthCheck>
      {featuresLoading ? (
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <>
          <BackgroundPattern />
          <div className="max-w-7xl mx-auto px-1 py-1">
            <div className="flex flex-col gap-6 h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between bg-gradient-to-r from-cyan-800/20 to-purple-800/20 p-4 rounded-2xl border border-cyan-700/30 backdrop-blur-sm shadow-lg">
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center gap-3">
                  <Bot className="w-9 h-9 text-cyan-400" />
                  <span> MovieMind  Ai Assistant</span>
                </h1>
                <button
                  onClick={startNewChat}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-300 rounded-xl border border-cyan-500/30 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/10"
                >
                  <PlusCircle className="w-5 h-5" />
                  <span className="font-medium">New Chat</span>
                </button>
              </div>

              {/* Main Content */}
              <div className="flex gap-6 flex-1 min-h-0">
                {/* Chat List Sidebar */}
                <div className="w-80 flex flex-col bg-gradient-to-b from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-3xl border border-gray-700/50 overflow-hidden shadow-xl">
                  <div className="p-4 border-b border-gray-700/50 bg-gray-800/40">
                    <h2 className="text-md font-medium text-cyan-300 mb-1">Chat History</h2>
                  </div>
                  <ChatList
                    onSelectChat={handleSelectChat}
                    onDeleteChat={handleDeleteChat}
                    currentChatId={currentChatId}
                    onChatsUpdate={() => fetchChatHistory()} 
                  />
                </div>

                {/* Chat Container */}
                <div className="flex-1 flex flex-col bg-gradient-to-b from-gray-800/60 to-gray-900/60 backdrop-blur-xl rounded-3xl border border-gray-700/50 overflow-hidden shadow-xl">
                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-br from-transparent to-purple-900/5" role="log" aria-label="Chat messages" aria-live="off">
                    {/* Empty chat state - intentionally left blank */}
                    
                    {/* Chat messages */}
                    {messages.map((message, index) => (
                      <div
                        key={index}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl p-5 shadow-lg ${
                            message.role === 'user'
                              ? 'bg-gradient-to-br from-cyan-500/15 to-purple-500/10 text-cyan-50 border border-cyan-500/30'
                              : 'bg-gradient-to-br from-gray-700/50 to-gray-800/50 text-gray-100 border border-gray-600/30'
                          } ${index > 0 && messages[index-1].role === message.role ? 'mt-2' : 'mt-6'}`}
                        >
                          {message.role === 'assistant' && (
                            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-700/30">
                              <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center">
                                <Bot className="w-4 h-4 text-cyan-400" />
                              </div>
                              <span className="text-sm font-medium text-cyan-400">AI Assistant</span>
                            </div>
                          )}
                          
                          {/* Main message content */}
                          {message.content && (
                            <div className={`prose prose-invert max-w-none leading-relaxed space-y-3 ${message.role === 'assistant' ? 'prose-headings:text-cyan-300 prose-strong:text-cyan-200 prose-a:text-cyan-400 hover:prose-a:text-cyan-300' : ''}`}>
                              {message.role === 'assistant'
                                ? <SafeMarkdown content={message.content} />
                                : <p className="whitespace-pre-wrap">{message.content}</p>}
                            </div>
                          )}
                          
                          {/* Structured content for AI messages */}
                          {message.role === 'assistant' && message.sections && message.sections.length > 0 && (
                            <div className="mt-3 space-y-4">
                              {message.sections.map((section, idx) => (
                                <div key={idx}>
                                  {renderSection(section)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {/* AI Thinking indicator */}
                    {isLoading && (
                      <div className="flex justify-start animate-fadeIn" role="status" aria-live="polite" aria-label="AI is thinking">
                        <div className="max-w-[85%] rounded-2xl p-4 shadow-lg bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-600/30">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center">
                              <Bot className="w-4 h-4 text-cyan-400" />
                            </div>
                            <span className="text-sm font-medium text-cyan-400">AI Assistant</span>
                          </div>
                          <div className="flex items-center gap-3 text-gray-300">
                            <LoadingSpinner size="sm" className="text-cyan-400" />
                            <span>Thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input Area */}
                  <div className="p-4 border-t border-gray-700/50 bg-gray-800/60 backdrop-blur-xl">
                    <form onSubmit={handleSubmit} className="relative">
                      <label htmlFor="ai-assistant-message" className="sr-only">
                        Ask about movies, TV shows, or recommendations
                      </label>
                      <input
                        id="ai-assistant-message"
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about movies, TV shows, or recommendations..."
                        className="w-full bg-gray-900/70 text-white rounded-xl px-5 py-3.5 pr-14 border border-gray-700/60 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 placeholder-gray-500 shadow-inner"
                        disabled={isLoading}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <button
                          type="submit"
                          disabled={isLoading}
                          className="p-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 disabled:from-gray-700 disabled:to-gray-800 text-white rounded-lg transition-all shadow-lg hover:shadow-cyan-500/30 disabled:shadow-none transform hover:-translate-y-0.5"
                        >
                          {isLoading ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <Send className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <style jsx global>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fadeIn {
              animation: fadeIn 0.3s ease-out forwards;
            }
          `}</style>
        </>
      )}
    </AuthCheck>
  )
}
