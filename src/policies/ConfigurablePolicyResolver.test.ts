import { describe, expect, it } from 'vitest';
import { ConfigurablePolicyResolver } from './ConfigurablePolicyResolver.js';

const DEFAULT = { limit: 10, windowMs: 1000 };
const SEARCH = { limit: 5, windowMs: 1000 };
const VIP = { limit: 100, windowMs: 1000 };
const VIP_SEARCH = { limit: 50, windowMs: 1000 };

const resolver = new ConfigurablePolicyResolver({
  default: DEFAULT,
  resources: { search: SEARCH },
  consumers: { vip: VIP },
  overrides: { search: { vip: VIP_SEARCH } },
});

describe('ConfigurablePolicyResolver', () => {
  it.each([
    ['default when nothing matches', { consumerId: 'alice' }, DEFAULT],
    ['resource rule', { consumerId: 'alice', resource: 'search' }, SEARCH],
    ['consumer rule beats resource rule', { consumerId: 'vip', resource: 'upload' }, VIP],
    ['resource+consumer override beats both', { consumerId: 'vip', resource: 'search' }, VIP_SEARCH],
  ])('uses the %s', (_name, consumer, expected) => {
    expect(resolver.resolve(consumer)).toBe(expected);
  });

  it('ignores inherited object properties such as "toString"', () => {
    expect(resolver.resolve({ consumerId: 'toString', resource: 'constructor' })).toBe(DEFAULT);
  });
});
