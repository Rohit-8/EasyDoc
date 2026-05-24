import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { env } from '../../config/env.js';
import { logger } from '../../observability/logger.js';
import { prisma } from '../../config/database.js';
import { AppError } from '../../utils/AppError.js';
import type { LanguageModel, EmbeddingModel } from 'ai';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyLanguageModel = LanguageModel | any;
type AnyEmbeddingModel = EmbeddingModel<string> | any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ModelInfo {
  id: string;
  rpm: number | null;
  rpd: number | null;
  tpm: number | null;
}

export interface EmbeddingModelInfo {
  id: string;
  dimensions: number;
  rpm: number | null;
  rpd: number | null;
}

export interface RegisteredProvider {
  id: string;
  name: string;
  models: ModelInfo[];
  embeddingModels: EmbeddingModelInfo[];
  createModel: (modelId: string) => AnyLanguageModel;
  createEmbeddingModel?: (modelId: string) => AnyEmbeddingModel;
}

const registry = new Map<string, RegisteredProvider>();

const GEMINI_MODELS: ModelInfo[] = [
  { id: 'gemini-3.5-flash', rpm: 5, rpd: 20, tpm: 250000 },
  { id: 'gemini-3.1-flash-lite', rpm: 15, rpd: 500, tpm: 250000 },
  { id: 'gemini-3-flash', rpm: 5, rpd: 20, tpm: 250000 },
  { id: 'gemini-2.5-flash-lite', rpm: 10, rpd: 20, tpm: 250000 },
  { id: 'gemma-4-31b', rpm: 15, rpd: 1500, tpm: null },
  { id: 'gemma-4-26b', rpm: 15, rpd: 1500, tpm: null },
  { id: 'gemma-3-27b-it', rpm: 30, rpd: 14400, tpm: 15000 },
  { id: 'gemma-3-12b-it', rpm: 30, rpd: 14400, tpm: 15000 },
  { id: 'gemma-3-4b-it', rpm: 30, rpd: 14400, tpm: 15000 },
  { id: 'gemma-3-1b-it', rpm: 30, rpd: 14400, tpm: 15000 },
];

const GROQ_MODELS: ModelInfo[] = [
  { id: 'groq/compound', rpm: 30, rpd: 250, tpm: 70000 },
  { id: 'groq/compound-mini', rpm: 30, rpd: 250, tpm: 70000 },
  { id: 'llama-3.1-8b-instant', rpm: 30, rpd: 14400, tpm: 6000 },
  { id: 'llama-3.3-70b-versatile', rpm: 30, rpd: 1000, tpm: 12000 },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', rpm: 30, rpd: 1000, tpm: 30000 },
  { id: 'openai/gpt-oss-120b', rpm: 30, rpd: 1000, tpm: 8000 },
  { id: 'openai/gpt-oss-20b', rpm: 30, rpd: 1000, tpm: 8000 },
  { id: 'qwen/qwen3-32b', rpm: 60, rpd: 1000, tpm: 6000 },
];

const NVIDIA_MODELS: ModelInfo[] = [
  { id: 'deepseek-ai/deepseek-v3.2', rpm: 40, rpd: null, tpm: null },
  { id: 'meta/llama-3.1-405b-instruct', rpm: 40, rpd: null, tpm: null },
  { id: 'meta/llama-3.3-70b-instruct', rpm: 40, rpd: null, tpm: null },
  { id: 'minimaxai/minimax-m2.7', rpm: 40, rpd: null, tpm: null },
  { id: 'mistralai/mistral-small-4-119b-2603', rpm: 40, rpd: null, tpm: null },
  { id: 'nvidia/nemotron-3-super-120b-a12b', rpm: 40, rpd: null, tpm: null },
  { id: 'qwen/qwen3.5-122b-a10b', rpm: 40, rpd: null, tpm: null },
  { id: 'qwen/qwen3-coder-480b-a35b-instruct', rpm: 40, rpd: null, tpm: null },
  { id: 'z-ai/glm-4.7', rpm: 40, rpd: null, tpm: null },
  { id: 'z-ai/glm-5.1', rpm: 40, rpd: null, tpm: null },
];

const GEMINI_EMBEDDING_MODELS: EmbeddingModelInfo[] = [
  { id: 'gemini-embedding-001', dimensions: 768, rpm: 1500, rpd: null },
];

