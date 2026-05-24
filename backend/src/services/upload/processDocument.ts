import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../../config/database.js';
import { parseDocument } from '../parsing/index.js';
import { chunkText } from '../chunking/index.js';
import { generateEmbeddings } from '../embedding/index.js';
import { classifyDocument, summarizeDocument, extractEntities } from '../analysis/index.js';
import { logger } from '../../observability/logger.js';
import { documentProcessingDuration } from '../../observability/metrics.js';
import { audit } from '../../observability/audit.js';
import { getAssignments } from '../providers/registry.js';

export async function processDocument(documentId: string, correlationId: string): Promise<void> {
  const start = Date.now();
  const timer = documentProcessingDuration.startTimer();

  try {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'processing' },
    });

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });

    // 1. Parse
    logger.info('Parsing document', { documentId, mimeType: doc.mimeType, correlationId });
    const parsed = await parseDocument(doc.filePath, doc.mimeType);

    // 2. Chunk
    logger.info('Chunking document', { documentId, textLength: parsed.text.length, correlationId });
    const chunks = chunkText(parsed.text, parsed.pageCount);

    // 3. Generate embeddings
    logger.info('Generating embeddings', { documentId, chunkCount: chunks.length, correlationId });
    const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

    // 4. Store chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vectorStr = `[${embeddings[i].join(',')}]`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding, page_number, section, token_count, metadata, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4::vector, $5, $6, $7, '{}', NOW())`,
        documentId,
        chunk.chunkIndex,
        chunk.content,
        vectorStr,
        chunk.pageNumber ?? null,
        chunk.section ?? null,
        chunk.tokenCount,
      );
    }

    // 5. LLM Analysis
    const assignments = await getAssignments();
    logger.info('Running LLM analysis', { documentId, correlationId });

    const [classification, summary, entities] = await Promise.all([
      classifyDocument(parsed.text),
      summarizeDocument(parsed.text),
      extractEntities(parsed.text),
    ]);

    // Store analysis results
    await prisma.analysisResult.upsert({
      where: { documentId_type: { documentId, type: 'classification' } },
      update: { content: classification, modelUsed: assignments.classification },
      create: { documentId, type: 'classification', content: classification, modelUsed: assignments.classification },
    });

    await prisma.analysisResult.upsert({
      where: { documentId_type: { documentId, type: 'summary' } },
      update: { content: summary, modelUsed: assignments.summarization },
      create: { documentId, type: 'summary', content: summary, modelUsed: assignments.summarization },
    });

    await prisma.analysisResult.upsert({
      where: { documentId_type: { documentId, type: 'entities' } },
      update: { content: entities, modelUsed: assignments.entityExtraction },
      create: { documentId, type: 'entities', content: entities, modelUsed: assignments.entityExtraction },
    });

    const durationMs = Date.now() - start;

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'ready',
        pageCount: parsed.pageCount,
        classification: classification.type,
        processingDurationMs: durationMs,
        modelUsed: assignments.summarization,
      },
    });

    timer();

    await audit({
      event: 'DOCUMENT_PROCESSED',
      entityType: 'document',
      entityId: documentId,
      correlationId,
      details: { durationMs, chunkCount: chunks.length, modelUsed: assignments.summarization },
    });

    logger.info('Document processed successfully', { documentId, durationMs, chunkCount: chunks.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Document processing failed', { documentId, error: message, correlationId });

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'error', errorMessage: message },
    });

    await audit({
      event: 'DOCUMENT_PROCESSING_FAILED',
      entityType: 'document',
      entityId: documentId,
      correlationId,
      details: { error: message },
    });

    throw error;
  }
}
