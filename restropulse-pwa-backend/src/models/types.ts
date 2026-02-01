export type SubscriptionTier = 'BASIC' | 'GOLD' | 'PLATINUM';

// Instagram Integration Types
export interface InstagramCredentials {
    userId: string;
    username: string;
    pageId: string;
    pageName: string;
    accessToken: string; // Encrypted
    tokenExpiresAt: Date;
    scopes: string[];
    connectedAt: Date;
    lastRefreshedAt?: Date;
}

export interface InstagramConnectionStatus {
    connected: boolean;
    username?: string;
    userId?: string;
    pageName?: string;
    connectedAt?: Date;
    tokenStatus?: 'valid' | 'expiring_soon' | 'expired';
    needsReauthorization?: boolean;
}

export interface User {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: 'OWNER' | 'MANAGER';
    firebaseUid?: string;
}

export interface Restaurant {
    id: string;
    name: string;
    cuisine: string;
    location: {
        address: string;
        lat: number;
        lng: number;
        mapUrl: string;
    };
    accountManager: {
        name: string;
        phone: string;
        email: string;
        avatar: string;
    };
    subscription: {
        tier: SubscriptionTier;
        renewalDate: string;
        status: 'ACTIVE' | 'Past Due';
    };
    integrations: {
        instagram: boolean;
    };
    instagramCredentials?: InstagramCredentials;
    activeOffers?: string[];
    chefSpecials?: string[];
    menuLastUpdated?: string;
}

export interface Post {
    id: string;
    type: 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'STORY' | 'REEL';
    status: 'POSTED' | 'PENDING_APPROVAL' | 'CHANGES_REQUESTED' | 'SCHEDULED' | 'MISSED_DEADLINE';
    thumbnail: string;
    mediaUrls?: string[];
    videoUrl?: string;
    caption: string;
    platform: 'INSTAGRAM' | 'FACEBOOK' | 'BOTH';
    scheduledFor?: string;
    postedAt?: string;
    feedback?: string;
    duration?: string;
    strategyId?: string;  // Optional - null/undefined for adhoc posts
    isAdhoc?: boolean;    // True for manually created posts
    stats?: {
        likes: number;
        shares: number;
        comments: number;
        reach: number;
    };
}

export interface ContentStrategy {
    postsPerWeek: number;
    focusCategories: string[];
    bestTime: string;
    nextScheduledDate: string;
    theme: string;
}

export interface StrategyCycle {
    id: string;
    period: string;
    startDate: string;
    endDate: string;
    status: 'ACTIVE' | 'PENDING_APPROVAL' | 'APPROVED' | 'CHANGES_REQUESTED' | 'HISTORY';
    summary: string;
    plannedPosts: {
        category: string;
        count: number;
    }[];
    focus: string[];
    feedback?: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface OtpRequest {
    phone: string;
}

export interface OtpVerifyRequest {
    phone: string;
    otp: string;
}

export interface AuthResponse {
    success: boolean;
    user?: User;
    token?: string;
    message?: string;
}

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
