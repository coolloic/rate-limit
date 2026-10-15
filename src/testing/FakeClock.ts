import type { Clock } from '../interfaces/Clock.js';

/** Manually advanced clock for deterministic tests. */
export class FakeClock implements Clock {
  public constructor(private current = 0) {}

  public now(): number {
    return this.current;
  }

  public set(ms: number): void {
    this.current = ms;
  }

  public advance(ms: number): void {
    this.current += ms;
  }
}
