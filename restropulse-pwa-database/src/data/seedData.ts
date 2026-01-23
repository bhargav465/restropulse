// Test data for seeding the database
// Matches the mock data structure from the backend

const CONTENT_BASE = process.env.CONTENT_BASE_URL || 'http://localhost:3001/content/mockdata';

const addHours = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

export const SEED_DATA: Record<string, any[]> = {
    users: [
        {
            _id: 'u1',
            name: 'Arjun Mehta',
            email: 'arjun@spicelounge.com',
            phone: '+91 98765 43210',
            role: 'OWNER',
            restaurantId: 'r1',
        },
        {
            _id: 'u2',
            name: 'Priya Sharma',
            email: 'priya@spicelounge.com',
            phone: '+91 98765 43211',
            role: 'MANAGER',
            restaurantId: 'r1',
        },
    ],

    restaurants: [
        {
            _id: 'r1',
            name: 'The Spice Lounge',
            cuisine: 'Modern Indian Fusion',
            location: {
                address: '12, Indiranagar, Bangalore, KA',
                lat: 12.9716,
                lng: 77.5946,
                mapUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.003673059882!2d77.6384!3d12.9716',
            },
            accountManager: {
                name: 'Sarah Jenkins',
                phone: '+91 99999 88888',
                email: 'sarah@restropulse.ai',
                avatar: 'https://picsum.photos/100/100',
            },
            subscription: {
                tier: 'GOLD',
                renewalDate: '2024-12-01',
                status: 'ACTIVE',
            },
            integrations: {
                whatsapp: true,
                instagram: false,
                facebook: true,
            },
            activeOffers: ['Flat 15% Off on Weekday Lunch Buffets'],
            chefSpecials: ['Truffle Mushroom Risotto'],
            menuLastUpdated: '2024-05-10',
        },
    ],

    posts: [
        {
            _id: 'p1',
            type: 'IMAGE',
            status: 'POSTED',
            thumbnail: `${CONTENT_BASE}/images/food_platter.jpg`,
            caption: 'Experience the burst of flavors with our new Tandoori Platter! #SpiceLounge #Foodie #BangaloreEats',
            platform: 'INSTAGRAM',
            postedAt: '2024-05-15T18:30:00Z',
            stats: {
                likes: 1240,
                shares: 45,
                comments: 89,
                reach: 5600,
            },
            restaurantId: 'r1',
        },
        {
            _id: 'p2',
            type: 'CAROUSEL',
            status: 'PENDING_APPROVAL',
            thumbnail: `${CONTENT_BASE}/images/cocktails.jpg`,
            mediaUrls: [
                `${CONTENT_BASE}/images/cocktails.jpg`,
                `${CONTENT_BASE}/images/ambiance_1.jpg`,
                `${CONTENT_BASE}/images/crowd.jpg`,
            ],
            caption: 'Weekend Plans? Sorted. Join us for our Happy Hour every Friday from 5 PM. Buy 1 Get 1 on all cocktails!',
            platform: 'BOTH',
            scheduledFor: addHours(48),
            feedback: JSON.stringify({
                tags: ['Caption'],
                details: { 'Caption': 'Not engaging' },
                note: 'Make it sound more exciting and add festive emojis!',
                resolution: 'Rewrote caption with punchier text and added emojis as requested.',
            }),
            restaurantId: 'r1',
        },
        {
            _id: 'p3',
            type: 'VIDEO',
            status: 'POSTED',
            thumbnail: `${CONTENT_BASE}/images/chef_cooking.jpg`,
            videoUrl: `${CONTENT_BASE}/videos/chef_process.mp4`,
            caption: 'Behind the scenes at The Spice Lounge kitchen! Watch Chef Rajeev create magic.',
            platform: 'FACEBOOK',
            postedAt: '2024-05-12T12:00:00Z',
            duration: '0:45',
            stats: {
                likes: 890,
                shares: 120,
                comments: 56,
                reach: 8900,
            },
            restaurantId: 'r1',
        },
        {
            _id: 'p4',
            type: 'IMAGE',
            status: 'CHANGES_REQUESTED',
            thumbnail: `${CONTENT_BASE}/images/biryani.jpg`,
            caption: 'Our signature Hyderabadi Biryani is waiting for you!',
            platform: 'INSTAGRAM',
            scheduledFor: addHours(72),
            feedback: JSON.stringify({
                tags: ['Image Quality', 'Caption'],
                details: {
                    'Image Quality': 'Lighting seems off',
                    'Caption': 'Add more details about the dish',
                },
                note: 'Please retake the photo with better lighting and expand the caption.',
                resolution: '',
            }),
            restaurantId: 'r1',
        },
        {
            _id: 'p5',
            type: 'REEL',
            status: 'SCHEDULED',
            thumbnail: `${CONTENT_BASE}/images/vegetables_pan.jpg`,
            videoUrl: `${CONTENT_BASE}/videos/reel_steak.mp4`,
            caption: 'Fresh ingredients, every single day. Watch the magic happen in our kitchen!',
            platform: 'INSTAGRAM',
            duration: '0:15',
            scheduledFor: addHours(50),
            restaurantId: 'r1',
        },
        {
            _id: 'p6',
            type: 'STORY',
            status: 'SCHEDULED',
            thumbnail: `${CONTENT_BASE}/images/yogurt_fruit.jpg`,
            videoUrl: `${CONTENT_BASE}/videos/story_drink.mp4`,
            caption: 'Start your morning right! Healthy Breakfast Bowls now available.',
            platform: 'INSTAGRAM',
            duration: '0:15',
            scheduledFor: addHours(4),
            restaurantId: 'r1',
        },
    ],

    contentStrategies: [
        {
            _id: 'cs1',
            postsPerWeek: 5,
            focusCategories: ['Food Photography', 'Behind-the-scenes', 'Customer Stories'],
            bestTime: '6:00 PM - 8:00 PM',
            nextScheduledDate: addHours(4),
            theme: 'Authentic Indian Flavors Meet Modern Dining',
            restaurantId: 'r1',
        },
    ],

    strategyCycles: [
        {
            _id: 'sc1',
            period: 'June 2024',
            startDate: '2024-06-01',
            endDate: '2024-06-30',
            status: 'ACTIVE',
            summary: 'Focus on showcasing seasonal menu items and monsoon specials with increased engagement through interactive stories.',
            plannedPosts: [
                { category: 'Food Photography', count: 12 },
                { category: 'Reels', count: 8 },
                { category: 'Stories', count: 20 },
            ],
            focus: ['Monsoon Menu', 'Customer Testimonials', 'Chef Specials'],
            restaurantId: 'r1',
        },
        {
            _id: 'sc2',
            period: 'May 2024',
            startDate: '2024-05-01',
            endDate: '2024-05-31',
            status: 'APPROVED',
            summary: 'Launch summer menu with vibrant visuals. Emphasize light, refreshing dishes and cocktail promotions.',
            plannedPosts: [
                { category: 'Food Photography', count: 10 },
                { category: 'Carousels', count: 5 },
                { category: 'Videos', count: 5 },
            ],
            focus: ['Summer Drinks', 'Outdoor Seating', 'Happy Hours'],
            restaurantId: 'r1',
        },
        {
            _id: 'sc3',
            period: 'April 2024',
            startDate: '2024-04-01',
            endDate: '2024-04-30',
            status: 'HISTORY',
            summary: 'Festival season campaign with special thalis and traditional recipes.',
            plannedPosts: [
                { category: 'Food Photography', count: 15 },
                { category: 'Stories', count: 25 },
            ],
            focus: ['Traditional Dishes', 'Festival Offers', 'Family Dining'],
            restaurantId: 'r1',
        },
    ],

    sessions: [],
};
