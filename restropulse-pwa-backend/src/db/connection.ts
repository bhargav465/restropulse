import { MongoClient, Db, Collection, ObjectId, WithId, Document } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

export interface DatabaseConfig {
    uri: string;
    database: string;
}

export function getConfig(): DatabaseConfig {
    const uri = process.env.MONGODB_URI;
    const database = process.env.MONGODB_DB_NAME;

    if (!uri) {
        throw new Error('MONGODB_URI environment variable is not set');
    }

    return {
        uri,
        database: database || 'restropulse',
    };
}

export async function connectDB(): Promise<Db> {
    if (db) return db;

    const config = getConfig();
    client = new MongoClient(config.uri);
    await client.connect();
    db = client.db(config.database);

    console.log(`Connected to MongoDB: ${config.database}`);
    return db;
}

export async function disconnectDB(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.log('Disconnected from MongoDB');
    }
}

export function getDB(): Db {
    if (!db) {
        throw new Error('Database not connected. Call connectDB() first.');
    }
    return db;
}

// Collection getters with proper typing
export function getUsersCollection(): Collection {
    return getDB().collection('users');
}

export function getRestaurantsCollection(): Collection {
    return getDB().collection('restaurants');
}

export function getPostsCollection(): Collection {
    return getDB().collection('posts');
}

export function getStrategyCyclesCollection(): Collection {
    return getDB().collection('strategyCycles');
}

export function getContentStrategiesCollection(): Collection {
    return getDB().collection('contentStrategies');
}

export function getSessionsCollection(): Collection {
    return getDB().collection('sessions');
}

// Helper to convert MongoDB _id to id for API responses
export function toApiFormat<T extends Document>(doc: WithId<T> | null): (Omit<T, '_id'> & { id: string }) | null {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { ...rest, id: _id.toString() } as Omit<T, '_id'> & { id: string };
}

// Helper to convert array of documents
export function toApiFormatArray<T extends Document>(docs: WithId<T>[]): (Omit<T, '_id'> & { id: string })[] {
    return docs.map(doc => toApiFormat(doc)!);
}

// Helper to create ObjectId from string (handles custom string IDs too)
export function toObjectId(id: string): ObjectId | string {
    // If it looks like a MongoDB ObjectId, convert it
    if (ObjectId.isValid(id) && id.length === 24) {
        return new ObjectId(id);
    }
    // Otherwise return as string (for custom IDs like 'r1', 'p1', etc.)
    return id;
}
