'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, Check, Database, Loader2, RefreshCw, Trash2, XCircle, Search, Server } from 'lucide-react'
import { toast } from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

interface CacheStats {
  totalKeys?: number
  memory?: {
    used_memory_human?: string
    used_memory_peak_human?: string
  }
  keyspace?: {
    db0?: string
  }
  uptime_in_days?: number
  connected_clients?: number
  hit_rate?: string
  status?: 'online' | 'offline' | 'error'
}

export function CacheManagement() {
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [keys, setKeys] = useState<string[]>([])
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [keyPattern, setKeyPattern] = useState('*')
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)

  const fetchCacheStats = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/cache?action=stats')
      
      if (!response.ok) {
        throw new Error('Failed to fetch cache stats')
      }
      
      const data = await response.json()
      setStats(data.stats)
    } catch (error) {
      console.error('Error fetching cache stats:', error)
      toast.error('Failed to load cache statistics')
      setStats({
        status: 'error',
        totalKeys: 0,
        memory: {
          used_memory_human: 'Error',
          used_memory_peak_human: 'Error'
        }
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchCacheKeys = async () => {
    try {
      setLoadingKeys(true)
      const response = await fetch(`/api/admin/cache?action=list&pattern=${encodeURIComponent(keyPattern)}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch cache keys')
      }
      
      const data = await response.json()
      setKeys(data.keys || [])
    } catch (error) {
      console.error('Error fetching cache keys:', error)
      toast.error('Failed to load cache keys')
      setKeys([])
    } finally {
      setLoadingKeys(false)
    }
  }

  const clearCache = async () => {
    try {
      setClearingCache(true)
      const response = await fetch('/api/admin/cache?action=clear', {
        method: 'GET'
      })
      
      if (!response.ok) {
        throw new Error('Failed to clear cache')
      }
      
      toast.success('Cache cleared successfully')
      fetchCacheStats()
      fetchCacheKeys()
      setClearConfirmOpen(false)
    } catch (error) {
      console.error('Error clearing cache:', error)
      toast.error('Failed to clear cache')
    } finally {
      setClearingCache(false)
    }
  }

  useEffect(() => {
    fetchCacheStats()
    fetchCacheKeys()
  }, [])

  // Render Redis status badge
  const renderStatusBadge = () => {
    const status = stats?.status || 'error'
    
    switch (status) {
      case 'online':
        return (
          <Badge className="ml-2 bg-gradient-to-r from-green-600 to-emerald-500 text-white border-none shadow-md shadow-green-500/20">
            <Check className="h-3 w-3 mr-1" /> Online
          </Badge>
        )
      case 'offline':
        return (
          <Badge className="ml-2 bg-gradient-to-r from-red-600 to-red-500 text-white border-none shadow-md shadow-red-500/20">
            <XCircle className="h-3 w-3 mr-1" /> Offline
          </Badge>
        )
      default:
        return (
          <Badge className="ml-2 bg-gradient-to-r from-amber-600 to-amber-500 text-white border-none shadow-md shadow-amber-500/20">
            <AlertCircle className="h-3 w-3 mr-1" /> Error
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with title and status */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-full shadow-lg shadow-cyan-500/30 animate-pulse" />
        <h2 className="text-xl font-semibold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Redis Cache Management</h2>
        {!loading && renderStatusBadge()}
      </div>
      
      {stats?.status === 'offline' && (
        <Alert className="bg-red-900/30 border-red-700/50 mb-6 shadow-lg shadow-red-900/20 backdrop-blur-sm">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <AlertTitle className="text-red-200">Redis Offline</AlertTitle>
          <AlertDescription className="text-red-300">
            Redis is currently offline. Some functionality may be limited.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Cache Statistics */}
      <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-lg p-6 space-y-6 shadow-xl shadow-cyan-900/5 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none"></div>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-cyan-500/10 p-2 rounded-lg">
              <Server className="h-5 w-5 text-cyan-400" />
            </div>
            <h3 className="text-lg text-white font-medium">Cache Statistics</h3>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchCacheStats}
            disabled={loading}
            className="bg-gray-800/50 border-gray-700 hover:bg-gray-700 text-gray-300 hover:text-white transition-all duration-300"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4 text-cyan-400" />
            )}
            Refresh
          </Button>
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-lg border border-gray-700/50 p-5 bg-gray-900/30 space-y-3 transition-all duration-300 hover:bg-gray-900/40 hover:border-gray-600/50 group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-30 transition-opacity pointer-events-none"></div>
              <h4 className="text-sm font-medium text-cyan-400 mb-4">Memory Usage</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-sm font-medium text-gray-400">Total Keys:</div>
                <div className="text-sm text-white font-mono">{stats.totalKeys || 0}</div>
                
                <div className="text-sm font-medium text-gray-400">Memory Usage:</div>
                <div className="text-sm text-white font-mono">{stats.memory?.used_memory_human || 'N/A'}</div>
                
                <div className="text-sm font-medium text-gray-400">Peak Memory:</div>
                <div className="text-sm text-white font-mono">{stats.memory?.used_memory_peak_human || 'N/A'}</div>
              </div>
            </div>
            
            <div className="rounded-lg border border-gray-700/50 p-5 bg-gray-900/30 space-y-3 transition-all duration-300 hover:bg-gray-900/40 hover:border-gray-600/50 group">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-30 transition-opacity pointer-events-none"></div>
              <h4 className="text-sm font-medium text-cyan-400 mb-4">Connection Info</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-sm font-medium text-gray-400">Uptime (days):</div>
                <div className="text-sm text-white font-mono">{stats.uptime_in_days || 'N/A'}</div>
                
                <div className="text-sm font-medium text-gray-400">Connected Clients:</div>
                <div className="text-sm text-white font-mono">{stats.connected_clients || 'N/A'}</div>
                
                <div className="text-sm font-medium text-gray-400">Hit Rate:</div>
                <div className="text-sm text-white font-mono">{stats.hit_rate || 'N/A'}</div>
              </div>
            </div>
          </div>
        ) : (
          <Alert className="bg-red-900/30 border-red-700/50 shadow-lg shadow-red-900/20 backdrop-blur-sm">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-red-200">Error</AlertTitle>
            <AlertDescription className="text-red-300">
              Failed to load cache statistics
            </AlertDescription>
          </Alert>
        )}
      </div>
      
      {/* Cache Keys */}
      <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-lg p-6 space-y-6 shadow-xl shadow-cyan-900/5 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none"></div>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-purple-500/10 p-2 rounded-lg">
              <Database className="h-5 w-5 text-purple-400" />
            </div>
            <h3 className="text-lg text-white font-medium">Cache Keys</h3>
          </div>
          
          <div className="flex gap-3">
            <div className="flex items-center space-x-2">
              <Input
                className="bg-gray-900/50 border-gray-700 focus:border-cyan-500 focus:ring-cyan-500/20 text-gray-300 w-48"
                placeholder="Pattern (e.g. movie:*)"
                value={keyPattern}
                onChange={(e) => setKeyPattern(e.target.value)}
                disabled={stats?.status === 'offline'}
              />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchCacheKeys}
                disabled={loadingKeys || stats?.status === 'offline'}
                className="bg-gray-800/50 border-gray-700 hover:bg-gray-700 text-gray-300 hover:text-white transition-all duration-300"
              >
                {loadingKeys ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4 text-purple-400" />
                )}
                Search
              </Button>
            </div>
            
            <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="sm"
                  disabled={stats?.status === 'offline'}
                  className="bg-gradient-to-r from-red-600 to-red-700 border-red-800 hover:from-red-700 hover:to-red-800 text-white shadow-md shadow-red-500/10"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Cache
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900/95 border border-gray-700 backdrop-blur-lg">
                <DialogHeader>
                  <DialogTitle className="text-lg text-white">Clear Cache</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Are you sure you want to clear all cache entries? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-4 flex gap-3">
                  <Button 
                    variant="ghost" 
                    onClick={() => setClearConfirmOpen(false)}
                    className="bg-gray-800/50 border-gray-700 hover:bg-gray-700 text-gray-300 hover:text-white transition-all duration-300"
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={clearCache}
                    disabled={clearingCache}
                    className="bg-gradient-to-r from-red-600 to-red-700 border-red-800 hover:from-red-700 hover:to-red-800 text-white shadow-md shadow-red-500/10"
                  >
                    {clearingCache ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Clear Cache
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        
        {loadingKeys ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        ) : keys.length > 0 ? (
          <div className="border border-gray-700/50 rounded-lg overflow-hidden bg-gray-900/30">
            <div className="max-h-80 overflow-y-auto scrollbar-hide">
              <table className="w-full border-collapse">
                <thead className="bg-gray-800/70 sticky top-0">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-gray-400">Key</th>
                    <th className="text-right p-3 text-xs font-medium text-gray-400 w-32">Type</th>
                    <th className="text-right p-3 text-xs font-medium text-gray-400 w-32">TTL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {keys.map((key, index) => (
                    <tr key={key} className={`hover:bg-gray-800/30 transition-colors ${index % 2 === 0 ? 'bg-gray-900/20' : 'bg-gray-900/10'}`}>
                      <td className="p-3 text-sm font-mono text-cyan-300">{key}</td>
                      <td className="p-3 text-right text-xs text-gray-400">string</td>
                      <td className="p-3 text-right text-xs text-gray-400">-1</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400 border border-dashed border-gray-700/50 rounded-lg bg-gray-900/20">
            {stats?.status === 'offline' ? (
              <div className="flex flex-col items-center gap-2">
                <XCircle className="h-8 w-8 text-gray-500 opacity-50" />
                <p>Redis is offline. Unable to fetch keys.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Database className="h-8 w-8 text-gray-500 opacity-50" />
                <p>No cache keys found matching pattern: <span className="text-gray-300 font-mono">{keyPattern}</span></p>
              </div>
            )}
          </div>
        )}
        
        {keys.length > 0 && (
          <div className="text-xs text-gray-500">
            Showing {keys.length} key(s)
          </div>
        )}
      </div>
    </div>
  )
} 