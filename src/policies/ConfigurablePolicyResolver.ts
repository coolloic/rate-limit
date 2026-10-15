import { DEFAULT_RESOURCE, type Consumer, type LimitPolicy } from '../domain/types.js';
import type { PolicyResolver } from '../interfaces/PolicyResolver.js';

type PolicyMap = Readonly<Record<string, LimitPolicy>>;

export interface PolicyRules {
  readonly default: LimitPolicy;
  /** Per resource, for every consumer. */
  readonly resources?: PolicyMap;
  /** Per consumer, on every resource. */
  readonly consumers?: PolicyMap;
  /** Per resource, then per consumer. */
  readonly overrides?: Readonly<Record<string, PolicyMap>>;
}

/** Most specific rule wins: resource+consumer → consumer → resource → default. */
export class ConfigurablePolicyResolver implements PolicyResolver {
  public constructor(private readonly rules: PolicyRules) {}

  public resolve({ consumerId, resource = DEFAULT_RESOURCE }: Consumer): LimitPolicy {
    const { overrides, consumers, resources } = this.rules;
    return (
      lookup(lookup(overrides, resource), consumerId) ??
      lookup(consumers, consumerId) ??
      lookup(resources, resource) ??
      this.rules.default
    );
  }
}

/** Own-property lookup, so ids like "toString" never hit Object.prototype. */
function lookup<T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}
