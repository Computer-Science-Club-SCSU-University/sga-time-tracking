import { api } from './api';
import type { TimeEntry } from "./api"
import { startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay, addWeeks, subWeeks } from "date-fns"

export interface DashboardStats {
  totalHours: number;
  daysLogged: number;
  currentStreak: number;
  longestStreak: number;
  averageHoursPerDay: number;
  productivityScore: number;
  weeklyTrend: 'up' | 'down' | 'stable';
  monthlyTrend: 'up' | 'down' | 'stable';
  recentActivity: TimeEntry[];
  weeklyBreakdown: WeeklyData[];
  productivityInsights: string[];
}

export interface WeeklyData {
  day: string;
  hours: number;
  sessions: number;
  productivity: number;
}

export interface SystemStats {
  total_users: number;
  total_logs: number;
  active_sessions: number;
  role_distribution: Array<{ role: string; count: number }>;
  recent_activity: TimeEntry[];
}

export interface TeamSummary {
  team_members: Array<{
    id: number;
    name: string;
    role: string;
    weeklyHours: number;
    activeSessions: number;
    isOnline: boolean;
  }>;
  total_team_hours: number;
  total_active_sessions: number;
  online_members: number;
}

export class DashboardService {
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      // Get user's time entries (all pages)
      const timeEntries = await api.getAllTimeEntries();
      const entries = timeEntries;
      
      // Calculate statistics from real data
      const stats = DashboardService.calculateStats(entries);
      
