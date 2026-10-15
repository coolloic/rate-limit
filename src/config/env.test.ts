import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('defaults to 10 requests per 1000 ms', () => {
    const env = parseEnv({});
    expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(10);
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(1000);
  });

  it('coerces numeric strings', () => {
    expect(parseEnv({ RATE_LIMIT_WINDOW_MS: '500' }).RATE_LIMIT_WINDOW_MS).toBe(500);
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(parseEnv({}))).toBe(true);
  });

  it('rejects invalid values with a readable error', () => {
    expect(() => parseEnv({ RATE_LIMIT_MAX_REQUESTS: '-1' })).toThrow(/RATE_LIMIT_MAX_REQUESTS/);
    expect(() => parseEnv({ RATE_LIMIT_WINDOW_MS: 'soon' })).toThrow(/RATE_LIMIT_WINDOW_MS/);
  });
});
