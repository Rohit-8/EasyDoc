# EasyDoc — Features

## Core Features

### 1. Document Ingestion (Async)

Upload and process documents asynchronously via a job queue.

**Supported Formats:**
| Format | Parser | Notes |
|--------|--------|-------|
| PDF | `pdf-parse` | Text-based PDFs |
| PDF (scanned) | `tesseract.js` | OCR via WASM, no native install |
| DOCX | `mammoth` | Preserves structure |
| XLSX / CSV | `exceljs` | Sheet-aware parsing |
| TXT / Markdown | Built-in | Direct text extraction |
| ZIP | `adm-zip` | Recursive extraction with bomb protection |

**Processing Pipeline (Async):**
```
Upload → Validate → Dedup Check → Scan → 202 Accepted
                                            │
    ┌───────────────────────────────────────┘
    ▼ [BullMQ Worker]
  Parse → Chunk → Embed → Analyze → Store → Status: "ready"
```

Upload returns immediately with `202 Accepted`. Client polls `GET /api/documents/:id` or `GET /api/jobs/:jobId` for status.

---

### 2. Security Layer

Multi-layered file validation before any processing occurs.

| Layer | Check | Method | Dependency |
|-------|-------|--------|------------|
| 1 | File extension whitelist | Custom middleware | None |
| 2 | MIME type validation | `file-type` (magic bytes) | npm (pure JS) |
| 3 | File size limit | Express `multer` config | npm |
| 4 | Duplicate detection | SHA-256 hash comparison | Built-in `crypto` |
| 5 | Antivirus scan | `clamscan` → ClamAV daemon | Optional (graceful skip) |
| 6 | ZIP bomb detection | Compression ratio check | Custom logic |
| 7 | Filename sanitization | Strip path traversal chars | Custom logic |

When ClamAV is not available, the system logs a warning and continues with the other layers. Controlled via `CLAMAV_ENABLED` env var.

---

### 3. Duplicate / Reupload Handling

Every uploaded file is hashed with SHA-256 before processing.

| Scenario | Behavior |
|----------|----------|
| Exact same file uploaded again | Return existing document (skip reprocessing) |
| Same file, `force=true` param | Create new version, re-run analysis |
| Updated file (different content) | New document; optionally linked as version via `originalDocumentId` |

---

### 4. Document Versioning

Documents support version tracking for re-uploads and re-analysis.

```
Document (v1) ← original upload
    └── Document Version (v2) ← re-upload with force=true
        └── Document Version (v3) ← re-analyzed with different model
```

Each version preserves:
- Original file
- All chunks and embeddings
- Analysis results
- Which LLM model was used
- Timestamp

---

### 5. Document Understanding Pipeline

Intelligent parsing that preserves document structure and metadata.

**Chunking Strategy:**
```
Document
  → Pages (for PDFs) / Sheets (for XLSX) / Sections (for DOCX)
    → Semantic Chunks (500-1000 tokens with 100-token overlap)
      → Each chunk stores:
         • text content
         • page_number / sheet_name / section_heading
         • chunk_index (position in document)
         • embedding vector (from cloud LLM)
         • token_count
```

**Metadata Extracted Per Document:**
- File name, size, MIME type, SHA-256 hash
- Page count / sheet count
- Upload timestamp
- Processing status: `queued` → `processing` → `ready` → `error`
- Processing duration (ms)
- Original file stored on disk for viewing

---

### 6. LLM-Powered Analysis Agent

Agentic workflow using cloud LLM providers for document intelligence.
All LLM responses use **streaming** for real-time output in the UI.

**Capabilities:**

