import { describe, expect, it } from 'vitest';
import { toRateLimitHeaders } from './headers.js';

describe('toRateLimitHeaders', () => {
  it('emits IETF draft headers with delta-seconds reset when allowed', () => {
    expect(
      toRateLimitHeaders({ allowed: true, limit: 10, remaining: 7, resetMs: 30_000, retryAfterMs: 0 }),
    ).toEqual({ 'RateLimit-Limit': '10', 'RateLimit-Remaining': '7', 'RateLimit-Reset': '30' });
  });

  it('adds Retry-After when denied', () => {
    expect(
      toRateLimitHeaders({ allowed: false, limit: 10, remaining: 0, resetMs: 2000, retryAfterMs: 2000 }),
    ).toEqual({ 'RateLimit-Limit': '10', 'RateLimit-Remaining': '0', 'RateLimit-Reset': '2', 'Retry-After': '2' });
  });

  it('rounds sub-second waits up so clients never retry too early', () => {
    const headers = toRateLimitHeaders({ allowed: false, limit: 10, remaining: 0, resetMs: 1, retryAfterMs: 1 });
    expect(headers['RateLimit-Reset']).toBe('1');
    expect(headers['Retry-After']).toBe('1');
  });
});
