import { Request, Response, NextFunction } from 'express';
import { logger } from '../observability/logger.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const correlationId = req.correlationId ?? 'unknown';

  if (err instanceof AppError) {
    logger.warn('Operational error', {
      code: err.code,
      message: err.message,
      status: err.statusCode,
      correlationId,
    });
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        status: err.statusCode,
        correlationId,
      },
    });
    return;
  }

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    correlationId,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      status: 500,
      correlationId,
    },
  });
}
