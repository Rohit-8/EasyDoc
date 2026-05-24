import { Queue, type ConnectionOptions } from 'bullmq';
import { redis, isRedisAvailable } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';

const QUEUE_NAME = 'document-processing';

let documentQueue: Queue | null = null;

export function getDocumentQueue(): Queue | null {
  if (documentQueue) return documentQueue;
  if (!isRedisAvailable() || !redis) return null;

  try {
    documentQueue = new Queue(QUEUE_NAME, {
      connection: redis as unknown as ConnectionOptions,
      defaultJobOptions: {
        attempts: env.QUEUE_MAX_RETRIES,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 5000 },
      },
    });
    logger.info('BullMQ document queue initialized');
    return documentQueue;
  } catch (err) {
    logger.warn('Failed to initialize BullMQ queue', { error: (err as Error).message });
    return null;
  }
}

export interface DocumentJobData {
  documentId: string;
  filePath: string;
  mimeType: string;
  correlationId: string;
}

export async function enqueueDocument(data: DocumentJobData): Promise<string | null> {
  const queue = getDocumentQueue();
  if (!queue) return null;

  const job = await queue.add('process', data, {
    jobId: `doc-${data.documentId}`,
  });

  logger.info('Document enqueued', { documentId: data.documentId, jobId: job.id });
  return job.id ?? null;
}

export { QUEUE_NAME };
