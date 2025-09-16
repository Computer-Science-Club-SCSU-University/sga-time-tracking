const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

// Types for API responses
export interface User {
  user_id: number;
  access_code: string;
  full_name: string;
  role: string;
  app_type?: string;
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

export interface IpCheckResponse {
  allowed: boolean;
  ip_address?: string;
  message?: string;
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
        'X-App-Type': 'clock', // Identify as clock app for session isolation
        'X-Requested-With': 'XMLHttpRequest', // Indicate AJAX request
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error occurred');
    }
  }

  async checkIpAccess(): Promise<IpCheckResponse> {
    try {
      return await this.request<IpCheckResponse>('/ip-check/');
    } catch {
      // If the endpoint doesn't exist or fails, assume access is allowed
      // This prevents blocking if the backend doesn't have IP checking yet
      return { allowed: true };
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
}

export const api = new ApiClient(API_BASE_URL); 