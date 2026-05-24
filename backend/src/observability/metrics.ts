import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const documentProcessingDuration = new client.Histogram({
  name: 'document_processing_duration_seconds',
  help: 'Document processing time',
  buckets: [1, 5, 10, 30, 60, 120],
  registers: [register],
});

export const llmRequestsTotal = new client.Counter({
  name: 'llm_requests_total',
  help: 'LLM API calls',
  labelNames: ['provider', 'model'],
  registers: [register],
});

export const llmRequestDuration = new client.Histogram({
  name: 'llm_request_duration_seconds',
  help: 'LLM call latency',
  labelNames: ['provider', 'model'],
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export { register };
