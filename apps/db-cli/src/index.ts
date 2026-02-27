#!/usr/bin/env node
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { setupCommand } from './commands/setup.js';
import { validateCommand } from './commands/validate.js';
import { seedCommand } from './commands/seed.js';

// Load .env from api app (single source of truth for MongoDB config)
const envCandidates = [
    resolve(process.cwd(), 'apps/api/.env'),
    resolve(process.cwd(), '../api/.env'),
    resolve(process.cwd(), 'api/.env')
];
const backendEnvPath = envCandidates.find((path) => existsSync(path));
if (backendEnvPath) {
    config({ path: backendEnvPath });
} else {
    config();
}

const program = new Command();

console.log(chalk.cyan.bold('\n  RestroPulse Database CLI\n'));

program
    .name('rp-db')
    .description('Database setup, schema validation, and test data seeding for RestroPulse')
    .version('1.0.0');

program
    .command('setup')
    .description('Set up main and test databases with collections and indexes')
    .option('--main-only', 'Set up main database only')
    .option('--test-only', 'Set up test database only')
    .action(setupCommand);

program
    .command('validate')
    .description('Validate database schemas and indexes')
    .option('--fix', 'Attempt to fix validation issues')
    .action(validateCommand);

program
    .command('seed')
    .description('Seed test database with sample data')
    .option('--clean', 'Clear existing data before seeding')
    .option('--main', 'Seed main database instead of test (use with caution)')
    .action(seedCommand);

program.parse();
