import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-correlation-id'] as string) || uuidv4();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
}