| Agent Tool | Function | Trigger | Assigned Model |
|------------|----------|---------|----------------|
| `classify_document` | Detect type: contract, report, invoice, letter, etc. | Auto on upload | Configurable via Settings |
| `summarize` | Generate concise summary with key points | Auto on upload | Configurable via Settings |
| `extract_entities` | Extract names, dates, monetary amounts, organizations | Auto on upload | Configurable via Settings |
| `answer_question` | RAG-based Q&A over document content (streamed) | User-initiated | Configurable via Settings |
| `compare_docs` | Diff analysis between two documents | User-initiated (V2) | Configurable via Settings |

**Provider Fallback Chain:**
```
Assigned model → (fails?) → fallback to next available provider → Ollama (local)
```

Each provider is wrapped in a circuit breaker (`opossum`):
- Opens after 5 consecutive failures
- Half-open check every 30 seconds
- Automatically recovers when provider comes back

---

### 7. Dynamic Provider Detection & Model Assignment

Providers are **auto-detected at startup** by checking which API keys are present.

**Detection Flow:**
```
App starts
  → GEMINI_API_KEY set?   → register all Gemini models
  → GROQ_API_KEY set?     → register all Groq models
  → NVIDIA_API_KEY set?   → register all NVIDIA models
  → OLLAMA_BASE_URL set?  → query Ollama /api/tags → register installed models
  → No keys at all?       → fail with clear error message
```

**Settings UI (frontend page):**

Users can assign which model to use for each task:

| Task | Model Selector | Shows Only |
|------|---------------|------------|
| Summarization | Dropdown | Models from active providers |
| Classification | Dropdown | Models from active providers |
| Entity Extraction | Dropdown | Models from active providers |
| Q&A (RAG) | Dropdown | Models from active providers |
| Embedding | Dropdown | Embedding models from active providers |

**Example scenarios:**
- User provides only `NVIDIA_API_KEY` → Settings page shows only NVIDIA models
- User provides `GEMINI_API_KEY` + `GROQ_API_KEY` → both Gemini and Groq models appear
- User adds `OLLAMA_BASE_URL` → locally installed Ollama models also appear
- User changes assignment at runtime → saved to DB, takes effect immediately

**Defaults (when no assignment is configured):**
```
If Gemini available → use gemini-3.1-flash-lite for most tasks,
                       gemma-4-31b for summarization,
                       gemini-embedding-1 for embeddings
Else if Groq available → use llama-3.3-70b-versatile
Else if NVIDIA available → use meta/llama-3.3-70b-instruct
Else if Ollama available → use first available model
```

---

### 8. Streaming Responses

All Q&A and summarization responses are **streamed** in real-time using Server-Sent Events (SSE).

**How it works:**
```
Client sends POST /api/documents/:id/ask
  → Server opens SSE stream
  → LLM generates tokens one by one
  → Each token sent as SSE event: data: {"token": "The"}
  → Final event includes citations: data: {"done": true, "citations": [...]}
  → Stream closes
```

**Benefits:**
- User sees response appearing word-by-word (like ChatGPT)
- No waiting for full response (especially on large documents)
- Can cancel mid-stream if answer is already sufficient
- Works with all providers (Vercel AI SDK handles streaming uniformly)

---

### 9. Citation-Aware Retrieval (RAG)

Every AI response is grounded in source document content with traceable citations.

**How Citations Work:**
```
User: "What is the termination clause?"
    ↓
Check query cache (Redis) → miss
    ↓
Generate query embedding (check embedding cache) 
    ↓
pgvector cosine similarity → top 5 chunks
    ↓
LLM receives chunks with [CHUNK_1], [CHUNK_2] markers
    ↓
LLM response: "The termination clause states... [1][2]"
    ↓
Citations mapped back:
  [1] → Page 12, Section 8.2, similarity: 0.92
  [2] → Page 13, Section 8.3, similarity: 0.87
    ↓
Cache response in Redis (TTL: 1 hour)
```

---

### 10. Caching

Multi-level caching via Redis to reduce latency and API costs.

