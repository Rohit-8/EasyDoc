import { generateText, streamText } from 'ai';
import type { Response } from 'express';
import { getModelForTask, getAssignments } from '../providers/registry.js';
import { retrieveChunks } from '../retrieval/index.js';
import { prisma } from '../../config/database.js';
import { logger } from '../../observability/logger.js';
import { llmRequestsTotal, llmRequestDuration } from '../../observability/metrics.js';
import { createCircuitBreaker } from '../../utils/circuitBreaker.js';
import { Prisma } from '@prisma/client';
import { getCachedQuery, setCachedQuery } from '../cache/index.js';

// ── Circuit-protected LLM calls ──

async function _generateText(modelTask: string, prompt: string): Promise<{ text: string; usage?: { totalTokens?: number } }> {
  const model = await getModelForTask(modelTask);
  return generateText({ model, prompt });
}

const llmBreaker = createCircuitBreaker(
  async (args: unknown) => {
    const { task, prompt } = args as { task: string; prompt: string };
    return _generateText(task, prompt);
  },
  'llm-generate',
  { timeout: 60000, errorThresholdPercentage: 40, resetTimeout: 30000 },
);

async function safeGenerate(task: string, prompt: string): Promise<{ text: string; usage?: { totalTokens?: number } }> {
  try {
    return await llmBreaker.fire({ task, prompt }) as { text: string; usage?: { totalTokens?: number } };
  } catch (err) {
    logger.warn(`Circuit breaker tripped for ${task}, attempting direct call`, { error: (err as Error).message });
    // Fallback: direct call bypassing breaker
    return _generateText(task, prompt);
  }
}

export async function classifyDocument(text: string): Promise<{ type: string; subtype: string; confidence: number }> {
  const timer = llmRequestDuration.startTimer({ provider: 'auto', model: 'classification' });

  const { text: result } = await safeGenerate(
    'classification',
    `Classify this document into one of these types: contract, invoice, report, letter, memo, policy, manual, resume, other.
Also provide a subtype and confidence score (0-1).
Respond ONLY with JSON: {"type": "...", "subtype": "...", "confidence": 0.95}

Document text (first 3000 chars):
${text.slice(0, 3000)}`,
  );

  timer();
  llmRequestsTotal.inc({ provider: 'auto', model: 'classification' });

  try {
    return JSON.parse(result.replace(/```json\n?|\n?```/g, '').trim());
  } catch (err) {
    logger.warn('Failed to parse classification JSON', { error: (err as Error).message, raw: result.substring(0, 200) });
    return { type: 'other', subtype: 'unknown', confidence: 0.5 };
  }
}

export async function summarizeDocument(
  text: string,
  style: 'brief' | 'detailed' | 'bullets' = 'brief',
): Promise<{ brief: string; detailed: string }> {
  const timer = llmRequestDuration.startTimer({ provider: 'auto', model: 'summarization' });

  const stylePrompts = {
    brief: 'Provide a 3-5 sentence summary capturing the key points.',
    detailed: 'Provide a section-by-section detailed summary.',
    bullets: 'Provide a bullet-point summary of all key points.',
  };

  const { text: brief } = await safeGenerate(
    'summarization',
    `${stylePrompts.brief}\n\nDocument:\n${text.slice(0, 8000)}`,
  );

  const { text: detailed } = await safeGenerate(
    'summarization',
    `${stylePrompts.detailed}\n\nDocument:\n${text.slice(0, 8000)}`,
  );

  timer();
  llmRequestsTotal.inc({ provider: 'auto', model: 'summarization' });

  return { brief, detailed };
}

