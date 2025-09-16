"use client"

import React, { useState, useEffect } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { api } from "@/lib/api"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@workspace/ui/components/command"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { 
  Building2, 
  Plus, 
  MoreHorizontal, 
  ChevronDown, 
  ChevronRight,
  User,
  Users,
  Edit,
  Trash2,
  UserPlus,
  UserMinus,
  X,
  Check,
  ChevronsUpDown
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@workspace/ui/lib/utils"

interface Committee {
  id: number;
  name: string;
  chair?: {
    id: number;
    name: string;
    role: string;
  };
  members: Array<{
    id: number;
    name: string;
    role: string;
  }>;
  member_count: number;
}

interface User {
  id: number;
  name?: string;
  full_name?: string;
  role: string;
}

export default function AdminCommitteesPage() {
  const [committees, setCommittees] = useState<Committee[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showChairDialog, setShowChairDialog] = useState(false)
  const [showAddMembersDialog, setShowAddMembersDialog] = useState(false)
  const [showRemoveMembersDialog, setShowRemoveMembersDialog] = useState(false)
  const [selectedCommittee, setSelectedCommittee] = useState<Committee | null>(null)
  const [newCommittee, setNewCommittee] = useState({
    name: "",
    chair_id: 0,
    member_ids: [] as number[]
  })
  const [editCommittee, setEditCommittee] = useState({
    name: ""
  })
  const [openChairPopover, setOpenChairPopover] = useState(false)
  const [openMembersPopover, setOpenMembersPopover] = useState(false)
  const [openChangeChairPopover, setOpenChangeChairPopover] = useState(false)
  const [openAddMembersPopover, setOpenAddMembersPopover] = useState(false)
  const [changeChairId, setChangeChairId] = useState(0)
  const [selectedMembersToAdd, setSelectedMembersToAdd] = useState<number[]>([])
  const [selectedMembersToRemove, setSelectedMembersToRemove] = useState<number[]>([])

  useEffect(() => {
    loadCommittees()
    loadUsers()
  }, [])

  const loadCommittees = async () => {
    try {
      const data = await api.getCommittees()
      const committees = Array.isArray(data) ? data : (data as any)?.results || []
      // Sort committees by name for consistent ordering
      const sortedCommittees = [...committees].sort((a, b) => a.name.localeCompare(b.name))
      setCommittees(sortedCommittees)
    } catch (error) {
      console.error("Failed to load committees:", error)
      toast.error("Failed to load committees")
      setCommittees([])
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const data = await api.getAllUsers()
      const users = Array.isArray(data) ? data : (data as any)?.results || []
      // Sort users by name for consistent ordering
      const sortedUsers = [...users].sort((a, b) => (a.name || a.full_name || "").localeCompare(b.name || b.full_name || ""))
      setUsers(sortedUsers)
    } catch (error) {
      console.error("Failed to load users:", error)
      toast.error("Failed to load users")
      setUsers([])
    }
  }

  const toggleRowExpansion = (committeeId: number) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(committeeId)) {
      newExpanded.delete(committeeId)
    } else {
      newExpanded.add(committeeId)
    }
    setExpandedRows(newExpanded)
  }

  const handleAddCommittee = async () => {
    if (!newCommittee.name.trim()) {
      toast.error("Committee name is required")
      return
    }
    if (!newCommittee.chair_id) {
      toast.error("Chair is required")
      return
    }

    try {
      await api.createCommittee({
        name: newCommittee.name,
        chair: newCommittee.chair_id,
        members: newCommittee.member_ids
      })
      setShowAddDialog(false)
      setNewCommittee({ name: "", chair_id: 0, member_ids: [] })
      loadCommittees()
      toast.success("Committee created successfully!")
    } catch (error) {
      console.error("Failed to create committee:", error)
      toast.error("Failed to create committee")
    }
  }

  const handleEditCommittee = (committee: Committee) => {
    setSelectedCommittee(committee)
    setEditCommittee({ name: committee.name })
    setShowEditDialog(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedCommittee) return
    
    try {
      await api.updateCommittee(selectedCommittee.id.toString(), editCommittee)
      setShowEditDialog(false)
      setSelectedCommittee(null)
      setEditCommittee({ name: "" })
      loadCommittees()
      toast.success("Committee updated successfully!")
    } catch (error) {
      console.error("Failed to update committee:", error)
      toast.error("Failed to update committee")
    }
  }

  const handleDeleteCommittee = (committee: Committee) => {
    setSelectedCommittee(committee)
    setShowDeleteDialog(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedCommittee) return

    try {
      await api.deleteCommittee(selectedCommittee.id.toString())
      setShowDeleteDialog(false)
      setSelectedCommittee(null)
      loadCommittees()
      toast.success("Committee deleted successfully")
    } catch (error) {
      console.error("Failed to delete committee:", error)
      toast.error("Failed to delete committee")
    }
  }

  const handleChangeChair = (committee: Committee) => {
    setSelectedCommittee(committee)
    setShowChairDialog(true)
  }

  const handleAddMembers = (committee: Committee) => {
    setSelectedCommittee(committee)
    setSelectedMembersToAdd([])
    setShowAddMembersDialog(true)
  }

  const handleRemoveMembers = (committee: Committee) => {
    setSelectedCommittee(committee)
    setSelectedMembersToRemove([])
    setShowRemoveMembersDialog(true)
  }

  const handleConfirmAddMembers = async () => {
    if (!selectedCommittee || selectedMembersToAdd.length === 0) {
      toast.error("Please select at least one member to add")
      return
    }

    try {
      await api.addMembersToCommittee(selectedCommittee.id.toString(), selectedMembersToAdd.map(id => id.toString()))
      setShowAddMembersDialog(false)
      setSelectedMembersToAdd([])
      setSelectedCommittee(null)
      loadCommittees()
      toast.success("Members added successfully!")
    } catch (error) {
      console.error("Failed to add members:", error)
      toast.error("Failed to add members")
    }
  }

  const handleConfirmRemoveMembers = async () => {
    if (!selectedCommittee || selectedMembersToRemove.length === 0) {
      toast.error("Please select at least one member to remove")
      return
    }

    try {
      await api.removeMembersFromCommittee(selectedCommittee.id.toString(), selectedMembersToRemove.map(id => id.toString()))
      setShowRemoveMembersDialog(false)
      setSelectedMembersToRemove([])
      setSelectedCommittee(null)
      loadCommittees()
      toast.success("Members removed successfully!")
    } catch (error) {
      console.error("Failed to remove members:", error)
      toast.error("Failed to remove members")
    }
  }

  const getSelectedChairName = () => {
    const chair = users.find(user => user.id === newCommittee.chair_id)
    return chair?.name || chair?.full_name || ""
  }

  const getSelectedMemberNames = () => {
    return newCommittee.member_ids.map(id => {
      const user = users.find(user => user.id === id)
      return user?.name || user?.full_name || ""
    }).filter((name): name is string => Boolean(name))
  }

  const removeMember = (memberId: number) => {
    setNewCommittee(prev => ({
      ...prev,
      member_ids: prev.member_ids.filter(id => id !== memberId)
    }))
  }

  const getAvailableUsersForCommittee = (committeeId?: number) => {
    if (!committeeId) return users
    
    const committee = committees.find(c => c.id === committeeId)
    if (!committee) return users
    
    // Filter out users who are already members of this committee
    const existingMemberIds = committee.members.map(m => m.id)
    const availableUsers = users.filter(user => !existingMemberIds.includes(user.id))
    // Sort available users by name
    return availableUsers.sort((a, b) => (a.name || a.full_name || "").localeCompare(b.name || b.full_name || ""))
  }

  const getRemovableMembers = (committee?: Committee | null) => {
    if (!committee) return []
    const removableMembers = committee.members.filter(member => member.id !== committee.chair?.id)
    // Sort removable members by name
    return removableMembers.sort((a, b) => a.name.localeCompare(b.name))
  }

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Committee Management</h1>
            <p className="text-muted-foreground">Create and manage committees</p>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Committee
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Committee</DialogTitle>
                <DialogDescription>
                  Create a new committee with a chair and optional members.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="committee-name">Committee Name *</Label>
                  <Input
                    id="committee-name"
                    value={newCommittee.name}
                    onChange={(e) => setNewCommittee({ ...newCommittee, name: e.target.value })}
                    placeholder="Enter committee name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Chair *</Label>
                  <Popover open={openChairPopover} onOpenChange={setOpenChairPopover}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openChairPopover}
                        className="w-full justify-between"
                      >
                        {newCommittee.chair_id ? getSelectedChairName() : "Select a chair..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput placeholder="Search users..." />
                        <CommandList>
                          <CommandEmpty>No user found.</CommandEmpty>
                          <CommandGroup>
                            {users.map((user) => (
                              <CommandItem
                                key={user.id}
                                value={user.name || user.full_name || ""}
                                onSelect={() => {
                                  setNewCommittee(prev => ({ ...prev, chair_id: user.id }))
                                  setOpenChairPopover(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    newCommittee.chair_id === user.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span>{user.name || user.full_name || ""}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Members (Optional)</Label>
                  <Popover open={openMembersPopover} onOpenChange={setOpenMembersPopover}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openMembersPopover}
                        className="w-full justify-between"
                      >
                        {newCommittee.member_ids.length > 0 
                          ? `${newCommittee.member_ids.length} member(s) selected`
                          : "Select members..."
                        }
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput placeholder="Search users..." />
                        <CommandList>
                          <CommandEmpty>No user found.</CommandEmpty>
                          <CommandGroup>
                            {users.map((user) => (
                              <CommandItem
                                key={user.id}
                                value={user.name || user.full_name || ""}
                                onSelect={() => {
                                  setNewCommittee(prev => ({
                                    ...prev,
                                    member_ids: prev.member_ids.includes(user.id)
                                      ? prev.member_ids.filter(id => id !== user.id)
                                      : [...prev.member_ids, user.id]
                                  }))
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    newCommittee.member_ids.includes(user.id) ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span>{user.name || user.full_name || ""}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  
                  {newCommittee.member_ids.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {getSelectedMemberNames().map((name, index) => (
                        <Badge key={index} variant="secondary" className="gap-1">
                          {name}
                          <button
                            onClick={() => {
                              const memberId = newCommittee.member_ids[index]
                              if (memberId) removeMember(memberId)
                            }}
                            className="ml-1 hover:bg-muted rounded-full p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddCommittee}>Create Committee</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Committee Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Committee</DialogTitle>
              <DialogDescription>
                Update committee settings for {selectedCommittee?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-committee-name">Committee Name</Label>
                <Input
                  id="edit-committee-name"
                  value={editCommittee.name}
                  onChange={(e) => setEditCommittee({ ...editCommittee, name: e.target.value })}
                  placeholder="Enter committee name"
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

        {/* Delete Committee Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Committee</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedCommittee?.name}? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>
                Delete Committee
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Chair Dialog */}
        <Dialog open={showChairDialog} onOpenChange={setShowChairDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Change Committee Chair</DialogTitle>
              <DialogDescription>
                Select a new chair for {selectedCommittee?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>New Chair *</Label>
                <Popover open={openChangeChairPopover} onOpenChange={setOpenChangeChairPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openChangeChairPopover}
                      className="w-full justify-between"
                    >
                      {changeChairId ? (users.find(u => u.id === changeChairId)?.name || users.find(u => u.id === changeChairId)?.full_name) : "Select a chair..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search users..." />
                      <CommandList>
                        <CommandEmpty>No user found.</CommandEmpty>
                        <CommandGroup>
                          {users.filter(user => user.id !== selectedCommittee?.chair?.id).map((user) => (
                            <CommandItem
                              key={user.id}
                              value={user.name || user.full_name || ""}
                              onSelect={() => {
                                setChangeChairId(user.id)
                                setOpenChangeChairPopover(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  changeChairId === user.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span>{user.name || user.full_name || ""}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowChairDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={async () => {
                  if (!changeChairId) {
                    toast.error("Please select a chair")
                    return
                  }
                  try {
                    await api.updateCommittee(selectedCommittee!.id.toString(), { chair_id: changeChairId })
                    setShowChairDialog(false)
                    setChangeChairId(0)
                    setSelectedCommittee(null)
                    loadCommittees()
                    toast.success("Committee chair updated successfully!")
                  } catch (error) {
                    console.error("Failed to update committee chair:", error)
                    toast.error("Failed to update committee chair")
                  }
                }}
              >
                Update Chair
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Members Dialog */}
        <Dialog open={showAddMembersDialog} onOpenChange={setShowAddMembersDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Members to Committee</DialogTitle>
              <DialogDescription>
                Select members to add to {selectedCommittee?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Members</Label>
                <Popover open={openAddMembersPopover} onOpenChange={setOpenAddMembersPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openAddMembersPopover}
                      className="w-full justify-between"
                    >
                      {selectedMembersToAdd.length > 0 
                        ? `${selectedMembersToAdd.length} member(s) selected`
                        : "Select members to add..."
                      }
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search users..." />
                      <CommandList>
                        <CommandEmpty>No available users found.</CommandEmpty>
                        <CommandGroup>
                          {getAvailableUsersForCommittee(selectedCommittee?.id).map((user) => (
                            <CommandItem
                              key={user.id}
                              value={user.name || user.full_name || ""}
                              onSelect={() => {
                                setSelectedMembersToAdd(prev => 
                                  prev.includes(user.id)
                                    ? prev.filter(id => id !== user.id)
                                    : [...prev, user.id]
                                )
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedMembersToAdd.includes(user.id) ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span>{user.name || user.full_name || ""}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                
                {selectedMembersToAdd.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedMembersToAdd.map((memberId) => {
                      const user = users.find(u => u.id === memberId)
                      return (
                        <Badge key={memberId} variant="secondary" className="gap-1">
                          {user?.name || user?.full_name || ""}
                          <button
                            onClick={() => setSelectedMembersToAdd(prev => prev.filter(id => id !== memberId))}
                            className="ml-1 hover:bg-muted rounded-full p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddMembersDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmAddMembers}>
                Add Members
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Members Dialog */}
        <Dialog open={showRemoveMembersDialog} onOpenChange={setShowRemoveMembersDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Remove Members from Committee</DialogTitle>
              <DialogDescription>
                Select members to remove from {selectedCommittee?.name}. Note: The committee chair cannot be removed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>
                  Current Members 
                  {selectedCommittee && (
                    <span className="text-muted-foreground font-normal">
                      ({getRemovableMembers(selectedCommittee).length} removable)
                    </span>
                  )}
                </Label>
                {selectedCommittee?.members && selectedCommittee.members.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectedCommittee.members.map((member) => {
                      const isChair = selectedCommittee?.chair?.id === member.id;
                      return (
                        <div 
                          key={member.id}
                          className={`flex items-center space-x-2 p-2 border rounded-lg ${
                            isChair ? 'bg-muted/30 border-muted' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            id={`remove-${member.id}`}
                            checked={selectedMembersToRemove.includes(member.id)}
                            disabled={isChair}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMembersToRemove(prev => [...prev, member.id])
                              } else {
                                setSelectedMembersToRemove(prev => prev.filter(id => id !== member.id))
                              }
                            }}
                            className="rounded"
                          />
                          <label 
                            htmlFor={`remove-${member.id}`}
                            className={`flex-1 flex items-center gap-2 ${
                              isChair ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                            }`}
                          >
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1">
                              <span className="font-medium text-sm">{member.name}</span>
                              <div className="text-xs text-muted-foreground capitalize">
                                {member.role}
                                {isChair && " • Chair"}
                              </div>
                              {isChair && (
                                <div className="text-xs text-muted-foreground italic">
                                  Cannot remove chair
                                </div>
                              )}
                            </div>
                          </label>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No members to remove</p>
                  </div>
                )}
                
                {/* Show info when only chair exists */}
                {selectedCommittee?.members && 
                 selectedCommittee.members.length === 1 && 
                 selectedCommittee.chair?.id === selectedCommittee.members[0]?.id && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center mt-0.5">
                        <User className="h-3 w-3 text-blue-600" />
                      </div>
                      <div className="text-sm text-blue-800">
                        <p className="font-medium">Only the chair is in this committee</p>
                        <p className="text-blue-700 mt-1">
                          Add other members first before removing anyone, or change the chair to remove the current one.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRemoveMembersDialog(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleConfirmRemoveMembers}
                disabled={
                  selectedMembersToRemove.length === 0 || 
                  getRemovableMembers(selectedCommittee).length === 0
                }
              >
                Remove Members
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Committees
            </CardTitle>
            <CardDescription>{committees.length} committees in the system</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-200 rounded"></div>
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Chair</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(committees) && committees.map((committee) => (
                    <React.Fragment key={committee.id}>
                      <TableRow>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRowExpansion(committee.id)}
                          >
                            {expandedRows.has(committee.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{committee.name}</TableCell>
                        <TableCell>
                          {committee.chair ? (
                            <div className="flex items-center gap-2">
                              <span>{committee.chair.name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No chair</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>{committee.member_count} members</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditCommittee(committee)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Committee
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleChangeChair(committee)}>
                                <User className="h-4 w-4 mr-2" />
                                Change Chair
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAddMembers(committee)}>
                                <UserPlus className="h-4 w-4 mr-2" />
                                Add Members
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleRemoveMembers(committee)}>
                                <UserMinus className="h-4 w-4 mr-2" />
                                Remove Members
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDeleteCommittee(committee)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Committee
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(committee.id) && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/30 p-0">
                            <div className="p-6 border-t border-border/50">
                              <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-semibold text-foreground">Committee Members</h4>
                              </div>
                              <div className="space-y-2">
                                {committee.members.length > 0 ? (
                                  <div className="grid gap-2">
                                    {[...committee.members].sort((a, b) => a.name.localeCompare(b.name)).map((member) => (
                                      <div 
                                        key={member.id} 
                                        className="flex items-center justify-between p-3 bg-background rounded-lg border border-border/50 transition-colors"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                            <User className="h-4 w-4 text-primary" />
                                          </div>
                                          <div>
                                            <span className="font-medium text-sm">{member.name}</span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-center py-8">
                                    <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                    <p className="text-sm text-muted-foreground">No members assigned to this committee</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Use the "Add Members" action to assign users
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
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
