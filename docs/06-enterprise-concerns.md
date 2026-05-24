# EasyDoc — Enterprise Cross-Cutting Concerns

This document details the enterprise patterns that make EasyDoc production-grade.

---

## 0. Redis-Optional Design

Redis is **optional** — controlled via `REDIS_URL` env var. When Redis is not configured, the service runs fully functional with graceful fallbacks.

### Fallback Matrix

| Feature | With Redis | Without Redis |
|---------|------------|---------------|
| **Job Queue** | BullMQ async (non-blocking upload) | Synchronous inline processing |
| **Caching** | Redis cache with configurable TTL | No cache (every request hits DB/API) |
| **Rate Limiting** | Distributed Redis counter (works across instances) | In-memory counter (per-process only) |
| **Job Status API** | `GET /api/jobs/:id` from Redis | Not available (use `GET /api/documents/:id` status field) |

### How It Works

```typescript
// config/redis.ts
let redis: Redis | null = null;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
  redis.on('error', (err) => {
    logger.warn('Redis connection lost, falling back to sync mode', { error: err.message });
    redis = null;  // degrade gracefully at runtime too
  });
} else {
  logger.info('REDIS_URL not set — running in sync mode (no queue, no cache)');
}

export { redis };
export const isRedisAvailable = () => redis !== null && redis.status === 'ready';
```

### Upload Behavior

```typescript
// services/upload/processDocument.ts
if (isRedisAvailable()) {
  // Async: enqueue to BullMQ, return 202 Accepted
  const job = await documentQueue.add('process', { documentId, correlationId });
  return { status: 202, jobId: job.id, documentStatus: 'queued' };
} else {
  // Sync: process inline, return 201 Created when done
  await processDocumentInline(documentId, correlationId);
  return { status: 201, documentStatus: 'ready' };
}
```

### Cache Behavior

```typescript
// services/cache/cacheService.ts
class CacheService {
  async get<T>(key: string): Promise<T | null> {
    if (!isRedisAvailable()) return null;  // cache miss, no error
    const data = await redis!.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!isRedisAvailable()) return;  // silently skip
    await redis!.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async invalidate(pattern: string): Promise<void> {
    if (!isRedisAvailable()) return;
    const keys = await redis!.keys(pattern);
    if (keys.length > 0) await redis!.del(...keys);
  }
}
```

### Rate Limiting Behavior

```typescript
// middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

function createLimiter(max: number, windowMs: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    // Use Redis store if available, otherwise in-memory (default)
    ...(isRedisAvailable() && {
      store: new RedisStore({ sendCommand: (...args) => redis!.call(...args) }),
    }),
  });
}
```

### Impact Summary

| Mode | Upload Response | Processing | Caching | Rate Limiting |
|------|----------------|------------|---------|---------------|
| **With Redis** | `202 Accepted` (async) | Background worker | Redis TTL | Distributed |
| **Without Redis** | `201 Created` (sync) | Inline (blocking) | None | In-memory |

Both modes produce identical results — the document ends up with `status: "ready"` and all analysis completed. The difference is latency on the upload endpoint.

---

## 0.5. Dynamic Provider Detection & Model Assignment

Providers are **auto-detected at startup** based on which API keys are set in `.env`. No hardcoded provider — the system adapts to whatever the deployer has access to.

### Provider Registry

