import { Injectable, inject, signal } from '@angular/core';
import { CapacitorCookies } from '@capacitor/core';
import { Router } from '@angular/router';
import { BackendConfigService } from './backend-config.service';

export interface User {
  user_id: string;
  tenant_id: string;
  email: string;
}

export interface UserInfo {
  user_id: string;
  email: string;
  full_name?: string;
}

interface RefreshResponse {
  access_token: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  access_token?: string;
  user?: User;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly backendConfig = inject(BackendConfigService);
  private readonly router = inject(Router);

  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;
  private restorePromise: Promise<void> | null = null;

  readonly isAuthenticated = signal(false);
  readonly currentUser = signal<User | null>(null);

  constructor() {
    void this.restoreSession();
  }

  async restoreSession(): Promise<void> {
    if (this.accessToken && this.isAuthenticated()) {
      return;
    }

    if (this.restorePromise) {
      return this.restorePromise;
    }

    this.restorePromise = (async () => {
      try {
        const accessToken = await this.refreshAccessToken();
        if (!accessToken) {
          this.clearSession();
          return;
        }

        this.accessToken = accessToken;
        await this.fetchUserInfo();
      } catch (error) {
        console.log('No valid session to restore');
        this.clearSession();
      } finally {
        this.restorePromise = null;
      }
    })();

    return this.restorePromise;
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      });

      const data: LoginResponse = await response.json();

      if (data.success && data.access_token && data.user) {
        this.accessToken = data.access_token;
        this.currentUser.set(data.user);
        this.isAuthenticated.set(true);
      }

      return data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Login error:', msg, this.getBaseUrl());
      return {
        success: false,
        error: 'Failed to connect to server'
      };
    }
  }

  private async fetchUserInfo(): Promise<void> {
    if (!this.accessToken) {
      return;
    }

    try {
      const response = await fetch(`${this.getBaseUrl()}/auth/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      const user: User = await response.json();
      this.currentUser.set(user);
      this.isAuthenticated.set(true);
    } catch (error) {
      console.error('Fetch user info error:', error);
      this.clearSession();
    }
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.getBaseUrl()}/auth/refresh`, {
          method: 'POST',
          credentials: 'include'
        });

        if (!response.ok) {
          return null;
        }

        const data: RefreshResponse = await response.json();
        return data.access_token;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Token refresh error:', msg, this.getBaseUrl());
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.accessToken) {
      const accessToken = await this.refreshAccessToken();
      if (accessToken) {
        this.accessToken = accessToken;
        await this.fetchUserInfo();
      }
    }

    return this.accessToken;
  }

  async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();

    if (!token) {
      throw new Error('Not authenticated');
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);

    let response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      const accessToken = await this.refreshAccessToken();

      if (!accessToken) {
        await this.logout();
        throw new Error('Session expired');
      }

      this.accessToken = accessToken;
      headers.set('Authorization', `Bearer ${accessToken}`);

      response = await fetch(url, {
        ...options,
        headers
      });
    }

    return response;
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${this.getBaseUrl()}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearSession();
      try {
        await CapacitorCookies.deleteCookie({
          url: this.backendConfig.getEventsUrl(),
          key: 'access_token'
        });
      } catch (error) {
        console.warn('Unable to clear SSE access cookie:', error);
      }
      await this.router.navigate(['/login']);
    }
  }

  async getUserById(userId: string): Promise<UserInfo | null> {
    try {
      const response = await this.authenticatedFetch(
        `${this.getBaseUrl()}/queries/user/${userId}`
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  }

  getTenantId(): string | null {
    return this.currentUser()?.tenant_id || null;
  }

  getUserId(): string | null {
    return this.currentUser()?.user_id || null;
  }

  getBaseUrl(): string {
    return this.backendConfig.getBaseUrl();
  }

  private clearSession(): void {
    this.accessToken = null;
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
  }
}