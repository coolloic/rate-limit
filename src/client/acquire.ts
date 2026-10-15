import type { RateLimiter } from '../domain/RateLimiter.js';
import type { Consumer, RateLimitResult } from '../domain/types.js';
import { RateLimitTimeoutError } from '../errors/RateLimitTimeoutError.js';

export interface AcquireOptions {
  /** Give up (without sleeping) if the total wait would exceed this. Default: no limit. */
  readonly maxWaitMs?: number;
  /** Give up after this many checks. Default: no limit. */
  readonly maxAttempts?: number;
  /** Adds a random 0..jitterMs delay on top of the exact wait, to spread out waiters. Default: 0. */
  readonly jitterMs?: number;
  readonly signal?: AbortSignal;
  /** Injectable for deterministic tests. Default: Math.random. */
  readonly random?: () => number;
}

/**
 * Waits for a slot instead of failing: on deny, sleeps the exact `retryAfterMs` (plus optional jitter)
 * and checks again. Rejects with `RateLimitTimeoutError` when a cap is hit, or the signal's reason on abort.
 */
export async function acquire(
  limiter: Pick<RateLimiter, 'check'>,
  consumer: Consumer,
  options: AcquireOptions = {},
): Promise<RateLimitResult> {
  const { maxWaitMs = Infinity, maxAttempts = Infinity, jitterMs = 0, signal, random = Math.random } = options;
  let waitedMs = 0;

  for (let attempt = 1; ; attempt++) {
    signal?.throwIfAborted();
    const result = await limiter.check(consumer);
    if (result.allowed) return result;

    const delayMs = result.retryAfterMs + random() * jitterMs;
    if (attempt >= maxAttempts || waitedMs + delayMs > maxWaitMs) throw new RateLimitTimeoutError(result);

    signal?.throwIfAborted();
    await sleep(delayMs, signal);
    waitedMs += delayMs;
  }
}

/** Resolves after `ms`, or early on abort, then rethrows the abort reason. */
async function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  await new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
  signal?.throwIfAborted();
}
