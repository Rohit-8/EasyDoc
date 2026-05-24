# CipherDocs — Data Model

## Database: PostgreSQL + pgvector

ORM: **Prisma** with `pgvector` extension support.

## Entity Relationship Diagram

```
┌───────────────────────────┐       ┌──────────────────────────────┐
│        documents          │       │      document_chunks         │
├───────────────────────────┤       ├──────────────────────────────┤
│ id              UUID (PK) │──┐    │ id            UUID (PK)      │
│ file_name       TEXT      │  │    │ document_id   UUID (FK)      │
│ file_path       TEXT      │  │    │ chunk_index   INT            │
│ mime_type       TEXT      │  │    │ content       TEXT           │
│ file_size       BIGINT    │  │    │ embedding     VECTOR(768)   │
│ file_hash       TEXT      │  │    │ page_number   INT           │
│ page_count      INT       │  │    │ section       TEXT          │
│ status          TEXT      │  │    │ token_count   INT           │
│ classification  TEXT      │  │    │ metadata      JSONB         │
│ error_message   TEXT      │  │    │ created_at    TIMESTAMPTZ   │
│ version         INT       │  │    └──────────────────────────────┘
│ original_doc_id UUID (FK) │  │
│ processing_ms   INT       │  │    ┌──────────────────────────────┐
│ model_used      TEXT      │  │    │     analysis_results         │
│ created_at      TIMESTAMPTZ  │    ├──────────────────────────────┤
│ updated_at      TIMESTAMPTZ  ├───►│ id            UUID (PK)      │
└───────────────────────────┘  │    │ document_id   UUID (FK)      │
                               │    │ type          TEXT           │
                               │    │ content       JSONB          │
                               │    │ model_used    TEXT           │
                               │    │ tokens_used   INT           │
                               │    │ created_at    TIMESTAMPTZ   │
                               │    └──────────────────────────────┘
                               │
                               │    ┌──────────────────────────────┐
                               │    │      qa_history              │
                               │    ├──────────────────────────────┤
                               └───►│ id            UUID (PK)      │
                                    │ document_id   UUID (FK)      │
                                    │ question      TEXT           │
                                    │ answer        TEXT           │
                                    │ citations     JSONB          │
                                    │ model_used    TEXT           │
                                    │ tokens_used   INT           │
                                    │ cached        BOOLEAN       │
                                    │ correlation_id TEXT          │
                                    │ created_at    TIMESTAMPTZ   │
                                    └──────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                        audit_logs                                │
├──────────────────────────────────────────────────────────────────┤
│ id              UUID (PK)                                        │
│ event           TEXT (e.g., DOCUMENT_UPLOADED, QUERY_EXECUTED)   │
│ entity_type     TEXT (document, query, system)                   │
│ entity_id       UUID (nullable)                                  │
│ actor_ip        TEXT                                              │
│ correlation_id  TEXT                                              │
│ details         JSONB                                            │
│ created_at      TIMESTAMPTZ                                      │
│                                                                  │
│ ⚠ IMMUTABLE — no UPDATE or DELETE allowed (append-only)          │
└──────────────────────────────────────────────────────────────────┘
```

## Table Definitions

### `documents`

Primary record for each uploaded file. Supports versioning via self-referential FK.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Unique document ID |
| `file_name` | TEXT | NOT NULL | Original file name (sanitized) |
| `file_path` | TEXT | NOT NULL | Server-side storage path |
| `mime_type` | TEXT | NOT NULL | Validated MIME type |
| `file_size` | BIGINT | NOT NULL | Size in bytes |
| `file_hash` | TEXT | NOT NULL | SHA-256 hash for dedup |
| `page_count` | INT | | Number of pages/sheets |
| `status` | TEXT | NOT NULL, DEFAULT 'queued' | `queued` → `processing` → `ready` → `error` |
| `classification` | TEXT | | Document type (contract, invoice, etc.) |
| `error_message` | TEXT | | Error details if status = error |
| `version` | INT | NOT NULL, DEFAULT 1 | Version number |
| `original_document_id` | UUID | FK → documents.id, NULLABLE | Points to v1 if this is a re-upload |
| `processing_duration_ms` | INT | | How long processing took |
| `model_used` | TEXT | | Which LLM was used for analysis |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Upload timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update |

