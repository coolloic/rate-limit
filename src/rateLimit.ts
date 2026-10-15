import type { Consumer, RateLimitResult } from './domain/types.js';
import type { RateLimiter } from './domain/RateLimiter.js';
import { createRateLimiter } from './factories/createRateLimiter.js';

let defaultLimiter: RateLimiter | undefined;

/** Checks `consumer` against the default limiter (10 requests per second unless configured otherwise). */
export function rateLimit(consumer: Consumer): Promise<RateLimitResult> {
  defaultLimiter ??= createRateLimiter();
  return defaultLimiter.check(consumer);
}
