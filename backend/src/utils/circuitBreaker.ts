import CircuitBreaker from 'opossum';
import { logger } from '../observability/logger.js';

interface BreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
  name?: string;
  [key: string]: unknown;
}

const defaultOptions: BreakerOptions = {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

export function createCircuitBreaker<T>(
  fn: (...args: unknown[]) => Promise<T>,
  name: string,
  options?: Partial<BreakerOptions>,
): CircuitBreaker {
  const breaker = new CircuitBreaker(fn, { ...defaultOptions, ...options, name } as Record<string, unknown>);

  breaker.on('open', () => logger.warn(`Circuit breaker OPEN: ${name}`));
  breaker.on('halfOpen', () => logger.info(`Circuit breaker HALF-OPEN: ${name}`));
  breaker.on('close', () => logger.info(`Circuit breaker CLOSED: ${name}`));

  return breaker;
}
