import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/database.js';
import { detectProviders } from './services/providers/registry.js';
import { startDocumentWorker, getWorker } from './workers/documentWorker.js';
import { logger } from './observability/logger.js';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  // Ensure upload directory exists
  await fs.mkdir(path.resolve(env.UPLOAD_DIR, 'tmp'), { recursive: true });

  // Connect to database
  await prisma.$connect();
  logger.info('Database connected');

  // Enable pgvector extension
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector').catch(() => {
    logger.warn('Could not create vector extension (may already exist)');
  });

  // Detect LLM providers
  await detectProviders();

  // Start BullMQ worker (if Redis available)
  startDocumentWorker();

  // Start server
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`EasyDoc API running on port ${env.PORT}`, { mode: env.NODE_ENV });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    const w = getWorker();
    if (w) await w.close();
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Force exit after 30s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});
