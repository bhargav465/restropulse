import { CreateIndexesOptions, IndexSpecification } from 'mongodb';

export interface CollectionSchema {
    name: string;
    indexes: Array<{
        spec: IndexSpecification;
        options?: CreateIndexesOptions;
    }>;
    validator?: object;
}

export const COLLECTIONS: CollectionSchema[] = [
    {
        name: 'users',
        indexes: [
            { spec: { email: 1 }, options: { unique: true } },
            { spec: { restaurantId: 1 } },
            { spec: { role: 1 } },
        ],
        validator: {
            $jsonSchema: {
                bsonType: 'object',
                required: ['email', 'name', 'role'],
                properties: {
                    email: { bsonType: 'string', description: 'User email address' },
                    name: { bsonType: 'string', description: 'User full name' },
                    phone: { bsonType: 'string' },
                    role: { enum: ['OWNER', 'MANAGER', 'STAFF'], description: 'User role' },
                    restaurantId: { bsonType: 'string' },
                    createdAt: { bsonType: 'date' },
                    updatedAt: { bsonType: 'date' },
                },
            },
        },
    },
    {
        name: 'restaurants',
        indexes: [
            { spec: { 'location.lat': 1, 'location.lng': 1 } },
            { spec: { 'subscription.status': 1 } },
            { spec: { 'subscription.tier': 1 } },
        ],
        validator: {
            $jsonSchema: {
                bsonType: 'object',
                required: ['name', 'cuisine'],
                properties: {
                    name: { bsonType: 'string', description: 'Restaurant name' },
                    cuisine: { bsonType: 'string', description: 'Cuisine type' },
                    location: {
                        bsonType: 'object',
                        properties: {
                            address: { bsonType: 'string' },
                            lat: { bsonType: 'double' },
                            lng: { bsonType: 'double' },
                            mapUrl: { bsonType: 'string' },
                        },
                    },
                    accountManager: {
                        bsonType: 'object',
                        properties: {
                            name: { bsonType: 'string' },
                            phone: { bsonType: 'string' },
                            email: { bsonType: 'string' },
                            avatar: { bsonType: 'string' },
                        },
                    },
                    subscription: {
                        bsonType: 'object',
                        properties: {
                            tier: { enum: ['STARTER', 'GROWTH', 'GOLD', 'ENTERPRISE'] },
                            renewalDate: { bsonType: 'string' },
                            status: { enum: ['ACTIVE', 'SUSPENDED', 'CANCELLED'] },
                        },
                    },
                    integrations: {
                        bsonType: 'object',
                        properties: {
                            whatsapp: { bsonType: 'bool' },
                            instagram: { bsonType: 'bool' },
                            facebook: { bsonType: 'bool' },
                        },
                    },
                    activeOffers: { bsonType: 'array', items: { bsonType: 'string' } },
                    chefSpecials: { bsonType: 'array', items: { bsonType: 'string' } },
                    menuLastUpdated: { bsonType: 'string' },
                    createdAt: { bsonType: 'date' },
                    updatedAt: { bsonType: 'date' },
                },
            },
        },
    },
    {
        name: 'posts',
        indexes: [
            { spec: { restaurantId: 1 } },
            { spec: { status: 1 } },
            { spec: { platform: 1 } },
            { spec: { scheduledFor: 1 } },
            { spec: { postedAt: -1 } },
            { spec: { restaurantId: 1, status: 1 } },
        ],
        validator: {
            $jsonSchema: {
                bsonType: 'object',
                required: ['type', 'status', 'platform'],
                properties: {
                    type: { enum: ['IMAGE', 'VIDEO', 'CAROUSEL', 'REEL', 'STORY'] },
                    status: { enum: ['PENDING_APPROVAL', 'CHANGES_REQUESTED', 'SCHEDULED', 'POSTED', 'MISSED_DEADLINE'] },
                    thumbnail: { bsonType: 'string' },
                    videoUrl: { bsonType: 'string' },
                    mediaUrls: { bsonType: 'array', items: { bsonType: 'string' } },
                    caption: { bsonType: 'string' },
                    platform: { enum: ['INSTAGRAM', 'FACEBOOK', 'BOTH'] },
                    scheduledFor: { bsonType: 'string' },
                    postedAt: { bsonType: 'string' },
                    duration: { bsonType: 'string' },
                    feedback: { bsonType: 'string' },
                    stats: {
                        bsonType: 'object',
                        properties: {
                            likes: { bsonType: 'int' },
                            shares: { bsonType: 'int' },
                            comments: { bsonType: 'int' },
                            reach: { bsonType: 'int' },
                        },
                    },
                    restaurantId: { bsonType: 'string' },
                    createdAt: { bsonType: 'date' },
                    updatedAt: { bsonType: 'date' },
                },
            },
        },
    },
    {
        name: 'strategyCycles',
        indexes: [
            { spec: { restaurantId: 1 } },
            { spec: { status: 1 } },
            { spec: { startDate: 1, endDate: 1 } },
        ],
        validator: {
            $jsonSchema: {
                bsonType: 'object',
                required: ['period', 'status'],
                properties: {
                    period: { bsonType: 'string', description: 'Cycle period label' },
                    startDate: { bsonType: 'string' },
                    endDate: { bsonType: 'string' },
                    status: { enum: ['PENDING_INPUT', 'ACTIVE', 'APPROVED', 'HISTORY'] },
                    summary: { bsonType: 'string' },
                    plannedPosts: {
                        bsonType: 'array',
                        items: {
                            bsonType: 'object',
                            properties: {
                                category: { bsonType: 'string' },
                                count: { bsonType: 'int' },
                            },
                        },
                    },
                    focus: { bsonType: 'array', items: { bsonType: 'string' } },
                    feedback: { bsonType: 'string' },
                    restaurantId: { bsonType: 'string' },
                    createdAt: { bsonType: 'date' },
                    updatedAt: { bsonType: 'date' },
                },
            },
        },
    },
    {
        name: 'contentStrategies',
        indexes: [
            { spec: { restaurantId: 1 }, options: { unique: true } },
        ],
        validator: {
            $jsonSchema: {
                bsonType: 'object',
                required: ['restaurantId'],
                properties: {
                    postsPerWeek: { bsonType: 'int' },
                    focusCategories: { bsonType: 'array', items: { bsonType: 'string' } },
                    bestTime: { bsonType: 'string' },
                    nextScheduledDate: { bsonType: 'string' },
                    theme: { bsonType: 'string' },
                    restaurantId: { bsonType: 'string' },
                    createdAt: { bsonType: 'date' },
                    updatedAt: { bsonType: 'date' },
                },
            },
        },
    },
    {
        name: 'sessions',
        indexes: [
            { spec: { token: 1 }, options: { unique: true } },
            { spec: { userId: 1 } },
            { spec: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
        ],
        validator: {
            $jsonSchema: {
                bsonType: 'object',
                required: ['token', 'userId', 'expiresAt'],
                properties: {
                    token: { bsonType: 'string' },
                    userId: { bsonType: 'string' },
                    expiresAt: { bsonType: 'date' },
                    createdAt: { bsonType: 'date' },
                },
            },
        },
    },
    {
        name: 'otpChallenges',
        indexes: [
            { spec: { phone: 1 } },
            { spec: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
        ],
    },
    {
        name: 'oauthSessions',
        indexes: [
            { spec: { sessionId: 1 }, options: { unique: true } },
            { spec: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
        ],
    },
    {
        name: 'accountManagers',
        indexes: [
            { spec: { city: 1 } },
            { spec: { city: 1, zone: 1 } },
        ],
        validator: {
            $jsonSchema: {
                bsonType: 'object',
                required: ['name', 'phone', 'email', 'city', 'zone'],
                properties: {
                    name: { bsonType: 'string', description: 'Manager full name' },
                    phone: { bsonType: 'string', description: 'Contact phone' },
                    email: { bsonType: 'string', description: 'Contact email' },
                    avatar: { bsonType: 'string', description: 'Avatar URL' },
                    city: { bsonType: 'string', description: 'City name' },
                    zone: { bsonType: 'string', description: 'Zone within city' },
                    createdAt: { bsonType: 'date' },
                    updatedAt: { bsonType: 'date' },
                },
            },
        },
    },
    {
        name: 'dataDeletionAudits',
        indexes: [
            { spec: { confirmationCode: 1 }, options: { unique: true } },
            { spec: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
        ],
    },
];
