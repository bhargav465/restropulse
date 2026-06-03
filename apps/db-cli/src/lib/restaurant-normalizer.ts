import { randomUUID } from 'node:crypto';

export type PriceRange = 'budget' | 'mid-range' | 'upscale' | 'fine-dining';
export type DataSource = 'kaggle-zomato' | 'osm' | 'merged' | 'manual';

export interface RestaurantFixture {
    _id: string;
    id: string;
    name: string;
    cuisine: string;
    cuisines: string[];
    location: {
        address: string;
        lat: number;
        lng: number;
        mapUrl: string;
    };
    accountManager: {
        name: string;
        phone: string;
        email: string;
        avatar: string;
    };
    integrations: { instagram: boolean };
    activeOffers: string[];
    chefSpecials: string[];
    menuLastUpdated: string;
    priceRange: PriceRange;
    rating?: number;
    ratingCount?: number;
    serviceOptions: {
        delivery: boolean;
        dineIn: boolean;
        takeout: boolean;
    };
    averageCostForTwo?: number;
    sourceCity: string;
    dataSource: DataSource;
    phone?: string;
    website?: string;
    operatingHours?: { weekday_text: string[] };
    menu?: Array<{
        id: string;
        category: string;
        name: string;
        isVeg: boolean;
        isAvailable: boolean;
        isBestSeller?: boolean;
    }>;
}

const CUISINE_PRIORITY = [
    'Biryani', 'South Indian', 'North Indian', 'Mughlai', 'Andhra',
    'Tamil', 'Kerala', 'Chettinad', 'Hyderabadi', 'Bengali',
    'Punjabi', 'Rajasthani', 'Gujarati', 'Maharashtrian',
    'Chinese', 'Italian', 'Continental', 'Mediterranean',
    'Fast Food', 'Street Food', 'Cafe', 'Bakery', 'Pizza', 'Burger',
];

export function normalizeCuisine(raw: string): { primary: string; all: string[] } {
    const all = raw.split(',').map(c => c.trim()).filter(Boolean);
    const primary = all.find(c =>
        CUISINE_PRIORITY.some(p => c.toLowerCase().includes(p.toLowerCase()))
    ) ?? all[0] ?? 'Multi-cuisine';
    return { primary, all };
}

export function normalizePriceRange(priceRangeInt: number): PriceRange {
    switch (priceRangeInt) {
        case 1: return 'budget';
        case 2: return 'mid-range';
        case 3: return 'upscale';
        case 4: return 'fine-dining';
        default: return 'mid-range';
    }
}

const DEFAULT_ACCOUNT_MANAGER = {
    hyderabad: { name: 'RestroPulse Hyderabad', phone: '+91 00000 00003', email: 'hyderabad@restropulse.ai', avatar: 'https://picsum.photos/seed/am-hyd/100/100' },
    mumbai:    { name: 'RestroPulse Mumbai',    phone: '+91 00000 00001', email: 'mumbai@restropulse.ai',    avatar: 'https://picsum.photos/seed/am-mum/100/100' },
    bangalore: { name: 'RestroPulse Bangalore', phone: '+91 00000 00002', email: 'bangalore@restropulse.ai', avatar: 'https://picsum.photos/seed/am-blr/100/100' },
};

export function normalizeRow(row: Record<string, string>, city: string): RestaurantFixture | null {
    const name = (row['Restaurant Name'] ?? row['name'] ?? '').trim();
    const latStr = row['Latitude'] ?? row['latitude'] ?? '';
    const lngStr = row['Longitude'] ?? row['longitude'] ?? '';
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (!name || isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;

    const cuisineRaw = row['Cuisines'] ?? row['cuisines'] ?? 'Multi-cuisine';
    const { primary, all } = normalizeCuisine(cuisineRaw);

    const priceRangeInt = parseInt(row['Price range'] ?? row['price_range'] ?? '2', 10);
    const priceRange = normalizePriceRange(Number.isNaN(priceRangeInt) ? 2 : priceRangeInt);

    const rating = parseFloat(row['Aggregate rating'] ?? row['aggregate_rating'] ?? '');
    const votes = parseInt(row['Votes'] ?? row['votes'] ?? '0', 10);
    const costForTwo = parseFloat(row['Average Cost for two'] ?? row['average_cost_for_two'] ?? '');

    const hasDelivery = (row['Has Online delivery'] ?? row['has_online_delivery'] ?? '').toLowerCase() === 'yes';
    const hasDineIn = (row['Has Table booking'] ?? row['has_table_booking'] ?? '').toLowerCase() === 'yes';

    const address = [
        row['Address'] ?? row['address'] ?? '',
        row['Locality'] ?? row['locality'] ?? '',
        row['City'] ?? row['city'] ?? city,
        'India',
    ].filter(Boolean).join(', ');

    const id = `acq-${city.slice(0, 3)}-${randomUUID().slice(0, 8)}`;
    const am = DEFAULT_ACCOUNT_MANAGER[city as keyof typeof DEFAULT_ACCOUNT_MANAGER]
        ?? DEFAULT_ACCOUNT_MANAGER.hyderabad;

    return {
        _id: id,
        id,
        name,
        cuisine: primary,
        cuisines: all,
        location: { address, lat, lng, mapUrl: `https://www.google.com/maps?q=${lat},${lng}` },
        accountManager: am,
        integrations: { instagram: false },
        activeOffers: [],
        chefSpecials: [],
        menuLastUpdated: new Date().toISOString().split('T')[0],
        priceRange,
        rating: isNaN(rating) ? undefined : rating,
        ratingCount: isNaN(votes) ? undefined : votes,
        serviceOptions: { delivery: hasDelivery, dineIn: hasDineIn, takeout: hasDineIn },
        averageCostForTwo: isNaN(costForTwo) ? undefined : costForTwo,
        sourceCity: city,
        dataSource: 'kaggle-zomato',
    };
}
