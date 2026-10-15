import { describe, expect, it } from 'vitest';
import { rateLimit } from './rateLimit.js';

describe('rateLimit (default instance)', () => {
  it('lets a consumer make 10 requests, then tells it how long to wait', async () => {
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await rateLimit({ consumerId: 'default-instance-test' }));

    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true);
    const denied = results[10];
    expect(denied?.allowed).toBe(false);
    expect(denied?.retryAfterMs).toBeGreaterThan(0);
    expect(denied?.retryAfterMs).toBeLessThanOrEqual(1000);
  });
});
