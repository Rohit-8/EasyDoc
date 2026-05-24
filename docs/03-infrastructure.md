# EasyDoc — Infrastructure & Tech Stack

## Runtime Requirements

| Requirement | Version | Required | Notes |
|-------------|---------|----------|-------|
| Node.js | >= 18.x | Yes | Runtime |
| npm | >= 9.x | Yes | Package manager |
| Git | >= 2.x | Yes | Version control |
| Redis | >= 7.x | **No** | Optional — enables async queue + cache. Falls back to sync processing + in-memory |
| ClamAV | >= 1.x | No | Optional malware scanning |

No Python, Docker, GPU, or native OS packages required.

## Cloud Services

### PostgreSQL — Aiven Cloud (or any pgvector-capable provider)

- **Extension:** pgvector 0.8.x
- **Connection:** SSL required (`sslmode=require`)
- **Purpose:** Document metadata, chunk storage, vector embeddings, analysis results, audit trail
- **Alternatives:** Supabase, Neon, Railway, self-hosted PostgreSQL + pgvector

### Redis — Cloud or Local (Optional)

Optional but recommended. Enables async job queue (BullMQ) and caching.
Controlled via `REDIS_URL` env var — if not set, the service runs without Redis.

| Feature | With Redis | Without Redis (fallback) |
|---------|------------|-------------------------|
| Job Queue | BullMQ async processing | Synchronous inline processing |
| Caching | Redis cache with TTL | No cache (always hits DB/API) |
| Rate Limiting | Distributed Redis counter | In-memory counter (per-process) |
| Job Status | Redis-stored state | DB-stored `documents.status` field |

| Option | Notes |
|--------|-------|
| **Aiven Redis** | Same provider as PostgreSQL, free tier available |
| **Upstash Redis** | Serverless, free tier: 10K commands/day |
| **Redis Cloud** | Free 30MB tier |
| **Local Redis** | `brew install redis` / `apt install redis` / Windows via WSL |
| **None** | Service works fully without Redis (sync mode) |

### LLM Providers

All accessed via **Vercel AI SDK** (`ai` npm package) — unified interface with streaming support.
Providers are **auto-detected at startup** based on which API keys are present in `.env`.

#### Gemini Models (via `GEMINI_API_KEY`)

| Model | RPD | RPM | TPM | Best For |
|-------|-----|-----|-----|----------|
| `gemini-3.5-flash` | 20 | 5 | 250,000 | Latest flash, highest quality |
| `gemini-3.1-flash-lite` ⭐ | **500** | **15** | 250,000 | **Default — best rate limits** |
| `gemini-3.1-pro` | — | — | — | Pro-tier (when quota available) |
| `gemini-3-flash` | 20 | 5 | 250,000 | Stable flash model |
| `gemini-2.5-flash-lite` | 20 | 10 | 250,000 | Previous gen lightweight |
| `gemma-4-31b` | 1,500 | 15 | **Unlimited** | **Best for summarization** (unlimited TPM) |
| `gemma-4-26b` | 1,500 | 15 | **Unlimited** | Heavy analysis, large docs |
| `gemma-3-1b-it` | 14,400 | 30 | 15,000 | Ultra-fast, simple tasks |
| `gemma-3-4b-it` | 14,400 | 30 | 15,000 | Fast entity extraction |
| `gemma-3-12b-it` | 14,400 | 30 | 15,000 | Balanced speed/quality |
| `gemma-3-27b-it` | 14,400 | 30 | 15,000 | Best Gemma 3 quality |

**Recommended defaults (Gemini-only deployment):**
```
Summarization  → gemma-4-31b       (unlimited TPM handles large docs)
Classification → gemini-3.1-flash-lite  (500 RPD, fast, cheap)
Entity Extract → gemini-3.1-flash-lite  (500 RPD, fast, cheap)
Q&A (RAG)      → gemini-3.1-flash-lite  (500 RPD, good quality)
Embedding      → gemini-embedding-1     (100 RPM, purpose-built)
```

#### Groq Models (via `GROQ_API_KEY`)

| Model | RPD | RPM | TPM | Best For |
|-------|-----|-----|-----|----------|
| `groq/compound` | 250 | 30 | 70,000 | Complex reasoning, multi-step |
| `groq/compound-mini` | 250 | 30 | 70,000 | Lighter reasoning |
| `llama-3.1-8b-instant` | 14,400 | 30 | 6,000 | Ultra-fast, simple tasks |
| `llama-3.3-70b-versatile` | 1,000 | 30 | 12,000 | Best Groq all-rounder |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 1,000 | 30 | 30,000 | High TPM, good quality |
| `openai/gpt-oss-120b` | 1,000 | 30 | 8,000 | Large model quality |
| `openai/gpt-oss-20b` | 1,000 | 30 | 8,000 | Balanced |
| `qwen/qwen3-32b` | 1,000 | 60 | 6,000 | Highest RPM on Groq |

