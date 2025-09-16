import { api } from './api'
import { AuthService } from './auth'
import type { UserRole } from './types'

// Role-based API service with permission checking
export class RoleBasedApi {
  constructor(private userRole: UserRole) {}

  // Common methods available to all roles
  getCurrentUser = () => api.verifySession()
  clockIn = () => api.clockIn()
  clockOut = () => api.clockOut()
  getTimeEntries = () => api.getTimeEntries()
  exportTimesheet = (userId?: string, format?: 'csv' | 'pdf') => 
    api.exportTimesheet(userId, format)
  getTimeEntriesForWeek = (weekOffset: number = 0) => 
    api.getTimeEntriesForWeek(undefined, weekOffset)

  // Team management methods (chairs and admins)
  async getTeamMembers() {
    if (!AuthService.canViewTeam(this.userRole)) {
      throw new Error('Insufficient permissions to view team')
    }
    return api.getTeamMembers()
  }

  async getMemberTimesheet(memberId: string) {
    if (!AuthService.canViewTeam(this.userRole)) {
      throw new Error('Insufficient permissions to view member timesheet')
    }
    return api.getMemberTimesheet(memberId)
  }

  async getTeamSummary() {
    if (!AuthService.canViewTeam(this.userRole)) {
      throw new Error('Insufficient permissions to view team summary')
    }
    return api.getTeamSummary()
  }

  // Admin methods
  async getSystemStats() {
    if (!AuthService.canViewSystemStats(this.userRole)) {
      throw new Error('Insufficient permissions to view system stats')
    }
    return api.getSystemStats()
  }

  async createUser(userData: any) {
    if (!AuthService.canManageUsers(this.userRole)) {
      throw new Error('Insufficient permissions to create users')
    }
    return api.createUser(userData)
  }

  async deleteUser(userId: string) {
    if (!AuthService.canManageUsers(this.userRole)) {
      throw new Error('Insufficient permissions to delete users')
    }
    return api.deleteUser(userId)
  }

  async updateUserRole(userId: string, role: string) {
    if (!AuthService.canManageUsers(this.userRole)) {
      throw new Error('Insufficient permissions to update user roles')
    }
    return api.updateUserRole(userId, role)
  }

  // Enhanced methods that return role-appropriate data
  async getEnhancedTimeEntriesForWeek(weekOffset: number = 0) {
    const baseEntries = await this.getTimeEntriesForWeek(weekOffset)
    
    // Add role-specific data
    if (AuthService.canViewTeam(this.userRole)) {
      const teamSummary = await this.getTeamSummary()
      return {
        ownEntries: baseEntries,
        teamSummary
      }
    }
    
    return baseEntries
  }

  async getDashboardData() {
    const baseData = {
      timeEntries: await this.getTimeEntries(),
      currentUser: await this.getCurrentUser()
    }

    // Add role-specific dashboard data
    if (AuthService.canViewSystemStats(this.userRole)) {
      const systemStats = await this.getSystemStats()
      return {
        ...baseData,
        systemStats
      }
    }

    if (AuthService.canViewTeam(this.userRole)) {
      const teamSummary = await this.getTeamSummary()
      return {
        ...baseData,
        teamSummary
      }
    }

    return baseData
  }
}

// Factory function to create role-based API service
export function createRoleBasedApi(userRole: UserRole): RoleBasedApi {
  return new RoleBasedApi(userRole)
}

// Hook for use in React components
export function useRoleBasedApi(userRole: UserRole) {
  return createRoleBasedApi(userRole)
} 