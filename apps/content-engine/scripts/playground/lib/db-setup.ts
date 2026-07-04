import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { setDB } from '@restropulse/db';
import { loadAllFixtures } from './fixture-loader.js';

let mongod: MongoMemoryServer;
let client: MongoClient;

export async function bootPlaygroundDB(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  setDB(client.db('restropulse-playground'));

  const counts = await loadAllFixtures();
  console.log(
    `\nPlayground ready — ${counts.restaurants} restaurants, ${counts.subscriptions} subscriptions, ` +
    `${counts.strategies} strategies, ${counts.cycles} cycles loaded (in-memory)\n`,
  );

  process.on('exit', async () => {
    await client?.close();
    await mongod?.stop();
  });
}

export async function getRestaurantsFromDB(): Promise<any[]> {
  return client.db('restropulse-playground').collection('restaurants').find({}).toArray();
}
