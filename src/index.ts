// Composition root + public API.
export { rateLimit } from './rateLimit.js';
export { createRateLimiter, type RateLimiterOptions } from './factories/createRateLimiter.js';
export { RateLimiter } from './domain/RateLimiter.js';
export { SystemClock } from './domain/SystemClock.js';
export { DEFAULT_RESOURCE, type Consumer, type LimitPolicy, type RateLimitResult } from './domain/types.js';
export { ConfigurablePolicyResolver, type PolicyRules } from './policies/ConfigurablePolicyResolver.js';
export { InMemoryStore } from './stores/InMemoryStore.js';
export { SlidingWindowLogStrategy, type SlidingWindowLog } from './strategies/SlidingWindowLogStrategy.js';
export { toRateLimitHeaders } from './http/headers.js';
export { acquire, type AcquireOptions } from './client/acquire.js';
export { withRateLimit } from './client/withRateLimit.js';
export { RateLimitError } from './errors/RateLimitError.js';
export { RateLimitTimeoutError } from './errors/RateLimitTimeoutError.js';
export type { Clock } from './interfaces/Clock.js';
export type { PolicyResolver } from './interfaces/PolicyResolver.js';
export type { RateLimitStore, StateTransition } from './interfaces/RateLimitStore.js';
export type { RateLimitStrategy } from './interfaces/RateLimitStrategy.js';
export { config, type Env } from './config/env.js';
