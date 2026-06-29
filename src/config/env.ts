import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Validate all environment variables at startup.
// The process exits immediately with a clear error if anything is missing or malformed —
// better to crash before serving traffic than to fail silently on the first real request.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10)),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z
    .string()
    .default('12')
    .transform((v) => parseInt(v, 10)),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),
  CORS_ORIGIN: z.string().default('*'),
  // Validated below after parsing — cannot use .refine() because NODE_ENV
  // is in the same schema and isn't available during field-level validation.

  // ─── File Upload (Phase 2) ─────────────────────────────────────────────────
  // UPLOAD_DIR: local disk path for stored resume files.
  // Phase 3: replace with S3_BUCKET + S3_REGION for cloud storage.
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_FILE_SIZE_MB: z
    .string()
    .default('10')
    .transform((v) => parseInt(v, 10)),

  // ─── Embeddings (Phase 3) ──────────────────────────────────────────────────
  // Omitting OPENAI_API_KEY disables embedding generation; the pipeline still
  // runs (chunking succeeds) but chunks have no vectors and search returns 503.
  OPENAI_API_KEY: z.string().optional(),
  // text-embedding-3-small: 1536 dims, $0.02/1M tokens — default and recommended.
  // text-embedding-3-large: 3072 dims, higher quality, higher cost.
  // If you change the model you must also change the vector column dimension
  // in schema.prisma and run a migration to recreate the column.
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z
    .string()
    .default('1536')
    .transform((v) => parseInt(v, 10)),
  EMBEDDING_BATCH_SIZE: z
    .string()
    .default('100')
    .transform((v) => parseInt(v, 10)),

  // ─── Search (Phase 3) ──────────────────────────────────────────────────────
  SEARCH_TOP_K: z
    .string()
    .default('10')
    .transform((v) => parseInt(v, 10)),
  SEARCH_MIN_SIMILARITY: z
    .string()
    .default('0.5')
    .transform((v) => parseFloat(v)),

  // ─── AI / LLM (Phase 5) ────────────────────────────────────────────────────
  // Primary AI provider: 'openai' | 'gemini' | 'groq'
  // The provider must have its API key set below or all AI endpoints return 503.
  AI_PRIMARY_PROVIDER: z.enum(['openai', 'gemini', 'groq']).default('openai'),
  // Optional fallback tried once if the primary fails all retries.
  AI_FALLBACK_PROVIDER: z.enum(['openai', 'gemini', 'groq']).optional(),

  // OpenAI chat model (separate from EMBEDDING_MODEL)
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),

  // Google Gemini
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),

  // Groq (uses OpenAI-compatible API)
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),

  // LLM call settings
  AI_MAX_RETRIES: z
    .string()
    .default('3')
    .transform((v) => parseInt(v, 10)),
  AI_RETRY_BASE_DELAY_MS: z
    .string()
    .default('1000')
    .transform((v) => parseInt(v, 10)),
  // Max tokens for generated responses
  AI_MAX_RESPONSE_TOKENS: z
    .string()
    .default('1500')
    .transform((v) => parseInt(v, 10)),
  // Token budget for retrieved context passed to LLM (not counting system prompt)
  AI_CONTEXT_TOKEN_BUDGET: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10)),

  // Phase 5: DB-backed response cache TTL in seconds (default 6 hours)
  AI_CACHE_TTL_SECONDS: z
    .string()
    .default('21600')
    .transform((v) => parseInt(v, 10)),

  // ─── Redis (Phase 6) ──────────────────────────────────────────────────────
  // Required for: response caching, rate limiting, BullMQ queues, job status
  // If unset, caching and queuing degrade gracefully (sync fallback).
  REDIS_URL: z.string().optional(),
  // Max retry attempts per Redis command before throwing (0 = no limit)
  REDIS_MAX_RETRIES: z
    .string()
    .default('3')
    .transform((v) => parseInt(v, 10)),
  // Connection timeout in ms
  REDIS_CONNECT_TIMEOUT: z
    .string()
    .default('5000')
    .transform((v) => parseInt(v, 10)),

  // ─── Cache TTLs (seconds) ──────────────────────────────────────────────────
  CACHE_TTL_RESUME: z.string().default('3600').transform((v) => parseInt(v, 10)),     // 1h
  CACHE_TTL_JOB: z.string().default('14400').transform((v) => parseInt(v, 10)),       // 4h
  CACHE_TTL_ANALYSIS: z.string().default('1800').transform((v) => parseInt(v, 10)),   // 30m

  // ─── BullMQ / Job Queue (Phase 6) ─────────────────────────────────────────
  // Number of jobs processed concurrently per worker instance
  QUEUE_CONCURRENCY: z
    .string()
    .default('5')
    .transform((v) => parseInt(v, 10)),
  // How long a completed job stays in the queue before removal (ms)
  QUEUE_REMOVE_ON_COMPLETE_AGE: z
    .string()
    .default('86400000') // 24h
    .transform((v) => parseInt(v, 10)),
  QUEUE_REMOVE_ON_FAIL_AGE: z
    .string()
    .default('604800000') // 7d — keep failed jobs for post-mortem analysis
    .transform((v) => parseInt(v, 10)),
  // Job status TTL in Redis (seconds)
  JOB_STATUS_TTL: z
    .string()
    .default('86400') // 24h
    .transform((v) => parseInt(v, 10)),

  // ─── Rate Limiting (Phase 6) ───────────────────────────────────────────────
  RATE_LIMIT_AUTH_MAX: z.string().default('10').transform((v) => parseInt(v, 10)),
  RATE_LIMIT_AUTH_WINDOW_MIN: z.string().default('15').transform((v) => parseInt(v, 10)),
  RATE_LIMIT_AI_MAX: z.string().default('20').transform((v) => parseInt(v, 10)),
  RATE_LIMIT_AI_WINDOW_MIN: z.string().default('60').transform((v) => parseInt(v, 10)),
  RATE_LIMIT_API_MAX: z.string().default('100').transform((v) => parseInt(v, 10)),
  RATE_LIMIT_API_WINDOW_MIN: z.string().default('1').transform((v) => parseInt(v, 10)),

  // ─── Email / Password Reset ───────────────────────────────────────────────
  // All optional. When absent, reset URLs are logged to the console (dev mode).
  APP_URL: z.string().optional(),          // e.g. https://resumora.app
  SMTP_HOST: z.string().optional(),        // e.g. smtp.sendgrid.net
  SMTP_PORT: z.string().default('587').transform((v) => parseInt(v, 10)),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),        // e.g. "Resumora" <noreply@resumora.app>

  // Phase 7+
  // S3_BUCKET: z.string().optional(),
  // S3_REGION: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    '❌ Invalid environment variables:\n',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.CORS_ORIGIN === '*') {
  console.error(
    '❌ CORS_ORIGIN must be set to your frontend origin in production (e.g. https://yourdomain.com). ' +
      'Wildcard "*" is not safe with credentials: true.',
  );
  process.exit(1);
}

// In production the password-reset feature requires real SMTP — the Ethereal
// development fallback sends to a test sandbox nobody can access.
if (parsed.data.NODE_ENV === 'production') {
  const missingSmtp: string[] = [];
  if (!parsed.data.SMTP_HOST) missingSmtp.push('SMTP_HOST');
  if (!parsed.data.SMTP_USER) missingSmtp.push('SMTP_USER');
  if (!parsed.data.SMTP_PASS) missingSmtp.push('SMTP_PASS');
  if (!parsed.data.APP_URL)   missingSmtp.push('APP_URL');

  if (missingSmtp.length > 0) {
    console.error(
      `❌ Missing required environment variables for production email delivery: ${missingSmtp.join(', ')}.\n` +
      '   Password reset emails cannot be delivered without a configured SMTP provider.\n' +
      '   Set these variables or the server will refuse to start.',
    );
    process.exit(1);
  }
}

export const env = parsed.data;
export type Env = typeof env;
