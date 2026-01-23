import { MongoClient, Db } from 'mongodb';
import chalk from 'chalk';

export interface DatabaseConfig {
    uri: string;
    mainDatabase: string;
    testDatabase: string;
}

export function getConfig(): DatabaseConfig {
    const uri = process.env.MONGODB_URI;
    const mainDatabase = process.env.MONGODB_DATABASE;
    const testDatabase = process.env.MONGODB_TEST_DATABASE;

    if (!uri) {
        console.error(chalk.red('Error: MONGODB_URI environment variable is not set'));
        console.log(chalk.yellow('Copy .env.example to .env and configure your MongoDB connection'));
        process.exit(1);
    }

    return {
        uri,
        mainDatabase: mainDatabase || 'restropulse',
        testDatabase: testDatabase || 'restropulse-test',
    };
}

let client: MongoClient | null = null;

export async function connect(): Promise<MongoClient> {
    if (client) return client;

    const config = getConfig();
    client = new MongoClient(config.uri);
    await client.connect();
    return client;
}

export async function getDatabase(useTestDb = false): Promise<Db> {
    const mongoClient = await connect();
    const config = getConfig();
    const dbName = useTestDb ? config.testDatabase : config.mainDatabase;
    return mongoClient.db(dbName);
}

export async function disconnect(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
    }
}
