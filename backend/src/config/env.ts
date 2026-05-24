import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Look for .env in backend root, then project root as fallback
const backendEnv = path.resolve(__dirname, '../../.env');
const rootEnv = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: backendEnv });
dotenv.config({ path: rootEnv }); // won't override already-set vars

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),
  GROQ_API_KEY: z.string().optional().default(''),
  NVIDIA_API_KEY: z.string().optional().default(''),
  OLLAMA_BASE_URL: z.string().optional().default(''),
  MODEL_SUMMARIZATION: z.string().optional().default(''),
  MODEL_CLASSIFICATION: z.string().optional().default(''),
  MODEL_ENTITY_EXTRACTION: z.string().optional().default(''),
  MODEL_QA: z.string().optional().default(''),
  EMBEDDING_PROVIDER: z.string().optional().default('gemini'),
  EMBEDDING_MODEL: z.string().optional().default('gemini-embedding-001'),
  EMBEDDING_DIMENSIONS: z.coerce.number().optional().default(768),
  CLAMAV_ENABLED: z.string().optional().default('false'),
  CLAMAV_HOST: z.string().optional().default('localhost'),
  CLAMAV_PORT: z.coerce.number().optional().default(3310),
  PORT: z.coerce.number().optional().default(3001),
  NODE_ENV: z.enum(['development', 'production']).optional().default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional().default('info'),
  UPLOAD_DIR: z.string().optional().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().optional().default(50),
  ALLOWED_EXTENSIONS: z.string().optional().default('pdf,docx,xlsx,csv,txt,md'),
  RATE_LIMIT_UPLOAD: z.coerce.number().optional().default(10),
  RATE_LIMIT_QUERY: z.coerce.number().optional().default(30),
  RATE_LIMIT_READ: z.coerce.number().optional().default(100),
  CACHE_TTL_QUERY: z.coerce.number().optional().default(3600),
  CACHE_TTL_EMBEDDING: z.coerce.number().optional().default(86400),
  CACHE_TTL_METADATA: z.coerce.number().optional().default(600),
  QUEUE_CONCURRENCY: z.coerce.number().optional().default(2),
  QUEUE_MAX_RETRIES: z.coerce.number().optional().default(3),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
