import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '../domain/RateLimiter.js';
import { RateLimitTimeoutError } from '../errors/RateLimitTimeoutError.js';
import { createRateLimiter } from '../factories/createRateLimiter.js';
import { ConfigurablePolicyResolver } from '../policies/ConfigurablePolicyResolver.js';
import { acquire } from './acquire.js';
import { withRateLimit } from './withRateLimit.js';

const consumer = { consumerId: 'alice' };

describe('client helpers', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers({ now: 0 }); // drives both Date.now (SystemClock) and setTimeout
    limiter = createRateLimiter({
      policies: new ConfigurablePolicyResolver({ default: { limit: 10, windowMs: 1000 } }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const exhaust = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) await limiter.check(consumer);
  };

  describe('acquire', () => {
    it('resolves immediately when a slot is free', async () => {
      await expect(acquire(limiter, consumer)).resolves.toMatchObject({ allowed: true, remaining: 9 });
    });

    it('waits exactly retryAfterMs, then resolves', async () => {
      await exhaust();
      vi.advanceTimersByTime(400);
      const pending = acquire(limiter, consumer);

      await vi.advanceTimersByTimeAsync(599);
      expect(vi.getTimerCount()).toBe(1); // still sleeping
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({ allowed: true });
      expect(Date.now()).toBe(1000);
    });

    it('fails fast with RateLimitTimeoutError when the wait would exceed maxWaitMs', async () => {
      await exhaust();
      const error = await acquire(limiter, consumer, { maxWaitMs: 500 }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RateLimitTimeoutError);
      expect(error).toMatchObject({ lastResult: { allowed: false, retryAfterMs: 1000 } });
      expect(Date.now()).toBe(0); // did not sleep
    });

    it('gives up after maxAttempts checks', async () => {
      await exhaust();
      await expect(acquire(limiter, consumer, { maxAttempts: 1 })).rejects.toBeInstanceOf(RateLimitTimeoutError);
    });

    it('rejects with the abort reason when the signal fires while waiting', async () => {
      await exhaust();
      const controller = new AbortController();
      const pending = acquire(limiter, consumer, { signal: controller.signal });
      const assertion = expect(pending).rejects.toThrow('caller gave up');

      await vi.advanceTimersByTimeAsync(100);
      controller.abort(new Error('caller gave up'));
      await assertion;
      expect(vi.getTimerCount()).toBe(0); // timer cleaned up
    });

    it('adds jitter on top of the exact wait, never before it', async () => {
      await exhaust();
      const pending = acquire(limiter, consumer, { jitterMs: 100, random: () => 0.5 });

      await vi.advanceTimersByTimeAsync(1000);
      expect(vi.getTimerCount()).toBe(1); // exact wait passed, jitter (50 ms) still pending
      await vi.advanceTimersByTimeAsync(50);
      await expect(pending).resolves.toMatchObject({ allowed: true });
    });
  });

  describe('withRateLimit', () => {
    it('passes arguments through and returns the wrapped result', async () => {
      const add = withRateLimit(limiter, consumer, (a: number, b: number) => a + b);
      await expect(add(2, 3)).resolves.toBe(5);
    });

    it('runs a burst of 15 calls as 10 now and 5 after the window', async () => {
      const startedAt: number[] = [];
      const task = withRateLimit(limiter, consumer, () => {
        startedAt.push(Date.now());
      });

      const all = Promise.all(Array.from({ length: 15 }, () => task()));
      await vi.advanceTimersByTimeAsync(1000);
      await all;

      expect(startedAt.filter((t) => t === 0)).toHaveLength(10);
      expect(startedAt.filter((t) => t === 1000)).toHaveLength(5);
    });
  });
});
