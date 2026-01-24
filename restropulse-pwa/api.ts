import { User, Restaurant, Post, ContentStrategy, StrategyCycle, LoginRequest, AuthResponse, ApiResponse } from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Helper function for API calls with auto token refresh
async function fetchAPI<T>(endpoint: string, options?: RequestInit, retry = true): Promise<T> {
    const token = localStorage.getItem('rp_token');

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });

    // If unauthorized and we have a refresh token, try to refresh
    if (response.status === 401 && retry) {
        const refreshToken = localStorage.getItem('rp_refresh_token');
        if (refreshToken) {
            const refreshed = await authAPI.refreshToken(refreshToken);
            if (refreshed) {
                // Retry the original request with new token
                return fetchAPI<T>(endpoint, options, false);
            }
        }
        // Clear tokens if refresh failed
        localStorage.removeItem('rp_token');
        localStorage.removeItem('rp_refresh_token');
        localStorage.removeItem('rp_session');
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Network error' }));
        throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
}

// Authentication API
export const authAPI = {
    // Firebase Authentication (Primary - Production)
    loginWithFirebase: async (firebaseIdToken: string): Promise<AuthResponse & { refreshToken?: string }> => {
        const response = await fetchAPI<AuthResponse & { refreshToken?: string }>('/auth/firebase', {
            method: 'POST',
            body: JSON.stringify({ idToken: firebaseIdToken }),
        }, false);

        if (response.success && response.token) {
            localStorage.setItem('rp_token', response.token);
            if (response.refreshToken) {
                localStorage.setItem('rp_refresh_token', response.refreshToken);
            }
        }

        return response;
    },

    // Legacy email/password login
    login: async (credentials: LoginRequest): Promise<AuthResponse> => {
        const response = await fetchAPI<AuthResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        }, false);

        if (response.success && response.token) {
            localStorage.setItem('rp_token', response.token);
        }

        return response;
    },

    // Fallback OTP verification (when Firebase not configured)
    verifyOtp: async (phone: string, otp: string): Promise<AuthResponse & { refreshToken?: string }> => {
        const response = await fetchAPI<AuthResponse & { refreshToken?: string }>('/auth/verify-otp', {
            method: 'POST',
            body: JSON.stringify({ phone, otp }),
        }, false);

        if (response.success && response.token) {
            localStorage.setItem('rp_token', response.token);
            if (response.refreshToken) {
                localStorage.setItem('rp_refresh_token', response.refreshToken);
            }
        }

        return response;
    },

    refreshToken: async (refreshToken: string): Promise<boolean> => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });

            if (!response.ok) return false;

            const data = await response.json();
            if (data.success && data.token) {
                localStorage.setItem('rp_token', data.token);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    },

    logout: async (): Promise<void> => {
        await fetchAPI('/auth/logout', { method: 'POST' }, false);
        localStorage.removeItem('rp_token');
        localStorage.removeItem('rp_refresh_token');
        localStorage.removeItem('rp_session');
    },

    checkSession: async (): Promise<AuthResponse> => {
        return fetchAPI<AuthResponse>('/auth/session');
    },
};

// Restaurant API
export const restaurantAPI = {
    get: async (id: string): Promise<Restaurant> => {
        const response = await fetchAPI<ApiResponse<Restaurant>>(`/restaurant/${id}`);
        return response.data!;
    },

    update: async (id: string, data: Partial<Restaurant>): Promise<Restaurant> => {
        const response = await fetchAPI<ApiResponse<Restaurant>>(`/restaurant/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
        return response.data!;
    },

    updateOffers: async (id: string, action: 'ADD' | 'DELETE', payload: string | number): Promise<Restaurant> => {
        const response = await fetchAPI<ApiResponse<Restaurant>>(`/restaurant/${id}/offers`, {
            method: 'PATCH',
            body: JSON.stringify({ action, payload }),
        });
        return response.data!;
    },

    updateSpecials: async (id: string, action: 'ADD' | 'DELETE', payload: string | number): Promise<Restaurant> => {
        const response = await fetchAPI<ApiResponse<Restaurant>>(`/restaurant/${id}/specials`, {
            method: 'PATCH',
            body: JSON.stringify({ action, payload }),
        });
        return response.data!;
    },

    updateMenu: async (id: string): Promise<Restaurant> => {
        const response = await fetchAPI<ApiResponse<Restaurant>>(`/restaurant/${id}/menu`, {
            method: 'PATCH',
        });
        return response.data!;
    },
};

// Posts API
export const postsAPI = {
    getAll: async (): Promise<Post[]> => {
        const response = await fetchAPI<ApiResponse<Post[]>>('/posts');
        return response.data!;
    },

    getById: async (id: string): Promise<Post> => {
        const response = await fetchAPI<ApiResponse<Post>>(`/posts/${id}`);
        return response.data!;
    },

    create: async (post: Omit<Post, 'id'>): Promise<Post> => {
        const response = await fetchAPI<ApiResponse<Post>>('/posts', {
            method: 'POST',
            body: JSON.stringify(post),
        });
        return response.data!;
    },

    update: async (id: string, post: Partial<Post>): Promise<Post> => {
        const response = await fetchAPI<ApiResponse<Post>>(`/posts/${id}`, {
            method: 'PUT',
            body: JSON.stringify(post),
        });
        return response.data!;
    },

    delete: async (id: string): Promise<void> => {
        await fetchAPI(`/posts/${id}`, { method: 'DELETE' });
    },
};

// Strategy API
export const strategyAPI = {
    getStrategy: async (): Promise<ContentStrategy> => {
        const response = await fetchAPI<ApiResponse<ContentStrategy>>('/strategy');
        return response.data!;
    },

    updateStrategy: async (strategy: Partial<ContentStrategy>): Promise<ContentStrategy> => {
        const response = await fetchAPI<ApiResponse<ContentStrategy>>('/strategy', {
            method: 'PUT',
            body: JSON.stringify(strategy),
        });
        return response.data!;
    },

    getAllCycles: async (): Promise<StrategyCycle[]> => {
        const response = await fetchAPI<ApiResponse<StrategyCycle[]>>('/strategy/cycles');
        return response.data!;
    },

    getCycleById: async (id: string): Promise<StrategyCycle> => {
        const response = await fetchAPI<ApiResponse<StrategyCycle>>(`/strategy/cycles/${id}`);
        return response.data!;
    },

    createCycle: async (cycle: Omit<StrategyCycle, 'id'>): Promise<StrategyCycle> => {
        const response = await fetchAPI<ApiResponse<StrategyCycle>>('/strategy/cycles', {
            method: 'POST',
            body: JSON.stringify(cycle),
        });
        return response.data!;
    },

    updateCycle: async (id: string, cycle: Partial<StrategyCycle>): Promise<StrategyCycle> => {
        const response = await fetchAPI<ApiResponse<StrategyCycle>>(`/strategy/cycles/${id}`, {
            method: 'PUT',
            body: JSON.stringify(cycle),
        });
        return response.data!;
    },
};
