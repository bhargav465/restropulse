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
┌─────────────────────┐
│   restropulse-pwa   │  (React PWA)
│   Port: 3000        │
└──────────┬──────────┘
           │ HTTP/REST
           ▼
┌─────────────────────┐
│restropulse-backend  │  (Express API)
│   Port: 3001        │
└──────────┬──────────┘
           │
           ▼
    [Future: Database]
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
- Content studio for social media posts
- Strategy planning and cycles
- Offer and special management
- Multi-platform support (Instagram, Facebook, WhatsApp)

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
- REST API

## Future Roadmap

- Database integration (MongoDB/PostgreSQL)
- Real authentication with JWT
- File upload for media
- WebSocket for real-time updates
- Service worker for offline support
- Push notifications
