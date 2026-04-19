#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadEnv, getResolvedEnv, redactUri } from './lib/env.js';
import { setupCommand } from './commands/setup.js';
import { validateCommand } from './commands/validate.js';
import { seedCommand } from './commands/seed.js';
import { resetCommand } from './commands/reset.js';
import { razorpaySetupCommand } from './commands/razorpay-setup.js';
import { deleteAccountCommand } from './commands/delete-account.js';
import { migrateCommand } from './commands/migrate.js';

const program = new Command();

function printBanner(): void {
    const env = getResolvedEnv();
    const uri = process.env.MONGODB_URI;
    const db = process.env.MONGODB_DB_NAME;
    const envColor = env === 'production' ? chalk.red.bold
        : env === 'staging' ? chalk.yellow.bold
        : chalk.green;

    console.log(chalk.cyan.bold('\n  RestroPulse Database CLI'));
    console.log(`  Environment : ${envColor(env)}`);
    console.log(`  Database    : ${chalk.white(db ?? chalk.red('(not set)'))}`);
    if (uri) {
        console.log(`  MongoDB     : ${chalk.gray(redactUri(uri))}`);
    } else {
        console.log(`  MongoDB     : ${chalk.red('(MONGODB_URI not set)')}`);
    }
    console.log('');
}

program
    .name('rp-db')
    .description('Database setup, schema validation, and test data seeding for RestroPulse')
    .version('1.0.0')
    .option('--env <env>', 'Target environment: development | staging | production', 'development')
    .hook('preAction', (thisCommand) => {
        loadEnv(thisCommand.opts().env as string);
        printBanner();
    });

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
    .command('migrate')
    .description('Run a named database migration')
    .requiredOption('--migration <name>', 'Migration to run (e.g. subscription-history)')
    .action(migrateCommand);

program
    .command('delete-account')
    .description('Delete a user account and all associated data (posts, strategies, subscriptions, etc.)')
    .option('--phone <phone>', 'Phone number of the user to delete')
    .option('--restaurant-id <id>', 'Restaurant ID to delete (skips user lookup)')
    .option('--dry-run', 'Preview what would be deleted without making any changes')
    .option('--no-archive', 'Skip JSON archive (archive is written by default)')
    .action(deleteAccountCommand);

program.parse();
