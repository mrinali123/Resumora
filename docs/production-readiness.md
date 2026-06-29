# Production Readiness Review

## Summary

| Category | Status | Notes |
|----------|--------|-------|
| Core API | ✅ Ready | All endpoints implemented, validated, and typed |
| Authentication | ✅ Ready | JWT with configurable expiry; bcrypt with configurable rounds |
| Input validation | ✅ Ready | Zod schemas on every route; sanitize middleware |
| Rate limiting | ✅ Ready | 4 limiters; Redis-backed with in-memory fallback |
| Error handling | ✅ Ready | AppError hierarchy; structured error responses |
| Logging | ✅ Ready | Pino structured JSON; request IDs; silent in tests |
| Health checks | ✅ Ready | /health (liveness) + /health/deep (readiness) |
| Background jobs | ✅ Ready | BullMQ queues; 3-retry with backoff; graceful shutdown |
| Caching | ✅ Ready | Redis L1 + DB L2 for AI; Redis for general; TTL strategy |
| Security headers | ✅ Ready | Helmet with explicit CSP; HSTS in production |
| CORS | ✅ Ready | Allowlist via env (comma-separated) |
| API documentation | ✅ Ready | OpenAPI 3.0 spec; Swagger UI at /api/docs |
| TypeScript | ✅ Ready | 0 errors in strict mode |
| Tests | ✅ Ready | Unit + integration test suites; Jest config |
| Docker | ✅ Ready | Multi-stage build; non-root user; healthcheck |
| docker-compose | ✅ Ready | Includes Redis service; volume mounts |
| CI/CD | ✅ Ready | GitHub Actions: type-check → unit → integration → build → Docker |
| Database indexes | ✅ Ready | Composite indexes on all query patterns |
| AI observability | ✅ Ready | ai_metrics table; latency/token/cache tracking |
| Graceful shutdown | ✅ Ready | SIGTERM closes queues, DB, Redis in order |

---

## Pre-deployment Checklist

### Environment
- [ ] `JWT_SECRET` is a cryptographically random 64-char string
- [ ] `DATABASE_URL` points to production PostgreSQL (not `localhost`)
- [ ] `REDIS_URL` points to production Redis (ElastiCache, Upstash, or self-hosted)
- [ ] `NODE_ENV=production` (enables HSTS, disables Swagger UI if desired)
- [ ] `CORS_ORIGIN` is set to your frontend domain(s), not `*`
- [ ] `BCRYPT_ROUNDS=12` (do not lower below 10 in production)
- [ ] AI provider keys set (`OPENAI_API_KEY`, optionally `GROQ_API_KEY`)
- [ ] `LOG_LEVEL=info` (not `debug` in production — logs are verbose)

### Database
- [ ] `prisma migrate deploy` run against production DB (not `migrate dev`)
- [ ] `00_enable_pgvector.sql` applied (enables the `vector` extension)
- [ ] `01_vector_indexes.sql` applied (IVFFlat indexes)
- [ ] Connection pool configured appropriately for your PostgreSQL plan

### Security
- [ ] File upload directory (`UPLOAD_DIR`) is outside the web root
- [ ] HTTPS/TLS terminated at load balancer (not at Node.js)
- [ ] Security headers verified with https://securityheaders.com
- [ ] Rate limits tested — confirm 429 responses fire at the right threshold
- [ ] Prototype pollution blocked — verify `__proto__` key is stripped in sanitize middleware

### Observability
- [ ] Log aggregation configured (CloudWatch, Datadog, Loki)
- [ ] Alerting on: P95 latency > 2s, error rate > 1%, queue depth > 1000
- [ ] `GET /health/deep` wired to load balancer health check
- [ ] `GET /metrics` (or Prometheus scrape) wired to monitoring dashboard

