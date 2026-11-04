# rate-limit

A small TypeScript rate-limiting library. `rateLimit(consumer)` tells you whether an identified consumer may proceed,
and if not, exactly how many milliseconds it must wait. By default a consumer gets **at most 10 requests in any
1-second span**.

```ts
import { rateLimit, toRateLimitHeaders } from './src/index.js';

const result = await rateLimit({ consumerId: 'user-42' });

if (result.allowed) {
  // proceed; result.remaining tells you how much quota is left
} else {
  console.log(`Try again in ${result.retryAfterMs} ms`);
}
```

## Running the test suite

Requirements: **Node 24** (pinned in `.nvmrc`) and **pnpm**.

```bash
nvm use            # switches to Node 24 from .nvmrc
pnpm install
pnpm test          # run the test suite (vitest)
pnpm check         # typecheck + lint + tests, which is what CI runs
```

The tests use fake clocks and fake timers, so they are deterministic and finish in well under a second. Highlights:

| Test file | What it demonstrates |
|---|---|
| `src/strategies/SlidingWindowLogStrategy.test.ts` | 10 allowed, then the 11th is denied with the exact wait; quota frees up as requests age out; denied requests don't use up quota; consumers and resources are isolated; **randomised invariant**: across 2,000 seeded random arrivals, no 1-second span ever has more than 10 allowed requests |
| `src/rateLimit.test.ts` | The default `rateLimit` export: 10 allowed, the 11th tells you how long to wait |
| `src/policies/ConfigurablePolicyResolver.test.ts` | Per-resource / per-consumer limits and which rule wins |
| `src/http/headers.test.ts` | IETF `RateLimit-*` headers and `Retry-After` |
| `src/client/acquire.test.ts` | Waiting for a slot, timeouts, abort, jitter, and the `withRateLimit` wrapper |
| `src/stores/InMemoryStore.test.ts` | Expiry, and clearing out entries for idle consumers |

## API

```ts
type Consumer = { consumerId: string; resource?: string };   // resource defaults to "default"
type RateLimitResult =
  | { allowed: true;  limit: number; remaining: number; resetMs: number; retryAfterMs: 0 }
  | { allowed: false; limit: number; remaining: 0;      resetMs: number; retryAfterMs: number };
```

| Function | Purpose |
|---|---|
| `rateLimit(consumer)` | Check against the default limiter (configured from env, 10 per 1000 ms by default) |
| `createRateLimiter({ policies?, clock?, store? })` | Build your own limiter instance |
| `toRateLimitHeaders(result)` | HTTP response headers for a result |
| `acquire(limiter, consumer, options?)` | Wait for a slot instead of being rejected |
| `withRateLimit(limiter, consumer, fn, options?)` | Wrap a function so every call waits for a slot |

### Configuration

The default limit comes from environment variables, validated with Zod at startup (see `.env.example`):

| Variable | Default |
|---|---|
| `RATE_LIMIT_MAX_REQUESTS` | `10` |
| `RATE_LIMIT_WINDOW_MS` | `1000` |

## HTTP headers

`toRateLimitHeaders(result)` follows the IETF RateLimit header fields draft:

| Header | Value | Example |
|---|---|---|
| `RateLimit-Limit` | Maximum request quota in the current window | `RateLimit-Limit: 10` |
| `RateLimit-Remaining` | Quota units left before being throttled | `RateLimit-Remaining: 4` |
| `RateLimit-Reset` | **Relative** seconds until a quota unit frees up (not a Unix timestamp) | `RateLimit-Reset: 1` |
| `Retry-After` | Only on deny. Seconds to wait (RFC 9110) | `Retry-After: 1` |

Seconds are **rounded up**, so a client that obeys the header never comes back too early. `Retry-After` is included
because existing clients already respect it, for example Python `urllib3.Retry`, many SDKs, and browsers.

