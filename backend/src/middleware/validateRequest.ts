import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from '../utils/AppError.js';

export function validateRequest(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AppError('VALIDATION_ERROR', message, 400);
    }
    req[source] = result.data;
    next();
  };
}
