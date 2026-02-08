/**
 * @restropulse/db - Posts collection helpers
 */

import { getPostsCollection, toApiFormat, toApiFormatArray, toObjectId } from './connection.js';
import type { Post } from '@restropulse/shared';

export async function findAllPosts(restaurantId?: string): Promise<Post[]> {
  const col = getPostsCollection();
  const query = restaurantId ? { restaurantId } : {};
  const docs = await col.find(query).sort({ createdAt: -1 }).toArray();
  return toApiFormatArray(docs) as Post[];
}

export async function findPostById(id: string): Promise<Post | null> {
  const col = getPostsCollection();
  const doc = await col.findOne({ _id: toObjectId(id) as any });
  return toApiFormat(doc) as Post | null;
}

export async function createPost(post: Omit<Post, 'id'>): Promise<Post> {
  const col = getPostsCollection();
  const postWithTimestamps = {
    ...post,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await col.insertOne(postWithTimestamps);
  return { ...post, id: result.insertedId.toString() } as Post;
}

export async function updatePost(id: string, updates: Partial<Post>): Promise<Post | null> {
  const col = getPostsCollection();
  const result = await col.findOneAndUpdate(
    { _id: toObjectId(id) as any },
    { $set: { ...updates, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  return toApiFormat(result) as Post | null;
}

export async function deletePost(id: string): Promise<boolean> {
  const col = getPostsCollection();
  const result = await col.deleteOne({ _id: toObjectId(id) as any });
  return result.deletedCount === 1;
}

export async function findPostsByStatus(status: string, restaurantId?: string): Promise<Post[]> {
  const col = getPostsCollection();
  const query: any = { status };
  if (restaurantId) query.restaurantId = restaurantId;
  const docs = await col.find(query).sort({ scheduledFor: 1 }).toArray();
  return toApiFormatArray(docs) as Post[];
}
