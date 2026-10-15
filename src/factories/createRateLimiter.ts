import { config } from '../config/env.js';
import { RateLimiter } from '../domain/RateLimiter.js';
import { SystemClock } from '../domain/SystemClock.js';
import type { Clock } from '../interfaces/Clock.js';
import type { PolicyResolver } from '../interfaces/PolicyResolver.js';
import type { RateLimitStore } from '../interfaces/RateLimitStore.js';
import { ConfigurablePolicyResolver } from '../policies/ConfigurablePolicyResolver.js';
import { InMemoryStore } from '../stores/InMemoryStore.js';
import { SlidingWindowLogStrategy, type SlidingWindowLog } from '../strategies/SlidingWindowLogStrategy.js';

export interface RateLimiterOptions {
  /** Defaults to one policy for everyone, from RATE_LIMIT_MAX_REQUESTS / RATE_LIMIT_WINDOW_MS. */
  readonly policies?: PolicyResolver;
  readonly clock?: Clock;
  /** Defaults to an in-process store. Swap for a shared store (e.g. Redis) when running several instances. */
  readonly store?: RateLimitStore<SlidingWindowLog>;
}

/** Factory: the single place where config and defaults become concrete objects. */
export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const clock = options.clock ?? new SystemClock();
  const store = options.store ?? new InMemoryStore<SlidingWindowLog>(clock);
  const policies =
    options.policies ??
    new ConfigurablePolicyResolver({
      default: { limit: config.RATE_LIMIT_MAX_REQUESTS, windowMs: config.RATE_LIMIT_WINDOW_MS },
    });
  return new RateLimiter(policies, new SlidingWindowLogStrategy(store, clock));
}