```typescript
// services/providers/registry.ts
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

interface RegisteredProvider {
  id: string;
  name: string;
  models: { id: string; rpm: number | null; rpd: number | null; tpm: number | null }[];
  createModel: (modelId: string) => LanguageModel;
}

const registry: Map<string, RegisteredProvider> = new Map();

export async function detectProviders(): Promise<void> {
  if (process.env.GEMINI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
    registry.set('gemini', {
      id: 'gemini',
      name: 'Google Gemini',
      models: [
        { id: 'gemini-3.1-flash-lite', rpm: 15, rpd: 500, tpm: 250000 },
        { id: 'gemma-4-31b', rpm: 15, rpd: 1500, tpm: null },
        { id: 'gemini-3.5-flash', rpm: 5, rpd: 20, tpm: 250000 },
        // ... all Gemini models
      ],
      createModel: (modelId) => google(modelId),
    });
    logger.info('Provider registered: Gemini');
  }

  if (process.env.GROQ_API_KEY) {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    registry.set('groq', {
      id: 'groq',
      name: 'Groq',
      models: [
        { id: 'llama-3.3-70b-versatile', rpm: 30, rpd: 1000, tpm: 12000 },
        { id: 'qwen/qwen3-32b', rpm: 60, rpd: 1000, tpm: 6000 },
        // ... all Groq models
      ],
      createModel: (modelId) => groq(modelId),
    });
    logger.info('Provider registered: Groq');
  }

  if (process.env.NVIDIA_API_KEY) {
    const nvidia = createOpenAICompatible({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
      name: 'nvidia',
    });
    registry.set('nvidia', {
      id: 'nvidia',
      name: 'NVIDIA Build',
      models: [
        { id: 'meta/llama-3.1-405b-instruct', rpm: 40, rpd: null, tpm: null },
        { id: 'meta/llama-3.3-70b-instruct', rpm: 40, rpd: null, tpm: null },
        // ... all NVIDIA models
      ],
      createModel: (modelId) => nvidia(modelId),
    });
    logger.info('Provider registered: NVIDIA');
  }

  if (process.env.OLLAMA_BASE_URL) {
    try {
      const res = await fetch(`${process.env.OLLAMA_BASE_URL}/api/tags`);
      const data = await res.json();
      const models = data.models.map((m: any) => ({
        id: m.name,
        rpm: null, rpd: null, tpm: null,
      }));
      const ollama = createOpenAICompatible({
        baseURL: `${process.env.OLLAMA_BASE_URL}/v1`,
        name: 'ollama',
      });
      registry.set('ollama', {
        id: 'ollama',
        name: 'Ollama (Local)',
        models,
        createModel: (modelId) => ollama(modelId),
      });
      logger.info(`Provider registered: Ollama (${models.length} models)`);
    } catch {
      logger.warn('OLLAMA_BASE_URL set but Ollama not reachable');
    }
  }

  if (registry.size === 0) {
    throw new Error('No LLM providers configured. Set at least one API key in .env');
  }
}

export function getActiveProviders() { return [...registry.values()]; }
export function getModel(providerId: string, modelId: string) {
  const provider = registry.get(providerId);
  if (!provider) throw new AppError('PROVIDER_INACTIVE', `Provider ${providerId} not active`, 400);
  return provider.createModel(modelId);
}
```

### Model Assignment (persisted)

```typescript
// services/providers/assignments.ts
const DEFAULT_ASSIGNMENTS: Record<string, string> = {
  summarization: 'gemma-4-31b',
  classification: 'gemini-3.1-flash-lite',
  entityExtraction: 'gemini-3.1-flash-lite',
  qa: 'gemini-3.1-flash-lite',
  embedding: 'gemini-embedding-1',
};

// On startup: load from DB or env overrides, fallback to defaults
export async function getAssignments(): Promise<Record<string, string>> {
  const dbAssignments = await prisma.settings.findFirst({ where: { key: 'model_assignments' } });
  if (dbAssignments) return JSON.parse(dbAssignments.value);

  // Env overrides
  const env: Record<string, string> = {};
  if (process.env.MODEL_SUMMARIZATION) env.summarization = process.env.MODEL_SUMMARIZATION;
  if (process.env.MODEL_CLASSIFICATION) env.classification = process.env.MODEL_CLASSIFICATION;
  if (process.env.MODEL_ENTITY_EXTRACTION) env.entityExtraction = process.env.MODEL_ENTITY_EXTRACTION;
  if (process.env.MODEL_QA) env.qa = process.env.MODEL_QA;

  // Auto-select defaults based on which providers are active
  const providers = getActiveProviders();
  const firstProvider = providers[0];
  const fallback = firstProvider?.models[0]?.id ?? 'gemini-3.1-flash-lite';

  return { ...Object.fromEntries(Object.keys(DEFAULT_ASSIGNMENTS).map(k => [k, fallback])), ...env };
}

export async function saveAssignments(assignments: Record<string, string>): Promise<void> {
  // Validate every model belongs to an active provider
  const allModels = getActiveProviders().flatMap(p => p.models.map(m => m.id));
  for (const [task, model] of Object.entries(assignments)) {
    if (task !== 'embedding' && !allModels.includes(model)) {
      throw new AppError('INVALID_MODEL', `Model ${model} is not available in any active provider`, 400);
    }
  }
  await prisma.settings.upsert({
    where: { key: 'model_assignments' },
    update: { value: JSON.stringify(assignments) },
    create: { key: 'model_assignments', value: JSON.stringify(assignments) },
  });
}
```

