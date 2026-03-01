# RestroPulse - Copilot Instructions

## Self-Update Directive

When any of the following change, update this file to reflect the current state of the project:
- New apps, packages, or services are added
- Environment variables change
- Database schema or collections change
- API routes are added or modified
- New conventions or patterns are established
- Dependencies significantly change

Always keep this file accurate and up to date with the codebase.

---

## Project Overview

RestroPulse is a social media management platform for restaurants. It is a Turborepo monorepo with npm workspaces.

## Monorepo Layout

```
apps/
  web/              React 19 + Vite 6 SPA (port 3000)
  api/              Express 4 REST API (port 3001)
  publisher/        Standalone cron worker (publishing + token refresh)
  content-engine/   Standalone poll worker (content generation)
  db-cli/           Commander CLI for DB operations
packages/
  shared/           @restropulse/shared -- unified TypeScript types
  db/               @restropulse/db -- shared MongoDB connection + helpers
  publishing/       @restropulse/publishing -- Meta API, encryption, publishing/token-refresh crons
  tsconfig/         Shared tsconfig presets (base, react, node)
  eslint-config/    Shared ESLint flat config
```

### AI Assistant Config Files

| File | Purpose |
|------|---------|
| `.vscode/mcp.json` | MCP server definitions for VS Code Copilot (JSONC) |
| `.mcp.json` | MCP server definitions for Claude Code CLI + extension (JSON) |
| `.github/copilot-instructions.md` | Project instructions for VS Code Copilot |
| `CLAUDE.md` | Project instructions for Claude Code |

## Key Conventions

### TypeScript
- All code is TypeScript with strict mode enabled
- ESM modules (type: "module" in package.json)
- Target: ES2022
- Import from `@restropulse/shared` for all types -- never duplicate type definitions
- Import `loadAndValidateEnv` from `@restropulse/shared` for startup config validation in services
- Import from `@restropulse/db` for MongoDB operations -- never create separate DB connections
- Import from `@restropulse/publishing` for encryption, Meta API, and publishing/token-refresh crons -- never duplicate these locally

### Naming
- Files: kebab-case (e.g., `publishing-service.ts`)
- Types/Interfaces: PascalCase (e.g., `PostStatus`, `Restaurant`)
- Functions/Variables: camelCase
- Enums: UPPER_SNAKE_CASE values (e.g., `PENDING_APPROVAL`)
- Collections: camelCase (e.g., `contentStrategies`, `strategyCycles`)

### Testing
- Frontend: Vitest + React Testing Library
- Backend: Vitest + mongodb-memory-server + supertest
- Tests go in `tests/` directory within each app
- Unit tests in `tests/unit/`, integration in `tests/integration/`
- Use `setDB()` from `@restropulse/db` for test database injection
- Standard test scripts across app workspaces: `test`, `test:unit`, `test:coverage`

### Error Handling
- API returns `{ success: boolean, data?: T, error?: string }` (ApiResponse type)
- HTTP status codes: 200 (success), 201 (created), 400 (bad request), 401 (unauthorized), 404 (not found), 500 (server error)
- All async route handlers must catch errors and return proper ApiResponse

### No Special Characters
- Do not use special characters like emoji in code, documentation, print statements, or logs
- Use plain text indicators instead

## Database

- MongoDB Atlas (driver: mongodb v6.12)
- Database name: `restropulse`
- Collections: users, restaurants, posts, contentStrategies, strategyCycles, accountManagers
- Document IDs: Support both ObjectId and custom string IDs (e.g., `r1` for seed data)
- Connection: Always use `@restropulse/db` singleton -- never create separate MongoClient instances

## Authentication

- Firebase Phone Auth (OTP) on the frontend
- Backend verifies Firebase ID tokens via Admin SDK
- Issues JWT access token (15min) + refresh token (7 days)
- Dev fallback: in-memory OTP when Firebase is not configured

## External APIs

- Meta Graph API v18.0 for Instagram/Facebook
- OAuth scopes: instagram_basic, instagram_content_publish, pages_show_list, pages_read_user_content, pages_manage_posts, public_profile
- Tokens encrypted with AES-256-CBC before storage
- Google Maps Places API (optional) for onboarding address autocomplete (`@react-google-maps/api`)

## Environment

- Each app has its own `.env` file
- Service entrypoints must load and validate env via `loadAndValidateEnv` with a local per-service schema
- See `docs/INFRASTRUCTURE.md` for the full list of environment variables per app
- Critical shared vars: MONGODB_URI, ENCRYPTION_KEY, META_APP_ID, META_APP_SECRET

## Common Commands

```bash
npm install              # Install all workspaces
npm run dev              # Start runtime apps (excludes @restropulse/db-cli)
npm run build            # Build all
npm run test             # Test all
npm run test:unit        # Run unit tests across workspaces
npm run test:coverage    # Run coverage across workspaces
npm run lint             # Lint all
npm run type-check       # Type-check all
npm run dev --filter=@restropulse/api   # Single app
npm run reset --filter=@restropulse/db-cli          # Reset test DB (empty)
npm run reset:main --filter=@restropulse/db-cli     # Reset main DB (60s delay)
```

## MCP Tool-Routing Rules

Three MCP servers provide non-overlapping context layers. Follow these rules
to prevent redundant or conflicting retrieval:

1. **Semantic Search (`semantic-search`)** -- Use ONLY for high-level discovery
   ("where is the feature that handles X?"). Never use it for type lookups or
   reading final file content.
2. **Logic / Navigation (`lsp-*`)** -- Use for jump-to-definition, find
   references, type diagnostics, and refactoring. This is the source of truth
   for TypeScript types and structure.
3. **Knowledge / Memory (`project-memory`)** -- Use for recalling architecture
   decisions, conventions, and user preferences. Never store code snippets or
   type information here.
4. **Filesystem tools** -- Use for reading/writing actual file content. Do not
   use `semantic-search` to read files.

Full setup details: `docs/MCP-SETUP.md`

## Architecture Docs

- `docs/ARCHITECTURE.md` -- System overview, data flows, component diagram
- `docs/INFRASTRUCTURE.md` -- Env vars, ports, cron schedules, external services
- `docs/TESTING.md` -- Testing stack, conventions, examples
- `docs/MCP-SETUP.md` -- MCP server configuration, tool-routing rules, troubleshooting
