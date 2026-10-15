import type { Clock } from '../interfaces/Clock.js';

export class SystemClock implements Clock {
  public now(): number {
    return Date.now();
  }
}
