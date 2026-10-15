import type { RateLimitResult } from '../domain/types.js';

/**
 * IETF draft headers (RateLimit-Limit / -Remaining / -Reset as delta-seconds), plus `Retry-After`
 * (RFC 9110) when denied. Seconds are rounded up so clients never retry too early.
 */
export function toRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(toSeconds(result.resetMs)),
  };
  if (!result.allowed) headers['Retry-After'] = String(toSeconds(result.retryAfterMs));
  return headers;
}

function toSeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}
