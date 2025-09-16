"use client"

import { useState, useEffect } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { api } from "@/lib/api"
import type { TeamMember } from "@/lib/types"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Plus, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

export default function AdminUsersPage() {
  const [users, setUsers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<TeamMember | null>(null)
  const [newUser, setNewUser] = useState({
    name: "",
    target_hours_per_week: ""
  })
  const [editUser, setEditUser] = useState({
    target_hours_per_week: ""
  })

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const data = await api.getTeamMembers()
      // Sort users by name as fallback in case backend doesn't sort
      const sortedUsers = [...data].sort((a, b) => a.name.localeCompare(b.name))
      setUsers(sortedUsers)
    } catch (error) {
      console.error("Failed to load users:", error)
      toast.error("Failed to load users")
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async () => {
    try {
      const createdUser = await api.createUser(newUser)
      setShowAddDialog(false)
      setNewUser({ name: "", target_hours_per_week: "" })
      loadUsers()
      toast.success("User created successfully!")
    } catch (error) {
      console.error("Failed to create user:", error)
      toast.error("Failed to create user")
    }
  }

  const handleEditUser = (user: TeamMember) => {
    setSelectedUser(user)
    setEditUser({ target_hours_per_week: user.target_hours_per_week?.toString() || "" })
    setShowEditDialog(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedUser) return
    
    try {
      await api.updateUser(selectedUser.id, { target_hours_per_week: parseInt(editUser.target_hours_per_week) || 2 })
      setShowEditDialog(false)
      setSelectedUser(null)
      setEditUser({ target_hours_per_week: "" })
      loadUsers()
      toast.success("User updated successfully!")
    } catch (error) {
      console.error("Failed to update user:", error)
      toast.error("Failed to update user")
    }
  }

  const handleDeleteUser = (user: TeamMember) => {
    setSelectedUser(user)
    setShowDeleteDialog(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedUser) return

    try {
      await api.deleteUser(selectedUser.id)
      setShowDeleteDialog(false)
      setSelectedUser(null)
      loadUsers()
      toast.success("User deleted successfully")
    } catch (error) {
      console.error("Failed to delete user:", error)
      toast.error("Failed to delete user")
    }
  }

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">User Management</h1>
            <p className="text-muted-foreground">Manage users, roles, and committees</p>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>Create a new user account with role and committee assignment.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    placeholder="Enter user's full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target_hours_per_week">Target Hours Per Week</Label>
                  <Input
                    id="target_hours_per_week"
                    type="number"
                    min="1"
                    max="168"
                    value={newUser.target_hours_per_week}
                    onChange={(e) => setNewUser({ ...newUser, target_hours_per_week: e.target.value })}
                    placeholder="Enter target hours per week"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddUser}>Create User</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit User Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update target hours per week for {selectedUser?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={selectedUser?.name || ""}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-target-hours">Target Hours Per Week</Label>
                <Input
                  id="edit-target-hours"
                  type="number"
                  min="1"
                  max="168"
                  value={editUser.target_hours_per_week}
                  onChange={(e) => setEditUser({ ...editUser, target_hours_per_week: e.target.value })}
                  placeholder="Enter target hours per week"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete User Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedUser?.name}? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>
                Delete User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>{users.length} users in the system</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-200 rounded"></div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>
                        <span className="capitalize">
                          {user.role}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditUser(user)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteUser(user)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  )
}
