'use client'

import React from 'react'
import { useState, useEffect } from 'react'
import { MessageSquare, Trash2, Clock, Calendar, Star, Search } from 'lucide-react'

interface ChatSession {
  _id: string
  userId: string
  messages: {
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
  }[]
  createdAt: Date
}

interface ChatListProps {
  onSelectChat: (chatId: string) => void
  onDeleteChat: (chatId: string) => Promise<void>
  currentChatId: string | null
  onChatsUpdate: () => void
}

export default function ChatList({ 
  onSelectChat, 
  onDeleteChat, 
  currentChatId,
  onChatsUpdate 
}: ChatListProps) {
  const [chats, setChats] = useState<ChatSession[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({
    today: true,
    yesterday: true,
    thisWeek: true,
    thisMonth: true,
    older: true
  })

  useEffect(() => {
    fetchChats()
  }, [])

  const fetchChats = async () => {
    try {
      const response = await fetch('/api/chat-history/list')
      if (response.ok) {
        const data = await response.json()
        setChats(data)
      }
    } catch (error) {
      console.error('Error fetching chats:', error)
    }
  }

  const getPreviewText = (messages: ChatSession['messages']) => {
    // Try to get the first user message which is more descriptive of the conversation
    const lastUserMessage = messages.filter(m => m.role === 'user')[0] || messages[0]
    if (!lastUserMessage) return 'New Chat'
    
    // Clean any potential ** from preview
    const cleanContent = lastUserMessage.content.replace(/\*\*/g, '')
    return cleanContent.slice(0, 30) + (cleanContent.length > 30 ? '...' : '')
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }
  
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await onDeleteChat(chatId)
    await fetchChats()
    onChatsUpdate()
  }
  
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  // Group chats by time periods
  const groupChatsByDate = (chats: ChatSession[]) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const yesterday = new Date(today - 86400000).getTime()
    const thisWeekStart = new Date(today - (now.getDay() * 86400000)).getTime()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    
    const filtered = searchQuery ? 
      chats.filter(chat => {
        const previewText = getPreviewText(chat.messages)
        return previewText.toLowerCase().includes(searchQuery.toLowerCase())
      }) : 
      chats
    
    return {
      today: filtered.filter(chat => new Date(chat.createdAt).getTime() >= today),
      yesterday: filtered.filter(chat => {
        const time = new Date(chat.createdAt).getTime()
        return time >= yesterday && time < today
      }),
      thisWeek: filtered.filter(chat => {
        const time = new Date(chat.createdAt).getTime()
        return time >= thisWeekStart && time < yesterday
      }),
      thisMonth: filtered.filter(chat => {
        const time = new Date(chat.createdAt).getTime()
        return time >= thisMonthStart && time < thisWeekStart
      }),
      older: filtered.filter(chat => new Date(chat.createdAt).getTime() < thisMonthStart)
    }
  }
  
  const renderChatItem = (chat: ChatSession) => (
    <div
      key={chat._id}
      className={`group flex items-start justify-between p-3 rounded-xl cursor-pointer
               hover:bg-gray-700/40 transition-all duration-200
               ${currentChatId === chat._id ? 'bg-gradient-to-r from-cyan-900/30 to-gray-800/60 border border-cyan-800/30' : 'border border-transparent'}`}
      onClick={() => {
        onSelectChat(chat._id)
        onChatsUpdate()
      }}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className={`mt-0.5 p-2 rounded-lg ${currentChatId === chat._id ? 'bg-cyan-500/20' : 'bg-gray-800/70'} transition-colors duration-200`}>
          <MessageSquare className={`w-4 h-4 ${currentChatId === chat._id ? 'text-cyan-400' : 'text-gray-400'}`} />
        </div>
        <div className="truncate">
          <p className={`text-sm font-medium truncate ${currentChatId === chat._id ? 'text-cyan-300' : 'text-gray-300'}`}>
            {getPreviewText(chat.messages)}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Clock className="w-3 h-3 text-gray-500" />
            <p className="text-xs text-gray-500">
              {formatTime(new Date(chat.createdAt))}
            </p>
          </div>
        </div>
      </div>
      <button
        onClick={(e) => handleDeleteChat(chat._id, e)}
        className="opacity-0 group-hover:opacity-100 p-1.5 bg-gray-800/70 hover:bg-red-900/30 rounded-lg transition-all"
        aria-label="Delete conversation"
      >
        <Trash2 className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-400" />
      </button>
    </div>
  )
  
  const renderSection = (title: string, chats: ChatSession[], sectionKey: string) => {
    if (chats.length === 0) return null
    
    return (
      <div className="mb-4">
        <div 
          className="flex items-center justify-between px-2 mb-1 cursor-pointer"
          onClick={() => toggleSection(sectionKey)}
        >
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-gray-800/70">
              {sectionKey === 'today' ? (
                <Calendar className="w-3 h-3 text-cyan-400" />
              ) : (
                <Calendar className="w-3 h-3 text-gray-400" />
              )}
            </div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
          </div>
          <div className="text-xs text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded-full">
            {chats.length}
          </div>
        </div>
        
        {expandedSections[sectionKey] && (
          <div className="space-y-1 pl-1 animate-fadeIn">
            {chats.map(renderChatItem)}
          </div>
        )}
      </div>
    )
  }
  
  const groupedChats = groupChatsByDate(chats)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3 pb-0">
        <div className="relative mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-gray-900/50 text-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm
                     border border-gray-700/50 focus:border-cyan-500/50 focus:ring-1 
                     focus:ring-cyan-500/50 placeholder-gray-500"
          />
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-500" />
        </div>
      </div>
      
      <div className="px-3 py-2 space-y-1">
        {renderSection('Today', groupedChats.today, 'today')}
        {renderSection('Yesterday', groupedChats.yesterday, 'yesterday')}
        {renderSection('This Week', groupedChats.thisWeek, 'thisWeek')}
        {renderSection('This Month', groupedChats.thisMonth, 'thisMonth')}
        {renderSection('Older', groupedChats.older, 'older')}
        
        {chats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-gray-500">
            <MessageSquare className="w-8 h-8 mb-2 text-gray-600/50" />
            <p className="text-sm">No conversation history</p>
            <p className="text-xs mt-1">Your chat history will appear here</p>
          </div>
        )}
        
        {chats.length > 0 && searchQuery && 
         groupedChats.today.length === 0 && 
         groupedChats.yesterday.length === 0 && 
         groupedChats.thisWeek.length === 0 && 
         groupedChats.thisMonth.length === 0 && 
         groupedChats.older.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-gray-500">
            <Search className="w-8 h-8 mb-2 text-gray-600/50" />
            <p className="text-sm">No matching conversations</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  )
}
