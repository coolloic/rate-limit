import type { LimitPolicy, RateLimitResult } from '../domain/types.js';
import type { Clock } from '../interfaces/Clock.js';
import type { RateLimitStore } from '../interfaces/RateLimitStore.js';
import type { RateLimitStrategy } from '../interfaces/RateLimitStrategy.js';

/** Timestamps (ms) of allowed requests, oldest first. */
export type SlidingWindowLog = readonly number[];

/**
 * Strategy: sliding window log. Guarantees at most `limit` allowed requests in any `windowMs` span
 * and returns the exact wait. Denied requests are not recorded, so retries don't extend the wait.
 */
export class SlidingWindowLogStrategy implements RateLimitStrategy {
  public constructor(
    private readonly store: RateLimitStore<SlidingWindowLog>,
    private readonly clock: Clock,
  ) {}

  public consume(key: string, { limit, windowMs }: LimitPolicy): Promise<RateLimitResult> {
    const now = this.clock.now();

    return this.store.update<RateLimitResult>(key, windowMs, (previous = []) => {
      const live = previous.filter((timestamp) => timestamp > now - windowMs);

      if (live.length < limit) {
        const state = [...live, now];
        const oldest = state[0] ?? now;
        const result: RateLimitResult = {
          allowed: true,
          limit,
          remaining: limit - state.length,
          resetMs: oldest + windowMs - now,
          retryAfterMs: 0,
        };
        return { state, result };
      }

      const waitMs = (live[0] ?? now) + windowMs - now;
      const result: RateLimitResult = { allowed: false, limit, remaining: 0, resetMs: waitMs, retryAfterMs: waitMs };
      return { state: live, result };
    });
  }
}