**Indexes:**
```sql
CREATE UNIQUE INDEX idx_documents_hash ON documents (file_hash) WHERE original_document_id IS NULL;
CREATE INDEX idx_documents_status ON documents (status);
CREATE INDEX idx_documents_classification ON documents (classification);
CREATE INDEX idx_documents_original ON documents (original_document_id);
```

### `document_chunks`

Semantic chunks with vector embeddings for RAG retrieval.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Unique chunk ID |
| `document_id` | UUID | FK → documents.id, ON DELETE CASCADE | Parent document |
| `chunk_index` | INT | NOT NULL | Order within document |
| `content` | TEXT | NOT NULL | Chunk text content |
| `embedding` | VECTOR(768) | NOT NULL | Embedding vector |
| `page_number` | INT | | Source page number |
| `section` | TEXT | | Section heading or sheet name |
| `token_count` | INT | | Token count of this chunk |
| `metadata` | JSONB | DEFAULT '{}' | Extra metadata |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:**
```sql
-- Vector similarity search index
CREATE INDEX idx_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Filter by document before vector search
CREATE INDEX idx_chunks_document ON document_chunks (document_id);

-- Ordering chunks within a document
CREATE INDEX idx_chunks_order ON document_chunks (document_id, chunk_index);
```

### `analysis_results`

Stored AI analysis outputs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `document_id` | UUID | FK → documents.id, ON DELETE CASCADE | |
| `type` | TEXT | NOT NULL | `summary`, `entities`, `classification` |
| `content` | JSONB | NOT NULL | Analysis output |
| `model_used` | TEXT | | Which LLM model produced this |
| `tokens_used` | INT | | Token consumption |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:**
```sql
CREATE INDEX idx_analysis_document ON analysis_results (document_id);
CREATE UNIQUE INDEX idx_analysis_type ON analysis_results (document_id, type);
```

**Content shapes by type:**

`type = "summary"`:
```json
{
  "brief": "This is a 2-year service agreement...",
  "detailed": "Section 1: Parties involved...\nSection 2: ..."
}
```

`type = "entities"`:
```json
{
  "people": ["John Smith", "Jane Doe"],
  "organizations": ["Acme Corp"],
  "dates": ["2026-01-15"],
  "monetary": ["$50,000"],
  "locations": ["New York, NY"]
}
```

`type = "classification"`:
```json
{
  "type": "contract",
  "subtype": "service_agreement",
  "confidence": 0.95
}
```

### `qa_history`

Log of user Q&A interactions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `document_id` | UUID | FK → documents.id, ON DELETE CASCADE | |
| `question` | TEXT | NOT NULL | User's question |
| `answer` | TEXT | NOT NULL | LLM-generated answer |
| `citations` | JSONB | NOT NULL | Array of citation objects |
| `model_used` | TEXT | | |
| `tokens_used` | INT | | |
| `cached` | BOOLEAN | DEFAULT false | Was this served from cache? |
| `correlation_id` | TEXT | | Request trace ID |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Citations JSONB format:**
```json
[
  {
    "chunkId": "uuid",
    "chunkIndex": 24,
    "pageNumber": 12,
    "section": "Section 8.2",
    "text": "snippet...",
    "similarity": 0.92
  }
]
```

### `audit_logs`

Immutable audit trail. **No UPDATE or DELETE operations permitted** — append only.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `event` | TEXT | NOT NULL | Event name (see events list) |
| `entity_type` | TEXT | NOT NULL | `document`, `query`, `system` |
| `entity_id` | UUID | | Related entity ID (nullable for system events) |
| `actor_ip` | TEXT | | Client IP address |
| `correlation_id` | TEXT | | Request correlation ID |
| `details` | JSONB | DEFAULT '{}' | Event-specific data |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Immutable timestamp |

**Indexes:**
```sql
CREATE INDEX idx_audit_event ON audit_logs (event);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs (created_at);
CREATE INDEX idx_audit_correlation ON audit_logs (correlation_id);
```

