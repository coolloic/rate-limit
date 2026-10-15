import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    RATE_LIMIT_ALGORITHM: z
      .enum(['fixed-window', 'sliding-window', 'token-bucket', 'leaky-bucket'])
      .default('fixed-window'),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

    RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('memory'),
    REDIS_URL: z.url().optional(),
  })
  .refine((env) => env.RATE_LIMIT_STORE !== 'redis' || env.REDIS_URL !== undefined, {
    error: 'REDIS_URL is required when RATE_LIMIT_STORE=redis',
    path: ['REDIS_URL'],
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Readonly<Record<string, string | undefined>>): Readonly<Env> {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return Object.freeze(parsed.data);
}

export const config: Readonly<Env> = parseEnv(process.env);
