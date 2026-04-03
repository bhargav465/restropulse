import { MongoClient, Db } from 'mongodb';
import chalk from 'chalk';

export interface DatabaseConfig {
    uri: string;
    database: string;
}

export function getConfig(): DatabaseConfig {
    const uri = process.env.MONGODB_URI;
    const database = process.env.MONGODB_DB_NAME;

    if (!uri) {
        console.error(chalk.red('Error: MONGODB_URI environment variable is not set'));
        process.exit(1);
    }

    if (!database) {
        console.error(chalk.red('Error: MONGODB_DB_NAME environment variable is not set'));
        process.exit(1);
    }

    return {
        uri,
        database,
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

export async function getDatabase(): Promise<Db> {
    const mongoClient = await connect();
    const config = getConfig();
    return mongoClient.db(config.database);
}

export async function disconnect(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
    }
}
