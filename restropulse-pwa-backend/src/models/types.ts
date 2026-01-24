export type SubscriptionTier = 'BASIC' | 'GOLD' | 'PLATINUM';

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
