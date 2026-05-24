import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.RATE_LIMIT_UPLOAD,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many uploads, try again later', status: 429 } },
});

export const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_QUERY,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later', status: 429 } },
});

export const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_READ,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later', status: 429 } },
});