| Cache | Key | TTL | Purpose |
|-------|-----|-----|---------|
| Query result cache | `query:{docId}:{hash(question)}` | 1 hour | Avoid duplicate LLM calls |
| Embedding cache | `embed:{hash(text)}` | 24 hours | Avoid duplicate embedding API calls |
| Document metadata | `doc:{id}` | 10 min | Fast doc list/detail responses |
| Rate limit counters | `rl:{ip}` | Per window | Track request counts |
| Job status | `job:{id}` | Until complete | Fast polling for processing status |

Cache invalidation: on document delete, version create, or manual purge.

---

### 11. Async Processing & Queue

All heavy document processing runs asynchronously via BullMQ + Redis.

| Feature | Detail |
|---------|--------|
| Queue backend | Redis (same instance as cache) |
| Concurrency | Configurable (default: 2 concurrent jobs) |
| Retry policy | Exponential backoff: 5s → 30s → 120s (3 attempts) |
| Dead Letter Queue | Failed jobs moved to DLQ after retries exhausted |
| Job priority | Supported (premium users could get higher priority) |
| Job progress | Reported at each stage (parsing 20%, chunking 50%, embedding 80%) |
| Job status API | `GET /api/jobs/:jobId` returns current state + progress |

---

### 12. Rate Limiting

Tiered rate limiting to prevent abuse.

| Endpoint Group | Limit | Window |
|----------------|-------|--------|
| Upload (`POST /api/documents/upload`) | 10 requests | 15 min |
| Q&A (`POST /api/documents/:id/ask`) | 30 requests | 1 min |
| Read endpoints (`GET /api/*`) | 100 requests | 1 min |
| Health (`GET /api/health`) | No limit | — |

Returns `429 Too Many Requests` with `Retry-After` header when exceeded.

---

### 13. Observability

#### Structured Logging (winston)
- JSON format for machine parsing
- Log levels: error, warn, info, debug
- Every log includes: timestamp, correlation ID, service name, level
- Request logs: method, path, status code, response time, IP

#### Metrics (Prometheus via prom-client)
| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total requests by method, path, status |
| `http_request_duration_seconds` | Histogram | Request latency distribution |
| `document_processing_duration_seconds` | Histogram | Job processing time |
| `document_uploads_total` | Counter | Upload count by file type |
| `llm_requests_total` | Counter | LLM calls by provider, model |
| `llm_request_duration_seconds` | Histogram | LLM call latency |
| `llm_tokens_used_total` | Counter | Token consumption by provider |
| `circuit_breaker_state` | Gauge | 0=closed, 1=open, 2=half-open |
| `queue_active_jobs` | Gauge | Currently processing jobs |
| `queue_waiting_jobs` | Gauge | Jobs waiting in queue |
| `cache_hits_total` | Counter | Cache hits by cache type |
| `cache_misses_total` | Counter | Cache misses by cache type |

Exposed at `GET /metrics` (Prometheus scrape endpoint).

#### Audit Trail
Immutable log of all significant actions stored in PostgreSQL.

| Event | Logged Data |
|-------|-------------|
| `DOCUMENT_UPLOADED` | document ID, file name, hash, IP, correlation ID |
| `DOCUMENT_PROCESSED` | document ID, duration, chunk count, model used |
| `DOCUMENT_FAILED` | document ID, error message, attempt count |
| `DOCUMENT_DELETED` | document ID, correlation ID |
| `QUERY_EXECUTED` | document ID, question (truncated), model, tokens, cached |
| `VERSION_CREATED` | document ID, version number, reason |

---

### 14. Error Handling

#### Global Error Handler
- Catches all unhandled errors and promise rejections
- Returns consistent JSON error response
- Logs full stack trace with correlation ID
- Never leaks internal details to client (production mode)
- Maps known errors to appropriate HTTP status codes