### Streaming LLM Responses (SSE)

```typescript
// services/analysis/streamingQA.ts
import { streamText } from 'ai';

export async function streamQAResponse(
  res: Response,
  documentId: string,
  question: string,
  topK: number,
  correlationId: string,
) {
  const assignments = await getAssignments();
  const modelId = assignments.qa;
  const provider = findProviderForModel(modelId);
  const model = getModel(provider.id, modelId);

  // Retrieve relevant chunks
  const chunks = await retrieveChunks(documentId, question, topK);
  const context = chunks.map((c, i) => `[CHUNK_${i + 1}] ${c.text}`).join('\n\n');

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Correlation-ID', correlationId);

  let fullAnswer = '';

  const { textStream } = await streamText({
    model,
    prompt: `Answer based on the document context:\n\n${context}\n\nQuestion: ${question}`,
  });

  for await (const token of textStream) {
    fullAnswer += token;
    res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
  }

  // Final event with citations
  const citations = chunks.map((c, i) => ({
    chunkId: c.id,
    chunkIndex: c.chunkIndex,
    pageNumber: c.pageNumber,
    section: c.section,
    text: c.text.substring(0, 200),
    similarity: c.similarity,
  }));

  res.write(`data: ${JSON.stringify({
    type: 'done',
    answer: fullAnswer,
    citations,
    model: modelId,
    tokensUsed: fullAnswer.split(/\s+/).length * 1.3, // estimate
    cached: false,
    correlationId,
  })}\n\n`);

  res.end();
}
```

---

## 1. Async Processing & Job Queue

### Why Not Synchronous?
Document processing involves parsing, OCR, embedding generation, and LLM analysis — this can take 10-120 seconds. Synchronous processing would:
- Block the HTTP connection (timeouts)
- Create head-of-line blocking under load
- Make error recovery impossible

### BullMQ Architecture

```
┌────────────┐     enqueue     ┌────────────────┐     process    ┌─────────────┐
│ Express API│ ──────────────► │ Redis Queue    │ ──────────────►│ BullMQ      │
│ (producer) │                 │ (FIFO + prio)  │                │ Worker      │
│            │◄─── 202 ───────│                │                │ (consumer)  │
└────────────┘  Accepted       └────────────────┘                └──────┬──────┘
                                      │                                │
                                      │ failed (3x)                    │ success
                                      ▼                                ▼
                               ┌────────────────┐            ┌─────────────┐
                               │ Dead Letter    │            │ PostgreSQL  │
                               │ Queue (DLQ)    │            │ status=ready│
                               └────────────────┘            └─────────────┘
```

### Job Lifecycle
```
created → queued → active → completed
                      │
                      └─ failed → (retry 1) → (retry 2) → (retry 3) → dead (DLQ)
```

### Configuration
```typescript
const QUEUE_CONFIG = {
  name: 'document-processing',
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,  // 5s → 30s → 120s
    },
    removeOnComplete: { age: 86400 },  // keep completed jobs 24h
    removeOnFail: false,               // keep failed for inspection
  },
  workerOptions: {
    concurrency: 2,         // process 2 docs simultaneously
    limiter: {
      max: 10,              // max 10 jobs per minute
      duration: 60000,
    },
  },
};
```

### Job Progress Reporting
```typescript
// Worker reports progress at each stage
await job.updateProgress({ stage: 'parsing', percent: 20 });
await job.updateProgress({ stage: 'chunking', percent: 40 });
await job.updateProgress({ stage: 'embedding', percent: 70 });
await job.updateProgress({ stage: 'analyzing', percent: 90 });
await job.updateProgress({ stage: 'complete', percent: 100 });
```

### DLQ Monitoring
Failed jobs in the Dead Letter Queue should be:
1. Logged as `DOCUMENT_PROCESSING_FAILED` audit event
2. Visible in admin metrics (`queue_dlq_size` gauge)
3. Manually retryable via `GET /api/jobs/:id/retry` (V2)

