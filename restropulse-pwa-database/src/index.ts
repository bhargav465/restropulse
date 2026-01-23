#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { setupCommand } from './commands/setup.js';
import { validateCommand } from './commands/validate.js';
import { seedCommand } from './commands/seed.js';

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
