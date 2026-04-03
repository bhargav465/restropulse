import { Db } from 'mongodb';
import { getArchivedAccountsCollection } from './connection.js';
import type { ArchivedAccount, AccountDeletionInitiator } from '@restropulse/shared';

export async function archiveAccount(
  db: Db,
  userId: string | null,
  restaurantId: string | null,
  initiator: AccountDeletionInitiator,
  database: string,
  userPhone?: string,
): Promise<string> {
  const archive: ArchivedAccount = {
    restaurantId: restaurantId ?? '',
    userPhone,
    archivedAt: new Date(),
    initiator,
    database,
    data: {
      users:             userId        ? await db.collection('users').find({ _id: userId as any }).toArray()             : [],
      restaurants:       restaurantId  ? await db.collection('restaurants').find({ _id: restaurantId as any }).toArray() : [],
      posts:             restaurantId  ? await db.collection('posts').find({ restaurantId }).toArray()                   : [],
      contentStrategies: restaurantId  ? await db.collection('contentStrategies').find({ restaurantId }).toArray()       : [],
      strategyCycles:    restaurantId  ? await db.collection('strategyCycles').find({ restaurantId }).toArray()          : [],
      subscriptions:     restaurantId  ? await db.collection('subscriptions').find({ restaurantId }).toArray()           : [],
      couponRedemptions: restaurantId  ? await db.collection('couponRedemptions').find({ restaurantId }).toArray()       : [],
      creditPurchases:   restaurantId  ? await db.collection('creditPurchases').find({ restaurantId }).toArray()         : [],
      invoices:          restaurantId  ? await db.collection('invoices').find({ restaurantId }).toArray()                : [],
    },
  };

  const result = await db.collection('archivedAccounts').insertOne(archive as any);
  return result.insertedId.toString();
}

export async function findArchivedAccountsByRestaurant(restaurantId: string) {
  return getArchivedAccountsCollection().find({ restaurantId }).sort({ archivedAt: -1 }).toArray();
}

export async function findArchivedAccountsByPhone(phone: string) {
  return getArchivedAccountsCollection().find({ userPhone: phone }).sort({ archivedAt: -1 }).toArray();
}
