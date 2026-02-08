// -------------------------------------------------------
// @restropulse/shared - Unified Types & Constants
// Single source of truth for all type definitions across
// the monorepo (web, api, publisher, content-engine, db-cli).
// -------------------------------------------------------

// ----- Enums / Literal Unions -----

export type SubscriptionTier = 'BASIC' | 'GOLD' | 'PLATINUM';

export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE';

export type UserRole = 'OWNER' | 'MANAGER';

export type PostType = 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'STORY' | 'REEL';

export type PostStatus =
  | 'PENDING_CONTENT'        // Awaiting content generation by content-engine
  | 'PENDING_APPROVAL'       // Content created, awaiting user review
  | 'CHANGES_REQUESTED'      // User requested changes
  | 'SCHEDULED'              // Approved and scheduled for publishing
  | 'PUBLISHING'             // Currently being published by publisher worker
  | 'POSTED'                 // Successfully published
  | 'MISSED_DEADLINE';       // Failed after max retries

export type Platform = 'INSTAGRAM' | 'FACEBOOK' | 'BOTH';

export type StrategyCycleStatus =
  | 'PENDING_GENERATION'     // Awaiting strategy generation by content-engine
  | 'ACTIVE'                 // Currently active cycle
  | 'PENDING_APPROVAL'       // Awaiting user review
  | 'APPROVED'               // Approved, ready for content generation
  | 'CHANGES_REQUESTED'      // User requested changes
  | 'HISTORY';               // Archived

export type TokenStatus = 'valid' | 'expiring_soon' | 'expired';

export type ViewState = 'LOGIN' | 'DASHBOARD' | 'STUDIO' | 'INPUTS' | 'STRATEGY' | 'SETTINGS';

export type InstagramConnectionError =
  | 'NO_PAGES_FOUND'
  | 'NO_IG_ACCOUNT_FOUND'
  | 'PERMISSIONS_MISSING'
  | 'INVALID_STATE'
  | 'TOKEN_EXCHANGE_FAILED'
  | 'API_ERROR'
  | 'ACCOUNT_TYPE_MISMATCH'
  | 'RATE_LIMITED'
  | 'CONFIG_ERROR'
  | 'TIMEOUT';

// ----- Interfaces -----

export interface InstagramConnectionStatus {
  connected: boolean;
  username?: string;
  userId?: string;
  pageName?: string;
  connectedAt?: string | Date;
  tokenStatus?: TokenStatus;
  needsReauthorization?: boolean;
}

/** Server-side only -- never sent to frontend */
export interface InstagramCredentials {
  userId: string;
  username: string;
  pageId: string;
  pageName: string;
  accessToken: string; // Encrypted at rest
  tokenExpiresAt: Date;
  scopes: string[];
  connectedAt: Date;
  lastRefreshedAt?: Date;
}

export interface InstagramAccount {
  id: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  pageName: string;
  pageId?: string;
  pageAccessToken?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
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
    status: SubscriptionStatus;
  };
  integrations: {
    instagram: boolean;
  };
  /** Public-safe connection info (no tokens) */
  instagramConnection?: InstagramConnectionStatus;
  /** Server-side only -- contains encrypted access token */
  instagramCredentials?: InstagramCredentials;
  activeOffers?: string[];
  chefSpecials?: string[];
  menuLastUpdated?: string;
}

export interface PostStats {
  likes: number;
  shares: number;
  comments: number;
  reach: number;
}

export interface Post {
  id: string;
  type: PostType;
  status: PostStatus;
  thumbnail: string;
  mediaUrls?: string[];
  videoUrl?: string;
  caption: string;
  platform: Platform;
  restaurantId?: string;
  scheduledFor?: string;
  postedAt?: string;
  feedback?: string;
  publishError?: string;
  publishAttempts?: number;
  duration?: string;
  strategyId?: string;
  isAdhoc?: boolean;
  instagramMediaId?: string;
  facebookPostId?: string;
  stats?: PostStats;
}

export interface ContentStrategy {
  id?: string;
  restaurantId?: string;
  postsPerWeek: number;
  focusCategories: string[];
  bestTime: string;
  nextScheduledDate: string;
  theme: string;
}

export interface PlannedPost {
  category: string;
  count: number;
}

export interface StrategyCycle {
  id: string;
  restaurantId?: string;
  period: string;
  startDate: string;
  endDate: string;
  status: StrategyCycleStatus;
  summary: string;
  plannedPosts: PlannedPost[];
  focus: string[];
  feedback?: string;
}

// ----- API Types (request/response) -----

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

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface GeneratePostRequest {
  concept: string;
  type: PostType;
  platform: Platform;
  scheduledFor?: string;
}

export interface ContentCyclePost {
  id: string;
  type: PostType;
  caption: string;
  thumbnail: string;
  scheduledFor: string;
}

export interface ContentCycle {
  id: string;
  posts: ContentCyclePost[];
}

export interface GeneratePostResponse {
  post: Post;
}
