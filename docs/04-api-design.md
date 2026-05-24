# CipherDocs — API Design

## Base URL

```
http://localhost:3001/api
```

## Interactive Documentation

Swagger UI available at `GET /api-docs` (powered by `swagger-jsdoc` + `swagger-ui-express`).

## Common Headers

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes (POST/PUT) | `application/json` or `multipart/form-data` |
| `X-Correlation-ID` | No | Client-provided trace ID. Server generates one if absent. |

### Response Headers

| Header | Description |
|--------|-------------|
| `X-Correlation-ID` | Trace ID for this request (echoed or generated) |
| `X-RateLimit-Limit` | Max requests allowed in window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds to wait (only on 429) |

---

## Endpoints

### Documents

#### `POST /api/documents/upload`

Upload a document for processing. Returns `202 Accepted` (async, with Redis) or `201 Created` (sync, without Redis).

**Request:** `multipart/form-data`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | The document file |
| `force` | boolean | No | Force reprocess even if duplicate (default: false) |
| `originalDocumentId` | UUID | No | Link as new version of existing document |

**Response (async — Redis available):** `202 Accepted`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "doc-proc-1716547200-abc",
  "fileName": "contract.pdf",
  "mimeType": "application/pdf",
  "fileSize": 245890,
  "fileHash": "sha256:a1b2c3d4...",
  "status": "queued",
  "uploadedAt": "2026-05-24T10:30:00Z"
}
```

**Response (sync — no Redis):** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "fileName": "contract.pdf",
  "mimeType": "application/pdf",
  "fileSize": 245890,
  "fileHash": "sha256:a1b2c3d4...",
  "status": "ready",
  "uploadedAt": "2026-05-24T10:30:00Z"
}
```

**Duplicate detected (no force):** `200 OK`
```json
{
  "id": "existing-uuid",
  "fileName": "contract.pdf",
  "status": "ready",
  "duplicate": true,
  "message": "File already processed. Use force=true to reprocess."
}
```

**Errors:**
| Code | Error Code | Reason |
|------|------------|--------|
| 400 | `INVALID_FILE_TYPE` | File type not in allowed list |
| 400 | `FILE_TOO_LARGE` | Exceeds MAX_FILE_SIZE_MB |
| 422 | `MALWARE_DETECTED` | ClamAV flagged the file |
| 422 | `ZIP_BOMB_DETECTED` | Compression ratio exceeds threshold |
| 429 | `RATE_LIMITED` | Upload rate limit exceeded |

---

#### `GET /api/documents`

List all documents with pagination and filtering.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `status` | string | all | `queued`, `processing`, `ready`, `error` |
| `type` | string | all | Classification filter |
| `sort` | string | `-createdAt` | Sort field. Prefix `-` for descending |
| `search` | string | | Search in file name |

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "fileName": "contract.pdf",
      "mimeType": "application/pdf",
      "fileSize": 245890,
      "fileHash": "sha256:a1b2c3d4...",
      "status": "ready",
      "classification": "contract",
      "pageCount": 15,
      "versionCount": 1,
      "uploadedAt": "2026-05-24T10:30:00Z",
      "processedAt": "2026-05-24T10:30:45Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

---

#### `GET /api/documents/:id`

