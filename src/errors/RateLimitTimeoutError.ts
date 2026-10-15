import type { RateLimitResult } from '../domain/types.js';
import { RateLimitError } from './RateLimitError.js';

/** Thrown by `acquire` when waiting for a slot would exceed `maxWaitMs` or `maxAttempts`. */
export class RateLimitTimeoutError extends RateLimitError {
  public constructor(public readonly lastResult: RateLimitResult) {
    super(`Rate limit still exceeded; next slot in ${String(lastResult.retryAfterMs)} ms`);
  }
}
