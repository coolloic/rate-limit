import type { Consumer, LimitPolicy } from '../domain/types.js';

export interface PolicyResolver {
  resolve(consumer: Consumer): LimitPolicy;
}