#### Error Categories
| Category | Status | Retryable | Example |
|----------|--------|-----------|---------|
| Validation | 400 | No | Invalid file type |
| Not Found | 404 | No | Document doesn't exist |
| Security | 422 | No | Malware detected |
| Rate Limited | 429 | Yes (after Retry-After) | Too many requests |
| LLM Failure | 503 | Yes | All providers down |
| Internal | 500 | No | Unexpected exception |

---

### 15. Frontend Features

**Pages:**

| Page | Description |
|------|-------------|
| **Landing** | Project overview, upload CTA |
| **Upload** | Drag-and-drop file upload with progress + job status polling |
| **Documents List** | All documents with status badges, type, date, version count |
| **Document Detail** | Summary, entities, citations, original file viewer, version history |
| **Q&A Chat** | Streaming chat interface for document Q&A with citation links |
| **Settings** | Model assignment per task, active providers display, embedding config |

**Settings Page Detail:**
```
┌─────────────────────────────────────────────────────────┐
│  Settings                                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Active Providers:  [✅ Gemini] [✅ Groq] [❌ NVIDIA]   │
│                     [✅ Ollama (local)]                  │
│                                                         │
│  ┌─── Model Assignment ───────────────────────────────┐ │
│  │                                                     │ │
│  │  Summarization:     [ gemma-4-31b             ▾ ] │ │
│  │  Classification:    [ gemini-3.1-flash-lite    ▾ ] │ │
│  │  Entity Extraction: [ gemini-3.1-flash-lite    ▾ ] │ │
│  │  Q&A (RAG):         [ gemini-3.1-flash-lite    ▾ ] │ │
│  │  Embedding:         [ gemini-embedding-1       ▾ ] │ │
│  │                                                     │ │
│  │  Each dropdown only shows models from active        │ │
│  │  providers (based on which API keys are set).       │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  [ Save Settings ]                                      │
└─────────────────────────────────────────────────────────┘
```

**UI Features:**
- Drag-and-drop upload with progress bar
- Real-time job status polling (queued → processing → ready)
- **Streaming Q&A** — response appears word-by-word in real-time
- Toast notifications on completion/error
- Summary view with expandable sections
- Citation highlights linked to original document
- Side-by-side: AI summary ↔ original document viewer
- Document type badges (contract, invoice, report, etc.)
- Entity tags (people, dates, amounts)
- Version history dropdown
- Model assignment settings with provider auto-detection
- Error states with retry actions
- Loading skeletons

---

## Feature Matrix

| Feature | MVP | V2 |
|---------|-----|-----|
| PDF/DOCX/XLSX upload | ✅ | |
| File validation (magic bytes, size) | ✅ | |
| SHA-256 duplicate detection | ✅ | |
| ClamAV malware scanning (optional) | ✅ | |
| Async processing (BullMQ, optional) | ✅ | |
| Text extraction + OCR | ✅ | |
| Semantic chunking | ✅ | |
| Vector embedding + pgvector | ✅ | |
| Auto-summarization | ✅ | |
| Auto-classification | ✅ | |
| Entity extraction | ✅ | |
| RAG Q&A with citations | ✅ | |
| **Streaming AI responses (SSE)** | ✅ | |
| **Dynamic provider detection** | ✅ | |
| **Settings UI — model assignment** | ✅ | |
| Original file viewer | ✅ | |
| Multi-provider LLM + circuit breaker | ✅ | |
| Redis caching (optional) | ✅ | |
| Rate limiting | ✅ | |
| Structured logging | ✅ | |
| Prometheus metrics | ✅ | |
| Audit trail | ✅ | |
| Swagger API docs | ✅ | |
| Graceful shutdown | ✅ | |
| Request correlation IDs | ✅ | |
| Document versioning | ✅ | |
| Global error handling | ✅ | |
| Document comparison | | ✅ |
| Batch upload | | ✅ |
| Export summaries (PDF/MD) | | ✅ |
| Webhook notifications | | ✅ |
| User auth (JWT) | | ✅ |
| Role-based access | | ✅ |
