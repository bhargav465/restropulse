# RestroPulse Infrastructure

## Services and Ports

Source of truth for local service ports: `config/ports.json`.

```json
{
   "web": 3000,
   "api": 3001,
   "publisher": 3002,
   "strictInDevelopment": true
}
```

Rules:
- `apps/web` uses `config/ports.json:web` in `vite.config.ts` with `strictPort: true`.
- `apps/api` uses `config/ports.json:api` as default and enforces the same port in development when `strictInDevelopment` is `true`.
- Root port scripts (`ports:check`, `ports:free`, `dev:check`, `dev:free`) read ports from `config/ports.json` unless explicit CLI ports are provided.

| Service         | Port   | Protocol | Description              |
|-----------------|--------|----------|--------------------------|
| Frontend (web)  | 3000   | HTTP     | Vite dev server          |
| Backend (api)   | 3001   | HTTP     | Express REST API         |
| Publisher        | --     | N/A      | Standalone cron worker   |
| Content Engine   | --     | N/A      | Standalone poll worker   |
| MongoDB Atlas    | 27017  | TCP      | Cloud-hosted database    |
| Firebase Auth    | --     | HTTPS    | Google Identity Platform |
| Meta Graph API   | --     | HTTPS    | v18.0 Instagram/Facebook |

## Environment Variables

### apps/api (.env)

| Variable                         | Required | Default                                          | Purpose                                    |
|----------------------------------|----------|--------------------------------------------------|--------------------------------------------|
| PORT                             | No       | 3001                                             | API server port                            |
| CORS_ORIGIN                      | No       | http://localhost:3000                             | Allowed CORS origin                        |
| NODE_ENV                         | No       | development                                      | Environment mode                           |
| MONGODB_URI                      | Yes      | --                                               | MongoDB Atlas connection string            |
| MONGODB_DB_NAME                  | No       | restropulse                                      | Database name                              |
| JWT_SECRET                       | Yes*     | restropulse-dev-secret-change-in-production      | JWT signing secret                         |
| ENCRYPTION_KEY                   | Yes      | --                                               | 32-byte hex key for AES-256-CBC            |
| META_APP_ID                      | Yes      | --                                               | Facebook/Meta App ID                       |
| META_APP_SECRET                  | Yes      | --                                               | Facebook/Meta App Secret                   |
| INSTAGRAM_REDIRECT_URI           | No       | http://localhost:3001/api/.../callback            | OAuth redirect URI                         |
| INSTAGRAM_REDIRECT_FRONTEND_URL  | No       | http://localhost:3000                             | Frontend URL for OAuth redirects           |
| BACKEND_URL                      | No       | http://localhost:3001                             | Backend URL for GDPR status links          |
| FIREBASE_SERVICE_ACCOUNT         | Cond.    | --                                               | Firebase service account JSON              |
| FIREBASE_SERVICE_ACCOUNT_PATH    | Cond.    | --                                               | Path to Firebase service account file      |
| FIREBASE_PROJECT_ID              | Cond.    | --                                               | Firebase project ID (limited)              |
| RAZORPAY_KEY_ID                  | No*      | --                                               | Razorpay API key ID                        |
| RAZORPAY_KEY_SECRET              | No*      | --                                               | Razorpay API key secret                    |
| RAZORPAY_WEBHOOK_SECRET          | No*      | --                                               | Razorpay webhook signature secret          |

*JWT_SECRET has a dev default but must be changed in production.
*RAZORPAY_* vars are optional in dev; service throws if called without config.

### apps/web (.env)

| Variable                         | Required | Default                    | Purpose                     |
|----------------------------------|----------|----------------------------|-----------------------------|
| VITE_API_URL                     | No       | http://localhost:3001/api  | Backend API base URL        |
| VITE_FIREBASE_API_KEY            | Yes*     | dev placeholder            | Firebase Web API key        |
| VITE_FIREBASE_AUTH_DOMAIN        | Yes*     | dev placeholder            | Firebase auth domain        |
| VITE_FIREBASE_PROJECT_ID         | Yes*     | dev placeholder            | Firebase project ID         |
| VITE_FIREBASE_STORAGE_BUCKET     | Yes*     | placeholder                | Firebase storage bucket     |
| VITE_FIREBASE_MESSAGING_SENDER_ID| Yes*    | placeholder                | Firebase messaging sender ID|
| VITE_FIREBASE_APP_ID             | Yes*     | placeholder                | Firebase app ID             |
| VITE_GOOGLE_MAPS_API_KEY         | No       | (none)                     | Google Maps Places API key  |
| VITE_RAZORPAY_KEY_ID             | No       | (none)                     | Razorpay key for checkout   |

*Required for production; dev uses fallback values.
**VITE_GOOGLE_MAPS_API_KEY is optional; when absent, the onboarding location step falls back to manual address entry.
**VITE_RAZORPAY_KEY_ID is fetched from the API at checkout time if not set.

### apps/publisher (.env)

