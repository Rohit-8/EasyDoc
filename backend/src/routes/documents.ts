import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { hashFile } from '../utils/hash.js';
import { processDocument } from '../services/upload/processDocument.js';
import { runSecurityChecks, sanitizeFilename } from '../services/security/index.js';
import { enqueueDocument } from '../queues/documentQueue.js';
import { uploadLimiter, readLimiter } from '../middleware/rateLimiter.js';
import { audit } from '../observability/audit.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../observability/logger.js';

const router = Router();

const allowedMimes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

const upload = multer({
  dest: path.resolve(env.UPLOAD_DIR, 'tmp'),
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = env.ALLOWED_EXTENSIONS.split(',').map((e) => `.${e.trim()}`);
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new AppError('INVALID_FILE_TYPE', `File type ${ext} is not allowed`, 400));
    }
  },
});

// POST /api/documents/upload
router.post('/upload', uploadLimiter, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('VALIDATION_ERROR', 'No file provided', 400);

  const file = req.file;
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = allowedMimes[ext] || file.mimetype;
  const safeName = sanitizeFilename(file.originalname);
  const docId = uuidv4();

  // Create permanent storage directory
  const docDir = path.resolve(env.UPLOAD_DIR, docId);
  await fs.mkdir(docDir, { recursive: true });
  const permanentPath = path.join(docDir, `original${ext}`);
  await fs.rename(file.path, permanentPath);

  // Security checks (magic bytes, ZIP bomb, malware)
  const security = await runSecurityChecks(permanentPath, mimeType);
  if (!security.passed) {
    await fs.rm(docDir, { recursive: true, force: true }).catch(() => {});
    throw new AppError('SECURITY_VIOLATION', security.reason ?? 'File failed security checks', 400);
  }

  // Hash for dedup
  const fileHash = await hashFile(permanentPath);

  // Check duplicate
  const force = req.body?.force === 'true';
  if (!force) {
    const existing = await prisma.document.findFirst({
      where: { fileHash, originalDocumentId: null },
    });
    if (existing) {
      await audit({
        event: 'DOCUMENT_DUPLICATE_DETECTED',
        entityType: 'document',
        entityId: existing.id,
        actorIp: req.ip,
        correlationId: req.correlationId,
        details: { fileHash },
      });
      // Clean up uploaded file
      await fs.rm(docDir, { recursive: true, force: true });
      res.status(200).json({
        id: existing.id,
        fileName: existing.fileName,
        status: existing.status,
        duplicate: true,
        message: 'File already processed. Use force=true to reprocess.',
      });
      return;
    }
  }

  // Handle versioning
  const originalDocumentId = req.body?.originalDocumentId || null;
  let version = 1;
  if (originalDocumentId) {
    const origDoc = await prisma.document.findUnique({ where: { id: originalDocumentId } });
    if (origDoc) {
      const latestVersion = await prisma.document.findFirst({
        where: { OR: [{ id: originalDocumentId }, { originalDocumentId }] },
        orderBy: { version: 'desc' },
      });
      version = (latestVersion?.version ?? 0) + 1;
    }
  }

  // Create document record
  const doc = await prisma.document.create({
    data: {
      id: docId,
      fileName: safeName,
      filePath: permanentPath,
      mimeType,
      fileSize: BigInt(file.size),
      fileHash,
      status: 'queued',
      version,
      originalDocumentId,
    },
  });

  await audit({
    event: 'DOCUMENT_UPLOADED',
    entityType: 'document',
    entityId: doc.id,
    actorIp: req.ip,
    correlationId: req.correlationId,
    details: { fileName: doc.fileName, fileHash, mimeType, fileSize: file.size },
  });

  // Process: async via BullMQ if Redis available, sync fallback otherwise
  const jobId = await enqueueDocument({
    documentId: doc.id,
    filePath: permanentPath,
    mimeType,
    correlationId: req.correlationId,
  });

  if (!jobId) {
    // Sync fallback — process in background
    processDocument(doc.id, req.correlationId).catch((err) => {
      logger.error('Background processing failed', { documentId: doc.id, error: err.message });
    });
  }

  res.status(202).json({
    id: doc.id,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSize: Number(doc.fileSize),
    fileHash: doc.fileHash,
    status: doc.status,
    uploadedAt: doc.createdAt,
    ...(jobId ? { jobId } : {}),
  });
});

