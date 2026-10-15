export interface StateTransition<TState, TResult> {
  readonly state: TState;
  readonly result: TResult;
}

export interface RateLimitStore<TState> {
  /**
   * Atomically replaces the state for `key` with the state returned by `transition`.
   * `previous` is `undefined` when the key is new or expired. The entry expires `ttlMs` after this write.
   * Implementations MUST guarantee no other update of the same key interleaves.
   */
  update<TResult>(
    key: string,
    ttlMs: number,
    transition: (previous: TState | undefined) => StateTransition<TState, TResult>,
  ): Promise<TResult>;
}