Get document details including summary, entities, and version info.

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "fileName": "contract.pdf",
  "mimeType": "application/pdf",
  "fileSize": 245890,
  "fileHash": "sha256:a1b2c3d4...",
  "status": "ready",
  "classification": "contract",
  "pageCount": 15,
  "chunkCount": 32,
  "uploadedAt": "2026-05-24T10:30:00Z",
  "processedAt": "2026-05-24T10:30:45Z",
  "processingDurationMs": 45000,
  "summary": {
    "brief": "This is a service agreement between...",
    "detailed": "Section 1: Parties involved..."
  },
  "entities": {
    "people": ["John Smith", "Jane Doe"],
    "organizations": ["Acme Corp", "Widget Inc"],
    "dates": ["2026-01-15", "2027-01-15"],
    "monetary": ["$50,000", "$5,000/month"]
  },
  "versions": [
    { "version": 1, "id": "uuid-v1", "createdAt": "2026-05-24T10:30:00Z", "modelUsed": "gemini-3.1-flash-lite" }
  ]
}
```

---

#### `GET /api/documents/:id/file`

Serve the original uploaded file.

**Response:** Binary stream with correct `Content-Type` and `Content-Disposition` headers.

---

#### `GET /api/documents/:id/versions`

Get version history for a document.

**Response:** `200 OK`
```json
{
  "data": [
    {
      "version": 2,
      "documentId": "uuid-v2",
      "fileHash": "sha256:...",
      "modelUsed": "gemini-3.1-flash-lite",
      "createdAt": "2026-05-25T08:00:00Z"
    },
    {
      "version": 1,
      "documentId": "uuid-v1",
      "fileHash": "sha256:...",
      "modelUsed": "gemini-3.1-flash-lite",
      "createdAt": "2026-05-24T10:30:00Z"
    }
  ]
}
```

---

#### `DELETE /api/documents/:id`

Delete a document and all associated data (chunks, embeddings, analysis, QA history).

**Response:** `204 No Content`

---

### Analysis & Q&A

#### `POST /api/documents/:id/ask`

Ask a question about a document (RAG Q&A). **Streams** the response via Server-Sent Events (SSE).

**Request:**
```json
{
  "question": "What is the termination clause?",
  "topK": 5
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `question` | string | required | The question to ask |
| `topK` | number | 5 | Number of chunks to retrieve (1-20) |

**Response:** `200 OK` — `Content-Type: text/event-stream`

Streamed as SSE events:
```
data: {"type":"token","content":"The"}

data: {"type":"token","content":" termination"}

data: {"type":"token","content":" clause"}

data: {"type":"token","content":" states"}

... (tokens stream word-by-word)

data: {"type":"done","answer":"The termination clause states that either party may terminate with 30 days written notice...","citations":[{"chunkId":"uuid","chunkIndex":24,"pageNumber":12,"section":"Section 8.2 - Termination","text":"Either party may terminate this agreement...","similarity":0.92},{"chunkId":"uuid","chunkIndex":25,"pageNumber":13,"section":"Section 8.3 - Notice Period","text":"Written notice of not less than thirty (30) days...","similarity":0.87}],"model":"gemini-3.1-flash-lite","tokensUsed":1240,"cached":false,"correlationId":"abc-123-def"}
```

**Non-streaming fallback:** If `Accept: application/json` header is set (no SSE), returns standard JSON:
```json
{
  "answer": "The termination clause states that either party may terminate with 30 days written notice...",
  "citations": [
    {
      "chunkId": "uuid",
      "chunkIndex": 24,
      "pageNumber": 12,
      "section": "Section 8.2 - Termination",
      "text": "Either party may terminate this agreement...",
      "similarity": 0.92
    },
    {
      "chunkId": "uuid",
      "chunkIndex": 25,
      "pageNumber": 13,
      "section": "Section 8.3 - Notice Period",
      "text": "Written notice of not less than thirty (30) days...",
      "similarity": 0.87
    }
  ],
  "model": "gemini-3.1-flash-lite",
  "tokensUsed": 1240,
  "cached": false,
  "correlationId": "abc-123-def"
}
```

---

#### `POST /api/documents/:id/summarize`

Re-generate summary for a document.

**Request:**
```json
{
  "style": "brief"
}
```

| Field | Type | Default | Options |
|-------|------|---------|---------|
| `style` | string | `brief` | `brief` (3-5 sentences), `detailed` (per section), `bullets` (key points) |

**Response:** `200 OK`
```json
{
  "summary": "...",
  "model": "gemma-4-31b",
  "tokensUsed": 890
}
```

---

### Settings & Provider Discovery

#### `GET /api/settings/providers`

Get all active LLM providers and their available models. Auto-detected from API keys at startup.

**Response:** `200 OK`
```json
{
  "providers": [
    {
      "id": "gemini",
      "name": "Google Gemini",
      "active": true,
      "models": [
        { "id": "gemini-3.1-flash-lite", "rpm": 15, "rpd": 500, "tpm": 250000 },
        { "id": "gemma-4-31b", "rpm": 15, "rpd": 1500, "tpm": null },
        { "id": "gemini-3.5-flash", "rpm": 5, "rpd": 20, "tpm": 250000 }
      ]
    },
    {
      "id": "groq",
      "name": "Groq",
      "active": true,
      "models": [
        { "id": "llama-3.3-70b-versatile", "rpm": 30, "rpd": 1000, "tpm": 12000 },
        { "id": "qwen/qwen3-32b", "rpm": 60, "rpd": 1000, "tpm": 6000 }
      ]
    },
    {
      "id": "nvidia",
      "name": "NVIDIA Build",
      "active": false,
      "models": []
    },
    {
      "id": "ollama",
      "name": "Ollama (Local)",
      "active": true,
      "models": [
        { "id": "llama3.2", "rpm": null, "rpd": null, "tpm": null }
      ]
    }
  ]
}
```

---

#### `GET /api/settings/models`

Get the current model assignment for each task.

**Response:** `200 OK`
```json
{
  "assignments": {
    "summarization": "gemma-4-31b",
    "classification": "gemini-3.1-flash-lite",
    "entityExtraction": "gemini-3.1-flash-lite",
    "qa": "gemini-3.1-flash-lite",
    "embedding": "gemini-embedding-1"
  }
}
```

---

#### `PUT /api/settings/models`

Update model assignments. Each model must belong to an active provider.

**Request:**
```json
{
  "assignments": {
    "summarization": "llama-3.3-70b-versatile",
    "classification": "gemini-3.1-flash-lite",
    "entityExtraction": "gemini-3.1-flash-lite",
    "qa": "meta/llama-3.1-405b-instruct",
    "embedding": "gemini-embedding-1"
  }
}
```

**Response:** `200 OK`
```json
{
  "assignments": {
    "summarization": "llama-3.3-70b-versatile",
    "classification": "gemini-3.1-flash-lite",
    "entityExtraction": "gemini-3.1-flash-lite",
    "qa": "meta/llama-3.1-405b-instruct",
    "embedding": "gemini-embedding-1"
  },
  "updatedAt": "2026-05-24T11:00:00Z"
}
```

**Errors:**
| Code | Error Code | Reason |
|------|------------|--------|
| 400 | `INVALID_MODEL` | Model ID not recognized |
| 400 | `PROVIDER_INACTIVE` | Model belongs to a provider with no API key |

---

### Jobs

#### `GET /api/jobs/:jobId`

Check the status of an async processing job.

**Response:** `200 OK`
```json
{
  "jobId": "doc-proc-1716547200-abc",
  "documentId": "uuid",
  "status": "processing",
  "progress": 60,
  "stage": "embedding",
  "attempts": 1,
  "createdAt": "2026-05-24T10:30:00Z"
}
```

| Status | Description |
|--------|-------------|
| `queued` | Waiting in queue |
| `processing` | Worker is processing |
| `completed` | Successfully processed |
| `failed` | All retries exhausted (check DLQ) |

---

### Health & Monitoring

#### `GET /api/health`

Liveness check — is the server running?

**Response:** `200 OK`
```json
{
  "status": "ok",
  "uptime": 86400,
  "version": "1.0.0"
}
```

#### `GET /api/health/ready`

Readiness check — are all dependencies available?

**Response:** `200 OK` (or `503 Service Unavailable` if a critical dependency is down)
```json
{
  "status": "ready",
  "mode": "async",
  "checks": {
    "database": { "status": "up", "latencyMs": 12 },
    "redis": { "status": "up", "latencyMs": 3 },
    "clamav": { "status": "unavailable", "message": "ClamAV not configured" },
    "llm": {
      "gemini": { "status": "up" },
      "groq": { "status": "up" },
      "nvidia": { "status": "circuit_open" }
    }
  }
}
```

When Redis is not configured:
```json
{
  "status": "ready",
  "mode": "sync",
  "checks": {
    "database": { "status": "up", "latencyMs": 12 },
    "redis": { "status": "not_configured", "message": "Running in sync mode" },
    "clamav": { "status": "unavailable" },
    "llm": { "gemini": { "status": "up" } }
  }
}
```

#### `GET /metrics`

Prometheus metrics endpoint (not under `/api` prefix).

---

## Error Response Format

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "INVALID_FILE_TYPE",
    "message": "File type application/x-msdownload is not allowed",
    "status": 400,
    "correlationId": "abc-123-def"
  }
}
```

## Error Codes

| Code | Status | Retryable | Description |
|------|--------|-----------|-------------|
| `VALIDATION_ERROR` | 400 | No | Request body/params failed validation |
| `INVALID_FILE_TYPE` | 400 | No | Unsupported or mismatched file type |
| `FILE_TOO_LARGE` | 400 | No | Exceeds MAX_FILE_SIZE_MB |
| `MALWARE_DETECTED` | 422 | No | ClamAV flagged the file |
| `ZIP_BOMB_DETECTED` | 422 | No | Compression ratio exceeds threshold |
| `DOCUMENT_NOT_FOUND` | 404 | No | Document ID does not exist |
| `JOB_NOT_FOUND` | 404 | No | Job ID does not exist |
| `RATE_LIMITED` | 429 | Yes | Too many requests, check Retry-After |
| `PROCESSING_FAILED` | 500 | No | Document parsing/embedding failed |
| `LLM_UNAVAILABLE` | 503 | Yes | All LLM providers failed |
| `SERVICE_UNAVAILABLE` | 503 | Yes | Critical dependency down |
