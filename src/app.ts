import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import {
  requestContextMiddleware,
  requestMetricsMiddleware,
} from './middleware/request-context.middleware';
import { sanitizeMiddleware } from './middleware/sanitize.middleware';
import { apiRateLimit } from './middleware/rate-limit.middleware';
import { openApiSpec } from './docs/openapi.spec';
import healthRoutes from './routes/health.routes';
import apiRoutes from './routes';

const app = express();

// Tell Express to trust the first proxy hop so req.ip reflects the real
// client IP from X-Forwarded-For (required behind Nginx / ALB / Heroku).
// Without this, all requests appear from the proxy's IP and IP-based rate
// limiting (auth brute-force protection) shares one bucket for every user.
app.set('trust proxy', 1);

// ─── Security Headers ─────────────────────────────────────────────────────────
// helmet sets 14+ security-relevant headers (CSP, HSTS, X-Frame-Options, etc.)
// Configured explicitly so each header's policy is documented and deliberate.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // swagger-ui needs inline styles/scripts
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
      },
    },
    // HSTS: tell browsers to always use HTTPS (31536000s = 1 year)
    hsts: env.NODE_ENV === 'production'
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    // Prevent clickjacking
    frameguard: { action: 'deny' },
    // Don't reveal Express
    hidePoweredBy: true,
  }),
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// credentials:true is incompatible with a literal Access-Control-Allow-Origin: *
// (browsers reject the combination per the CORS spec).
// When CORS_ORIGIN=* we reflect the requesting origin instead, which satisfies
// both the spec and browsers while still allowing any origin in development.
// In production set CORS_ORIGIN to your exact frontend domain(s).
const allowedOrigins =
  env.CORS_ORIGIN === '*'
    ? null // null means "reflect any origin"
    : env.CORS_ORIGIN.split(',').map((o) => o.trim());

app.use(
  cors({
    origin: (requestOrigin, callback) => {
      // Non-browser requests (curl, server-to-server) have no Origin header.
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins === null) {
        // Dev / wildcard: reflect the exact requesting origin so
        // Access-Control-Allow-Origin is never the literal '*'.
        callback(null, requestOrigin);
        return;
      }
      if (allowedOrigins.includes(requestOrigin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${requestOrigin} not allowed by CORS policy`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining'],
    maxAge: 86400, // preflight cache (24h)
  }),
);

// ─── Request Context ──────────────────────────────────────────────────────────
// Must come before logging so request ID is available in log fields.
app.use(requestContextMiddleware);

// ─── Request Logging ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      'Request completed',
    );
  });
  next();
});

// ─── Metrics ──────────────────────────────────────────────────────────────────
app.use(requestMetricsMiddleware);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
// 10mb limit for API calls; file uploads use multipart (multer), not JSON.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Input Sanitization ───────────────────────────────────────────────────────
// Runs after body parsing, before routes.
app.use(sanitizeMiddleware);

// ─── Global Rate Limiting ─────────────────────────────────────────────────────
// Per-route overrides (auth, AI) are applied in their respective routers.
app.use('/api/', apiRateLimit);

// ─── API Documentation ────────────────────────────────────────────────────────
// Served at /api/docs (disabled in test environment to keep tests clean)
if (env.NODE_ENV === 'development') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Resume Analyzer API',
    swaggerOptions: { persistAuthorization: true },
  }));
}

// ─── Health Routes ────────────────────────────────────────────────────────────
// Exposed at /health (not under /api/v1) for load balancer compatibility.
app.use('/health', healthRoutes);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1', apiRoutes);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