#### NVIDIA Build Models (via `NVIDIA_API_KEY`)

| Model | RPM | Best For |
|-------|-----|----------|
| `deepseek-ai/deepseek-v3.2` | 40 | Deep reasoning, analysis |
| `meta/llama-3.1-405b-instruct` | 40 | Largest model, best quality |
| `meta/llama-3.3-70b-instruct` | 40 | Balanced quality/speed |
| `minimaxai/minimax-m2.7` | 40 | Alternative architecture |
| `mistralai/mistral-small-4-119b-2603` | 40 | Strong European model |
| `nvidia/nemotron-3-super-120b-a12b` | 40 | NVIDIA-optimized |
| `qwen/qwen3.5-122b-a10b` | 40 | Strong multilingual |
| `qwen/qwen3-coder-480b-a35b-instruct` | 40 | Code-heavy documents |
| `z-ai/glm-4.7` | 40 | General purpose |
| `z-ai/glm-5.1` | 40 | Latest GLM |

#### Ollama Local Models (via `OLLAMA_BASE_URL`)

Any model pulled locally. Auto-detected by querying `GET /api/tags` on the Ollama server.

#### Dynamic Provider Detection

At startup, the backend checks which API keys are set and registers only those providers:
```
GEMINI_API_KEY set?  → register Gemini models
GROQ_API_KEY set?    → register Groq models
NVIDIA_API_KEY set?  → register NVIDIA models
OLLAMA_BASE_URL set? → query Ollama for installed models → register them
```
The frontend fetches `GET /api/settings/models` to show only available models in the UI.

### Embedding Models

| Provider | Model | RPM | RPD | TPM | Dimensions | Notes |
|----------|-------|-----|-----|-----|------------|-------|
| Gemini | `gemini-embedding-1` | **100** | **1,000** | 30,000 | 768 | **Default** — highest rate limits |
| Gemini | `text-embedding-004` | — | — | — | 768 | Legacy fallback |
| NVIDIA | `llama-nemotron-embed-1b-v2` | — | — | — | — | Latest NVIDIA embed |
| NVIDIA | `llama-3.2-nv-embedqa-1b-v2` | — | — | — | — | QA-optimized |
| NVIDIA | `nv-embed-v2` | — | — | — | 4096 | High accuracy |
| NVIDIA | `bge-m3` | — | — | — | 1024 | Multilingual |
| NVIDIA | `llama-3_2-nemoretriever-300m-embed-v2` | — | — | — | — | Lightweight retrieval |
| Ollama | `nomic-embed-text` | — | — | — | 768 | Offline fallback |

## NPM Dependencies

### Backend — Core

| Package | Purpose |
|---------|---------|
| `express` | HTTP server |
| `typescript` | Type safety |
| `tsx` | Dev runner (ts-node alternative) |
| `prisma` | ORM + migrations |
| `@prisma/client` | Database client |
| `pgvector` | pgvector type support |
| `ai` | Vercel AI SDK (multi-provider LLM) |
| `@ai-sdk/google` | Gemini provider |
| `@ai-sdk/groq` | Groq provider |
| `dotenv` | Environment variable loading |
| `zod` | Schema validation (env, requests) |
| `uuid` | Unique ID generation |
| `cors` | CORS middleware |

### Backend — File Processing

| Package | Purpose |
|---------|---------|
| `multer` | File upload handling |
| `pdf-parse` | PDF text extraction |
| `mammoth` | DOCX text extraction |
| `exceljs` | Spreadsheet parsing (MIT, stable) |
| `tesseract.js` | OCR (WASM, no native deps) |
| `file-type` | Magic bytes file detection |
| `clamscan` | ClamAV integration (optional) |
| `adm-zip` | ZIP extraction + bomb detection |

### Backend — Enterprise

| Package | Purpose |
|---------|---------|
| `bullmq` | Job queue — async processing (requires Redis, skipped if no Redis) |
| `ioredis` | Redis client (for BullMQ + cache, optional) |
| `express-rate-limit` | Rate limiting middleware (in-memory fallback if no Redis) |
| `rate-limit-redis` | Redis-backed rate limit store (optional) |
| `morgan` | HTTP request logger |
| `winston` | Structured application logger |
| `prom-client` | Prometheus metrics |
| `swagger-jsdoc` | Generate OpenAPI spec from JSDoc |
| `swagger-ui-express` | Serve Swagger UI at /api-docs |
| `opossum` | Circuit breaker for LLM providers |
| `helmet` | Security headers |
| `hpp` | HTTP parameter pollution protection |
| `express-async-errors` | Async error propagation |

### Frontend

| Package | Purpose |
|---------|---------|
| `react` | UI framework |
| `react-dom` | DOM rendering |
| `react-router-dom` | Client-side routing |
| `vite` | Build tool |
| `typescript` | Type safety |
| `axios` | HTTP client |
| `tailwindcss` | Styling |
| `lucide-react` | Icons |
| `react-dropzone` | Drag-and-drop upload |
| `react-hot-toast` | Toast notifications |
| `@tanstack/react-query` | Server state + polling |

