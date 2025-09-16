export type UserRole = "admin" | "chair" | "member"

export interface User {
  id: string
  name: string
  role: UserRole
  committeeId: string
  committeeName: string
  target_hours_per_week: number
}

export interface TimeEntry {
  id: string
  userId: string
  date: string
  hours: number
  description?: string
}

export interface TeamMember {
  id: string
  name: string
  totalHoursThisWeek: number
  role: UserRole
  target_hours_per_week: number
}

export interface Committee {
  id: string
  name: string
  chairId?: string
}

export interface AccessCode {
  id: string
  code: string
  committeeId: string
  role: UserRole
  isActive: boolean
  createdAt: string
  expiresAt?: string
}
