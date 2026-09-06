"use client"
import { useState, useRef, useEffect, type KeyboardEvent } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { SafeMarkdown } from "@/lib/ai-markdown"

type Message = {
  text: string
  isUser: boolean
  timestamp: number
}

export function ChatAssistant() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || isLoading) return

    const userMessage: Message = { 
      text: trimmedInput, 
      isUser: true,
      timestamp: Date.now()
    }
    
    setMessages(prev => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    setError("")

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmedInput }),
      })

      let data: { response?: unknown; error?: unknown } = {}
      try {
        data = await response.json() as { response?: unknown; error?: unknown }
      } catch {
        throw new Error('invalid')
      }

      if (!response.ok || typeof data.response !== 'string') {
        throw new Error('failed')
      }

      const assistantText = data.response
      setMessages(prev => [...prev, {
        text: assistantText,
        isUser: false,
        timestamp: Date.now()
      }])
    } catch {
      setError("Something went wrong. Please try again.")
      setMessages(prev => [...prev, {
        text: "Sorry, I encountered an unexpected error. Please try again later.",
        isUser: false,
        timestamp: Date.now()
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <Card className="h-[600px] flex flex-col glass-card border-gray-700/50 shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-semibold">
          <span className="text-cyan-500 mr-2">AI</span> Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 relative">
        <div className="absolute inset-0 bg-gray-900/20 backdrop--sm rounded-xl" />
        {messages.map((message) => (
          <div
            key={message.timestamp}
            className={`flex ${message.isUser ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl p-3 ${
                message.isUser
                  ? "bg-cyan-500 text-white shadow-md"
                  : "bg-gray-800 text-gray-300 shadow-md"
              }`}
            >
              {message.isUser
                ? message.text
                : <SafeMarkdown content={message.text} />}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-center">
            <Loader2 className="animate-spin h-6 w-6 text-cyan-500" />
          </div>
        )}
        {error && (
          <div className="text-red-400 text-sm text-center p-2">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </CardContent>
      <div className="p-4 border-t border-gray-700/50 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything..."
          className="flex-1 bg-gray-800 text-white border-gray-700/50 rounded-xl focus:ring-2 focus:ring-cyan-500/50"
          disabled={isLoading}
        />
        <Button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="min-w-[80px] bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl shadow-md"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send"
          )}
        </Button>
      </div>
    </Card>
  )
}
