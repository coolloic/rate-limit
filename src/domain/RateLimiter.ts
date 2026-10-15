import type { PolicyResolver } from '../interfaces/PolicyResolver.js';
import type { RateLimitStrategy } from '../interfaces/RateLimitStrategy.js';
import { DEFAULT_RESOURCE, type Consumer, type RateLimitResult } from './types.js';

export class RateLimiter {
  public constructor(
    private readonly policies: PolicyResolver,
    private readonly strategy: RateLimitStrategy,
  ) {}

  public check(consumer: Consumer): Promise<RateLimitResult> {
    const { consumerId, resource = DEFAULT_RESOURCE } = consumer;
    // JSON encoding keeps keys unambiguous whatever characters the ids contain.
    const key = JSON.stringify([resource, consumerId]);
    return this.strategy.consume(key, this.policies.resolve(consumer));
  }
}
