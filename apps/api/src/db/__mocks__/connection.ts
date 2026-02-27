
import { vi } from 'vitest';

// --- Data Types & Seeds ---

export const mockUser = {
    _id: 'u1',
    id: 'u1',
    name: 'Arjun Mehta',
    email: 'arjun@spicelounge.com',
    password: 'mock_hashed_password',
    role: 'OWNER',
    refreshToken: 'mock_refresh_token'
};

export const mockRestaurant = {
    _id: 'r1',
    id: 'r1',
    name: 'The Spice Lounge',
    cuisine: 'Modern Indian Fusion',
    location: {
        address: '12, Indiranagar, Bangalore, KA',
        lat: 12.9716,
        lng: 77.5946,
        mapUrl: 'https://www.google.com/maps/test'
    },
    accountManager: {
        name: 'Sarah Jenkins',
        phone: '+91 99999 88888',
        email: 'sarah@restropulse.ai',
        avatar: 'https://picsum.photos/100/100'
    },
    subscription: {
        tier: 'GOLD',
        renewalDate: '2024-12-01',
        status: 'ACTIVE'
    },
    integrations: {
        whatsapp: true,
        instagram: false,
        facebook: true
    },
    activeOffers: ['Flat 15% Off on Weekday Lunch Buffets'],
    chefSpecials: ['Truffle Mushroom Risotto'],
    menuLastUpdated: '2024-05-10'
};

export const mockStrategy = {
    _id: 's1',
    restaurantId: 'r1',
    postsPerWeek: 7,
    theme: 'Updated Theme',
    bestTime: '7:00 PM - 9:00 PM',
    focusCategories: ['Food', 'Ambiance']
};

export const mockCycle = {
    _id: 'sc1',
    id: 'sc1',
    restaurantId: 'r1',
    summary: 'Test strategy cycle',
    status: 'ACTIVE',
    plannedPosts: [],
    focus: [],
    feedback: '',
    period: 'May 2024',
    startDate: '2024-05-01T00:00:00Z',
    endDate: '2024-05-31T23:59:59Z'
};

// --- In-Memory Collection Implementation ---

class MockCollection {
    name: string;
    docs: any[];

    constructor(name: string, initialData: any[] = []) {
        this.name = name;
        this.docs = JSON.parse(JSON.stringify(initialData)); // Deep copy query
    }

    private _matches(doc: any, query: any): boolean {
        if (!query || Object.keys(query).length === 0) return true;

        for (const key in query) {
            const val = query[key];

            // Check for property existence using dots
            if (key.includes('.')) {
                const parts = key.split('.');
                let current = doc;
                for (const part of parts) {
                    current = current ? current[part] : undefined;
                }

                // Basic mongo operator check
                if (typeof val === 'object' && val !== null) {
                    if (val.$exists !== undefined) {
                        const exists = current !== undefined && current !== null;
                        if (val.$exists && !exists) return false;
                        if (!val.$exists && exists) return false;
                    }
                    // Not handling $ne, $lt fully but basic check for exists is often sufficient for these existing tests
                } else {
                    if (current !== val) return false;
                }
            } else {
                // Direct property check
                if (key === '_id' || key === 'id') {
                    // Loose matching for IDs (string vs likely string)
                    const docId = (doc._id || doc.id || '').toString();
                    const queryId = (val || '').toString();
                    if (docId !== queryId) return false;
                } else if (doc[key] !== val) {
                    return false;
                }
            }
        }
        return true;
    }

