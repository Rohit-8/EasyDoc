# EasyDoc — Architecture Overview

AI-powered RAG system for document analysis, summarization, and citation-aware retrieval.
Enterprise-grade with async processing, observability, caching, and graceful fault tolerance.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (React + Vite)                          │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐ │
│  │ Upload UI  │  │ Document List│  │ Summary View│  │ Q&A Chat      │ │
│  └─────┬──────┘  └──────┬───────┘  └──────┬──────┘  │ (streaming)   │ │
│                                                      └───────┬───────┘ │
│  ┌────────────┐                                              │         │
│  │ Settings   │  ← model assignment per task                 │         │
│  │ Page       │  ← shows only active providers               │         │
│  └─────┬──────┘                                              │         │
└────────┼────────────────┼────────────────┼───────────────────┼─────────┘
         │                │                │                   │
         ▼                ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   API GATEWAY (Express + TypeScript)                     │
│                                                                         │
│  ┌──────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Rate     │ │ Request    │ │ Correlation│ │ Swagger  │ │ Global   │ │
│  │ Limiter  │ │ Logger     │ │ ID (trace) │ │ /api-docs│ │ Error    │ │
│  │          │ │ (morgan)   │ │            │ │          │ │ Handler  │ │
│  └──────────┘ └────────────┘ └────────────┘ └──────────┘ └──────────┘ │
│                                                                         │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────────┐       │
│  │ Upload API   │  │ Documents API │  │ Analysis / Q&A API     │       │
│  └──────┬───────┘  └───────┬───────┘  │ (SSE streaming)        │       │
│                                       └────────────┬───────────┘       │
│  ┌──────────────┐                                  │                   │
│  │ Settings API │  GET/PUT /api/settings/models     │                   │
│  │              │  GET /api/settings/providers       │                   │
│  └──────┬───────┘                                  │                   │
└─────────┼──────────────────┼───────────────────────┼───────────────────┘
          │                  │                       │
          ▼                  │                       ▼
┌──────────────────┐         │         ┌──────────────────────────┐
│ SECURITY LAYER   │         │         │ RAG PIPELINE             │
│                  │         │         │                          │
│ • File type      │         │         │ 1. Check query cache     │
│   validation     │         │         │ 2. Query embedding       │
│ • Magic bytes    │         │         │    (embedding cache)     │
│ • SHA-256 hash   │         │         │ 3. Vector similarity     │
│   (dedup check)  │         │         │    search (pgvector)     │
│ • ClamAV scan    │         │         │ 4. Context assembly      │
│   (optional)     │         │         │ 5. LLM call (circuit     │
│ • Size limits    │         │         │    breaker + fallback)   │
│ • ZIP bomb       │         │         │ 6. Stream tokens via SSE │
│   protection     │         │         │ 7. Citation attachment   │
└────────┬─────────┘         │         │ 8. Cache response        │
         │                   │         └────────────┬─────────────┘
         │                   │                      │
         ▼                   │                      ▼
┌──────────────────┐         │         ┌──────────────────────────┐
│ ASYNC JOB QUEUE  │         │         │ LLM PROVIDERS            │
│ (BullMQ + Redis) │         │         │ (Vercel AI SDK)          │
│                  │         │         │                          │
│ • Document       │         │         │ Auto-detected from .env: │
│   processing job │         │         │ • Gemini (if key set)    │
│ • Retry with     │         │         │ • Groq   (if key set)    │
│   exponential    │         │         │ • NVIDIA (if key set)    │
│   backoff        │         │         │ • Ollama (if URL set)    │
│ • Dead letter    │         │         │                          │
│   queue (DLQ)    │         │         │ All responses streamed   │
│ • Concurrency    │         │         │ via SSE to client.       │
│   control        │         │         │                          │
│                  │         │         │ Model ↔ task assignment  │
│ ⚡ OPTIONAL:     │         │         │ via Settings UI + API.   │
│ If no Redis,     │         │         │                          │
│ processing runs  │         │         │ Circuit breaker per      │
│ synchronously    │         │         │ provider (opossum)       │
│ inline.          │         │         └──────────────────────────┘
└────────┬─────────┘         │
         │                   │
         ▼                   │         ┌──────────────────────────┐