```ts
app.use(async (req, res, next) => {
  const result = await rateLimit({ consumerId: req.user.id, resource: req.path });
  res.set(toRateLimitHeaders(result));
  if (!result.allowed) return res.status(429).send('Too Many Requests');
  next();
});
```

> Newer revisions of the draft merge these into structured `RateLimit` / `RateLimit-Policy` fields. Only the header
> mapping would change, so it is a small edit in `src/http/headers.ts`.

## Algorithm choice

The requirement is "**not more than 10 requests per second** for any consumer". The three common algorithms handle
that differently:

| Algorithm | How it works | Holds "≤ 10 in any second"? | Memory per consumer | Wait time |
|---|---|---|---|---|
| **Fixed window** | Counter that resets every whole second | ❌ 10 at t=0.99s plus 10 at t=1.01s gives **20 in 20 ms** | O(1) | Coarse (until the window boundary) |
| **Token bucket** | Bucket of 10 tokens refilled at 10/s | ❌ A full bucket (10) plus refill during the next second allows **up to ~19 in a rolling second** | O(1) | Exact for the next token |
| **Sliding window log** ✅ | Keep the timestamps of allowed requests; allow if fewer than 10 are within the last 1000 ms | ✅ **Exactly**, by construction | O(limit), at most 10 numbers | **Exact**: `oldest + 1000 - now` |

**Why sliding window log:**

1. **Correctness.** It is the only one of the three that guarantees the stated limit in every 1-second span. The
   other two are cheaper approximations that allow bursts above the limit. The randomised invariant test checks this
   property directly.
2. **Exact `retryAfterMs`.** The requirement asks for the number of milliseconds to wait. The log knows exactly when
   the oldest request leaves the window, so the answer is exact rather than a guess.
3. **Cost is small at this limit.** Memory is O(limit) per active consumer, which is at most 10 numbers here. Idle
   consumers are cleared out.
4. **Denied requests are not recorded**, so a client that keeps retrying doesn't push its own wait further out.

When to choose differently: with very large limits (for example 10,000/min) the log gets expensive. A **sliding window
counter** (two fixed-window counters, weighted) gives an approximation with O(1) memory, and a **token bucket** is the
right fit when bursts are actually wanted. Both drop in as another `RateLimitStrategy` without changing `RateLimiter`.

## Extension (a): limits per resource and per consumer (built)

Pass a `ConfigurablePolicyResolver`. The most specific rule wins: **resource+consumer → consumer → resource → default**.

```ts
import { createRateLimiter, ConfigurablePolicyResolver } from './src/index.js';

const limiter = createRateLimiter({
  policies: new ConfigurablePolicyResolver({
    default: { limit: 10, windowMs: 1000 },
    resources: { search: { limit: 5, windowMs: 1000 } },        // everyone, on /search
    consumers: { 'partner-acme': { limit: 100, windowMs: 1000 } }, // this consumer, everywhere
    overrides: { search: { 'partner-acme': { limit: 50, windowMs: 1000 } } },
  }),
});

await limiter.check({ consumerId: 'partner-acme', resource: 'search' }); // 50/s
```

Each resource/consumer pair is counted separately. Because `PolicyResolver` is an interface, rules can just as easily
come from a database, feature flags, or a pricing plan. Only the resolver changes.

## Extension (b): use in a highly available web application (design)

The in-memory store is per process. With several app instances behind a load balancer, each instance would allow
10/s, so N instances allow N × 10/s. The design for high availability:

1. **A shared store.** Add a `RedisStore` that implements the existing `RateLimitStore` / `RateLimitStrategy`
   interfaces. The public API is already async, so callers don't change.
2. **Atomic check-and-record in Redis.** Run the whole sliding-window step as one Lua script, so two instances can't
   both take the last slot:
   ```lua
   -- KEYS[1]=key  ARGV: limit, windowMs
   local t = redis.call('TIME'); local now = t[1] * 1000 + math.floor(t[2] / 1000)
   redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - ARGV[2])
   if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[1]) then
     redis.call('ZADD', KEYS[1], now, now .. '-' .. math.random())
     redis.call('PEXPIRE', KEYS[1], ARGV[2])
     return {1, 0}
   end
   local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')[2]
   return {0, oldest + ARGV[2] - now}
   ```
