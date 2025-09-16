import type { User, UserRole } from "./types"

export class AuthService {
  private static baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"

  // Permission definitions
  static readonly PERMISSIONS = {
    // Time tracking permissions
    TIME_TRACKING: {
      CLOCK_IN: 'time_tracking.clock_in',
      CLOCK_OUT: 'time_tracking.clock_out',
      VIEW_OWN_LOGS: 'time_tracking.view_own_logs',
      EXPORT_OWN_LOGS: 'time_tracking.export_own_logs',
    },
    // Team management permissions
    TEAM_MANAGEMENT: {
      VIEW_TEAM: 'team.view_team',
      VIEW_MEMBER_TIMESHEET: 'team.view_member_timesheet',
      VIEW_TEAM_SUMMARY: 'team.view_team_summary',
    },
    // Admin permissions
    ADMIN: {
      MANAGE_USERS: 'admin.manage_users',
      VIEW_SYSTEM_STATS: 'admin.view_system_stats',
      MANAGE_COMMITTEES: 'admin.manage_committees',
      MANAGE_ACCESS_CODES: 'admin.manage_access_codes',
    },
    // User management permissions
    USER_MANAGEMENT: {
      CREATE_USER: 'user.create',
      DELETE_USER: 'user.delete',
      UPDATE_USER_ROLE: 'user.update_role',
      VIEW_ALL_USERS: 'user.view_all',
    }
  } as const

  // Role-based permission mappings
  private static readonly ROLE_PERMISSIONS: Record<UserRole, string[]> = {
    member: [
      'time_tracking.clock_in',
      'time_tracking.clock_out',
      'time_tracking.view_own_logs',
      'time_tracking.export_own_logs',
    ],
    chair: [
      'time_tracking.clock_in',
      'time_tracking.clock_out',
      'time_tracking.view_own_logs',
      'time_tracking.export_own_logs',
      'team.view_team',
      'team.view_member_timesheet',
      'team.view_team_summary',
    ],
    admin: [
      'time_tracking.clock_in',
      'time_tracking.clock_out',
      'time_tracking.view_own_logs',
      'time_tracking.export_own_logs',
      'team.view_team',
      'team.view_member_timesheet',
      'team.view_team_summary',
      'admin.manage_users',
      'admin.view_system_stats',
      'admin.manage_committees',
      'admin.manage_access_codes',
      'user.create',
      'user.delete',
      'user.update_role',
      'user.view_all',
    ]
  }

  static async login(accessCode: string): Promise<User> {
    // Clear any existing session first by attempting logout
    try {
      await this.logout()
      // Add a small delay to ensure backend processes the logout
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch {
      // Ignore logout errors during login
    }
    
    const response = await fetch(`${this.baseUrl}/login/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Type": "hub",
        "X-Requested-With": "XMLHttpRequest",
        "Cache-Control": "no-cache",
      },
      credentials: "include",
      cache: "no-store",  // Prevent any caching of the login request
      body: JSON.stringify({ access_code: accessCode }),
    })

    if (!response.ok) {
      throw new Error("Invalid credentials")
    }

    const userData = await response.json()
    
    // Transform backend user data to frontend format
    return {
      id: userData.user_id.toString(),
      name: userData.full_name,
      role: userData.role as UserRole,
      committeeId: "1", // Default committee for now
      committeeName: "Default Committee",
      target_hours_per_week: userData.target_hours_per_week || 2
    }
  }

  static async getCurrentUser(): Promise<User | null> {
    try {
      const response = await fetch(`${this.baseUrl}/me/`, {
        credentials: "include",
        headers: {
          "X-App-Type": "hub",
          "X-Requested-With": "XMLHttpRequest",
          "Cache-Control": "no-cache",
        },
        cache: "no-store",  // Prevent caching of user verification
      })

      if (!response.ok) {
        return null
      }

      const userData = await response.json()
      
      // Transform backend user data to frontend format
      return {
        id: userData.user_id.toString(),
        name: userData.full_name,
        role: userData.role as UserRole,
        committeeId: "1",
        committeeName: "Default Committee",
        target_hours_per_week: userData.target_hours_per_week || 2
      }
    } catch {
      return null
    }
  }

  static async logout(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/logout/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-App-Type": "hub",
          "X-Requested-With": "XMLHttpRequest",
          "Cache-Control": "no-cache",
        },
      })
      
      // Don't throw on error, just log it
      if (!response.ok) {
        console.error("Logout response not OK:", response.status)
      }
    } catch (error) {
      console.error("Logout error:", error)
      // Don't throw - we want to clear local state regardless
    }
    
    // Clear any cached data
    if (typeof window !== "undefined") {
      try {
        // Clear all cookies accessible from JavaScript
        document.cookie.split(";").forEach(cookie => {
          const eqPos = cookie.indexOf("=")
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim()
          // Clear cookie for all possible paths
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/api`
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/api/`
        })
      } catch (e) {
        console.error("Error clearing cookies:", e)
      }
    }
  }

  // Enhanced permission checking methods
  static hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
    const roleHierarchy: Record<UserRole, number> = {
      member: 1,
      chair: 2,
      admin: 3,
    }

    return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
  }

  static hasSpecificPermission(userRole: UserRole, permission: string): boolean {
    const userPermissions = this.ROLE_PERMISSIONS[userRole] || []
    return userPermissions.includes(permission)
  }

  static hasAnyPermission(userRole: UserRole, permissions: string[]): boolean {
    const userPermissions = this.ROLE_PERMISSIONS[userRole] || []
    return permissions.some(permission => userPermissions.includes(permission))
  }

  static hasAllPermissions(userRole: UserRole, permissions: string[]): boolean {
    const userPermissions = this.ROLE_PERMISSIONS[userRole] || []
    return permissions.every(permission => userPermissions.includes(permission))
  }

  // Role-specific permission checks
  static canManageUsers(userRole: UserRole): boolean {
    return this.hasSpecificPermission(userRole, 'admin.manage_users')
  }

  static canViewTeam(userRole: UserRole): boolean {
    return this.hasSpecificPermission(userRole, 'team.view_team')
  }

  static canViewSystemStats(userRole: UserRole): boolean {
    return this.hasSpecificPermission(userRole, 'admin.view_system_stats')
  }

  static canClockInOut(userRole: UserRole): boolean {
    return this.hasSpecificPermission(userRole, 'time_tracking.clock_in')
  }

  static canExportLogs(userRole: UserRole): boolean {
    return this.hasSpecificPermission(userRole, 'time_tracking.export_own_logs')
  }

  // Get user permissions for debugging/display
  static getUserPermissions(userRole: UserRole): string[] {
    return this.ROLE_PERMISSIONS[userRole] || []
  }

  // Check if user can access specific features
  static canAccessFeature(userRole: UserRole, feature: string): boolean {
    const featurePermissions: Record<string, string[]> = {
      'dashboard': ['time_tracking.view_own_logs'],
      'team': ['team.view_team'],
      'team-summary': ['team.view_team_summary'],
      'admin-users': ['admin.manage_users'],
      'admin-committees': ['admin.manage_committees'],
      'admin-access-codes': ['admin.manage_access_codes'],
      'admin-settings': ['admin.view_system_stats'],
      'clock-in-out': ['time_tracking.clock_in'],
      'export-timesheet': ['time_tracking.export_own_logs'],
    }

    const requiredPermissions = featurePermissions[feature] || []
    return this.hasAllPermissions(userRole, requiredPermissions)
  }
}
