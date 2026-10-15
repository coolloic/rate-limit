import type { Clock } from '../interfaces/Clock.js';
import type { RateLimitStore, StateTransition } from '../interfaces/RateLimitStore.js';

interface Entry<TState> {
  readonly state: TState;
  readonly expiresAt: number;
}

/**
 * Adapter: `RateLimitStore` over a `Map`, for a single process.
 * Updates are atomic because read, transition and write run synchronously (no `await` in between).
 * Expired entries are ignored on read and swept at most once per TTL, so idle consumers don't leak memory.
 */
export class InMemoryStore<TState> implements RateLimitStore<TState> {
  private readonly entries = new Map<string, Entry<TState>>();
  private nextSweepAt = 0;

  public constructor(private readonly clock: Clock) {}

  public get size(): number {
    return this.entries.size;
  }

  public update<TResult>(
    key: string,
    ttlMs: number,
    transition: (previous: TState | undefined) => StateTransition<TState, TResult>,
  ): Promise<TResult> {
    const now = this.clock.now();
    this.sweepIfDue(now, ttlMs);

    const entry = this.entries.get(key);
    const previous = entry !== undefined && entry.expiresAt > now ? entry.state : undefined;
    const { state, result } = transition(previous);
    this.entries.set(key, { state, expiresAt: now + ttlMs });
    return Promise.resolve(result);
  }

  private sweepIfDue(now: number, intervalMs: number): void {
    if (now < this.nextSweepAt) return;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    this.nextSweepAt = now + intervalMs;
  }
}
