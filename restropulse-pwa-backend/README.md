# RestroPulse PWA Backend

Backend API server for RestroPulse Progressive Web Application.

## Architecture

This backend provides RESTful APIs for:
- User authentication and session management
- Restaurant data management
- Content studio (posts, strategies)
- Analytics and insights

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Build Tool**: TSC (TypeScript Compiler)

## Getting Started

### Installation

```bash
npm install
```

### Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API Port | `3001` |
| `CONTENT_BASE_URL` | Base URL for images/videos | `http://localhost:3001/content/mockdata` |
| `JWT_SECRET` | Token secret | `your-secret-key` |

## Asset Management

Assets (images/videos) are served via `express.static` from the `public` directory.
- Root path: `/content`
- Local path: `./public`

To use a CDN, update `CONTENT_BASE_URL` in `.env` to point to the CDN endpoint.

### Development

```bash
npm run dev
```

Server runs on `http://localhost:3001` by default.

### Production Build

```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/session` - Check session status

### Restaurant
- `GET /api/restaurant/:id` - Get restaurant details
- `PUT /api/restaurant/:id` - Update restaurant details
- `PATCH /api/restaurant/:id/offers` - Manage offers
- `PATCH /api/restaurant/:id/specials` - Manage chef specials

### Content Studio
- `GET /api/posts` - Get all posts
- `GET /api/posts/:id` - Get specific post
- `POST /api/posts` - Create new post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post

### Strategy
- `GET /api/strategy/cycles` - Get strategy cycles
- `GET /api/strategy/cycles/:id` - Get specific cycle
- `POST /api/strategy/cycles` - Create new cycle
- `PUT /api/strategy/cycles/:id` - Update cycle

## Project Structure

```
src/
├── server.ts          # Entry point
├── config/            # Configuration files
├── controllers/       # Route controllers
├── routes/            # API routes
├── services/          # Business logic
├── models/            # Data models & types
├── middleware/        # Express middleware
├── data/              # Mock data (temporary)
└── utils/             # Utility functions
```

## Development Workflow

1. Make changes in `src/`
2. The dev server auto-reloads on file changes
3. Test API endpoints using tools like Postman or curl
4. Build for production using `npm run build`

## Future Enhancements

- [ ] Database integration (MongoDB/PostgreSQL)
- [ ] JWT authentication
- [ ] File upload for media
- [ ] WebSocket for real-time updates
- [ ] Rate limiting and security middleware
- [ ] API documentation with Swagger
