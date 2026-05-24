import { Worker, type ConnectionOptions } from 'bullmq';
import { redis, isRedisAvailable } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';
import { prisma } from '../config/database.js';
import { processDocument } from '../services/upload/processDocument.js';
import { QUEUE_NAME, type DocumentJobData } from '../queues/documentQueue.js';

let worker: Worker | null = null;

export function startDocumentWorker(): Worker | null {
  if (!isRedisAvailable() || !redis) {
    logger.info('Redis not available — skipping BullMQ worker');
    return null;
  }

  worker = new Worker<DocumentJobData>(
    QUEUE_NAME,
    async (job) => {
      const { documentId, correlationId } = job.data;
      logger.info('Processing document job', { documentId, jobId: job.id });

      try {
        await prisma.document.update({
          where: { id: documentId },
          data: { status: 'processing' },
        });

        await job.updateProgress(10);

        await processDocument(documentId, correlationId);

        await job.updateProgress(100);
        logger.info('Document job completed', { documentId, jobId: job.id });
      } catch (err) {
        logger.error('Document job failed', { documentId, jobId: job.id, error: (err as Error).message });
        await prisma.document.update({
          where: { id: documentId },
          data: { status: 'error' },
        });
        throw err; // let BullMQ handle retry
      }
    },
    {
      connection: redis as unknown as ConnectionOptions,
      concurrency: env.QUEUE_CONCURRENCY,
    },
  );

  worker.on('completed', (job) => {
    logger.info('Worker: job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Worker: job failed', { jobId: job?.id, error: err.message });
  });

  logger.info('BullMQ document worker started', { concurrency: env.QUEUE_CONCURRENCY });
  return worker;
}

export function getWorker(): Worker | null {
  return worker;
}