// GET /api/documents
router.get('/', readLimiter, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const status = req.query.status as string;
  const type = req.query.type as string;
  const search = req.query.search as string;
  const sort = (req.query.sort as string) || '-createdAt';

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (type) where.classification = type;
  if (search) where.fileName = { contains: search, mode: 'insensitive' };

  const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
  const sortOrder = sort.startsWith('-') ? 'desc' : 'asc';

  const [data, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { versions: true } } },
    }),
    prisma.document.count({ where }),
  ]);

  res.json({
    data: data.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      mimeType: d.mimeType,
      fileSize: Number(d.fileSize),
      fileHash: d.fileHash,
      status: d.status,
      classification: d.classification,
      pageCount: d.pageCount,
      versionCount: d._count.versions + 1,
      uploadedAt: d.createdAt,
      processedAt: d.status === 'ready' ? d.updatedAt : null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// GET /api/documents/:id
router.get('/:id', readLimiter, async (req: Request, res: Response) => {
  const docId = req.params.id as string;
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    include: {
      analyses: true,
      versions: { orderBy: { version: 'desc' }, select: { id: true, version: true, createdAt: true, modelUsed: true } },
      _count: { select: { chunks: true } },
    },
  });

  if (!doc) throw new AppError('DOCUMENT_NOT_FOUND', 'Document not found', 404);

  const summary = doc.analyses.find((a) => a.type === 'summary');
  const entities = doc.analyses.find((a) => a.type === 'entities');
  const classification = doc.analyses.find((a) => a.type === 'classification');

  res.json({
    id: doc.id,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSize: Number(doc.fileSize),
    fileHash: doc.fileHash,
    status: doc.status,
    classification: doc.classification,
    pageCount: doc.pageCount,
    chunkCount: doc._count.chunks,
    uploadedAt: doc.createdAt,
    processedAt: doc.status === 'ready' ? doc.updatedAt : null,
    processingDurationMs: doc.processingDurationMs,
    errorMessage: doc.errorMessage,
    summary: summary?.content ?? null,
    entities: entities?.content ?? null,
    classificationDetails: classification?.content ?? null,
    versions: [
      { version: doc.version, id: doc.id, createdAt: doc.createdAt, modelUsed: doc.modelUsed },
      ...doc.versions.map((v) => ({ version: v.version, id: v.id, createdAt: v.createdAt, modelUsed: v.modelUsed })),
    ],
  });
});

// GET /api/documents/:id/file
router.get('/:id/file', async (req: Request, res: Response) => {
  const docId = req.params.id as string;
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) throw new AppError('DOCUMENT_NOT_FOUND', 'Document not found', 404);

  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);  

  const fileBuffer = await fs.readFile(doc.filePath);
  res.send(fileBuffer);
});

// DELETE /api/documents/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const docId = req.params.id as string;
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) throw new AppError('DOCUMENT_NOT_FOUND', 'Document not found', 404);

  await prisma.document.delete({ where: { id: docId } });

  // Clean up file
  const docDir = path.dirname(doc.filePath);
  await fs.rm(docDir, { recursive: true, force: true }).catch(() => {});

  await audit({
    event: 'DOCUMENT_DELETED',
    entityType: 'document',
    entityId: doc.id,
    actorIp: req.ip,
    correlationId: req.correlationId,
    details: { fileName: doc.fileName },
  });

  res.status(204).send();
});

export default router;