---

## 2. Caching Strategy

### Cache Hierarchy
```
Request → In-memory (node-cache, 1 min) → Redis (configurable TTL) → Database
```

For MVP, Redis is the primary cache. In-memory can be added later for hot data.

### Cache Keys & TTLs

| Purpose | Key Pattern | TTL | Invalidation |
|---------|-------------|-----|--------------|
| Query results | `cache:query:{docId}:{sha256(question)}` | 1 hour | Document reprocess, version create |
| Embeddings | `cache:embed:{sha256(text)}` | 24 hours | Never (embeddings are deterministic per model) |
| Document metadata | `cache:doc:{id}` | 10 min | Document update, delete |
| Document list | `cache:docs:list:{queryHash}` | 2 min | Any document change |
| Job status | `cache:job:{jobId}` | Until completion | Job state change |

### Cache Invalidation Patterns

```typescript
// On document delete
await redis.del(`cache:doc:${id}`);
await redis.keys(`cache:query:${id}:*`).then(keys => redis.del(...keys));
await redis.keys(`cache:docs:list:*`).then(keys => redis.del(...keys));

// On document version create
await redis.del(`cache:doc:${id}`);
await redis.keys(`cache:query:${id}:*`).then(keys => redis.del(...keys));
```

### Cache Miss Handling
- Log `cache_misses_total` metric with cache type label
- Never throw on cache failure — fall through to DB/API
- Redis down → app continues without cache (degraded mode)

---

## 3. Logging

### Logger Configuration (winston)

```typescript
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'easydoc' },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development'
        ? winston.format.combine(winston.format.colorize(), winston.format.simple())
        : winston.format.json()
    }),
  ],
});
```

### Log Levels

| Level | When |
|-------|------|
| `error` | Unhandled exceptions, all retries exhausted, data corruption |
| `warn` | ClamAV unavailable, circuit breaker opened, rate limit hit, retry attempt |
| `info` | Document uploaded, processed, deleted, query executed, job status changes |
| `debug` | Cache hits/misses, embedding details, chunk counts, SQL queries |

### Structured Log Format
```json
{
  "timestamp": "2026-05-24T10:30:00.000Z",
  "level": "info",
  "service": "easydoc",
  "correlationId": "abc-123-def",
  "message": "Document processed successfully",
  "documentId": "uuid",
  "fileName": "contract.pdf",
  "durationMs": 45000,
  "chunkCount": 32,
  "modelUsed": "gemini-3.1-flash-lite"
}
```

### Request Logging (morgan)
Every HTTP request is logged with:
- Method, URL, status code, response time
- Client IP, user-agent
- Correlation ID
- Response size

---

## 4. Request Tracing (Correlation ID)

Every request gets a unique `X-Correlation-ID`:
1. If client sends one → use it
2. Otherwise → generate UUID v4

The correlation ID is:
- Attached to every log entry
- Included in every error response
- Stored in audit logs
- Stored in qa_history
- Passed to BullMQ job data
- Propagated to LLM provider calls (for debugging)

```typescript
// middleware/correlationId.ts
app.use((req, res, next) => {
  const id = req.headers['x-correlation-id'] || crypto.randomUUID();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
});
```

---

## 5. Rate Limiting

### Tiered Limits

```typescript
// Separate limiters per endpoint group
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,
  standardHeaders: true,      // X-RateLimit-* headers
  legacyHeaders: false,
  store: new RedisStore({ client: redis }),
  handler: (req, res) => {
    auditLog('RATE_LIMIT_EXCEEDED', { ip: req.ip, endpoint: 'upload' });
    res.status(429).json({ error: { code: 'RATE_LIMITED', ... } });
  },
});

const queryLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 min
  max: 30,
  store: new RedisStore({ client: redis }),
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  store: new RedisStore({ client: redis }),
});
```

### Rate Limit Response
```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1716547200
Retry-After: 420

{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Try again in 420 seconds.",
    "status": 429
  }
}
```

---

## 6. Circuit Breaker (LLM Providers)

Each LLM provider is wrapped with `opossum` circuit breaker to prevent cascade failures.