      return {
        totalHours: stats.totalHours,
        daysLogged: stats.daysLogged,
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        averageHoursPerDay: stats.averageHoursPerDay,
        productivityScore: stats.productivityScore,
        weeklyTrend: stats.weeklyTrend,
        monthlyTrend: stats.monthlyTrend,
        recentActivity: entries.slice(0, 5), // Last 5 entries
        weeklyBreakdown: this.calculateWeeklyBreakdown(entries),
        productivityInsights: this.generateInsights(entries, stats)
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      // Return default stats if API fails
      return this.getDefaultStats();
    }
  }

  async getSystemStats(): Promise<SystemStats> {
    try {
      return await api.getSystemStats();
    } catch (error) {
      console.error('Error fetching system stats:', error);
      return {
        total_users: 0,
        total_logs: 0,
        active_sessions: 0,
        role_distribution: [],
        recent_activity: []
      };
    }
  }

  async getTeamSummary(): Promise<TeamSummary> {
    try {
      return await api.getTeamSummary();
    } catch (error) {
      console.error('Error fetching team summary:', error);
      return {
        team_members: [],
        total_team_hours: 0,
        total_active_sessions: 0,
        online_members: 0
      };
    }
  }

  static calculateStats(entries: TimeEntry[], now: Date = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Only include entries where both clock_in and clock_out are within the current week
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    
    // Include any session that overlaps the week
    const weekEntries = entries.filter(entry => {
      const clockIn = new Date(entry.clock_in)
      const clockOut = entry.clock_out ? new Date(entry.clock_out) : null
      // Completed session: any overlap with week
      if (clockOut) {
        return (clockIn <= weekEnd && clockOut >= weekStart)
      }
      // Ongoing session: clock_in in week
      if (entry.is_active && !entry.clock_out) {
        return clockIn >= weekStart && clockIn <= weekEnd
      }
      return false
    })
    
    // Calculate total hours for the week
    const totalHours = weekEntries.reduce((total, entry) => {
      if (entry.clock_in && entry.clock_out && typeof entry.duration === 'number') {
        // Use duration field (now in seconds) when available
        return total + (entry.duration / 3600)
      } else if (entry.is_active && !entry.clock_out) {
        // For active sessions, calculate from clock_in to now
        const clockIn = new Date(entry.clock_in)
        const seconds = Math.max(0, (now.getTime() - clockIn.getTime()) / 1000)
        return total + (seconds / 3600)
      }
      return total
    }, 0)
    
    // Calculate days logged
    const uniqueDays = new Set(
      weekEntries.map(entry => new Date(entry.clock_in).toDateString())
    );
    const daysLogged = uniqueDays.size;
    // Calculate streaks
    const { currentStreak, longestStreak } = DashboardService.prototype.calculateStreaks(entries);
    // Calculate average hours per day
    const averageHoursPerDay = daysLogged > 0 ? totalHours / daysLogged : 0;
    // Calculate productivity score (based on consistency and hours)
    const productivityScore = Math.min(100, Math.round(
      (averageHoursPerDay / 8) * 50 + // Hours component (max 50 points)
      (daysLogged / 30) * 50 // Consistency component (max 50 points)
    ));
    // Calculate trends
    const weeklyTrend = DashboardService.prototype.calculateTrend(entries, 7);
    const monthlyTrend = DashboardService.prototype.calculateTrend(entries, 30);
    return {
      totalHours: Math.round(totalHours * 100) / 100,
      daysLogged,
      currentStreak,
      longestStreak,
      averageHoursPerDay: Math.round(averageHoursPerDay * 100) / 100,
      productivityScore,
      weeklyTrend,
      monthlyTrend
    };
  }

  private calculateStreaks(entries: TimeEntry[]) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Get unique days with activity
    const activeDays = new Set(
      entries.map(entry => new Date(entry.clock_in).toDateString())
    );
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    // Check current streak (consecutive days from today backwards)
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateString = checkDate.toDateString();
      
      if (activeDays.has(dateString)) {
        currentStreak++;
      } else {
        break;
      }
    }
    
    // Calculate longest streak
    const sortedDays = Array.from(activeDays).sort();
    for (let i = 0; i < sortedDays.length; i++) {
      const currentDate = new Date(sortedDays[i] || '');
      const prevDate = i > 0 ? new Date(sortedDays[i - 1] || '') : null;
      
      if (prevDate) {
        const dayDiff = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
        if (dayDiff === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      } else {
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    
    return { currentStreak, longestStreak };
  }

  private calculateTrend(entries: TimeEntry[], days: number): 'up' | 'down' | 'stable' {
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - days);
    
    const recentEntries = entries.filter(entry => {
      const entryDate = new Date(entry.clock_in);
      return entryDate >= periodStart && entryDate <= periodEnd;
    });
    
    const olderEntries = entries.filter(entry => {
      const entryDate = new Date(entry.clock_in);
      const olderStart = new Date(periodStart);
      olderStart.setDate(olderStart.getDate() - days);
      return entryDate >= olderStart && entryDate < periodStart;
    });
    
    const recentHours = recentEntries.reduce((total, entry) => {
      return total + (entry.duration ? entry.duration / 3600 : 0);
    }, 0);
    
    const olderHours = olderEntries.reduce((total, entry) => {
      return total + (entry.duration ? entry.duration / 3600 : 0);
    }, 0);
    
    const diff = recentHours - olderHours;
    
    if (diff > 2) return 'up';
    if (diff < -2) return 'down';
    return 'stable';
  }

  private calculateWeeklyBreakdown(entries: TimeEntry[]): WeeklyData[] {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekData: WeeklyData[] = [];
    
    for (let i = 0; i < 7; i++) {
      const dayEntries = entries.filter(entry => {
        const entryDate = new Date(entry.clock_in);
        return entryDate.getDay() === i;
      });
      
      const hours = dayEntries.reduce((total, entry) => {
        return total + (entry.duration || 0);
      }, 0);
      
      const sessions = dayEntries.length;
      const productivity = hours > 0 ? Math.min(100, (hours / 8) * 100) : 0;
      
      weekData.push({
        day: days[i]!,
        hours: Math.round(hours * 100) / 100,
        sessions,
        productivity: Math.round(productivity)
      });
    }
    
    return weekData;
  }

  private generateInsights(entries: TimeEntry[], stats: any): string[] {
    const insights: string[] = [];
    
    if (stats.currentStreak > 0) {
      insights.push(`You're on a ${stats.currentStreak}-day streak! Keep it up!`);
    }
    
    if (stats.averageHoursPerDay < 4) {
      insights.push('Consider logging more hours to improve your productivity score.');
    } else if (stats.averageHoursPerDay > 8) {
      insights.push('Great work! You are consistently logging full workdays.');
    }
    
    if (stats.weeklyTrend === 'up') {
      insights.push('Your weekly hours are trending upward - excellent progress!');
    } else if (stats.weeklyTrend === 'down') {
      insights.push('Your weekly hours have decreased. Consider reviewing your schedule.');
    }
    
    if (stats.productivityScore > 80) {
      insights.push('Outstanding productivity! You are in the top tier of performers.');
    } else if (stats.productivityScore < 50) {
      insights.push('Focus on consistency to improve your productivity score.');
    }
    
    return insights;
  }

  private getDefaultStats(): DashboardStats {
    return {
      totalHours: 0,
      daysLogged: 0,
      currentStreak: 0,
      longestStreak: 0,
      averageHoursPerDay: 0,
      productivityScore: 0,
      weeklyTrend: 'stable',
      monthlyTrend: 'stable',
      recentActivity: [],
      weeklyBreakdown: [],
      productivityInsights: ['Start logging your time to see insights here!']
    };
  }
}

export const dashboardService = new DashboardService(); 