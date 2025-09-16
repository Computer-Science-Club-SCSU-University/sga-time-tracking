const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

// Types for API responses
export interface User {
  user_id: number;
  access_code: string;
  full_name: string;
  role: string;
  target_hours_per_week: number;
}

export interface TimeEntry {
  id: number;
  user: User;
  clock_in: string;
  clock_out?: string;
  ip_address?: string;
  created_at: string;
  duration?: number;
  is_active: boolean;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ApiError {
  error: string;
  details?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      credentials: 'include', // Include cookies for session auth
      headers: {
        'Content-Type': 'application/json',
        'X-App-Type': 'hub', // Identify as hub app for session isolation
         'X-Requested-With': 'XMLHttpRequest', // Indicate AJAX request
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message || `HTTP error! status: ${response.status}`;
        throw new Error(errorMessage);
      }
      
      // Handle responses with no content (like 204 No Content for DELETE operations)
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {} as T;
      }
      
      // Check if response has content to parse
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const text = await response.text();
        return text ? JSON.parse(text) : {} as T;
      }
      
      // For non-JSON responses, return empty object
      return {} as T;
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error('Network error occurred');
    }
  }

  async login(accessCode: string): Promise<User> {
    return this.request<User>('/login/', {
      method: 'POST',
      body: JSON.stringify({ access_code: accessCode }),
    });
  }

  async logout(): Promise<{ message: string }> {
    return this.request<{ message: string }>('/logout/', {
      method: 'POST',
    });
  }

  async verifySession(): Promise<User | null> {
    try {
      return await this.request<User>('/me/');
    } catch {
      return null;
    }
  }

  async clockIn(): Promise<TimeEntry> {
    return this.request<TimeEntry>('/time-logs/clock_in/', {
      method: 'POST',
    });
  }

  async clockOut(): Promise<TimeEntry> {
    return this.request<TimeEntry>('/time-logs/clock_out/', {
      method: 'POST',
    });
  }

  async getTimeEntries(): Promise<PaginatedResponse<TimeEntry> | TimeEntry[]> {
    return this.request<PaginatedResponse<TimeEntry> | TimeEntry[]>('/time-logs/');
  }

  // Additional methods for hub functionality
  async getTimeEntriesForWeek(userId?: string, weekOffset: number = 0): Promise<TimeEntry[]> {
    // For now, return all entries - backend doesn't support week filtering yet
    const response = await this.getTimeEntries();
    const entries = Array.isArray(response) ? response : response.results;
    return entries;
  }

  async exportTimesheet(userId?: string, format: 'csv' | 'pdf' = 'csv'): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/time-logs/export_csv/`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Export failed');
    }
    
    return response.blob();
  }

  // Team management endpoints (for chairs and admins)
  async getTeamMembers(committeeId?: string): Promise<any[]> {
    const url = committeeId ? `/team/?committee_id=${committeeId}` : '/team/';
    return this.request<any[]>(url);
  }

  async getCommitteeMembers(committeeId: string): Promise<any[]> {
    return this.getTeamMembers(committeeId);
  }

  // Get all users (admin only)
  async getAllUsers(): Promise<any[]> {
    return this.request<any[]>('/users/');
  }

  async getMemberTimesheet(memberId: string): Promise<TimeEntry[]> {
    return this.request<TimeEntry[]>(`/team/${memberId}/member_timesheet/`);
  }

  // Admin endpoints
  async getSystemStats(): Promise<any> {
    return this.request<any>('/admin/');
  }

  async createUser(userData: any): Promise<any> {
    // Transform frontend data to backend format
    const backendData = {
      full_name: userData.name,
      target_hours_per_week: parseInt(userData.target_hours_per_week) || 2
    };
    
    return this.request<any>('/admin/create_user/', {
      method: 'POST',
      body: JSON.stringify(backendData),
    });
  }

  async deleteUser(userId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/admin/${userId}/delete_user/`, {
      method: 'DELETE',
    });
  }

  async updateUser(userId: string, userData: any): Promise<any> {
    return this.request<any>(`/admin/${userId}/update_user/`, {
      method: 'PATCH',
      body: JSON.stringify(userData),
    });
  }

  async updateUserRole(userId: string, role: string): Promise<any> {
    return this.request<any>(`/admin/${userId}/update_user_role/`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  // Allowed IP management endpoints
  async getAllowedIPs(): Promise<any[]> {
    return this.request<any[]>('/allowed-ips/');
  }

  async createAllowedIP(ipData: any): Promise<any> {
    return this.request<any>('/allowed-ips/', {
      method: 'POST',
      body: JSON.stringify(ipData),
    });
  }

  async updateAllowedIP(ipId: string, ipData: any): Promise<any> {
    return this.request<any>(`/allowed-ips/${ipId}/`, {
      method: 'PATCH',
      body: JSON.stringify(ipData),
    });
  }

  async deleteAllowedIP(ipId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/allowed-ips/${ipId}/`, {
      method: 'DELETE',
    });
  }

  // Access code management endpoints
  async getAccessCodes(): Promise<any[]> {
    return this.request<any[]>('/access-codes/');
  }

  async createAccessCode(codeData: any): Promise<any> {
    return this.request<any>('/access-codes/', {
      method: 'POST',
      body: JSON.stringify(codeData),
    });
  }

  async revokeAccessCode(codeId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/access-codes/${codeId}/revoke/`, {
      method: 'POST',
    });
  }

  async regenerateAccessCode(userId: string): Promise<any> {
    return this.request<any>(`/admin/${userId}/regenerate_access_code/`, {
      method: 'POST',
    });
  }

  // Chair endpoints
  async getTeamSummary(): Promise<any> {
    return this.request<any>('/chair/team_summary/');
  }

  async getMyCommittees(): Promise<any[]> {
    return this.request<any[]>('/chair/my_committees/');
  }

  async getAllTimeEntries(): Promise<TimeEntry[]> {
    let url = '/time-logs/';
    let allEntries: TimeEntry[] = [];
    while (url) {
      const response = await this.request<PaginatedResponse<TimeEntry>>(url);
      allEntries = allEntries.concat(response.results);
      url = response.next
        ? response.next.startsWith('http')
          ? response.next.replace(this.baseUrl, '')
          : response.next
        : '';
    }
    return allEntries;
  }

  // Committee management endpoints
  async getCommittees(): Promise<any[]> {
    return this.request<any[]>('/committees/');
  }

  async createCommittee(committeeData: any): Promise<any> {
    return this.request<any>('/committees/', {
      method: 'POST',
      body: JSON.stringify(committeeData),
    });
  }

  async updateCommittee(committeeId: string, committeeData: any): Promise<any> {
    return this.request<any>(`/committees/${committeeId}/`, {
      method: 'PATCH',
      body: JSON.stringify(committeeData),
    });
  }

  async deleteCommittee(committeeId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/committees/${committeeId}/`, {
      method: 'DELETE',
    });
  }

  async addMembersToCommittee(committeeId: string, memberIds: string[]): Promise<any> {
    return this.request<any>(`/committees/${committeeId}/add_members/`, {
      method: 'POST',
      body: JSON.stringify({ member_ids: memberIds }),
    });
  }

  async removeMembersFromCommittee(committeeId: string, memberIds: string[]): Promise<any> {
    return this.request<any>(`/committees/${committeeId}/remove_members/`, {
      method: 'POST',
      body: JSON.stringify({ member_ids: memberIds }),
    });
  }
}

export const api = new ApiClient(API_BASE_URL); 