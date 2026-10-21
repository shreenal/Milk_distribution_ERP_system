import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().uri().required(),

  DB_POOL_MAX: Joi.number().default(10),
  DB_CONNECTION_TIMEOUT_MS: Joi.number().default(5000),
  DB_IDLE_TIMEOUT_MS: Joi.number().default(30000),
  DB_STATEMENT_TIMEOUT_MS: Joi.number().default(15000),

  SECRET: Joi.string().required(),
  ACCESS_TOKEN_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().default(7),
  TRUST_PROXY_HOPS: Joi.number().default(1),
  CORS_ORIGINS: Joi.string().required(),

  // Refresh-token cookie. Same-site setups (e.g. localhost:5173 -> localhost:3000, or
  // app.example.com -> api.example.com) use lax. Unrelated domains need none (forces Secure).
  REFRESH_COOKIE_SAMESITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),
  REFRESH_COOKIE_SECURE: Joi.boolean().default(
    Joi.ref('NODE_ENV', { adjust: (v: string) => v === 'production' }),
  ),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_TLS: Joi.boolean().default(false),
});
