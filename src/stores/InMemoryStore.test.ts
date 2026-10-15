import { describe, expect, it } from 'vitest';
import { FakeClock } from '../testing/FakeClock.js';
import { InMemoryStore } from './InMemoryStore.js';

const increment = (previous: number | undefined): { state: number; result: number } => {
  const state = (previous ?? 0) + 1;
  return { state, result: state };
};

describe('InMemoryStore', () => {
  it('passes the previous state to the transition and returns its result', async () => {
    const store = new InMemoryStore<number>(new FakeClock());
    expect(await store.update('k', 1000, increment)).toBe(1);
    expect(await store.update('k', 1000, increment)).toBe(2);
  });

  it('treats expired entries as absent', async () => {
    const clock = new FakeClock();
    const store = new InMemoryStore<number>(clock);
    await store.update('k', 1000, increment);
    clock.advance(1000);
    expect(await store.update('k', 1000, increment)).toBe(1);
  });

  it('evicts expired entries of idle keys so memory does not grow unbounded', async () => {
    const clock = new FakeClock();
    const store = new InMemoryStore<number>(clock);
    for (let i = 0; i < 100; i++) await store.update(`consumer-${String(i)}`, 1000, increment);
    expect(store.size).toBe(100);

    clock.advance(1000);
    await store.update('someone-else', 1000, increment);
    expect(store.size).toBe(1);
  });
});
