import pino from 'pino';
import { env } from '../config/env';

// Pino is chosen over Winston/Morgan for structured JSON logging and
// significantly lower overhead — important for high-throughput routes.
// In development, pino-pretty renders human-readable coloured output.
// In production, raw JSON is shipped to a log aggregator (Datadog, CloudWatch, etc.).
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'resume-analyzer' },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        }
      : undefined,
});
