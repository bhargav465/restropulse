/**
 * @restropulse/db - Barrel export
 * Central entry point for all database operations.
 */

export {
  connectDB,
  disconnectDB,
  getDB,
  setDB,
  getConfig,
  getUsersCollection,
  getRestaurantsCollection,
  getPostsCollection,
  getStrategyCyclesCollection,
  getContentStrategiesCollection,
  getSessionsCollection,
  getOtpChallengesCollection,
  getOauthSessionsCollection,
  getDataDeletionAuditsCollection,
  getAccountManagersCollection,
  getCitiesCollection,
  toApiFormat,
  toApiFormatArray,
  toObjectId,
  ObjectId,
} from './connection.js';

export type { DatabaseConfig } from './connection.js';

export * from './users.js';
export * from './restaurants.js';
export * from './posts.js';
export * from './strategy.js';
export * from './account-managers.js';
export * from './cities.js';
