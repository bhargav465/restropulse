import express, { Express } from 'express';
import cors from 'cors';
import authRoutes from '../../src/routes/auth.js';
import restaurantRoutes from '../../src/routes/restaurant.js';
import postsRoutes from '../../src/routes/posts.js';
import strategyRoutes from '../../src/routes/strategy.js';

export function createTestApp(): Express {
    const app = express();

    app.use(cors({ origin: '*', credentials: true }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    app.use('/api/auth', authRoutes);
    app.use('/api/restaurant', restaurantRoutes);
    app.use('/api/posts', postsRoutes);
    app.use('/api/strategy', strategyRoutes);

    return app;
}

export const mockUser = {
    id: 'u1',
    name: 'Arjun Mehta',
    email: 'arjun@spicelounge.com',
    phone: '+91 98765 43210',
    role: 'OWNER' as const
};

export const mockRestaurant = {
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
        tier: 'GOLD' as const,
        renewalDate: '2024-12-01',
        status: 'ACTIVE' as const
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

export const mockPost = {
    id: 'p1',
    type: 'IMAGE' as const,
    status: 'POSTED' as const,
    thumbnail: '/mockdata/images/food_platter.jpg',
    caption: 'Test caption',
    platform: 'INSTAGRAM' as const,
    postedAt: '2024-05-15T18:30:00Z',
    stats: {
        likes: 100,
        shares: 10,
        comments: 5,
        reach: 500
    }
};

export const mockStrategyCycle = {
    id: 'sc1',
    period: 'June 2024',
    startDate: '2024-06-01',
    endDate: '2024-06-30',
    status: 'ACTIVE' as const,
    summary: 'Test strategy cycle',
    plannedPosts: [
        { category: 'Food Photography', count: 12 }
    ],
    focus: ['Test Focus']
};

export function generateAuthToken(): string {
    return 'jwt-token-' + Date.now();
}
