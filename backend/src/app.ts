import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import 'express-async-errors';

import { correlationId } from './middleware/correlationId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { register } from './observability/metrics.js';
import { swaggerSpec } from './config/swagger.js';

import documentRoutes from './routes/documents.js';
import analysisRoutes from './routes/analysis.js';
import settingsRoutes from './routes/settings.js';
import healthRoutes from './routes/health.js';
import jobsRoutes from './routes/jobs.js';

export function createApp() {
  const app = express();

  // Security
  app.use(helmet());
  app.use(hpp());
  app.use(cors({ origin: true, credentials: true }));

  // Parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Observability
  app.use(correlationId);
  app.use(morgan('short'));

  // Routes
  app.use('/api/documents', documentRoutes);
  app.use('/api/documents', analysisRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/health', healthRoutes);
  app.use('/api/jobs', jobsRoutes);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Prometheus metrics
  app.get('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
