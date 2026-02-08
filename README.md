# RestroPulse

AI-powered social media management platform for restaurants.

## Project Structure

This repository contains a full-stack application split into front-end and back-end:

### `restropulse-pwa/`
Front-end Progressive Web Application built with React, TypeScript, and Vite.

**Quick Start:**
```bash
cd restropulse-pwa
npm install
npm run dev
```

See [restropulse-pwa/README-FRONTEND.md](restropulse-pwa/README-FRONTEND.md) for details.

### `restropulse-pwa-backend/`
Backend API server built with Node.js, Express, and TypeScript.

**Quick Start:**
```bash
cd restropulse-pwa-backend
npm install
npm run dev
```

See [restropulse-pwa-backend/README.md](restropulse-pwa-backend/README.md) for details.

### Other Directories

- `whatsappbusinessapi-bot/` - Python bot for WhatsApp Business API integration
- `whatsappbusinessapi-webhook/` - Azure Function webhook handler
- `shared-schemas/` - Protocol Buffers schema definitions
- `scripts/` - Build and generation scripts

## Architecture

```
┌─────────────────────────┐
│    restropulse-pwa      │  React 19 PWA (Vite)
│    Port: 3000           │  Tailwind CSS, Recharts
└───────────┬─────────────┘
            │ HTTP/REST
            v
┌─────────────────────────┐     ┌─────────────────────────────┐
│ restropulse-pwa-backend │     │   Background Services       │
│ Port: 3001 (Express)    │     │                             │
│                         │     │  Publishing Cron (5 min)    │
│  Routes:                │     │  Token Refresh Cron (daily) │
│    /api/auth            │     └──────────┬──────────────────┘
│    /api/restaurant      │                │
│    /api/posts           │────────────────┘
│    /api/strategy        │
│    /api/integrations    │
└───────────┬─────────────┘
            │
    ┌───────┴───────┐
    v               v
┌─────────┐   ┌──────────────────────┐
│ MongoDB │   │  Meta Graph API      │
│ Atlas   │   │  (Instagram + FB)    │
│         │   │  v18.0               │
└─────────┘   └──────────────────────┘
```

### Publishing Flow

```
 Content Studio (Approve)    Cron Job (every 5 min)
         │                          │
         v                          v
  Status: SCHEDULED ───────> Check scheduledFor <= now
                                    │
                                    v
                            Publishing Service
                            ┌───────────────┐
                            │ IMAGE/CAROUSEL │──> IG Container API
                            │ REEL/VIDEO    │──> IG Reel Container
                            │ STORY         │──> IG Story Container
                            │ FACEBOOK      │──> FB Page Photos/Feed
                            └───────┬───────┘
                                    │
                              Success/Fail
                                    │
                                    v
                           Update post status
                         POSTED / MISSED_DEADLINE
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Development Setup

1. **Start the backend:**
   ```bash
   cd restropulse-pwa-backend
   npm install
   cp .env.example .env
   npm run dev
   ```

2. **Start the frontend:**
   ```bash
   cd restropulse-pwa
   npm install
   cp .env.example .env
   npm run dev
   ```

3. Open `http://localhost:3000` in your browser

### Login Credentials (Demo)

- **Email:** arjun@spicelounge.com
- **Password:** demo123

## Features

- Restaurant dashboard with analytics
- Content studio for social media posts with approval workflow
- Automated publishing to Instagram and Facebook via Meta Graph API v18.0
- Instagram OAuth integration (connect/disconnect, multi-account picker)
- Publishing cron job with rate limiting and retry logic
- Token refresh cron for long-lived access tokens
- Strategy planning and cycles
- Offer and special management
- Multi-platform support (Instagram, Facebook, WhatsApp)
- Comprehensive test suites (650+ tests across frontend and backend)

## Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite
- Tailwind CSS
- Lucide Icons
- Recharts

**Backend:**
- Node.js + Express
- TypeScript
- MongoDB Atlas
- JWT Auth + Firebase Admin SDK
- Meta Graph API v18.0 (Instagram + Facebook publishing)
- AES-256-GCM encryption for access tokens
- Cron-based scheduled publishing and token refresh

**Testing:**
- Backend: Jest 29 + ts-jest (ESM) -- 349 tests, 87.66% statement coverage
- Frontend: Vitest + React Testing Library -- 301 tests, 82.7% statement coverage

**Media & Assets:**
- Served via Express static middleware
- Configurable base URL for CDN readiness

## Configuration

### Environment Variables

#### Backend (`/restropulse-pwa-backend/.env`)
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API Port | `3001` |
| `CONTENT_BASE_URL` | Base URL for images/videos | `http://localhost:3001/content/mockdata` |
| `JWT_SECRET` | Token secret | `your-secret-key` |
| `MONGODB_URI` | MongoDB connection string | Required |
| `MONGODB_DB_NAME` | Database name | `restropulse` |
| `INSTAGRAM_APP_ID` | Meta App ID for Instagram OAuth | Required |
| `INSTAGRAM_APP_SECRET` | Meta App Secret | Required |
| `INSTAGRAM_REDIRECT_URI` | OAuth callback URL | `http://localhost:3001/api/integrations/instagram/callback` |
| `ENCRYPTION_KEY` | 32-byte hex key for token encryption | Required |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase Admin SDK credentials (JSON) | Optional |
| `FIREBASE_PROJECT_ID` | Firebase project ID | Optional |

#### Frontend (`/restropulse-pwa/.env`)
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:3001/api` |
- REST API

## Current Status

- [x] MongoDB Atlas database integration
- [x] JWT authentication with session management
- [x] Instagram OAuth with Facebook Login (Graph API v18.0)
- [x] Automated publishing to Instagram (IMAGE, REEL, CAROUSEL, STORY)
- [x] Automated publishing to Facebook (photo, video, multi-photo)
- [x] Publishing cron with rate limiting and retry logic
- [x] Token encryption (AES-256-GCM) and auto-refresh cron
- [x] Content approval workflow (approve/request changes/revert)
- [x] 650+ automated tests with 85%+ coverage

## Future Roadmap

- File upload for media (Azure Blob Storage)
- WebSocket for real-time updates
- Service worker for offline support
- Push notifications
- RazorPay subscription payments
