import React from 'react'
import { AdminCheck } from '@/components/AdminCheck'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, Database, BarChart3, Users, Settings, Home, Globe } from 'lucide-react'
import { UserManagement } from '@/components/admin/UserManagement'
import { DashboardOverview } from '@/components/admin/DashboardOverview'
import { CacheManagement } from '@/components/admin/CacheManagement'
import { SystemSettings } from '@/components/admin/SystemSettings'
import Link from 'next/link'

export default function AdminPage() {
  return (
    <AdminCheck>
      <div className="relative min-h-screen overflow-hidden">
        {/* Enhanced Background Effects */}
        <div className="fixed inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-x" />
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-900/95 to-gray-800/90" />
          <div className="absolute inset-0 bg-scan-lines opacity-5" />
        </div>

        {/* Main Content */}
        <div className="relative z-10 container mx-auto py-8 px-4">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 shadow-lg shadow-blue-600/20 transform hover:scale-105 transition-all duration-300">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Admin Dashboard</h1>
                <p className="text-gray-400">Manage your movie recommendation system</p>
              </div>
            </div>
            <Link 
              href="/"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 border border-gray-700/50 transition-all duration-300 backdrop-blur-sm"
            >
              <Home className="w-4 h-4" />
              <span className="font-medium">Back to Home</span>
            </Link>
          </div>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-8 bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 p-1 rounded-xl">
              <TabsTrigger 
                value="overview"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600/80 data-[state=active]:to-cyan-500/80 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/20 rounded-lg"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="cache"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600/80 data-[state=active]:to-cyan-500/80 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/20 rounded-lg"
              >
                <Database className="w-4 h-4 mr-2" />
                Cache Management
              </TabsTrigger>
              <TabsTrigger 
                value="users"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600/80 data-[state=active]:to-cyan-500/80 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/20 rounded-lg"
              >
                <Users className="w-4 h-4 mr-2" />
                Users
              </TabsTrigger>
              <TabsTrigger 
                value="settings"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600/80 data-[state=active]:to-cyan-500/80 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/20 rounded-lg"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-6">
              <DashboardOverview />
            </TabsContent>
            
            <TabsContent value="cache" className="space-y-6">
              <Card className="bg-gray-800/30 backdrop-blur-sm border-gray-700/50 shadow-xl shadow-cyan-900/5 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none"></div>
                <CardContent className="p-0">
                  <CacheManagement />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="users" className="space-y-6">
              <Card className="bg-gray-800/30 backdrop-blur-sm border-gray-700/50 shadow-xl shadow-cyan-900/5 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none"></div>
                <CardHeader className="pb-0">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-cyan-400" />
                    <CardTitle className="text-white">User Management</CardTitle>
                  </div>
                  <CardDescription className="text-gray-400">View and manage system users</CardDescription>
                </CardHeader>
                <CardContent>
                  <UserManagement />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="settings" className="space-y-6">
              <Card className="bg-gray-800/30 backdrop-blur-sm border-gray-700/50 shadow-xl shadow-cyan-900/5 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none"></div>
                <CardHeader className="pb-0">
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-cyan-400" />
                    <CardTitle className="text-white">System Settings</CardTitle>
                  </div>
                  <CardDescription className="text-gray-400">Manage application settings</CardDescription>
                </CardHeader>
                <CardContent>
                  <SystemSettings />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminCheck>
  )
} 