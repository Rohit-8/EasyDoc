import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'CipherDocs API',
      version: '1.0.0',
      description: 'AI-powered RAG system for document analysis, summarization, and citation-aware retrieval.',
    },
    servers: [{ url: '/api', description: 'API server' }],
    components: {
      schemas: {
        Document: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fileName: { type: 'string' },
            mimeType: { type: 'string' },
            fileSize: { type: 'integer' },
            fileHash: { type: 'string' },
            status: { type: 'string', enum: ['queued', 'processing', 'ready', 'error'] },
            classification: { type: 'string', nullable: true },
            pageCount: { type: 'integer', nullable: true },
            uploadedAt: { type: 'string', format: 'date-time' },
          },
        },
        Citation: {
          type: 'object',
          properties: {
            chunkId: { type: 'string' },
            chunkIndex: { type: 'integer' },
            pageNumber: { type: 'integer', nullable: true },
            section: { type: 'string', nullable: true },
            text: { type: 'string' },
            similarity: { type: 'number' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
    paths: {
      '/documents/upload': {
        post: {
          tags: ['Documents'],
          summary: 'Upload a document',
          requestBody: {
            content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, force: { type: 'string' } } } } },
          },
          responses: {
            '202': { description: 'Document accepted for processing' },
            '400': { description: 'Invalid file' },
          },
        },
      },
      '/documents': {
        get: {
          tags: ['Documents'],
          summary: 'List documents',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Paginated document list' } },
        },
      },
      '/documents/{id}': {
        get: {
          tags: ['Documents'],
          summary: 'Get document details',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Document with analyses' }, '404': { description: 'Not found' } },
        },
        delete: {
          tags: ['Documents'],
          summary: 'Delete a document',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '204': { description: 'Deleted' }, '404': { description: 'Not found' } },
        },
      },
      '/documents/{id}/file': {
        get: {
          tags: ['Documents'],
          summary: 'Download original file',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'File stream' } },
        },
      },
      '/documents/{id}/ask': {
        post: {
          tags: ['Q&A'],
          summary: 'Ask a question (SSE streaming)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: { question: { type: 'string' }, topK: { type: 'integer', default: 5 } }, required: ['question'] } } },
          },
          responses: { '200': { description: 'SSE stream of tokens + final answer with citations' } },
        },
      },
      '/documents/{id}/summarize': {
        post: {
          tags: ['Analysis'],
          summary: 'Regenerate summary',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: { style: { type: 'string', enum: ['brief', 'detailed', 'bullets'] } } } } },
          },
          responses: { '200': { description: 'New summary' } },
        },
      },
      '/documents/{id}/qa-history': {
        get: {
          tags: ['Q&A'],
          summary: 'Get Q&A history',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Q&A history' } },
        },
      },
      '/settings/providers': {
        get: {
          tags: ['Settings'],
          summary: 'List active LLM providers',
          responses: { '200': { description: 'Provider list with models' } },
        },
      },
      '/settings/models': {
        get: {
          tags: ['Settings'],
          summary: 'Get model assignments',
          responses: { '200': { description: 'Current task→model mapping' } },
        },
        put: {
          tags: ['Settings'],
          summary: 'Update model assignments',
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: { assignments: { type: 'object' } } } } },
          },
          responses: { '200': { description: 'Updated assignments' } },
        },
      },
      '/health': {
        get: { tags: ['Health'], summary: 'Liveness check', responses: { '200': { description: 'OK' } } },
      },
      '/health/ready': {
        get: { tags: ['Health'], summary: 'Readiness check', responses: { '200': { description: 'System status' } } },
      },
    },
  },
  apis: [], // spec is inline above
};

export const swaggerSpec = swaggerJsdoc(options);