**Audit events:**
| Event | entity_type | details |
|-------|-------------|---------|
| `DOCUMENT_UPLOADED` | document | `{fileName, fileHash, mimeType, fileSize}` |
| `DOCUMENT_PROCESSED` | document | `{durationMs, chunkCount, modelUsed}` |
| `DOCUMENT_PROCESSING_FAILED` | document | `{error, attempt}` |
| `DOCUMENT_DELETED` | document | `{fileName}` |
| `DOCUMENT_DUPLICATE_DETECTED` | document | `{existingId, fileHash}` |
| `VERSION_CREATED` | document | `{version, originalId}` |
| `QUERY_EXECUTED` | query | `{question (truncated 100 chars), modelUsed, tokensUsed, cached}` |
| `SUMMARY_REGENERATED` | document | `{style, modelUsed}` |
| `RATE_LIMIT_EXCEEDED` | system | `{ip, endpoint, limit}` |
| `LLM_CIRCUIT_OPENED` | system | `{provider, failureCount}` |
| `LLM_CIRCUIT_CLOSED` | system | `{provider}` |

---

## Prisma Schema

```prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

model Document {
  id                   String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  fileName             String           @map("file_name")
  filePath             String           @map("file_path")
  mimeType             String           @map("mime_type")
  fileSize             BigInt           @map("file_size")
  fileHash             String           @map("file_hash")
  pageCount            Int?             @map("page_count")
  status               String           @default("queued")
  classification       String?
  errorMessage         String?          @map("error_message")
  version              Int              @default(1)
  originalDocumentId   String?          @map("original_document_id") @db.Uuid
  processingDurationMs Int?             @map("processing_duration_ms")
  modelUsed            String?          @map("model_used")
  createdAt            DateTime         @default(now()) @map("created_at") @db.Timestamptz
  updatedAt            DateTime         @updatedAt @map("updated_at") @db.Timestamptz

  originalDocument     Document?        @relation("DocumentVersions", fields: [originalDocumentId], references: [id])
  versions             Document[]       @relation("DocumentVersions")
  chunks               DocumentChunk[]
  analyses             AnalysisResult[]
  qaHistory            QaHistory[]

  @@index([fileHash])
  @@index([status])
  @@index([classification])
  @@index([originalDocumentId])
  @@map("documents")
}

model DocumentChunk {
  id          String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documentId  String                  @map("document_id") @db.Uuid
  chunkIndex  Int                     @map("chunk_index")
  content     String
  embedding   Unsupported("vector(768)")
  pageNumber  Int?                    @map("page_number")
  section     String?
  tokenCount  Int?                    @map("token_count")
  metadata    Json                    @default("{}")
  createdAt   DateTime                @default(now()) @map("created_at") @db.Timestamptz

  document    Document                @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@index([documentId, chunkIndex])
  @@map("document_chunks")
}

model AnalysisResult {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documentId  String   @map("document_id") @db.Uuid
  type        String
  content     Json
  modelUsed   String?  @map("model_used")
  tokensUsed  Int?     @map("tokens_used")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  document    Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, type])
  @@map("analysis_results")
}

model QaHistory {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documentId    String   @map("document_id") @db.Uuid
  question      String
  answer        String
  citations     Json
  modelUsed     String?  @map("model_used")
  tokensUsed    Int?     @map("tokens_used")
  cached        Boolean  @default(false)
  correlationId String?  @map("correlation_id")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz

  document      Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@map("qa_history")
}

model AuditLog {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  event         String
  entityType    String   @map("entity_type")
  entityId      String?  @map("entity_id") @db.Uuid
  actorIp       String?  @map("actor_ip")
  correlationId String?  @map("correlation_id")
  details       Json     @default("{}")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([event])
  @@index([entityType, entityId])
  @@index([createdAt])
  @@index([correlationId])
  @@map("audit_logs")
}
```

## Key Queries

### Vector Similarity Search (RAG retrieval)
```sql
SELECT
  id,
  document_id,
  content,
  page_number,
  section,
  chunk_index,
  1 - (embedding <=> $1::vector) AS similarity
FROM document_chunks
WHERE document_id = $2
ORDER BY embedding <=> $1::vector
LIMIT $3;  -- topK parameter
```

### Duplicate Check
```sql
SELECT id, file_name, status
FROM documents
WHERE file_hash = $1
  AND original_document_id IS NULL
LIMIT 1;
```

### Latest Version of a Document
```sql
SELECT *
FROM documents
WHERE (id = $1 OR original_document_id = $1)
ORDER BY version DESC
LIMIT 1;
```

### Audit Trail for a Document
```sql
SELECT event, details, actor_ip, correlation_id, created_at
FROM audit_logs
WHERE entity_type = 'document'
  AND entity_id = $1
ORDER BY created_at ASC;
```