## Environment Configuration

```bash
# .env.example — Copy to .env and fill in values

# ── Database ──
DATABASE_URL=postgres://user:pass@host:port/dbname?sslmode=require

# ── Redis (optional — enables async queue + cache) ──
# If not set, service runs in sync mode with in-memory rate limiting and no cache.
REDIS_URL=

# ── LLM Providers (at least one required) ──
# Only set the keys for providers you have access to.
# The app auto-detects which providers are available at startup.
GEMINI_API_KEY=
GROQ_API_KEY=
NVIDIA_API_KEY=

# ── Model Assignment (optional — defaults are auto-selected) ──
# Override via Settings UI or here. Must be a model from an active provider.
MODEL_SUMMARIZATION=gemma-4-31b
MODEL_CLASSIFICATION=gemini-3.1-flash-lite
MODEL_ENTITY_EXTRACTION=gemini-3.1-flash-lite
MODEL_QA=gemini-3.1-flash-lite

# ── Embedding ──
EMBEDDING_PROVIDER=gemini            # gemini | nvidia | ollama (auto-detected)
EMBEDDING_MODEL=gemini-embedding-1
EMBEDDING_DIMENSIONS=768

# ── Ollama (optional local fallback) ──
OLLAMA_BASE_URL=http://localhost:11434

# ── ClamAV (optional) ──
CLAMAV_ENABLED=false
CLAMAV_HOST=localhost
CLAMAV_PORT=3310

# ── Server ──
PORT=3001
NODE_ENV=development                 # development | production
LOG_LEVEL=info                       # error | warn | info | debug

# ── Upload Limits ──
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=50
ALLOWED_EXTENSIONS=pdf,docx,xlsx,csv,txt,md,zip

# ── Rate Limiting ──
RATE_LIMIT_UPLOAD=10                 # per 15 min
RATE_LIMIT_QUERY=30                  # per 1 min
RATE_LIMIT_READ=100                  # per 1 min

# ── Cache TTL (seconds) ──
CACHE_TTL_QUERY=3600                 # 1 hour
CACHE_TTL_EMBEDDING=86400            # 24 hours
CACHE_TTL_METADATA=600               # 10 min

# ── Queue ──
QUEUE_CONCURRENCY=2
QUEUE_MAX_RETRIES=3

# ── Frontend ──
VITE_API_URL=http://localhost:3001/api
```

## Deployment — Clone and Run

```bash
# 1. Clone
git clone <repo>
cd EasyDoc

# 2. Configure
cp .env.example .env
# Fill in: DATABASE_URL, REDIS_URL, at least one LLM API key

# 3. Backend
cd backend
npm install
npx prisma migrate deploy    # run DB migrations
npm run dev                  # starts Express + BullMQ worker

# 4. Frontend (separate terminal)
cd frontend
npm install
npm run dev                  # starts Vite dev server
```

## Deployment — Linux / Production

```bash
# Install Redis
sudo apt install redis-server
sudo systemctl enable redis-server

# Optional: Install ClamAV
sudo apt install clamav clamav-daemon
sudo freshclam
sudo systemctl start clamav-daemon
# Set CLAMAV_ENABLED=true in .env

# Start app
cd backend && npm run build && npm start
cd frontend && npm run build  # serve dist/ with nginx/caddy
```

## Network Diagram

```
┌──────────────┐    HTTPS     ┌──────────────────────┐
│   Browser    │◄────────────►│  Express Server      │
│   (React)    │  :5173       │  :3001               │
└──────────────┘              └──┬───┬───┬───┬───┬───┘
                                 │   │   │   │   │
                           HTTPS │   │   │   │   │ TCP
                                 │   │   │   │   │
              ┌──────────────────┘   │   │   │   └──────────────┐
              ▼                      │   │   │                  ▼
    ┌─────────────────┐              │   │   │       ┌──────────────────┐
    │ LLM APIs        │              │   │   │       │ ClamAV Daemon    │
    │ • Gemini        │              │   │   │       │ :3310 (optional) │
    │ • Groq          │              │   │   │       └──────────────────┘
    │ • NVIDIA Build  │              │   │   │
    └─────────────────┘              │   │   │
                                     │   │   │
                    ┌────────────────┘   │   └────────────────┐
                    ▼                    ▼                    ▼
          ┌──────────────────┐  ┌──────────────┐   ┌──────────────────┐
          │ Aiven PostgreSQL │  │ Redis        │   │ /metrics         │
          │ (pgvector)       │  │ (BullMQ +    │   │ (Prometheus      │
          │ :23607 SSL       │  │  Cache)      │   │  scrape)         │
          └──────────────────┘  └──────────────┘   └──────────────────┘
```
