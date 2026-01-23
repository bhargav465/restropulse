import { getUsersCollection, toApiFormat } from './connection.js';
import { User } from '../models/types.js';

export async function findUserByEmail(email: string): Promise<User | null> {
    const col = getUsersCollection();
    const doc = await col.findOne({ email });
    return toApiFormat(doc) as User | null;
}

export async function findUserById(id: string): Promise<User | null> {
    const col = getUsersCollection();
    const doc = await col.findOne({ _id: id as any });
    return toApiFormat(doc) as User | null;
}

export async function createUser(user: Omit<User, 'id'>): Promise<User> {
    const col = getUsersCollection();
    const result = await col.insertOne({
        ...user,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return { ...user, id: result.insertedId.toString() } as User;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const col = getUsersCollection();
    const result = await col.findOneAndUpdate(
        { _id: id as any },
        { $set: { ...updates, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return toApiFormat(result) as User | null;
}