### AI Cost Controls
- [ ] `AI_MAX_RESPONSE_TOKENS` set appropriately (default 1500)
- [ ] `RATE_LIMIT_AI_MAX` configured per your budget (default 20/hour/user)
- [ ] Monitor `ai_metrics` table weekly for cost spikes
- [ ] AI response cache TTLs configured — longer TTL = lower cost

---

## Known Limitations

1. **File storage on local disk** — works for a single server; does not work with horizontal scaling. Move to S3 before adding a second API instance.

2. **pgvector IVFFlat requires manual reindexing** — when row count grows significantly (10x), run `REINDEX INDEX CONCURRENTLY` on embedding indexes. Operator downtime: 0 (CONCURRENTLY option).

3. **BullMQ workers share the API process** — at high job volumes, worker CPU can starve HTTP request handling. Move workers to a dedicated `worker.ts` entrypoint before Stage 2.

4. **No distributed tracing** — request IDs propagate through logs but are not connected across service calls (e.g., API → OpenAI). Add OpenTelemetry before Stage 2.

5. **JWT tokens cannot be revoked** — tokens are valid until expiry even after logout. Implement a Redis blocklist for high-security deployments.

6. **AI prompt injection risk** — user-provided text (resume content, job descriptions) is embedded in LLM prompts. The system prompt includes a JSON schema constraint which limits scope, but does not fully prevent adversarial inputs.

---

## Performance Benchmarks (Target SLOs)

| Endpoint | P50 | P95 | P99 |
|----------|-----|-----|-----|
| POST /auth/login | < 150ms | < 300ms | < 500ms |
| GET /resumes | < 50ms | < 100ms | < 200ms |
| POST /analysis/job-fit (cached) | < 30ms | < 80ms | < 150ms |
| POST /analysis/job-fit (cold) | < 500ms | < 1500ms | < 3000ms |
| POST /analysis/improve-resume (cached) | < 50ms | < 100ms | < 200ms |
| POST /analysis/improve-resume (cold) | < 3s | < 8s | < 15s |
| POST /resumes/upload (async) | < 200ms | < 400ms | < 800ms |

Cold AI calls depend on OpenAI API latency (P95 ≈ 3s for GPT-4o-mini in practice).

---

## Runbook: Common Incidents

### Redis down
- **Symptoms:** No caching; in-memory rate limits; slower API (DB hit every request)
- **API impact:** Graceful degradation — server continues serving requests
- **Recovery:** Restart Redis; cache warms automatically over next few minutes
- **Prevention:** Redis Sentinel or Cluster with automatic failover

### OpenAI rate limited (429)
- **Symptoms:** AI endpoints return 503 after retry exhaustion
- **API impact:** Only AI features affected; ATS scoring and retrieval unaffected
- **Recovery:** Wait for rate limit window (usually 60s); or switch `AI_PRIMARY_PROVIDER` to `groq`
- **Prevention:** Set `AI_FALLBACK_PROVIDER=groq` in env

### PostgreSQL connection exhaustion
- **Symptoms:** `P2024` Prisma error; all endpoints return 500
- **Recovery:** Restart API instances to release connections; check for long-running queries
- **Prevention:** Install PgBouncer; set `connection_limit` in `DATABASE_URL`

### Resume stuck in PENDING
- **Symptoms:** Resume was uploaded but never becomes PROCESSED
- **Diagnosis:** Check `SELECT * FROM resumes WHERE status = 'PENDING' AND created_at < NOW() - INTERVAL '10 minutes'`
- **Recovery:** Re-enqueue job via admin endpoint (future work); or manually trigger `processExistingResume`
- **Root cause:** Worker crash, Redis outage, or OpenAI timeout during embedding

### Large queue backlog
- **Symptoms:** `GET /health/metrics` shows `queue.depth > 1000`
- **Recovery:** Scale up workers (increase `QUEUE_CONCURRENCY` or add instances)
- **Prevention:** Alert at queue depth > 500; auto-scale based on queue depth metric