export async function extractEntities(text: string): Promise<Record<string, string[]>> {
  const timer = llmRequestDuration.startTimer({ provider: 'auto', model: 'entityExtraction' });

  const { text: result } = await safeGenerate(
    'entityExtraction',
    `Extract named entities from this document. Return ONLY JSON:
{"people": [], "organizations": [], "dates": [], "monetary": [], "locations": []}

Document text (first 5000 chars):
${text.slice(0, 5000)}`,
  );

  timer();
  llmRequestsTotal.inc({ provider: 'auto', model: 'entityExtraction' });

  try {
    return JSON.parse(result.replace(/```json\n?|\n?```/g, '').trim());
  } catch (err) {
    logger.warn('Failed to parse entity extraction JSON', { error: (err as Error).message, raw: result.substring(0, 200) });
    return { people: [], organizations: [], dates: [], monetary: [], locations: [] };
  }
}

export async function streamQAResponse(
  res: Response,
  documentId: string,
  question: string,
  topK: number,
  correlationId: string,
): Promise<void> {
  const chunks = await retrieveChunks(documentId, question, topK);
  const context = chunks.map((c, i) => `[CHUNK_${i + 1}] ${c.content}`).join('\n\n');
  const model = await getModelForTask('qa');
  const assignments = await getAssignments();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Correlation-ID', correlationId);

  let fullAnswer = '';

  const { textStream } = streamText({
    model,
    prompt: `You are a document analysis assistant. Answer the question based ONLY on the provided document context. If the answer is not in the context, say so. Reference the chunk numbers in your answer.

Context:
${context}

Question: ${question}`,
  });

  for await (const token of textStream) {
    fullAnswer += token;
    res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
  }

  const citations = chunks.map((c) => ({
    chunkId: c.id,
    chunkIndex: c.chunkIndex,
    pageNumber: c.pageNumber,
    section: c.section,
    text: c.content.substring(0, 200),
    similarity: c.similarity,
  }));

  // Save to QA history
  await prisma.qaHistory.create({
    data: {
      documentId,
      question,
      answer: fullAnswer,
      citations,
      modelUsed: assignments.qa,
      cached: false,
      correlationId,
    },
  });

  res.write(
    `data: ${JSON.stringify({
      type: 'done',
      answer: fullAnswer,
      citations,
      model: assignments.qa,
      cached: false,
      correlationId,
    })}\n\n`,
  );

  res.end();
}

export async function answerQuestion(
  documentId: string,
  question: string,
  topK: number,
  correlationId: string,
): Promise<{
  answer: string;
  citations: unknown[];
  model: string;
  tokensUsed: number;
  cached: boolean;
}> {
  // Check cache first
  type CachedQA = { answer: string; citations: unknown[]; model: string; tokensUsed: number };
  const cached = await getCachedQuery<CachedQA>(documentId, question);
  if (cached) {
    await prisma.qaHistory.create({
      data: { documentId, question, answer: cached.answer, citations: cached.citations as Prisma.InputJsonValue, modelUsed: cached.model, tokensUsed: cached.tokensUsed, cached: true, correlationId },
    });
    return { ...cached, cached: true };
  }

  const chunks = await retrieveChunks(documentId, question, topK);
  const context = chunks.map((c, i) => `[CHUNK_${i + 1}] ${c.content}`).join('\n\n');
  const assignments = await getAssignments();

  const qaPrompt = `You are a document analysis assistant. Answer the question based ONLY on the provided document context. If the answer is not in the context, say so. Reference the chunk numbers in your answer.

Context:
${context}

Question: ${question}`;

  const { text: answer, usage } = await safeGenerate('qa', qaPrompt);

  const citations = chunks.map((c) => ({
    chunkId: c.id,
    chunkIndex: c.chunkIndex,
    pageNumber: c.pageNumber,
    section: c.section,
    text: c.content.substring(0, 200),
    similarity: c.similarity,
  }));

  const result = {
    answer,
    citations,
    model: assignments.qa,
    tokensUsed: usage?.totalTokens ?? 0,
  };

  // Cache the result
  await setCachedQuery(documentId, question, result);

  await prisma.qaHistory.create({
    data: {
      documentId,
      question,
      answer,
      citations,
      modelUsed: assignments.qa,
      tokensUsed: usage?.totalTokens,
      cached: false,
      correlationId,
    },
  });

  return { ...result, cached: false };
}
