# RestroPulse Database CLI

Standalone CLI tool for MongoDB database setup, schema validation, and test data seeding.

## Features

- **Setup**: Create main and test databases with collections, indexes, and validators
- **Validate**: Check schemas and indexes against expected definitions
- **Seed**: Populate test database with sample data

## Installation

```bash
cd restropulse-pwa-database
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure your MongoDB connection:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `MONGODB_DATABASE` | Main database name | `restropulse` |
| `MONGODB_TEST_DATABASE` | Test database name | `restropulse-test` |

## Usage

### Development (with TypeScript)

```bash
# Set up both databases
npm run setup

# Validate schemas
npm run validate

# Seed test database
npm run seed

# Seed with clean (wipe existing data first)
npm run seed:clean
```

### Using the CLI directly

```bash
# Run any command
npm run dev -- <command> [options]

# Examples
npm run dev -- setup --main-only
npm run dev -- validate --fix
npm run dev -- seed --clean
```

### Commands

#### `setup`
Creates databases, collections, indexes, and schema validators.

Options:
- `--main-only` - Set up main database only
- `--test-only` - Set up test database only

#### `validate`
Validates that collections and indexes match the expected schema.

Options:
- `--fix` - Attempt to automatically fix issues

#### `seed`
Seeds the database with test data.

Options:
- `--clean` - Clear existing data before seeding
- `--main` - Seed main database (use with caution)

## Building Executable

To create a standalone Windows executable:

```bash
npm run build:exe
```

This creates `dist/rp-db.exe` which can be run without Node.js installed.

## Schema Definitions

Collections and their schemas are defined in `src/schemas/collections.ts`:

- **users** - User accounts with roles
- **restaurants** - Restaurant profiles and settings
- **posts** - Social media content
- **strategyCycles** - Monthly content strategy cycles
- **contentStrategies** - Content posting strategies
- **sessions** - Authentication sessions (with TTL index)

## Test Data

Sample data is defined in `src/data/seedData.ts` and mirrors the mock data used in the backend for consistency.

## Project Structure

```
restropulse-pwa-database/
  src/
    index.ts           # CLI entry point
    config/
      database.ts      # MongoDB connection
    commands/
      setup.ts         # Setup command
      validate.ts      # Validate command
      seed.ts          # Seed command
    schemas/
      collections.ts   # Collection definitions
    data/
      seedData.ts      # Test data
  scripts/
    bundle.js          # esbuild bundler
  dist/                # Compiled output
  .env.example         # Environment template
  package.json
  tsconfig.json
  README.md
```
