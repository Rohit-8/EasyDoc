import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../observability/logger.js';

let redis: Redis | null = null;

if (env.REDIS_URL) {
  try {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    redis.on('error', (err) => {
      logger.warn('Redis connection error', { error: err.message });
    });
    redis.on('connect', () => {
      logger.info('Redis connected');
    });
  } catch (err) {
    logger.warn('Failed to connect to Redis, running in sync mode', { error: (err as Error).message });
    redis = null;
  }
} else {
  logger.info('REDIS_URL not set — running in sync mode (no queue, no cache)');
}

export { redis };
export const isRedisAvailable = () => redis !== null && redis.status === 'ready';
