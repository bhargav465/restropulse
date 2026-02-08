# RestroPulse Architecture

## System Overview

RestroPulse is a social media management platform for restaurants, organized as a **Turborepo monorepo** with npm workspaces. It automates content creation, scheduling, and publishing to Instagram and Facebook via the Meta Graph API.

## Monorepo Structure

```
restropulse/
  apps/
    web/          @restropulse/web          React SPA (Vite)
    api/          @restropulse/api          Express REST API
    publisher/    @restropulse/publisher    Cron worker -- publishing + token refresh
    content-engine/ @restropulse/content-engine  Worker -- content generation
    db-cli/       @restropulse/db-cli       CLI for DB seed/migration
  packages/
    shared/       @restropulse/shared       Unified TypeScript types
    db/           @restropulse/db           Shared MongoDB connection + helpers
    tsconfig/     @restropulse/tsconfig     Shared tsconfig presets
    eslint-config/ @restropulse/eslint-config Shared ESLint flat config
```

## Application Architecture Diagram

```
                              +-------------------+
                              |   Firebase Auth   |
                              |  (Phone OTP Auth) |
                              +--------+----------+
                                       |
                            ID Token   | Verify
                                       v
+--------------------+  REST API  +--------------------+
|   Frontend (Web)   |---------->|   Backend (API)     |
|   React + Vite     |<----------|   Express           |
|   Port 3000        |  JSON     |   Port 3001         |
+--------------------+           +---+-----+-------+---+
                                     |     |       |
                         Reads/Writes|     |       | Reads/Writes
                                     v     |       v
                              +------+-----+--+ +--+-------------+
                              |   MongoDB     | | Meta Graph API |
                              |   Atlas       | | v18.0          |
                              |   restropulse | | (Instagram/FB) |
                              +---+-----+-----+ +----------------+
                                  |     |
                   Reads/Writes   |     |  Reads/Writes
                    +-------------+     +-------------+
                    |                                  |
          +---------v----------+          +------------v---------+
          | Publisher Worker   |          | Content Engine Worker |
          | Cron: Publish posts|          | Cron: Generate content|
          | Cron: Refresh tokens|         | Process strategy cycles|
          +--------------------+          +------------------------+
```

## Applications

### apps/web -- Frontend SPA

- **Framework**: React 19 + TypeScript + Vite 6
- **Styling**: Tailwind CSS (CDN)
- **Auth**: Firebase Authentication (phone OTP)
- **Port**: 3000

**Pages** (state-based routing via `ViewState`):

| View         | Component          | Purpose                         |
|--------------|--------------------|---------------------------------|
| LOGIN        | Login.tsx          | Phone OTP authentication        |
| DASHBOARD    | Dashboard.tsx      | Restaurant overview              |
| STUDIO       | ContentStudio.tsx  | Content calendar, post management|
| INPUTS       | Inputs.tsx         | Offers, chef specials, menu      |
| STRATEGY     | Strategy.tsx       | Content strategy configuration   |
| SETTINGS     | Settings.tsx       | Instagram connection, logout     |

**Auth Flow**:
1. User enters phone number; Firebase sends OTP via RecaptchaVerifier
2. User submits OTP; Firebase confirms; frontend obtains Firebase ID token
3. Frontend sends ID token to `POST /api/auth/firebase`
4. Backend verifies via Firebase Admin SDK, returns JWT pair
5. Frontend stores `rp_token` (15min) and `rp_refresh_token` (7d) in localStorage

### apps/api -- REST API

- **Framework**: Express 4 + TypeScript
- **Database**: MongoDB (via `@restropulse/db`)
- **Auth**: Firebase Admin SDK + JWT (access/refresh tokens)
- **Port**: 3001

**Route Groups**:

| Prefix                           | Purpose                            |
|----------------------------------|------------------------------------|
| `/api/auth/*`                    | Authentication (Firebase, JWT)     |
| `/api/restaurant/:id`           | Restaurant CRUD, offers, specials  |
| `/api/posts/*`                   | Post CRUD, publishing, generation  |
| `/api/strategy/*`               | Content strategy and cycles        |
| `/api/integrations/instagram/*` | OAuth, account management, GDPR    |
| `/health`                        | Health check                       |

### apps/publisher -- Publishing Worker