3. **One clock.** Use Redis `TIME` inside the script, so differences between app servers' clocks don't matter.
4. **Redis Cluster.** Keys hash by `{resource:consumer}` hash tags, so each key's script runs on a single shard.
5. **Failure policy.** Decide explicitly what happens when Redis is down or slow. **Fail-open** keeps serving users
   but drops the limit. **Fail-closed** protects the backend but causes an outage. A common middle ground is a short
   timeout followed by a fallback to a per-instance in-memory limiter with `limit / N`. A circuit breaker avoids
   hammering an unhealthy Redis.
6. **Replication.** With async replication, a failover can lose a few recent timestamps. For rate limiting that means
   a brief over-allowance, which is usually acceptable. Document it rather than paying for synchronous replication.
7. **Latency.** Each check is one round trip to Redis, about 0.1–1 ms in the same region. For very hot paths, a
   **local pre-check** can deny consumers that are clearly over the limit without asking Redis.
8. **Edge / gateway.** For coarse protection (for example per IP), enforce at the API gateway or CDN as well, and keep
   this library for fine-grained per-consumer business limits.

## Rate limiting vs concurrency limiting, and client retries

**[p-limit](https://github.com/sindresorhus/p-limit)** limits **concurrency**: how many promises are *in flight*
at once. This library limits **rate**: how many *start* within a time window. They solve different problems and work
well together. For example, `p-limit(3)` caps open connections while `withRateLimit` keeps you within an API's 10/s
quota:

```ts
import pLimit from 'p-limit';
const concurrency = pLimit(3);
const throttled = withRateLimit(limiter, { consumerId: 'my-service' }, callApi);
await Promise.all(ids.map((id) => concurrency(() => throttled(id))));
```

Ideas from **Python retry libraries** (`urllib3.Retry`, `tenacity`) are built into `acquire()`:

| Retry concept | Here |
|---|---|
| Respect `Retry-After` (`respect_retry_after_header=True`) | The server emits `Retry-After`. `acquire` waits the **exact** `retryAfterMs` instead of guessing with exponential backoff |
| `stop_after_delay` / `stop_after_attempt` | `maxWaitMs` / `maxAttempts`. `acquire` **fails fast** with `RateLimitTimeoutError` rather than sleeping and then failing |
| `wait_random` jitter | `jitterMs` adds 0..jitterMs **on top** of the exact wait, so many waiters don't all retry at the same moment, and never too early |
| Cancellation | `signal` (`AbortSignal`) cancels the wait immediately |

Clients in other languages can work with this server unchanged. For example, in Python:

```python
from urllib3.util import Retry
from requests.adapters import HTTPAdapter

retry = Retry(total=5, status_forcelist=[429], respect_retry_after_header=True, backoff_jitter=0.1)
session.mount("https://", HTTPAdapter(max_retries=retry))
```

## Project structure

```
src/
├── index.ts                     # public API
├── rateLimit.ts                 # default rateLimit() instance
├── domain/                      # RateLimiter, SystemClock, types
├── strategies/                  # SlidingWindowLogStrategy (Strategy pattern)
├── stores/                      # InMemoryStore (Adapter pattern)
├── policies/                    # ConfigurablePolicyResolver
├── factories/                   # createRateLimiter (Factory)
├── http/                        # IETF headers
├── client/                      # acquire, withRateLimit
├── errors/                      # RateLimitError hierarchy
├── config/                      # Zod-validated env config
└── testing/                     # FakeClock
docs/design/rate-limiter.md      # design note: use cases, responsibilities, class diagram
```

Engineering rules (SOLID, GoF, strict TypeScript, env config) are in [`CLAUDE.md`](./CLAUDE.md).

## License

[MIT](./LICENSE)
