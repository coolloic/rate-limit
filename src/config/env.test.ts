import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('applies defaults when variables are missing', () => {
    const env = parseEnv({});
    expect(env.RATE_LIMIT_ALGORITHM).toBe('fixed-window');
    expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(100);
    expect(env.RATE_LIMIT_STORE).toBe('memory');
  });

  it('coerces numeric strings', () => {
    expect(parseEnv({ RATE_LIMIT_WINDOW_MS: '1000' }).RATE_LIMIT_WINDOW_MS).toBe(1000);
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(parseEnv({}))).toBe(true);
  });

  it('rejects invalid values with a readable error', () => {
    expect(() => parseEnv({ RATE_LIMIT_MAX_REQUESTS: '-1' })).toThrow(/RATE_LIMIT_MAX_REQUESTS/);
  });

  it('requires REDIS_URL when the redis store is selected', () => {
    expect(() => parseEnv({ RATE_LIMIT_STORE: 'redis' })).toThrow(/REDIS_URL/);
  });
});
