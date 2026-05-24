import crypto from 'crypto';
import { redis, isRedisAvailable } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../observability/logger.js';

function hashKey(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function queryKey(documentId: string, question: string): string {
  return `cache:query:${documentId}:${hashKey(question)}`;
}

function embeddingKey(text: string, model: string): string {
  return `cache:embedding:${model}:${hashKey(text)}`;
}

function metadataKey(documentId: string): string {
  return `cache:metadata:${documentId}`;
}

export async function getCachedQuery<T>(documentId: string, question: string): Promise<T | null> {
  if (!isRedisAvailable() || !redis) return null;
  try {
    const raw = await redis.get(queryKey(documentId, question));
    if (!raw) return null;
    logger.debug('Cache hit: query', { documentId });
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn('Cache read error (query)', { error: (err as Error).message });
    return null;
  }
}

export async function setCachedQuery(documentId: string, question: string, data: unknown): Promise<void> {
  if (!isRedisAvailable() || !redis) return;
  try {
    await redis.setex(queryKey(documentId, question), env.CACHE_TTL_QUERY, JSON.stringify(data));
  } catch (err) {
    logger.warn('Cache write error (query)', { error: (err as Error).message });
  }
}

export async function getCachedEmbedding(text: string, model: string): Promise<number[] | null> {
  if (!isRedisAvailable() || !redis) return null;
  try {
    const raw = await redis.get(embeddingKey(text, model));
    if (!raw) return null;
    logger.debug('Cache hit: embedding');
    return JSON.parse(raw) as number[];
  } catch (err) {
    logger.warn('Cache read error (embedding)', { error: (err as Error).message });
    return null;
  }
}

export async function setCachedEmbedding(text: string, model: string, embedding: number[]): Promise<void> {
  if (!isRedisAvailable() || !redis) return;
  try {
    await redis.setex(embeddingKey(text, model), env.CACHE_TTL_EMBEDDING, JSON.stringify(embedding));
  } catch (err) {
    logger.warn('Cache write error (embedding)', { error: (err as Error).message });
  }
}

export async function getCachedMetadata<T>(documentId: string): Promise<T | null> {
  if (!isRedisAvailable() || !redis) return null;
  try {
    const raw = await redis.get(metadataKey(documentId));
    if (!raw) return null;
    logger.debug('Cache hit: metadata', { documentId });
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn('Cache read error (metadata)', { error: (err as Error).message });
    return null;
  }
}

export async function setCachedMetadata(documentId: string, data: unknown): Promise<void> {
  if (!isRedisAvailable() || !redis) return;
  try {
    await redis.setex(metadataKey(documentId), env.CACHE_TTL_METADATA, JSON.stringify(data));
  } catch (err) {
    logger.warn('Cache write error (metadata)', { error: (err as Error).message });
  }
}

export async function invalidateDocumentCache(documentId: string): Promise<void> {
  if (!isRedisAvailable() || !redis) return;
  try {
    const pattern = `cache:*:${documentId}:*`;
    const keys = await redis.keys(pattern);
    const metaKey = metadataKey(documentId);
    keys.push(metaKey);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.debug('Cache invalidated', { documentId, keysRemoved: keys.length });
    }
  } catch (err) {
    logger.warn('Cache invalidation error', { error: (err as Error).message });
  }
}