    private _setDeep(obj: any, path: string, value: any) {
        if (!path.includes('.')) {
            obj[path] = value;
            return;
        }
        const parts = path.split('.');
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current[part] || typeof current[part] !== 'object') current[part] = {};
            current = current[part];
        }
        current[parts[parts.length - 1]] = value;
    }

    async findOne(query: any) {
        return this.docs.find(doc => this._matches(doc, query)) || null;
    }

    find(query: any) {
        const results = this.docs.filter(doc => this._matches(doc, query));
        return {
            toArray: vi.fn(async () => results),
            sort: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
        };
    }

    async insertOne(doc: any) {
        // Generate a 24-char hex string to mimic MongoDB ObjectId
        const _id = doc._id || Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        const newDoc = { ...doc, _id, id: _id };
        // Deep copy safely
        this.docs.push(JSON.parse(JSON.stringify(newDoc)));
        return { insertedId: _id, acknowledged: true };
    }

    async updateOne(filter: any, update: any) {
        const doc = this.docs.find(d => this._matches(d, filter));
        if (doc) {
            if (update.$set) {
                for (const key in update.$set) {
                    this._setDeep(doc, key, update.$set[key]);
                }
            }
            // Handle simple push
            if (update.$push) {
                for (const key in update.$push) {
                    if (!doc[key]) doc[key] = [];
                    if (Array.isArray(doc[key])) doc[key].push(update.$push[key]);
                }
            }
            // Handle pull
            if (update.$pull) {
                for (const key in update.$pull) {
                    // Very simple pull implementation assuming equality
                    if (Array.isArray(doc[key])) {
                        doc[key] = doc[key].filter((item: any) => item !== update.$pull[key]);
                    }
                }
            }
            // Handle unset
            if (update.$unset) {
                for (const key in update.$unset) {
                    delete doc[key];
                    // Also handle nested paths like 'integrations.instagram' in a simple way if needed?
                    // Currently only top level keys are easily deleted with delete doc[key]
                }
            }

            return { matchedCount: 1, modifiedCount: 1, acknowledged: true };
        }
        return { matchedCount: 0, modifiedCount: 0, acknowledged: true };
    }

    async findOneAndUpdate(filter: any, update: any, options: any) {
        let doc = this.docs.find(d => this._matches(d, filter));

        if (!doc && options?.upsert) {
            const _id = filter._id || 'upsert_' + Date.now();
            doc = { ...filter, _id, id: _id };
            this.docs.push(doc);
        }

        if (doc) {
            if (update && update.$set) {
                Object.assign(doc, update.$set);
            }
            // $push support for findOneAndUpdate
            if (update && update.$push) {
                for (const key in update.$push) {
                    if (!doc[key]) doc[key] = [];
                    if (Array.isArray(doc[key])) doc[key].push(update.$push[key]);
                }
            }
            // Return modified doc if returnDocument: 'after'
            return doc;
        }
        return null;
    }

    async deleteOne(filter: any) {
        const index = this.docs.findIndex(doc => this._matches(doc, filter));
        if (index !== -1) {
            this.docs.splice(index, 1);
            return { deletedCount: 1, acknowledged: true };
        }
        return { deletedCount: 0, acknowledged: true };
    }

    async deleteMany(filter: any) {
        if (!filter || Object.keys(filter).length === 0) {
            const count = this.docs.length;
            this.docs = [];
            return { deletedCount: count, acknowledged: true };
        }
        const oldLength = this.docs.length;
        this.docs = this.docs.filter(doc => !this._matches(doc, filter));
        return { deletedCount: oldLength - this.docs.length, acknowledged: true };
    }

    async countDocuments() {
        return this.docs.length;
    }
}

// --- Initialize Collections ---

export const usersCollection = new MockCollection('users', [mockUser]);
export const restaurantsCollection = new MockCollection('restaurants', [mockRestaurant]);
export const postsCollection = new MockCollection('posts', []); // Start empty so tests can seed
export const strategyCyclesCollection = new MockCollection('strategyCycles', [mockCycle]);
export const contentStrategiesCollection = new MockCollection('contentStrategies', [mockStrategy]);
export const sessionsCollection = new MockCollection('sessions', []);

// --- Exports ---

// Use vi.fn() wrapper to ensure tests can spy if they want, but delegate to instance
export const getUsersCollection = vi.fn(() => usersCollection);
export const getRestaurantsCollection = vi.fn(() => restaurantsCollection);
export const getPostsCollection = vi.fn(() => postsCollection);
export const getStrategyCyclesCollection = vi.fn(() => strategyCyclesCollection);
export const getContentStrategiesCollection = vi.fn(() => contentStrategiesCollection);
export const getSessionsCollection = vi.fn(() => sessionsCollection);

export const connectDB = vi.fn(async () => ({}));
export const disconnectDB = vi.fn(async () => { });
export const getDB = vi.fn(() => ({}));

// Helper exports 
export function toApiFormat(doc: any) {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { ...rest, id: _id ? _id.toString() : doc.id || 'mock_id' };
}

export function toApiFormatArray(docs: any[]) {
    return docs.map(doc => toApiFormat(doc));
}

export function toObjectId(id: string) {
    return id;
}

