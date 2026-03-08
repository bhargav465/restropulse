import chalk from 'chalk';
import ora from 'ora';
import { connect, getConfig, disconnect } from '../config/database.js';
import { COLLECTIONS } from '../schemas/collections.js';
import { DEFAULT_CITIES, DEFAULT_ACCOUNT_MANAGERS } from '../data/default-data.js';

interface ResetOptions {
    main?: boolean;
}

export async function resetCommand(options: ResetOptions): Promise<void> {
    const config = getConfig();
    const spinner = ora();
    const dbName = options.main ? config.mainDatabase : config.testDatabase;

    if (options.main) {
        console.log(chalk.red.bold('\nWARNING: You are about to DROP and RECREATE the MAIN database!'));
        console.log(chalk.red('All data in the main database will be permanently deleted.'));
        console.log(chalk.gray('Press Ctrl+C within 60 seconds to cancel...\n'));
        await new Promise(resolve => setTimeout(resolve, 60000));
    }

    try {
        spinner.start('Connecting to MongoDB...');
        const client = await connect();
        spinner.succeed('Connected to MongoDB');

        const db = client.db(dbName);
        console.log(chalk.cyan(`\nResetting database: ${chalk.bold(dbName)}`));

        // Drop all known collections
        spinner.start('Dropping existing collections...');
        const existingCollections = await db.listCollections().toArray();
        const existingNames = existingCollections.map(c => c.name);

        for (const name of existingNames) {
            // Skip system collections
            if (name.startsWith('system.')) continue;
            await db.dropCollection(name);
            console.log(chalk.gray(`    Dropped: ${name}`));
        }
        spinner.succeed(`Dropped ${existingNames.filter(n => !n.startsWith('system.')).length} collection(s)`);

        // Recreate collections with validators and indexes
        for (const collection of COLLECTIONS) {
            spinner.start(`Creating collection: ${collection.name}`);

            await db.createCollection(collection.name, {
                validator: collection.validator,
                validationLevel: 'moderate',
                validationAction: 'warn',
            });

            const col = db.collection(collection.name);
            for (const index of collection.indexes) {
                await col.createIndex(index.spec, index.options || {});
            }

            spinner.succeed(`Created ${collection.name} (${collection.indexes.length} indexes)`);
        }

        // Seed default cities and HQ account managers
        spinner.start('Seeding default cities and account managers...');
        const now = new Date();
        const citiesCol = db.collection('cities');
        for (const city of DEFAULT_CITIES) {
            await citiesCol.insertOne({ ...city, createdAt: now, updatedAt: now } as any);
        }
        const amCol = db.collection('accountManagers');
        for (const am of DEFAULT_ACCOUNT_MANAGERS) {
            await amCol.insertOne({ ...am, createdAt: now, updatedAt: now } as any);
        }
        spinner.succeed(`Seeded ${DEFAULT_CITIES.length} cities and ${DEFAULT_ACCOUNT_MANAGERS.length} account managers`);

        console.log(chalk.green('\nDatabase reset complete -- defaults seeded and ready to use.'));

    } catch (err: any) {
        spinner.fail('Reset failed');
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
    } finally {
        await disconnect();
    }
}
