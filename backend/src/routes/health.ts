import { Router, Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { isRedisAvailable } from '../config/redis.js';
import { getActiveProviders } from '../services/providers/registry.js';

const router = Router();

// GET /api/health
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/health/ready
router.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, unknown> = {};

  // Database
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'up', latencyMs: Date.now() - start };
  } catch {
    checks.database = { status: 'down' };
  }

  // Redis
  checks.redis = isRedisAvailable()
    ? { status: 'up' }
    : { status: 'not_configured', message: 'Running in sync mode' };

  // LLM Providers
  const providers = getActiveProviders();
  const llm: Record<string, { status: string }> = {};
  for (const p of providers) {
    llm[p.id] = { status: 'up' };
  }
  checks.llm = llm;

  const allUp = (checks.database as { status: string }).status === 'up' && providers.length > 0;

  res.status(allUp ? 200 : 503).json({
    status: allUp ? 'ready' : 'degraded',
    mode: isRedisAvailable() ? 'async' : 'sync',
    checks,
  });
});

export default router;
