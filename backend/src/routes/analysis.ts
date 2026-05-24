import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { streamQAResponse, answerQuestion, summarizeDocument } from '../services/analysis/index.js';
import { parseDocument } from '../services/parsing/index.js';
import { queryLimiter } from '../middleware/rateLimiter.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../observability/audit.js';
import { getAssignments } from '../services/providers/registry.js';

const router = Router();

const askSchema = z.object({
  question: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(20).optional().default(5),
});

// POST /api/documents/:id/ask
router.post('/:id/ask', queryLimiter, validateRequest(askSchema), async (req: Request, res: Response) => {
  const docId = req.params.id as string;
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) throw new AppError('DOCUMENT_NOT_FOUND', 'Document not found', 404);
  if (doc.status !== 'ready') throw new AppError('VALIDATION_ERROR', 'Document is not ready for Q&A', 400);

  const { question, topK } = req.body;
  const wantsStream = req.headers.accept !== 'application/json';

  if (wantsStream) {
    await streamQAResponse(res, doc.id, question, topK, req.correlationId);
  } else {
    const result = await answerQuestion(doc.id, question, topK, req.correlationId);

    await audit({
      event: 'QUERY_EXECUTED',
      entityType: 'query',
      entityId: doc.id,
      actorIp: req.ip,
      correlationId: req.correlationId,
      details: { question: question.slice(0, 100), modelUsed: result.model, tokensUsed: result.tokensUsed, cached: result.cached },
    });

    res.json({ ...result, correlationId: req.correlationId });
  }
});

const summarizeSchema = z.object({
  style: z.enum(['brief', 'detailed', 'bullets']).optional().default('brief'),
});

// POST /api/documents/:id/summarize
router.post('/:id/summarize', queryLimiter, validateRequest(summarizeSchema), async (req: Request, res: Response) => {
  const docId = req.params.id as string;
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) throw new AppError('DOCUMENT_NOT_FOUND', 'Document not found', 404);
  if (doc.status !== 'ready') throw new AppError('VALIDATION_ERROR', 'Document is not ready', 400);

  const parsed = await parseDocument(doc.filePath, doc.mimeType);
  const summary = await summarizeDocument(parsed.text, req.body.style);
  const assignments = await getAssignments();

  await prisma.analysisResult.upsert({
    where: { documentId_type: { documentId: doc.id, type: 'summary' } },
    update: { content: summary, modelUsed: assignments.summarization },
    create: { documentId: doc.id, type: 'summary', content: summary, modelUsed: assignments.summarization },
  });

  await audit({
    event: 'SUMMARY_REGENERATED',
    entityType: 'document',
    entityId: doc.id,
    correlationId: req.correlationId,
    details: { style: req.body.style, modelUsed: assignments.summarization },
  });

  res.json({ summary, model: assignments.summarization });
});

// GET /api/documents/:id/qa-history
router.get('/:id/qa-history', async (req: Request, res: Response) => {
  const history = await prisma.qaHistory.findMany({
    where: { documentId: req.params.id as string },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.json({ data: history });
});

export default router;
