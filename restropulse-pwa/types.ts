
export type SubscriptionTier = 'BASIC' | 'GOLD' | 'PLATINUM';

// Instagram Integration Types (public-safe, no tokens)
export interface InstagramConnectionStatus {
  connected: boolean;
  username?: string;
  userId?: string;
  pageName?: string;
  connectedAt?: string;
  tokenStatus?: 'valid' | 'expiring_soon' | 'expired';
  needsReauthorization?: boolean;
}

export interface InstagramAccount {
  id: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  pageName: string;
}

export type InstagramConnectionError =
  | 'NO_PAGES_FOUND'
  | 'NO_IG_ACCOUNT_FOUND'
  | 'PERMISSIONS_MISSING'
  | 'INVALID_STATE'
  | 'TOKEN_EXCHANGE_FAILED'
  | 'API_ERROR'
  | 'ACCOUNT_TYPE_MISMATCH';

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
  instagramConnection?: InstagramConnectionStatus;
  // New fields for 'Inputs' data visibility
  activeOffers?: string[];
  chefSpecials?: string[];
  menuLastUpdated?: string;
}

export interface Post {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'STORY' | 'REEL';
  status: 'POSTED' | 'PENDING_APPROVAL' | 'CHANGES_REQUESTED' | 'SCHEDULED' | 'MISSED_DEADLINE';
  thumbnail: string;
  mediaUrls?: string[]; // For carousels
  videoUrl?: string; // For videos, reels, stories
  caption: string;
  platform: 'INSTAGRAM' | 'FACEBOOK' | 'BOTH';
  restaurantId?: string;
  scheduledFor?: string;
  postedAt?: string;
  feedback?: string;
  publishError?: string;
  publishAttempts?: number;
  duration?: string; // e.g. "0:15"
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
  startDate: string; // ISO Date
  endDate: string; // ISO Date
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'APPROVED' | 'CHANGES_REQUESTED' | 'HISTORY';
  summary: string;
  plannedPosts: {
    category: string;
    count: number;
  }[];
  focus: string[];
  feedback?: string;
}

export type ViewState = 'LOGIN' | 'DASHBOARD' | 'STUDIO' | 'INPUTS' | 'STRATEGY' | 'SETTINGS';