┌──────────────────┐         │         │ CACHE LAYER              │
│ DOCUMENT         │         │         │ (Redis — optional)       │
│ PROCESSING       │         │         │                          │
│ PIPELINE         │         │         │ • Embedding cache        │
│                  │         │         │ • Query result cache     │
│ • PDF parsing    │         │         │ • Document metadata      │
│ • DOCX parsing   │         │         │ • Rate limit counters    │
│ • XLSX parsing   │         │         │ • Job status tracking    │
│ • OCR (tess.js)  │         │         │ • BullMQ queue backend   │
│ • Chunking       │         │         │                          │
│ • Embedding      │         │         │ If no Redis: no cache,   │
│ • Auto-analysis  │         │         │ in-memory rate limiting  │
└────────┬─────────┘         │         └──────────────────────────┘
└────────┬─────────┘         │         │                          │
         │                   │         │ • Structured logs        │
         │                   │         │   (winston + JSON)       │
         │                   │         │ • Prometheus metrics     │
         │                   │         │   (prom-client)          │
         │                   │         │ • Health + readiness     │
         │                   │         │ • Audit trail (DB)       │
         │                   │         │ • Correlation ID tracing │
         ▼                   ▼         └──────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│                    AIVEN POSTGRESQL + pgvector                           │
│                                                                         │
│  ┌───────────┐ ┌────────────────┐ ┌───────────────┐ ┌───────────────┐  │
│  │ documents │ │ document_      │ │ analysis_     │ │ audit_logs    │  │
│  │ (meta +   │ │ chunks         │ │ results       │ │ (immutable    │  │
│  │ versions) │ │ (text+vectors) │ │ (summaries)   │ │  trail)       │  │
│  └───────────┘ └────────────────┘ └───────────────┘ └───────────────┘  │
│  ┌───────────┐ ┌────────────────┐                                      │
│  │ document_ │ │ qa_history     │                                      │
│  │ versions  │ │                │                                      │
│  └───────────┘ └────────────────┘                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

## Request Flows

### Document Upload Flow (Async or Sync)
```
User uploads file
    → Rate limit check (Redis-backed or in-memory)
    → Assign X-Correlation-ID
    → Request logged (method, path, IP, user-agent, correlation ID)
    → Validate file type (MIME + magic bytes)
    → Compute SHA-256 hash → check for duplicate
        → If exact duplicate exists: return existing doc (or create new version)
    → ClamAV scan (if available, else skip with warning log)
    → ZIP bomb check (if archive)
    → Store raw file on disk (uploads/{uuid}/original.{ext})
    → Insert document record

    [If Redis available — ASYNC MODE]
    → Set status = "queued"
    → Enqueue processing job to BullMQ
    → Audit log: DOCUMENT_UPLOADED
    → Return 202 Accepted { documentId, jobId, status: "queued" }
    → Worker picks up job in background (see below)

    [If no Redis — SYNC MODE]
    → Set status = "processing"
    → Process inline: parse → chunk → embed → analyze
    → Set status = "ready"
    → Audit log: DOCUMENT_UPLOADED + DOCUMENT_PROCESSED
    → Return 201 Created { documentId, status: "ready" }

    [Worker (async mode only)]
    → Update status → "processing"
    → Parse document (pdf-parse / mammoth / exceljs / tesseract.js)
    → Split into semantic chunks (with page/section metadata)
    → Generate embeddings via cloud LLM (with retry + circuit breaker)
    → Store chunks + vectors in PostgreSQL (transactional)
    → Run auto-analysis (classify, summarize, extract entities)
    → Cache document metadata in Redis
    → Update status → "ready"
    → Audit log: DOCUMENT_PROCESSED

    [On failure (async)]
    → Retry with exponential backoff (3 attempts, 5s/30s/120s)
    → On exhaustion: move to Dead Letter Queue
    → Update status → "error" + error_message
    → Audit log: DOCUMENT_PROCESSING_FAILED

    [On failure (sync)]
    → Update status → "error" + error_message
    → Audit log: DOCUMENT_PROCESSING_FAILED
    → Return 500 with error details
```

### Query / Q&A Flow (Cache-aware)
```
User asks a question about a document
    → Rate limit check
    → Assign correlation ID
    → Request logged
    → If Redis available:
        → Generate cache key: hash(documentId + question)
        → Check Redis cache → hit? return cached response
    → Generate query embedding
        → If Redis: check embedding cache (same text = same embedding)
    → pgvector cosine similarity search (top-K chunks)
    → Assemble prompt: system instructions + chunks + question
    → Call LLM provider (circuit breaker wraps each provider)
        → Primary fails → fallback to next provider
    → Parse response + map citations to source chunks
    → If Redis: cache response (TTL = configurable, default 1h)
    → Audit log: QUERY_EXECUTED
    → Return answer with citations + model used + tokens used
```

