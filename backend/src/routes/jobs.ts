import { Router, Request, Response } from 'express';
import { getDocumentQueue } from '../queues/documentQueue.js';
import { AppError } from '../utils/AppError.js';

const router = Router();

// GET /api/jobs/:jobId
router.get('/:jobId', async (req: Request, res: Response) => {
  const queue = getDocumentQueue();
  if (!queue) throw new AppError('QUEUE_UNAVAILABLE', 'Job queue is not available (Redis not connected)', 503);

  const jobId = req.params.jobId as string;
  const job = await queue.getJob(jobId);
  if (!job) throw new AppError('NOT_FOUND', `Job ${jobId} not found`, 404);

  const state = await job.getState();
  const progress = job.progress;

  res.json({
    jobId: job.id,
    state,
    progress,
    data: { documentId: job.data.documentId },
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason ?? null,
    createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
  });
});

export default router;
