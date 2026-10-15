import { beforeEach, describe, expect, it } from 'vitest';
import { RateLimiter } from '../domain/RateLimiter.js';
import type { RateLimitResult } from '../domain/types.js';
import { ConfigurablePolicyResolver } from '../policies/ConfigurablePolicyResolver.js';
import { InMemoryStore } from '../stores/InMemoryStore.js';
import { FakeClock } from '../testing/FakeClock.js';
import { SlidingWindowLogStrategy, type SlidingWindowLog } from './SlidingWindowLogStrategy.js';

const TEN_PER_SECOND = { limit: 10, windowMs: 1000 };

describe('SlidingWindowLogStrategy (10 requests per second)', () => {
  let clock: FakeClock;
  let limiter: RateLimiter;

  beforeEach(() => {
    clock = new FakeClock();
    const strategy = new SlidingWindowLogStrategy(new InMemoryStore<SlidingWindowLog>(clock), clock);
    limiter = new RateLimiter(new ConfigurablePolicyResolver({ default: TEN_PER_SECOND }), strategy);
  });

  const hit = (consumerId = 'alice', resource?: string): Promise<RateLimitResult> =>
    limiter.check(resource === undefined ? { consumerId } : { consumerId, resource });

  const hitTimes = async (n: number, consumerId = 'alice'): Promise<RateLimitResult[]> => {
    const results: RateLimitResult[] = [];
    for (let i = 0; i < n; i++) results.push(await hit(consumerId));
    return results;
  };

  it('allows the first 10 requests and counts remaining quota down', async () => {
    const results = await hitTimes(10);
    expect(results.every((r) => r.allowed)).toBe(true);
    expect(results.map((r) => r.remaining)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it('denies the 11th request with the exact wait in milliseconds', async () => {
    await hitTimes(10);
    clock.advance(300);
    expect(await hit()).toEqual({ allowed: false, limit: 10, remaining: 0, resetMs: 700, retryAfterMs: 700 });
  });

  it('allows the request again once retryAfterMs has elapsed', async () => {
    await hitTimes(10);
    const denied = await hit();
    clock.advance(denied.retryAfterMs - 1);
    expect((await hit()).allowed).toBe(false);
    clock.advance(1);
    expect((await hit()).allowed).toBe(true);
  });

  it('slides: quota frees up as individual requests age out, not all at once', async () => {
    await hitTimes(5); // t=0
    clock.set(500);
    await hitTimes(5); // t=500
    clock.set(999);
    expect(await hit()).toMatchObject({ allowed: false, retryAfterMs: 1 });

    clock.set(1000); // the five t=0 requests leave the window
    const results = await hitTimes(6);
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, true, true, false]);
    expect(results[5]).toMatchObject({ retryAfterMs: 500 }); // next to expire: the t=500 batch
  });

  it('does not count denied requests against the consumer', async () => {
    await hitTimes(10); // t=0
    clock.set(500);
    await hitTimes(50); // hammering while blocked
    clock.set(1000); // only the t=0 requests expire; denied t=500 attempts must not linger
    expect((await hitTimes(10)).every((r) => r.allowed)).toBe(true);
  });

  it('tracks each consumer independently', async () => {
    await hitTimes(10, 'alice');
    expect((await hit('alice')).allowed).toBe(false);
    expect((await hit('bob')).allowed).toBe(true);
  });

  it('tracks each resource independently for the same consumer', async () => {
    for (let i = 0; i < 10; i++) await hit('alice', 'search');
    expect((await hit('alice', 'search')).allowed).toBe(false);
    expect((await hit('alice', 'upload')).allowed).toBe(true);
  });

  it('reports resetMs as the time until the oldest request leaves the window', async () => {
    expect(await hit()).toMatchObject({ resetMs: 1000 });
    clock.advance(250);
    expect(await hit()).toMatchObject({ resetMs: 750 });
  });

  it('never allows more than 10 requests in any 1-second span (randomised arrivals)', async () => {
    const random = mulberry32(42);
    const allowedAt: number[] = [];
    for (let i = 0; i < 2000; i++) {
      clock.advance(Math.floor(random() * 60));
      if ((await hit()).allowed) allowedAt.push(clock.now());
    }

    expect(allowedAt.length).toBeGreaterThan(100);
    for (const [i, start] of allowedAt.entries()) {
      const inWindow = allowedAt.slice(i).filter((t) => t < start + 1000).length;
      expect(inWindow).toBeLessThanOrEqual(10);
    }
  });
});

/** Small seeded PRNG so the randomised test is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
