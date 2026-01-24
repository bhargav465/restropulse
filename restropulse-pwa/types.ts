
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
    whatsapp: boolean;
    instagram: boolean;
    facebook: boolean;
  };
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
  scheduledFor?: string;
  postedAt?: string;
  feedback?: string;
  duration?: string; // e.g. "0:15"
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