const NVIDIA_EMBEDDING_MODELS: EmbeddingModelInfo[] = [
  { id: 'nvidia/llama-3.2-nv-embedqa-1b-v2', dimensions: 2048, rpm: null, rpd: null },
  { id: 'nvidia/nv-embedqa-e5-v5', dimensions: 1024, rpm: null, rpd: null },
  { id: 'nvidia/nv-embedqa-mistral-7b-v2', dimensions: 4096, rpm: null, rpd: null },
  { id: 'baai/bge-m3', dimensions: 1024, rpm: null, rpd: null },
  { id: 'snowflake/arctic-embed-l-v2.0', dimensions: 1024, rpm: null, rpd: null },
];

export async function detectProviders(): Promise<void> {
  registry.clear();

  if (env.GEMINI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
    registry.set('gemini', {
      id: 'gemini',
      name: 'Google Gemini',
      models: GEMINI_MODELS,
      embeddingModels: GEMINI_EMBEDDING_MODELS,
      createModel: (modelId: string) => google(modelId) as LanguageModel,
      createEmbeddingModel: (modelId: string) => google.textEmbeddingModel(modelId),
    });
    logger.info('Provider registered: Gemini', { models: GEMINI_MODELS.length, embeddings: GEMINI_EMBEDDING_MODELS.length });
  }

  if (env.GROQ_API_KEY) {
    const groq = createGroq({ apiKey: env.GROQ_API_KEY });
    registry.set('groq', {
      id: 'groq',
      name: 'Groq',
      models: GROQ_MODELS,
      embeddingModels: [],
      createModel: (modelId: string) => groq(modelId) as LanguageModel,
    });
    logger.info('Provider registered: Groq', { models: GROQ_MODELS.length });
  }

  if (env.NVIDIA_API_KEY) {
    const nvidia = createOpenAICompatible({
      name: 'nvidia',
      baseURL: 'https://integrate.api.nvidia.com/v1',
      headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}` },
    });
    registry.set('nvidia', {
      id: 'nvidia',
      name: 'NVIDIA Build',
      models: NVIDIA_MODELS,
      embeddingModels: NVIDIA_EMBEDDING_MODELS,
      createModel: (modelId: string) => nvidia.chatModel(modelId),
      createEmbeddingModel: (modelId: string) => nvidia.textEmbeddingModel(modelId),
    });
    logger.info('Provider registered: NVIDIA', { models: NVIDIA_MODELS.length, embeddings: NVIDIA_EMBEDDING_MODELS.length });
  }

  if (env.OLLAMA_BASE_URL) {
    try {
      const res = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`);
      const data = (await res.json()) as { models: { name: string }[] };
      const models: ModelInfo[] = data.models.map((m) => ({
        id: m.name,
        rpm: null,
        rpd: null,
        tpm: null,
      }));

      // Check if nomic-embed-text is available for embeddings
      const embeddingModels: EmbeddingModelInfo[] = data.models
        .filter((m) => m.name.includes('embed') || m.name.includes('nomic'))
        .map((m) => ({ id: m.name, dimensions: 768, rpm: null, rpd: null }));

      const llmModels = models.filter((m) => !embeddingModels.some((e) => e.id === m.id));

      const ollama = createOpenAICompatible({
        name: 'ollama',
        baseURL: `${env.OLLAMA_BASE_URL}/v1`,
      });
      registry.set('ollama', {
        id: 'ollama',
        name: 'Ollama (Local)',
        models: llmModels,
        embeddingModels,
        createModel: (modelId: string) => ollama.chatModel(modelId),
        createEmbeddingModel: (modelId: string) => ollama.textEmbeddingModel(modelId),
      });
      logger.info(`Provider registered: Ollama (${llmModels.length} LLMs, ${embeddingModels.length} embeddings)`);
    } catch {
      logger.warn('OLLAMA_BASE_URL set but Ollama not reachable');
    }
  }

  if (registry.size === 0) {
    throw new Error('No LLM providers configured. Set at least one API key in .env');
  }

  logger.info(`Total providers: ${registry.size}`);
}

export function getActiveProviders(): RegisteredProvider[] {
  return [...registry.values()];
}

export function findProviderForModel(modelId: string): RegisteredProvider | undefined {
  for (const provider of registry.values()) {
    if (provider.models.some((m) => m.id === modelId)) {
      return provider;
    }
  }
  return undefined;
}

export function getModel(modelId: string): LanguageModel {
  const provider = findProviderForModel(modelId);
  if (!provider) {
    throw new AppError('INVALID_MODEL', `Model ${modelId} not available in any active provider`, 400);
  }
  return provider.createModel(modelId);
}

