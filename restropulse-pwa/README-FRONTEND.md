# RestroPulse PWA (Front-End)

A Progressive Web Application for restaurant social media management powered by AI.

## Overview

This is the front-end client for RestroPulse, built with React, TypeScript, and Vite. It provides a responsive, mobile-first interface for restaurant owners to manage their social media presence.

## Tech Stack

- **Framework**: React 19
- **Language**: TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS (via utility classes)
- **Icons**: Lucide React
- **Charts**: Recharts

## Prerequisites

- Node.js 18+ and npm
- restropulse-pwa-backend running on port 3001

## Getting Started

### Installation

```bash
npm install
```

### Environment Setup

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

The default API URL is `http://localhost:3001/api`. Update if needed.

### Development

Make sure the backend is running first, then:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
npm run preview
```

## Features

- **Dashboard**: Overview of restaurant metrics and recent posts
- **Content Studio**: Manage social media posts across platforms
- **Inputs**: Update offers, chef specials, and menu information
- **Strategy**: View and manage content strategy cycles
- **Settings**: Account and preferences management

## Architecture

- Pure front-end UI with no business logic
- All data operations via REST API calls to backend
- State management using React hooks
- Client-side routing with browser history API
- PWA-ready with offline support (future enhancement)

## API Integration

The app communicates with the backend through the `api.ts` service layer:

- Authentication endpoints
- Restaurant data management
- Posts CRUD operations
- Strategy cycles management

All API calls include proper error handling and loading states.

## Development Guidelines

- Components are in `/components`
- Shared types are in `types.ts`
- API service layer is in `api.ts`
- Mock assets are in `/mockdata` (for development only)

## Future Enhancements

- Service worker for offline functionality
- Push notifications
- Image upload and optimization
- Real-time updates via WebSockets
- Progressive image loading
- Advanced caching strategies

---

For detailed functional requirements and specifications, see [README-DETAILED.md](README-DETAILED.md)
