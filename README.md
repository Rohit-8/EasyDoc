# CipherDocs

AI-powered RAG system for document analysis, summarization, and citation-aware retrieval. Built with Express + TypeScript backend, React + Vite frontend, PostgreSQL with pgvector, and multi-provider LLM support.

---

## Architecture

```
┌──────────────────────┐        ┌──────────────────────────────────────┐
│   React + Vite SPA   │──API──▶│       Express + TypeScript API       │
│                      │        │                                      │
│  • Upload UI         │        │  Helmet ─▶ CORS ─▶ Rate Limiter     │
│  • Document List     │        │  Morgan ─▶ Correlation ID            │
│  • Summary View      │        │  ─▶ Routes ─▶ Error Handler          │
│  • Q&A Chat (SSE)    │        │                                      │
│  • Settings Page     │        │  ┌──────────┐  ┌──────────────────┐  │
│                      │        │  │ BullMQ   │  │ Security Layer   │  │
└──────────────────────┘        │  │ Queue    │  │ Magic bytes, ZIP │  │
                                │  │ + Worker │  │ ClamAV, Sanitize │  │
                                │  └──────────┘  └──────────────────┘  │
                                └───────────┬──────────────────────────┘
                                            │
                          ┌─────────────────┼─────────────────┐
                          ▼                 ▼                 ▼
                   ┌────────────┐   ┌─────────────┐   ┌────────────┐
                   │ PostgreSQL │   │   Redis      │   │ LLM        │
                   │ + pgvector │   │ (optional)   │   │ Providers  │
                   └────────────┘   └─────────────┘   └────────────┘
```

## Features

- **Multi-format ingestion** — PDF, DOCX, XLSX, CSV, TXT, Markdown
- **Smart chunking** — 800-token chunks with 200-token overlap
- **Multi-provider embeddings** — Gemini, NVIDIA, Ollama with automatic fallback
- **Citation-aware Q&A** — SSE streaming with chunk-level source references
- **Document classification** — Auto-categorizes uploaded documents
- **Entity extraction** — People, organizations, dates, monetary values, locations
- **Summarization** — Brief, detailed, or bullet-point styles
- **Version control** — Document re-upload with version tracking and deduplication
- **Security pipeline** — Magic bytes, ZIP bomb detection, ClamAV (optional), filename sanitization
- **Async processing** — BullMQ queue + worker when Redis available, sync fallback otherwise
- **Cache layer** — Redis-backed cache-aside for Q&A, embeddings, and metadata
- **Observability** — Winston JSON logging, Prometheus metrics, audit trail, correlation IDs
- **Circuit breakers** — Opossum-based fault tolerance for all LLM calls
- **API docs** — Swagger UI at `/api-docs`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, TypeScript, TailwindCSS, TanStack Query, React Router 7 |
| Backend | Express 4, TypeScript 5.6, Prisma 6, Vercel AI SDK |
| Database | PostgreSQL + pgvector |
| Cache/Queue | Redis + BullMQ (optional) |
| LLM Providers | Google Gemini, Groq, NVIDIA NIM, Ollama (local) |
| Security | Helmet, HPP, rate limiting, ClamAV (optional) |
| Observability | Winston, Prometheus (prom-client), morgan |

## Screenshots

### Document Analysis - Summary, Classification & Ask Questions
![Document Upload & Analysis](public/document-upload.png)

### Entity Extraction, Tags & Version History
![Classifications and Tags](public/classifications-and-tags.png)

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** with [pgvector](https://github.com/pgvector/pgvector) extension
- **Redis** (optional — enables async queue + caching)
- At least one LLM provider API key (Gemini, Groq, or NVIDIA) or local Ollama

### 1. Clone & Install

```bash
git clone <repo-url> && cd CipherDocs
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit `backend/.env` with your database URL and at least one LLM provider key:

```env
DATABASE_URL=postgres://user:pass@host:port/dbname?sslmode=require
GEMINI_API_KEY=your-key-here
```

### 3. Set Up Database

```bash
cd backend
npx prisma migrate dev --name init
# or for an existing database:
npx prisma db push
```

### 4. Run

```bash
# Terminal 1 — Backend
cd backend
npx tsx src/index.ts

# Terminal 2 — Frontend
cd frontend
npm run dev
```

The frontend runs at `http://localhost:5173` and proxies API requests to the backend at `http://localhost:3001`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/documents/upload` | Upload a document (multipart/form-data) |
| `GET` | `/api/documents` | List documents (paginated, filterable) |
| `GET` | `/api/documents/:id` | Get document details with analyses |
| `GET` | `/api/documents/:id/file` | Download original file |
| `DELETE` | `/api/documents/:id` | Delete document and all related data |
| `POST` | `/api/documents/:id/ask` | Ask a question (SSE streaming or JSON) |
| `POST` | `/api/documents/:id/summarize` | Regenerate summary |
| `GET` | `/api/documents/:id/qa-history` | Get Q&A history |
| `GET` | `/api/settings/providers` | List active LLM providers and models |
| `GET/PUT` | `/api/settings/models` | Get/update task→model assignments |
| `GET` | `/api/jobs/:jobId` | Check async job status |
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/health/ready` | Readiness probe |
| `GET` | `/metrics` | Prometheus metrics |
| `GET` | `/api-docs` | Swagger UI |

## LLM Providers

CipherDocs auto-detects available providers on startup based on environment variables:

| Provider | Env Variable | Example Models |
|----------|-------------|----------------|
| **Google Gemini** | `GEMINI_API_KEY` | gemini-3.1-flash-lite, gemma-4-31b |
| **Groq** | `GROQ_API_KEY` | llama-3.3-70b-versatile, mixtral-8x7b-32768 |
| **NVIDIA NIM** | `NVIDIA_API_KEY` | meta/llama-3.1-70b-instruct |
| **Ollama** | `OLLAMA_BASE_URL` | Any locally pulled model (llama3.2, phi3, etc.) |

Embedding providers: Gemini (`gemini-embedding-1`), NVIDIA (`nvidia/llama-3.2-nv-embedqa-1b-v2` and others), Ollama (auto-detected).

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for the complete reference. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `REDIS_URL` | — | Redis URL (optional, enables queue + cache) |
| `GEMINI_API_KEY` | — | Google AI API key |
| `EMBEDDING_PROVIDER` | `gemini` | `gemini`, `nvidia`, or `ollama` |
| `MAX_FILE_SIZE_MB` | `50` | Upload size limit |
| `QUEUE_CONCURRENCY` | `2` | BullMQ worker concurrency |
| `CLAMAV_ENABLED` | `false` | Enable ClamAV malware scanning |

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