- **Runtime**: Standalone Node.js process (no Express)
- **Cron Jobs**:
  - Publishing: `*/5 * * * *` (every 5 minutes) -- publishes due SCHEDULED posts
  - Token refresh: `0 2 * * *` (daily 2:00 AM IST) -- refreshes expiring Instagram tokens

### apps/content-engine -- Content Generation Worker

- **Runtime**: Standalone Node.js process (no Express)
- **Polling**: `*/2 * * * *` (every 2 minutes)
- **Jobs**:
  - Adhoc post processing: generates content for posts with status `PENDING_CONTENT`
  - Strategy cycle processing: generates posts for `APPROVED` cycles
  - Strategy generation: creates strategies for `PENDING_GENERATION` requests

### apps/db-cli -- Database CLI

- **Framework**: Commander + chalk + ora
- **Purpose**: Seed data, run migrations, database operations

## Shared Packages

### packages/shared

Single source of truth for all TypeScript types, enums, and interfaces used across the monorepo. Key exports: `User`, `Restaurant`, `Post`, `ContentStrategy`, `StrategyCycle`, and all status/type enums.

### packages/db

Shared MongoDB connection layer with collection helpers:

| Module            | Exports                                     |
|-------------------|---------------------------------------------|
| connection.ts     | `connectDB()`, `disconnectDB()`, `getDB()`, `setDB()` |
| posts.ts          | `getPostsCollection()`, `findPostById()`, `getRecentPublishAttempts()` |
| restaurants.ts    | `getRestaurantsCollection()`, `findRestaurantById()` |
| strategy.ts       | `getContentStrategiesCollection()`, `getStrategyCyclesCollection()` |
| users.ts          | `getUsersCollection()`, `findUserByPhone()`, `findUserByFirebaseUid()` |

`setDB()` enables test injection with `mongodb-memory-server`.

## Data Flows

### Post Publishing Flow

```
1. User creates/approves post (API) --> status: SCHEDULED
2. Publisher cron runs every 5 min
3. Finds posts where scheduledFor <= now AND status = SCHEDULED
4. Atomically sets status = PUBLISHING
5. Decrypts Instagram token (AES-256-CBC)
6. Uploads media to Facebook CDN (image: /photos, video: direct URL)
7. Creates IG media container via Meta Graph API
8. For video: polls container status every 5s (max 5 min)
9. Publishes container via /media_publish
10. Updates post status: PUBLISHED or FAILED (max 3 attempts)
```

### Meta Graph API OAuth Flow

```
1. Frontend redirects to Facebook OAuth dialog
2. User authorizes RestroPulse app
3. Facebook redirects to /api/integrations/instagram/callback with code
4. Backend exchanges code for short-lived token
5. Exchanges short-lived for long-lived token (60 days)
6. Discovers Facebook Pages via /me/accounts
7. Finds IG Business Account per page
8. Stores encrypted page access token in restaurant document
9. Token refresh cron renews tokens 15 days before expiry
```

### Content Generation Flow

```
1. User requests content (API /posts/generate or approves strategy cycle)
2. Post/cycle stored with status PENDING_CONTENT or APPROVED
3. Content engine polls every 2 min
4. Finds pending work, generates content (placeholder; future: AI)
5. Updates post with caption, thumbnail, media URLs
6. Advances status to PENDING_APPROVAL
7. User reviews and approves --> status: SCHEDULED
```

## Security

- **Token encryption**: AES-256-CBC with per-operation random IV; stored as `iv:ciphertext` in MongoDB
- **JWT**: Access tokens (15min), refresh tokens (7 days), signed with `JWT_SECRET`
- **OAuth CSRF**: Random state tokens with 10-minute expiry
- **Facebook Webhooks**: HMAC-SHA256 signed request verification using App Secret
- **CORS**: Restricted to configured `FRONTEND_URL` + API origin

## MongoDB Collections

| Collection          | Primary Key Pattern          | Used By              |
|---------------------|------------------------------|----------------------|
| users               | ObjectId or custom string    | API                  |
| restaurants         | ObjectId or custom string    | API, Publisher, Engine|
| posts               | ObjectId or custom string    | API, Publisher, Engine|
| contentStrategies   | ObjectId                     | API, Engine          |
| strategyCycles      | ObjectId                     | API, Engine          |

Database name: `restropulse` (configurable via `MONGODB_DB_NAME`)