export function getAllModels(): ModelInfo[] {
  return getActiveProviders().flatMap((p) => p.models);
}

// Default model selection based on what's available
export function getDefaultModel(): string {
  if (registry.has('gemini')) return 'gemini-3.1-flash-lite';
  if (registry.has('groq')) return 'llama-3.3-70b-versatile';
  if (registry.has('nvidia')) return 'meta/llama-3.3-70b-instruct';
  const ollama = registry.get('ollama');
  if (ollama && ollama.models.length > 0) return ollama.models[0].id;
  throw new AppError('LLM_UNAVAILABLE', 'No LLM providers available', 503);
}

// Model assignments
const DEFAULT_TASKS = ['summarization', 'classification', 'entityExtraction', 'qa', 'embedding'] as const;

export async function getAssignments(): Promise<Record<string, string>> {
  const setting = await prisma.setting.findUnique({ where: { key: 'model_assignments' } });
  if (setting) {
    try {
      return JSON.parse(setting.value);
    } catch { /* fall through */ }
  }

  const defaults: Record<string, string> = {};
  const envMap: Record<string, string | undefined> = {
    summarization: env.MODEL_SUMMARIZATION,
    classification: env.MODEL_CLASSIFICATION,
    entityExtraction: env.MODEL_ENTITY_EXTRACTION,
    qa: env.MODEL_QA,
    embedding: env.EMBEDDING_MODEL,
  };

  const fallback = getDefaultModel();
  for (const task of DEFAULT_TASKS) {
    const envVal = envMap[task];
    if (envVal && findProviderForModel(envVal)) {
      defaults[task] = envVal;
    } else if (task === 'embedding') {
      defaults[task] = env.EMBEDDING_MODEL;
    } else if (task === 'summarization' && registry.has('gemini')) {
      defaults[task] = 'gemma-4-31b';
    } else {
      defaults[task] = fallback;
    }
  }

  return defaults;
}

export async function saveAssignments(assignments: Record<string, string>): Promise<void> {
  const allModels = getAllModels().map((m) => m.id);
  for (const [task, model] of Object.entries(assignments)) {
    if (task !== 'embedding' && !allModels.includes(model)) {
      throw new AppError('INVALID_MODEL', `Model ${model} is not available in any active provider`, 400);
    }
  }
  await prisma.setting.upsert({
    where: { key: 'model_assignments' },
    update: { value: JSON.stringify(assignments) },
    create: { key: 'model_assignments', value: JSON.stringify(assignments) },
  });
}

export async function getModelForTask(task: string): Promise<LanguageModel> {
  const assignments = await getAssignments();
  const modelId = assignments[task];
  if (!modelId) return getModel(getDefaultModel());
  try {
    return getModel(modelId);
  } catch {
    return getModel(getDefaultModel());
  }
}

// ── Embedding helpers ──

export function getAllEmbeddingModels(): EmbeddingModelInfo[] {
  return getActiveProviders().flatMap((p) => p.embeddingModels);
}

export function findEmbeddingProvider(modelId: string): RegisteredProvider | undefined {
  for (const provider of registry.values()) {
    if (provider.embeddingModels.some((m) => m.id === modelId)) {
      return provider;
    }
  }
  return undefined;
}

export function getEmbeddingModel(modelId: string): EmbeddingModel<string> {
  const provider = findEmbeddingProvider(modelId);
  if (!provider?.createEmbeddingModel) {
    throw new AppError('INVALID_MODEL', `Embedding model ${modelId} not available in any active provider`, 400);
  }
  return provider.createEmbeddingModel(modelId);
}

export function getDefaultEmbeddingModel(): string {
  // Prefer EMBEDDING_PROVIDER from env
  const preferredProvider = env.EMBEDDING_PROVIDER;
  const provider = registry.get(preferredProvider);
  if (provider && provider.embeddingModels.length > 0) {
    return provider.embeddingModels[0].id;
  }

  // Fallback chain: gemini → nvidia → ollama
  for (const pid of ['gemini', 'nvidia', 'ollama']) {
    const p = registry.get(pid);
    if (p && p.embeddingModels.length > 0) return p.embeddingModels[0].id;
  }

  throw new AppError('EMBEDDING_UNAVAILABLE', 'No embedding model available. Configure Gemini, NVIDIA, or Ollama.', 503);
}
