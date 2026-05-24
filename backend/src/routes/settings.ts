import { Router, Request, Response } from 'express';
import {
  getActiveProviders,
  getAssignments,
  saveAssignments,
} from '../services/providers/registry.js';

const router = Router();

// GET /api/settings/providers
router.get('/providers', async (_req: Request, res: Response) => {
  const providers = getActiveProviders().map((p) => ({
    id: p.id,
    name: p.name,
    active: true,
    models: p.models,
    embeddingModels: p.embeddingModels,
  }));

  res.json({ providers });
});

// GET /api/settings/models
router.get('/models', async (_req: Request, res: Response) => {
  const assignments = await getAssignments();
  res.json({ assignments });
});

// PUT /api/settings/models
router.put('/models', async (req: Request, res: Response) => {
  const { assignments } = req.body;
  await saveAssignments(assignments);
  const saved = await getAssignments();
  res.json({ assignments: saved, updatedAt: new Date().toISOString() });
});

export default router;