### Reupload / Versioning Flow
```
User uploads file with same SHA-256 hash as existing document
    → Option A (default): return existing document, skip reprocessing
    → Option B (force=true query param): create new version
        → Insert new document_version record
        → Link to same file hash
        → Re-run analysis with current LLM (may produce better results)
        → Keep old version accessible

User uploads updated version of same file (different hash)
    → Create new document record
    → If original_document_id provided: link as new version
    → Process normally
    → Old version remains accessible via version history
```

## Project Structure

```
EasyDoc/
├── docs/                           # Architecture & design docs
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts              # Validated env vars (zod)
│   │   │   ├── database.ts         # Prisma client singleton
│   │   │   ├── redis.ts            # Redis/IORedis client
│   │   │   ├── llm.ts              # LLM provider config
│   │   │   └── queue.ts            # BullMQ config
│   │   ├── middleware/
│   │   │   ├── rateLimiter.ts      # express-rate-limit (tiered)
│   │   │   ├── requestLogger.ts    # morgan + structured format
│   │   │   ├── correlationId.ts    # X-Correlation-ID injection
│   │   │   ├── errorHandler.ts     # Global catch-all error handler
│   │   │   └── validateRequest.ts  # zod schema validation
│   │   ├── routes/
│   │   │   ├── documents.ts        # CRUD + upload
│   │   │   ├── analysis.ts         # Q&A (SSE streaming), summarize
│   │   │   ├── settings.ts         # GET/PUT model assignments, GET providers
│   │   │   ├── health.ts           # Health + readiness
│   │   │   └── swagger.ts          # Swagger UI setup
│   │   ├── services/
│   │   │   ├── upload/             # File validation, malware, dedup
│   │   │   ├── parsing/            # PDF, DOCX, XLSX, OCR parsers
│   │   │   ├── chunking/           # Text splitting + metadata
│   │   │   ├── embedding/          # Multi-provider embedding
│   │   │   ├── retrieval/          # Vector search + context
│   │   │   ├── analysis/           # LLM agent (summarize, classify, QA)
│   │   │   ├── providers/          # Dynamic provider detection + registry
│   │   │   └── cache/              # Redis cache abstraction
│   │   ├── workers/
│   │   │   └── documentWorker.ts   # BullMQ async processor
│   │   ├── queues/
│   │   │   └── documentQueue.ts    # Queue definition, DLQ, events
│   │   ├── observability/
│   │   │   ├── logger.ts           # winston (JSON structured)
│   │   │   ├── metrics.ts          # prom-client (Prometheus)
│   │   │   └── audit.ts            # Audit trail DB service
│   │   ├── db/
│   │   │   └── prisma/
│   │   └── utils/
│   │       ├── hash.ts             # SHA-256 file hashing
│   │       ├── circuitBreaker.ts   # opossum wrapper
│   │       └── gracefulShutdown.ts # SIGTERM/SIGINT handler
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── UploadPage.tsx
│   │   │   ├── DocumentsPage.tsx
│   │   │   ├── DocumentDetailPage.tsx
│   │   │   ├── QAChatPage.tsx
│   │   │   └── SettingsPage.tsx      # Model assignment per task
│   │   ├── hooks/
│   │   │   └── useSSE.ts             # SSE streaming hook for Q&A
│   │   └── services/               # API client with retry + error handling
│   ├── package.json
│   └── vite.config.ts
├── .env.example
├── .gitignore
└── README.md
```

## Graceful Shutdown Sequence

```
SIGTERM / SIGINT received
    1. Log "Shutting down gracefully..."
    2. Stop accepting new HTTP connections (server.close())
    3. Wait for in-flight HTTP requests to drain (30s timeout)
    4. If Redis: pause BullMQ worker (finish current job, accept no new)
    5. Flush buffered logs (winston)
    6. If Redis: close Redis connection
    7. Disconnect Prisma client (drain DB pool)
    8. Log "Shutdown complete"
    9. Exit 0

    [If 30s timeout exceeded]
    → Log "Forced shutdown after timeout"
    → Exit 1
```

## Middleware Pipeline (Order Matters)

```
Request →
  1. correlationId    (assign unique trace ID)
  2. requestLogger    (log entry with correlation ID, method, path, IP)
  3. rateLimiter      (reject if over limit, return 429)
  4. express.json()   (parse body)
  5. route handler    (business logic)
  6. errorHandler     (catch all unhandled errors, log, return structured error)
```