| Variable         | Required | Default       | Purpose                          |
|------------------|----------|---------------|----------------------------------|
| NODE_ENV         | No       | development   | Environment mode                 |
| MONGODB_URI      | Yes      | --            | MongoDB connection string        |
| MONGODB_DB_NAME  | No       | restropulse   | Database name                    |
| ENCRYPTION_KEY   | Yes      | --            | Must match API's key             |
| META_APP_ID      | Yes      | --            | For token refresh                |
| META_APP_SECRET  | Yes      | --            | For token refresh                |

### apps/content-engine (.env)

| Variable         | Required | Default       | Purpose                          |
|------------------|----------|---------------|----------------------------------|
| NODE_ENV         | No       | development   | Environment mode                 |
| MONGODB_URI      | Yes      | --            | MongoDB connection string        |
| MONGODB_DB_NAME  | No       | restropulse   | Database name                    |

## Cron Schedules

| Worker          | Schedule          | Timezone      | Description                       |
|-----------------|-------------------|---------------|-----------------------------------|
| Publisher       | */5 * * * *       | Asia/Kolkata  | Publish due scheduled posts       |
| Token Refresh   | 0 2 * * *         | Asia/Kolkata  | Refresh expiring Instagram tokens |
| Content Engine  | */2 * * * *       | Asia/Kolkata  | Process content generation queue  |

## External Service Dependencies

### MongoDB Atlas

- **Database**: `restropulse`
- **Collections**: users, restaurants, posts, contentStrategies, strategyCycles, accountManagers, subscriptionPlans, subscriptions, coupons, couponRedemptions, creditPurchases, creditPacks, invoices
- **Driver**: mongodb v6.12
- **Connection**: Shared singleton via `@restropulse/db`

### Firebase Authentication

- **Provider**: Phone (SMS OTP)
- **Admin SDK**: Used by API to verify ID tokens
- **Client SDK**: Used by frontend for OTP flow
- **Fallback**: In-memory OTP for development when Firebase is not configured

### Meta Graph API v18.0

- **Base URL**: https://graph.facebook.com/v18.0
- **OAuth URL**: https://www.facebook.com/v18.0/dialog/oauth
- **Scopes**: instagram_basic, instagram_content_publish, pages_show_list, pages_read_user_content, pages_manage_posts, public_profile
- **Token Lifetime**: 60 days (long-lived)
- **Refresh Window**: 15 days before expiry (cron), 7 days (on-demand)

### Razorpay

- **API Base**: https://api.razorpay.com/v1
- **Auth**: Basic Auth (key_id:key_secret)
- **Subscriptions API**: Recurring billing for plans (MONTHLY/ANNUAL)
- **Orders API**: One-time payments for credit packs
- **Offers API**: Coupon discount syncing
- **Invoices**: Auto-generated by Razorpay for each subscription charge
- **Webhooks**: HMAC-SHA256 signature verification via `X-Razorpay-Signature` header
- **Webhook events**: subscription.authenticated, subscription.activated, subscription.charged, subscription.pending, subscription.halted, subscription.cancelled

### Google Maps Places API (optional)

- **Package**: `@vis.gl/react-google-maps` (frontend only)
- **Used for**: Address autocomplete during onboarding (location step)
- **API Key**: `VITE_GOOGLE_MAPS_API_KEY` in `apps/web/.env`
- **Fallback**: Manual address text input when API key is not configured
- **Required APIs**: Maps JavaScript API, Places API

## Token and Timeout Configuration

| Parameter                  | Value         |
|----------------------------|---------------|
| JWT Access Token Expiry    | 15 minutes    |
| JWT Refresh Token Expiry   | 7 days        |
| OAuth State Token Expiry   | 10 minutes    |
| Instagram Token Lifetime   | 60 days       |
| API Request Timeout        | 30 seconds    |
| Media Upload Timeout       | 60 seconds    |
| Video Poll Interval        | 5 seconds     |
| Video Poll Max Wait        | 5 minutes     |
| Max Publish Attempts       | 3 per post    |
| OTP Expiry (dev)           | 5 minutes     |
| OTP Max Attempts (dev)     | 3 per number  |

## Encryption

- **Algorithm**: AES-256-CBC
- **Key**: `ENCRYPTION_KEY` env variable (64 hex chars = 32 bytes; if plain text, SHA-256 hashed)
- **IV**: 16 random bytes per encryption operation
- **Storage format**: `{iv_hex}:{ciphertext_hex}`
- **Used for**: Instagram access tokens in MongoDB restaurant documents

## Local Development Setup

1. Clone the repository
2. Copy `.env.example` to `.env` in each app that needs one
3. Run `npm install` at the root (installs all workspaces)
4. Start services:
   ```
   npm run dev          # Starts all apps via Turborepo
   npm run dev --filter=@restropulse/api   # API only
   npm run dev --filter=@restropulse/web   # Frontend only
   ```
5. For database seeding: `npm run seed --filter=@restropulse/db-cli`
6. For a fresh empty database: `npm run reset --filter=@restropulse/db-cli` (test) or `npm run reset:main --filter=@restropulse/db-cli` (main, 60s safety delay)

## Build and Deploy

```bash
npm run build          # Build all packages and apps
npm run type-check     # TypeScript type checking across monorepo
npm run lint           # ESLint across monorepo
npm run test           # Run all test suites
```

Individual app builds produce output in their respective `dist/` directories.
