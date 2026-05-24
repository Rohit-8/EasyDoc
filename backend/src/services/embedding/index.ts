import { embed } from 'ai';
import { env } from '../../config/env.js';
import { logger } from '../../observability/logger.js';
import {
  getAssignments,
  getDefaultEmbeddingModel,
  getEmbeddingModel as getEmbeddingModelFromRegistry,
  findEmbeddingProvider,
} from '../providers/registry.js';

async function resolveEmbeddingModelId(): Promise<string> {
  // Priority: DB assignment → env var → auto-detect
  const assignments = await getAssignments();
  const assigned = assignments.embedding;
  if (assigned && findEmbeddingProvider(assigned)) return assigned;
  if (env.EMBEDDING_MODEL && findEmbeddingProvider(env.EMBEDDING_MODEL)) return env.EMBEDDING_MODEL;
  return getDefaultEmbeddingModel();
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const modelId = await resolveEmbeddingModelId();
  const model = getEmbeddingModelFromRegistry(modelId);

  const { embedding } = await embed({
    model,
    value: text,
  });

  return embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  const batchSize = 10;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(generateEmbedding));
    results.push(...batchResults);
    if (i + batchSize < texts.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  logger.debug(`Generated ${results.length} embeddings via ${await resolveEmbeddingModelId()}`);
  return results;
}