```
                    ┌──────────────┐
                    │   CLOSED     │ ← Normal state
                    │ (requests    │
                    │  pass thru)  │
                    └──────┬───────┘
                           │ 5 consecutive failures
                           ▼
                    ┌──────────────┐
                    │   OPEN       │ ← Fail fast, don't call provider
                    │ (reject all) │
                    └──────┬───────┘
                           │ 30 second timeout
                           ▼
                    ┌──────────────┐
                    │  HALF-OPEN   │ ← Allow 1 test request
                    │ (1 test req) │
                    └──────┬───────┘
                      success │ failure
                         ▼         ▼
                      CLOSED     OPEN
```

### Configuration
```typescript
const circuitOptions = {
  timeout: 30000,           // 30s max per LLM call
  errorThresholdPercentage: 50,
  resetTimeout: 30000,      // try again after 30s
  volumeThreshold: 5,       // min 5 calls before opening
};
```

### Fallback Chain
```typescript
async function callLLM(prompt: string): Promise<string> {
  const providers = [geminiBreaker, groqBreaker, nvidiaBreaker, ollamaBreaker];

  for (const breaker of providers) {
    try {
      return await breaker.fire(prompt);
    } catch (err) {
      logger.warn(`Provider ${breaker.name} failed, trying next`, { error: err.message });
    }
  }

  throw new AppError('LLM_UNAVAILABLE', 'All LLM providers are unavailable', 503);
}
```

---

## 7. Error Handling

### Global Error Handler

```typescript
// Catches ALL unhandled errors — must be last middleware
app.use((err, req, res, next) => {
  const correlationId = req.correlationId;

  // Known application error
  if (err instanceof AppError) {
    logger.warn(err.message, { code: err.code, correlationId });
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, status: err.status, correlationId }
    });
  }

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: { code: 'FILE_TOO_LARGE', message: '...', status: 400, correlationId }
    });
  }

  // Unknown error — log full stack, return generic message
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    correlationId,
    path: req.path,
    method: req.method,
  });

  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : err.message;

  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message, status: 500, correlationId }
  });
});
```

### AppError Class
```typescript
class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number = 500,
  ) {
    super(message);
  }
}
```

### Unhandled Rejection / Exception Handlers
```typescript
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { error: reason });
  // Don't exit — let graceful shutdown handle it if needed
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  // Trigger graceful shutdown
  gracefulShutdown(1);
});
```

---

## 8. Graceful Shutdown

```typescript
async function gracefulShutdown(exitCode = 0) {
  logger.info('Shutdown initiated...');

  // 1. Stop accepting new connections
  server.close();

  // 2. Wait for in-flight requests (30s max)
  await new Promise(resolve => setTimeout(resolve, 30000));

  // 3. Stop BullMQ worker (finish current job)
  await worker.close();

  // 4. Flush logs
  await new Promise(resolve => logger.on('finish', resolve));
  logger.end();

  // 5. Close Redis
  await redis.quit();

  // 6. Disconnect Prisma
  await prisma.$disconnect();

  logger.info('Shutdown complete');
  process.exit(exitCode);
}

process.on('SIGTERM', () => gracefulShutdown(0));
process.on('SIGINT', () => gracefulShutdown(0));
```

---

## 9. Document Versioning

### How It Works
- Each document has a `version` (starts at 1) and optional `original_document_id`
- Re-uploading same file hash → returns existing doc (or creates version if `force=true`)
- New version links back to original via `original_document_id`
- All versions share the same `original_document_id` chain

### Version Query
```
Document A (v1, original)
    ├── Document B (v2, original_document_id = A)
    └── Document C (v3, original_document_id = A)
```

### API Behavior
| Scenario | Query Param | Result |
|----------|-------------|--------|
| Upload duplicate (same hash) | none | Return existing document |
| Upload duplicate, force reprocess | `force=true` | Create v2, re-analyze with current model |
| Upload updated file | `originalDocumentId=<uuid>` | Create v2, new content + analysis |

---

## 10. Duplicate Detection

### SHA-256 File Hash
```typescript
import { createHash } from 'crypto';

async function hashFile(filePath: string): Promise<string> {
  const stream = fs.createReadStream(filePath);
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return `sha256:${hash.digest('hex')}`;
}
```

