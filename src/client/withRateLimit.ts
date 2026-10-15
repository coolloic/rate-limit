import type { RateLimiter } from '../domain/RateLimiter.js';
import type { Consumer } from '../domain/types.js';
import { acquire, type AcquireOptions } from './acquire.js';

/** Wraps `fn` so each call first waits for a rate-limit slot (like p-limit's `limit(fn)`, but for rate). */
export function withRateLimit<TArgs extends readonly unknown[], TResult>(
  limiter: Pick<RateLimiter, 'check'>,
  consumer: Consumer,
  fn: (...args: TArgs) => TResult | Promise<TResult>,
  options: AcquireOptions = {},
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    await acquire(limiter, consumer, options);
    return fn(...args);
  };
}
