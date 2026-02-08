import { getRestaurantsCollection, toApiFormat } from './connection.js';
import { Restaurant, InstagramCredentials } from '../models/types.js';

export async function findRestaurantById(id: string): Promise<Restaurant | null> {
    const col = getRestaurantsCollection();
    const doc = await col.findOne({ _id: id as any });
    return toApiFormat(doc) as Restaurant | null;
}

// Get all restaurants with Instagram credentials (for token refresh cron)
export async function findRestaurantsWithInstagram(): Promise<Restaurant[]> {
    const col = getRestaurantsCollection();
    const docs = await col.find({
        'instagramCredentials.accessToken': { $exists: true, $ne: null }
    }).toArray();
    return docs.map(doc => toApiFormat(doc) as Restaurant);
}

export async function updateRestaurant(id: string, updates: Partial<Restaurant>): Promise<Restaurant | null> {
    const col = getRestaurantsCollection();
    const result = await col.findOneAndUpdate(
        { _id: id as any },
        { $set: { ...updates, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return toApiFormat(result) as Restaurant | null;
}

// Update Instagram credentials for a restaurant
export async function updateInstagramCredentials(
    id: string,
    credentials: InstagramCredentials
): Promise<Restaurant | null> {
    const col = getRestaurantsCollection();
    const result = await col.findOneAndUpdate(
        { _id: id as any },
        {
            $set: {
                instagramCredentials: credentials,
                'integrations.instagram': true,
                updatedAt: new Date()
            }
        },
        { returnDocument: 'after' }
    );
    return toApiFormat(result) as Restaurant | null;
}

// Remove Instagram credentials (disconnect)
export async function removeInstagramCredentials(id: string): Promise<Restaurant | null> {
    const col = getRestaurantsCollection();
    const result = await col.findOneAndUpdate(
        { _id: id as any },
        {
            $unset: { instagramCredentials: '' },
            $set: {
                'integrations.instagram': false,
                updatedAt: new Date()
            }
        },
        { returnDocument: 'after' }
    );
    return toApiFormat(result) as Restaurant | null;
}

export async function addOffer(id: string, offer: string): Promise<Restaurant | null> {
    const col = getRestaurantsCollection();
    // Fetch current offers, prepend new one, then update
    const doc = await col.findOne({ _id: id as any });
    if (!doc) return null;

    const offers = [offer, ...(doc.activeOffers || [])];

    const result = await col.findOneAndUpdate(
        { _id: id as any },
        { $set: { activeOffers: offers, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return toApiFormat(result) as Restaurant | null;
}

export async function removeOffer(id: string, index: number): Promise<Restaurant | null> {
    const col = getRestaurantsCollection();
    // MongoDB doesn't have direct index-based array removal, so we fetch, modify, update
    const doc = await col.findOne({ _id: id as any });
    if (!doc) return null;

    const offers = doc.activeOffers || [];
    offers.splice(index, 1);

    const result = await col.findOneAndUpdate(
        { _id: id as any },
        { $set: { activeOffers: offers, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return toApiFormat(result) as Restaurant | null;
}

export async function addSpecial(id: string, special: string): Promise<Restaurant | null> {
    const col = getRestaurantsCollection();
    // Fetch current specials, prepend new one, then update
    const doc = await col.findOne({ _id: id as any });
    if (!doc) return null;

    const specials = [special, ...(doc.chefSpecials || [])];

    const result = await col.findOneAndUpdate(
        { _id: id as any },
        { $set: { chefSpecials: specials, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return toApiFormat(result) as Restaurant | null;
}

export async function removeSpecial(id: string, index: number): Promise<Restaurant | null> {
    const col = getRestaurantsCollection();
    const doc = await col.findOne({ _id: id as any });
    if (!doc) return null;

    const specials = doc.chefSpecials || [];
    specials.splice(index, 1);

    const result = await col.findOneAndUpdate(
        { _id: id as any },
        { $set: { chefSpecials: specials, updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return toApiFormat(result) as Restaurant | null;
}

export async function updateMenuTimestamp(id: string): Promise<Restaurant | null> {
    const col = getRestaurantsCollection();
    const result = await col.findOneAndUpdate(
        { _id: id as any },
        { $set: { menuLastUpdated: new Date().toISOString().split('T')[0], updatedAt: new Date() } },
        { returnDocument: 'after' }
    );
    return toApiFormat(result) as Restaurant | null;
}