### Dedup Flow
```
Upload file → compute SHA-256
  → SELECT FROM documents WHERE file_hash = $hash AND original_document_id IS NULL
  → Found?
      Yes + no force → return existing (200 OK, duplicate: true)
      Yes + force    → create new version (202 Accepted)
      No             → process as new (202 Accepted)
```

---

## 11. Monitoring (Prometheus Metrics)

### Exposed at `GET /metrics`

```
# HTTP
http_requests_total{method="POST", path="/api/documents/upload", status="202"} 42
http_request_duration_seconds_bucket{le="0.5", method="GET", path="/api/documents"} 156

# Documents
document_uploads_total{mime_type="application/pdf"} 30
document_processing_duration_seconds_bucket{le="30"} 25
document_processing_errors_total{stage="embedding"} 2

# LLM
llm_requests_total{provider="gemini", model="gemini-3.1-flash-lite"} 100
llm_request_duration_seconds_bucket{le="5", provider="gemini"} 90
llm_tokens_used_total{provider="gemini", type="input"} 50000
llm_tokens_used_total{provider="gemini", type="output"} 15000
circuit_breaker_state{provider="gemini"} 0  # 0=closed, 1=open, 2=half-open

# Queue
queue_active_jobs{queue="document-processing"} 2
queue_waiting_jobs{queue="document-processing"} 5
queue_completed_jobs_total{queue="document-processing"} 100
queue_failed_jobs_total{queue="document-processing"} 3
queue_dlq_size{queue="document-processing"} 1

# Cache
cache_hits_total{type="query"} 200
cache_misses_total{type="query"} 50
cache_hits_total{type="embedding"} 500

# System
nodejs_heap_size_total_bytes 52428800
nodejs_active_handles_total 15
```

### Health Check Types

| Endpoint | Purpose | Fails when |
|----------|---------|------------|
| `GET /api/health` | Liveness (is process alive?) | Never (if reachable) |
| `GET /api/health/ready` | Readiness (can handle requests?) | DB or Redis unreachable |

---

## 12. Swagger / OpenAPI

Auto-generated from JSDoc annotations on route handlers.

```typescript
// swagger.ts
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EasyDoc API',
      version: '1.0.0',
      description: 'AI-powered document analysis and RAG system',
    },
    servers: [{ url: '/api' }],
  },
  apis: ['./src/routes/*.ts'],
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

Route annotation example:
```typescript
/**
 * @openapi
 * /documents/upload:
 *   post:
 *     summary: Upload a document for processing
 *     tags: [Documents]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       202:
 *         description: Document accepted for processing
 */
```

---

## 13. Security Hardening

| Concern | Solution |
|---------|----------|
| Security headers | `helmet` middleware (CSP, HSTS, X-Frame-Options, etc.) |
| HTTP parameter pollution | `hpp` middleware |
| CORS | Configured whitelist via `cors` |
| Path traversal | Sanitize file names, serve files via controlled endpoint |
| SQL injection | Prisma parameterized queries (no raw SQL interpolation) |
| Request size | `express.json({ limit: '1mb' })`, multer file size limit |
| Credential exposure | `.env` + `.gitignore`, never log secrets |
| Error leaks | Generic error messages in production mode |

---

## Summary: What Makes This Enterprise-Grade

| Concern | Pattern | Package |
|---------|---------|---------|
| Async processing | BullMQ job queue with DLQ | `bullmq`, `ioredis` |
| Retry & backoff | Exponential backoff, 3 attempts | `bullmq` built-in |
| Caching | Redis with TTL per cache type | `ioredis` |
| Rate limiting | Tiered per endpoint group | `express-rate-limit`, `rate-limit-redis` |
| Structured logging | JSON logs with correlation ID | `winston`, `morgan` |
| Metrics | Prometheus-compatible | `prom-client` |
| Audit trail | Immutable DB table | PostgreSQL |
| Circuit breaker | Per-provider fault isolation | `opossum` |
| Error handling | Global handler, typed AppError | Custom |
| Graceful shutdown | Drain connections, close resources | Custom |
| Duplicate detection | SHA-256 file hashing | Built-in `crypto` |
| Document versioning | Self-referential FK | Prisma |
| API documentation | Auto-generated OpenAPI | `swagger-jsdoc`, `swagger-ui-express` |
| Security headers | OWASP best practices | `helmet`, `hpp` |
| Request tracing | Correlation ID propagation | Custom middleware |
