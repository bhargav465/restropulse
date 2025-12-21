import { Restaurant, Post, ContentStrategy, User, StrategyCycle } from './types';
import { ASSETS } from './mockdata/assets';

export const MOCK_USER: User = {
  id: 'u1',
  name: 'Arjun Mehta',
  email: 'arjun@spicelounge.com',
  phone: '+91 98765 43210',
  role: 'OWNER'
};

export const MOCK_RESTAURANT: Restaurant = {
  id: 'r1',
  name: 'The Spice Lounge',
  cuisine: 'Modern Indian Fusion',
  location: {
    address: '12, Indiranagar, Bangalore, KA',
    lat: 12.9716,
    lng: 77.5946,
    mapUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.003673059882!2d77.6384!3d12.9716!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDU4JzE3LjgiTiA3N8KwMzgnMTguMiJF!5e0!3m2!1sen!2sin!4v1620000000000!5m2!1sen!2sin'
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

// Helper to get relative dates
const addHours = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

export const MOCK_POSTS: Post[] = [
  {
    id: 'p1',
    type: 'IMAGE',
    status: 'POSTED',
    thumbnail: ASSETS.images.food_platter,
    caption: 'Experience the burst of flavors with our new Tandoori Platter! 🍗✨ #SpiceLounge #Foodie #BangaloreEats',
    platform: 'INSTAGRAM',
    postedAt: '2024-05-15T18:30:00Z',
    stats: {
      likes: 1240,
      shares: 45,
      comments: 89,
      reach: 5600
    }
  },
  {
    id: 'p8',
    type: 'REEL',
    status: 'PENDING_APPROVAL',
    thumbnail: ASSETS.images.vegetables_pan, 
    videoUrl: ASSETS.videos.reel_steak,
    caption: 'Fresh ingredients, every single day. 🥗 Watch the magic happen in our kitchen! #FarmToTable #HealthyEating #RestroPulse',
    platform: 'INSTAGRAM',
    duration: '0:15',
    scheduledFor: addHours(50), 
    feedback: ''
  },
  {
    id: 'p2',
    type: 'CAROUSEL',
    status: 'PENDING_APPROVAL',
    thumbnail: ASSETS.images.cocktails,
    mediaUrls: [ASSETS.images.cocktails, ASSETS.images.ambiance_1, ASSETS.images.crowd],
    caption: 'Weekend Plans? Sorted. 🍹 Join us for our Happy Hour every Friday from 5 PM. Buy 1 Get 1 on all cocktails! 🥂✨ #Cheers #WeekendVibes',
    platform: 'BOTH',
    scheduledFor: addHours(48), 
    feedback: JSON.stringify({
        tags: ["Caption"],
        details: { "Caption": "Not engaging" },
        note: "Make it sound more exciting and add festive emojis!",
        resolution: "Rewrote caption with punchier text and added ✨ emojis as requested."
    })
  },
  {
    id: 'p9',
    type: 'STORY',
    status: 'SCHEDULED',
    thumbnail: ASSETS.images.yogurt_fruit, 
    videoUrl: ASSETS.videos.story_drink,
    caption: 'Start your morning right! 🍓 Healthy Breakfast Bowls now available.',
    platform: 'INSTAGRAM',
    duration: '0:15',
    scheduledFor: addHours(4),
  },
  {
    id: 'p3',
    type: 'VIDEO',
    status: 'CHANGES_REQUESTED',
    thumbnail: ASSETS.images.salad_eating,
    videoUrl: ASSETS.videos.chef_process,
    caption: 'Love at first bite! 🥗 Our customers are loving the new Summer Salad menu.',
    platform: 'INSTAGRAM',
    duration: '0:15',
    scheduledFor: addHours(24), 
    feedback: JSON.stringify({
        tags: ["Media"],
        details: { "Media": "Prefer Video" },
        note: "Can we make the video shorter? Maybe 15 seconds instead of 30."
    })
  },
  {
    id: 'p4',
    type: 'IMAGE',
    status: 'SCHEDULED',
    thumbnail: ASSETS.images.biryani,
    caption: 'Did someone say Biryani? 🍛 Pre-order now for Sunday Lunch!',
    platform: 'INSTAGRAM',
    scheduledFor: addHours(5), 
    feedback: JSON.stringify({
        tags: ["Timing"],
        details: { "Timing": "Post Later" },
        note: "Let's move this to the lunch slot instead of morning.",
        resolution: "Rescheduled to 12:30 PM for better lunch audience reach."
    })
  },
  {
    id: 'p5',
    type: 'IMAGE',
    status: 'SCHEDULED',
    thumbnail: ASSETS.images.dessert,
    caption: 'Flash Sale! ⚡ First 10 orders get a free dessert.',
    platform: 'INSTAGRAM',
    scheduledFor: addHours(2) 
  },
  {
    id: 'p6',
    type: 'CAROUSEL',
    status: 'PENDING_APPROVAL',
    thumbnail: ASSETS.images.ambiance_1,
    mediaUrls: [ASSETS.images.ambiance_1, ASSETS.images.ambiance_2, ASSETS.images.food_platter],
    caption: 'This post was supposed to go out yesterday but wasn\'t approved.',
    platform: 'FACEBOOK',
    scheduledFor: addHours(-24) 
  },
  {
    id: 'p7',
    type: 'IMAGE',
    status: 'CHANGES_REQUESTED',
    thumbnail: ASSETS.images.curry,
    caption: 'Special Curry Night! 🍛 Join us.',
    platform: 'INSTAGRAM',
    scheduledFor: addHours(36),
    feedback: JSON.stringify({
        tags: ["Caption"],
        details: { "Caption": "Wrong Price" },
        note: "Price is 499 not 599. \n\n[Update]: Still shows 599 in the graphic overlay.",
        resolution: "Updated the graphic overlay to reflect ₹499."
    })
  }
];

export const MOCK_STRATEGY: ContentStrategy = {
  postsPerWeek: 4,
  focusCategories: ['Behind the Scenes', 'Offers', 'User Generated Content'],
  bestTime: '7:30 PM',
  nextScheduledDate: 'Friday, 24 May',
  theme: 'Vibrant & Welcoming'
};

export const MOCK_CYCLES: StrategyCycle[] = [
  {
    id: 'cycle_2',
    period: 'Jun 1 - Jun 14, 2024',
    startDate: '2024-06-01',
    endDate: '2024-06-14',
    status: 'PENDING_APPROVAL',
    summary: 'Focus on festive season menu, customer testimonials, and behind-the-scenes content.',
    focus: ['Menu Highlights', 'Customer Reviews', 'Chef Specials', 'Ambiance'],
    plannedPosts: [
      { category: 'Menu highlights', count: 4 },
      { category: 'Customer reviews', count: 4 },
      { category: 'Chef specials', count: 2 },
      { category: 'Restaurant ambiance', count: 2 }
    ]
  },
  {
    id: 'cycle_1',
    period: 'May 15 - May 31, 2024',
    startDate: '2024-05-15',
    endDate: '2024-05-31',
    status: 'ACTIVE',
    summary: 'Driving weekday lunch traffic and promoting the new cocktail menu.',
    focus: ['Weekday Offers', 'Cocktail Launch', 'Interactive Stories'],
    plannedPosts: [
      { category: 'Weekday Offers', count: 6 },
      { category: 'Cocktail Launch', count: 4 },
      { category: 'Interactive Stories', count: 5 }
    ]
  }
];

// Area Chart Data (Engagement Pulse)
export const INSIGHT_DATA = [
  { name: 'Week 1', engagement: 2400, posts: 3 },
  { name: 'Week 2', engagement: 1398, posts: 4 },
  { name: 'Week 3', engagement: 3800, posts: 2 },
  { name: 'Week 4', engagement: 4300, posts: 5 },
  { name: 'Week 5', engagement: 4800, posts: 4 }, // Current
];

// Donut Chart Data (Content Balance)
export const CONTENT_MIX_DATA = [
    { name: 'Food & Menu', value: 45, color: '#f97316' }, // Orange-500
    { name: 'Offers', value: 30, color: '#a855f7' },      // Purple-500
    { name: 'BTS', value: 25, color: '#3b82f6' },         // Blue-500
];

export const THEME_PERFORMANCE = [
    { category: 'Food & Menu', count: 7, label: 'Top Performer', type: 'HIGH', score: 92 },
    { category: 'Offers', count: 4, label: 'Average', type: 'MED', score: 65 },
    { category: 'BTS', count: 3, label: 'Trending', type: 'HIGH', score: 85 },
];