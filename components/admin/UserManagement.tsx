'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { AlertCircle, Check, Loader2, Search, X, UserCog, RefreshCw, UserPlus } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { 
  Dialog,
  DialogContent, 
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useSession } from 'next-auth/react'

interface User {
  _id: string
  email: string
  name?: string
  image?: string
  role?: string
  created_at: string
  preferences?: {
    favorite_genres: string[]
    selected_moods: string[]
  }
}

interface PaginationData {
  total: number
  page: number
  limit: number
  pages: number
}

export function UserManagement() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    page: 1,
    limit: 10,
    pages: 0
  })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [updatingUser, setUpdatingUser] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>('')

  // Fetch users
  const fetchUsers = async (page = 1) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/admin/users?page=${page}&limit=10`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }
      
      const data = await response.json()
      setUsers(data.users)
      setPagination(data.pagination)
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  // Change page
  const handlePageChange = (newPage: number) => {
    fetchUsers(newPage)
  }

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // This would typically filter results on the server
    // For now, just a simple client-side filter
    if (searchTerm.trim() === '') {
      fetchUsers()
    } else {
      const filtered = users.filter(user => 
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase()))
      )
      setUsers(filtered)
    }
  }

  // Open edit dialog
  const openEditDialog = (user: User) => {
    setSelectedUser(user)
    setSelectedRole(user.role || 'user')
    setIsDialogOpen(true)
  }

  // Update user role
  const updateUserRole = async () => {
    if (!selectedUser) return

    // Get current user's role 
    const currentUserEmail = session?.user?.email || ''
    const currentUser = users.find(user => user.email === currentUserEmail)
    const currentUserRole = currentUser?.role || 'user'

    // Check permissions based on roles
    const isCurrentUser = selectedUser.email === currentUserEmail
    
    // Prevent users from removing their own elevated role
    if (isCurrentUser && 
        ((selectedUser.role === 'admin' && selectedRole !== 'admin') || 
         (selectedUser.role === 'owner' && selectedRole !== 'owner'))) {
      toast.error("You cannot remove your own elevated role")
      return
    }
    
    // Prevent non-owners from modifying owner role
    if (selectedUser.role === 'owner' && currentUserRole !== 'owner') {
      toast.error("Only owners can modify other owners")
      return
    }
    
    // Prevent non-owners from assigning owner role
    if (selectedRole === 'owner' && currentUserRole !== 'owner') {
      toast.error("Only owners can assign the owner role")
      return
    }
    
    // Regular admins can't modify other admins (only owners can)
    if (selectedUser.role === 'admin' && currentUserRole === 'admin' && !isCurrentUser) {
      toast.error("Only owners can modify other admins")
      return
    }
    
    // Admins can only modify regular users (not admins or owners)
    if (currentUserRole === 'admin' && 
        !isCurrentUser && 
        (selectedUser.role === 'admin' || selectedUser.role === 'owner')) {
      toast.error("Admins can only modify regular users")
      return
    }

    try {
      setUpdatingUser(true)
      
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: selectedUser._id,
          updates: {
            role: selectedRole
          }
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update user')
      }
      
      // Update the local state
      setUsers(users.map(user => 
        user._id === selectedUser._id 
          ? { ...user, role: selectedRole } 
          : user
      ))
      
      toast.success('User updated successfully')
      setIsDialogOpen(false)
    } catch (error) {
      console.error('Error updating user:', error)
      toast.error('Failed to update user')
    } finally {
      setUpdatingUser(false)
    }
  }

  // Generate initials for avatar
  const getInitials = (name?: string) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  return (
    <div className="space-y-6">
      {/* Header with title and stats */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
        <h2 className="text-xl font-semibold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">User Directory</h2>
      </div>
      
      {/* Search and actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6 bg-gray-800/30 backdrop-blur-sm p-4 rounded-lg border border-gray-700/50">
        <form onSubmit={handleSearch} className="w-full max-w-sm flex gap-2">
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900/50 border-gray-700 focus:border-cyan-500 focus:ring-cyan-500/20 text-gray-300"
          />
          <Button 
            type="submit" 
            variant="outline" 
            size="icon"
            className="bg-gray-800 border-gray-700 hover:bg-gray-700"
          >
            <Search className="h-4 w-4 text-cyan-400" />
          </Button>
        </form>
        
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-400 hidden md:block">
            {pagination.total} user{pagination.total !== 1 ? 's' : ''}
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchUsers()}
              disabled={loading}
              className="bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2 text-cyan-400" />
              )}
              Refresh
            </Button>
            
          </div>
        </div>
      </div>

      {/* User table */}
      <div className="rounded-lg border border-gray-700/50 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-800/50">
            <TableRow className="hover:bg-gray-800/70 border-gray-700/50">
              <TableHead className="text-gray-300">User</TableHead>
              <TableHead className="text-gray-300">Email</TableHead>
              <TableHead className="text-gray-300">Role</TableHead>
              <TableHead className="text-right text-gray-300">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-gray-900/20">
            {loading ? (
              <TableRow className="hover:bg-gray-800/50 border-gray-700/50">
                <TableCell colSpan={4} className="h-24 text-center">
                  <div className="flex justify-center items-center text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin text-cyan-400 mr-2" />
                    <span>Loading users...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow className="hover:bg-gray-800/50 border-gray-700/50">
                <TableCell colSpan={4} className="h-24 text-center text-gray-400">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user._id} className="hover:bg-gray-800/50 border-gray-700/50">
                  <TableCell className="text-gray-300">
                    <div className="flex items-center gap-3">
                      <Avatar className="border border-gray-700 bg-gray-800">
                        <AvatarImage src={user.image} alt={user.name} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-600 to-cyan-500 text-white">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="font-medium">{user.name || 'Anonymous'}</div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-gray-400">{user.email}</TableCell>
                  <TableCell>
                    {user.role === 'owner' ? (
                      <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-none">
                        owner
                      </Badge>
                    ) : user.role === 'admin' ? (
                      <Badge className="bg-gradient-to-r from-red-500 to-amber-500 hover:from-red-600 hover:to-amber-600 text-white border-none">
                        admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-gray-800 text-gray-300 hover:bg-gray-700">
                        user
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Determine if current user can edit this user */}
                    {(() => {
                      const currentUserEmail = session?.user?.email || ''
                      const currentUser = users.find(user => user.email === currentUserEmail)
                      const currentUserRole = currentUser?.role || 'user'
                      const isCurrentUser = user.email === currentUserEmail
                      
                      // Owner can edit anyone, admin can edit only regular users and themselves
                      const canEdit = 
                        currentUserRole === 'owner' || 
                        isCurrentUser || 
                        (currentUserRole === 'admin' && user.role !== 'admin' && user.role !== 'owner')
                        
                      return (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                          disabled={!canEdit}
                          title={!canEdit ? 
                            "You don't have permission to edit this user" : 
                            "Edit user"}
                          className={`${!canEdit ? 'opacity-50 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-gray-800/70'}`}
                        >
                          <UserCog className="h-4 w-4 mr-2 text-cyan-400" />
                          Edit
                        </Button>
                      )
                    })()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && users.length > 0 && pagination.pages > 1 && (
        <div className="flex justify-center mt-6">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => handlePageChange(Math.max(1, pagination.page - 1))}
                  className={`${pagination.page <= 1 ? 'pointer-events-none opacity-50' : ''} text-gray-400 hover:text-white hover:bg-gray-800/50`}
                />
              </PaginationItem>
              
              {Array.from({ length: pagination.pages }, (_, i) => i + 1)
                .filter(page => 
                  // Show first page, last page, current page and pages around current
                  page === 1 ||
                  page === pagination.pages ||
                  Math.abs(page - pagination.page) <= 1
                )
                .map((page, index, array) => {
                  // Add ellipsis
                  const showEllipsis = index > 0 && page - array[index - 1] > 1
                  
                  return (
                    <React.Fragment key={page}>
                      {showEllipsis && (
                        <PaginationItem>
                          <span className="px-4 py-2 text-gray-500">...</span>
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationLink
                          isActive={page === pagination.page}
                          onClick={() => handlePageChange(page)}
                          className={page === pagination.page ? 
                            'bg-gradient-to-r from-blue-600 to-cyan-500 text-white border-none' : 
                            'text-gray-400 hover:text-white hover:bg-gray-800/50'}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    </React.Fragment>
                  )
                })}
              
              <PaginationItem>
                <PaginationNext 
                  onClick={() => handlePageChange(Math.min(pagination.pages, pagination.page + 1))}
                  className={`${pagination.page >= pagination.pages ? 'pointer-events-none opacity-50' : ''} text-gray-400 hover:text-white hover:bg-gray-800/50`}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-gray-800/95 backdrop-blur-md border border-gray-700/50 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Edit User</DialogTitle>
            <DialogDescription className="text-gray-400">
              Update user role and permissions
            </DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-gray-700 bg-gray-800">
                  <AvatarImage src={selectedUser.image} alt={selectedUser.name} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-600 to-cyan-500 text-white text-lg">
                    {getInitials(selectedUser.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-medium text-xl text-white">{selectedUser.name || 'Anonymous'}</h4>
                  <p className="text-sm text-gray-400">{selectedUser.email}</p>
                </div>
              </div>
              
              <div className="grid gap-4 pt-4">
                <div className="grid gap-2">
                  <Label htmlFor="role" className="text-gray-300">User Role</Label>
                  <Select
                    value={selectedRole}
                    onValueChange={setSelectedRole}
                    disabled={
                      // Disable if current user is trying to edit their own elevated role
                      (selectedUser.email === session?.user?.email && 
                      (selectedUser.role === 'admin' || selectedUser.role === 'owner')) ||
                      // Disable if non-owner trying to edit an owner
                      (selectedUser.role === 'owner' && 
                      users.find(user => user.email === session?.user?.email)?.role !== 'owner') ||
                      // Disable while updating
                      updatingUser
                    }
                  >
                    <SelectTrigger 
                      id="role"
                      className="bg-gray-900/50 border-gray-700 focus:border-cyan-500 focus:ring-cyan-500/20 text-gray-300"
                    >
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-gray-300">
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem 
                        value="owner" 
                        disabled={users.find(user => user.email === session?.user?.email)?.role !== 'owner'}
                      >
                        Owner
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* Role explanations */}
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex gap-2 items-start text-gray-400">
                      <span className="font-semibold min-w-[50px]">User:</span>
                      <span>Regular account with basic access</span>
                    </div>
                    <div className="flex gap-2 items-start text-amber-400">
                      <span className="font-semibold min-w-[50px]">Admin:</span>
                      <span>Can manage regular users and system settings, but cannot modify other admins or owners</span>
                    </div>
                    <div className="flex gap-2 items-start text-pink-400">
                      <span className="font-semibold min-w-[50px]">Owner:</span>
                      <span>Full system access, can manage all users including admins and owners</span>
                    </div>
                  </div>
                  
                  {selectedUser.email === session?.user?.email && 
                   (selectedUser.role === 'admin' || selectedUser.role === 'owner') && (
                    <p className="text-xs text-amber-400 mt-1">Note: You cannot remove your own elevated role</p>
                  )}
                  {selectedUser.role === 'owner' && 
                   users.find(user => user.email === session?.user?.email)?.role !== 'owner' && (
                    <p className="text-xs text-red-400 mt-1">Note: Only owners can modify owner roles</p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsDialogOpen(false)}
              className="bg-gray-700/50 border-gray-600 hover:bg-gray-600 text-gray-300"
            >
              Cancel
            </Button>
            <Button 
              onClick={updateUserRole} 
              disabled={updatingUser}
              className={`
                ${updatingUser ? 'bg-gray-700' : 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400'} 
                text-white border-none
              `}
            >
              {updatingUser ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 