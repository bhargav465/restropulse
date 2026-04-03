#!/usr/bin/env node
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { setupCommand } from './commands/setup.js';
import { validateCommand } from './commands/validate.js';
import { seedCommand } from './commands/seed.js';
import { resetCommand } from './commands/reset.js';
import { razorpaySetupCommand } from './commands/razorpay-setup.js';
import { deleteAccountCommand } from './commands/delete-account.js';

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
    .description('Set up database collections and indexes')
    .action(setupCommand);

program
    .command('validate')
    .description('Validate database schemas and indexes')
    .option('--fix', 'Attempt to fix validation issues')
    .action(validateCommand);

program
    .command('seed')
    .description('Seed database with sample data')
    .option('--clean', 'Clear existing data before seeding')
    .action(seedCommand);

program
    .command('reset')
    .description('Drop all collections and recreate database with indexes and defaults (10s safety delay)')
    .action(resetCommand);

program
    .command('razorpay-setup')
    .description('Create Razorpay subscription plans and write plan IDs back to MongoDB')
    .option('--dry-run', 'Preview what would be created without making API calls or DB writes')
    .option('--force', 'Overwrite existing Razorpay plan IDs in MongoDB')
    .action(razorpaySetupCommand);

program
    .command('delete-account')
    .description('Delete a user account and all associated data (posts, strategies, subscriptions, etc.)')
    .option('--phone <phone>', 'Phone number of the user to delete')
    .option('--restaurant-id <id>', 'Restaurant ID to delete (skips user lookup)')
    .option('--dry-run', 'Preview what would be deleted without making any changes')
    .option('--no-archive', 'Skip JSON archive (archive is written by default)')
    .action(deleteAccountCommand);

program.parse();
