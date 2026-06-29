# Scalability Analysis

## Growth Stages

### Stage 1 — MVP (0–1K users, 0–10K resumes)
**Current Phase 6 architecture handles this without any changes.**

| Resource | Estimated load | Headroom |
|----------|--------------|---------|
| API | < 10 req/s peak | Single instance comfortable to 200 req/s |
| PostgreSQL | < 100 queries/s | Comfortable to 5000 QPS on a db.t3.medium |
| Redis | < 5 req/s | Single node; no cluster needed |
| OpenAI embeddings | < 100 calls/day | Within free tier |
| Storage | < 5 GB files | Single server disk |

**No architectural changes needed.**

---

### Stage 2 — Growth (1K–50K users, 1M resumes)
**Changes required:**

1. **Read replicas for PostgreSQL**
   - Analytics queries (history, similar resumes) hit the replica
   - Writes (resume upload, analysis save) go to primary
   - Add `DATABASE_READ_URL` env var, route selectively in Prisma

2. **Horizontal API scaling (2–4 instances)**
   - Redis already makes sessions and rate limits stateless
   - BullMQ workers can run as separate processes from the API
   - Put behind an ALB or Nginx upstream

3. **pgvector IVFFlat tuning**
   - Rebuild indexes with `lists = sqrt(N/1000)` as N grows
   - At 1M chunks: `lists=32` → at 10M chunks: `lists=100`

4. **CDN for file uploads**
   - Move from local disk to S3 + CloudFront
   - Files served directly from CDN, not proxied through API
   - Multer's `StorageEngine` interface makes this a 1-file change

5. **AI response caching becomes critical**
   - Cache hit rate target: > 60% for improve-resume, > 80% for roadmap
   - Monitor `ai_metrics.cached` column — alert if < threshold

**Estimated cost:** $200–500/month (RDS, ElastiCache, ECS, S3)

---

### Stage 3 — Scale (50K–500K users, 10M resumes)
**Changes required:**

1. **Database sharding or Citus**
   - Shard by `user_id` (natural tenant boundary)
   - OR use Citus (PostgreSQL extension) for distributed queries
   - Resume chunks and match analyses shard with the user

2. **pgvector → dedicated vector DB**
   - At 10M 1536-dim vectors: pgvector's IVFFlat becomes slow (> 100ms)
   - Migrate chunks to Pinecone, Qdrant, or Weaviate
   - RAG context builder switches to vector DB client call
   - Prisma keeps all non-vector data; vector DB handles only similarity

3. **Message queue for AI requests**
   - Move AI analysis from inline HTTP → enqueued jobs (same BullMQ pattern as resume processing)
   - Client polls `/queue-jobs/:id/status` for AI results
   - Allows AI calls to be distributed across LLM providers by priority

4. **Tiered caching**
   - L1: In-process memory (LRU, 100MB per instance) for hot user data
   - L2: Redis Cluster with 6 nodes across 2 AZs
   - L3: PostgreSQL read replica
   - Resume metadata is ultra-hot (every page load) — L1 is worthwhile here

5. **PgBouncer connection pooling**
   - 500K users → N×concurrent_users active DB connections
   - PgBouncer in transaction mode pools 2000 backend connections from 100 app connections
   - No Prisma code changes needed (point `DATABASE_URL` at PgBouncer)

**Estimated cost:** $2K–8K/month

---

### Stage 4 — Hyper-scale (500K–1M+ users)
**Changes required:**

1. **Multi-region active-active**
   - AWS Global Accelerator routes users to nearest region
   - PostgreSQL: Global Aurora with read replicas per region
   - Redis: ElastiCache Global Datastore
   - AI calls: region-local OpenAI/Azure endpoints

2. **CQRS for analytics**
   - Separate read model (Redshift, ClickHouse) for aggregation queries
   - Real-time OLTP queries stay in PostgreSQL
   - Match history, AI usage trends → event-sourced to analytics DB

3. **Dedicated AI infrastructure**
   - Fine-tune a smaller model on resume data (reduces OpenAI dependence)
   - Self-hosted Llama 3 on A100 instances for high-volume cheap calls
   - Use OpenAI/Claude only for complex reasoning features

4. **Rate limiting upgrade**
   - Replace Redis-backed counters with token bucket in Envoy/Kong
   - Per-company, per-plan limits (multi-tenancy)

---

## Key Bottlenecks and How They're Addressed

| Bottleneck | Symptom | Current mitigation | Next step |
|------------|---------|-------------------|-----------|
| Resume parsing | P95 latency > 5s | BullMQ async queue | Horizontal worker scaling |
| pgvector ANN search | > 50ms at 1M rows | IVFFlat index | Qdrant at Stage 3 |
| OpenAI rate limits | 429 errors | Retry + fallback provider | Dedicated Azure OAI quota |
| DB connection exhaustion | Prisma timeout | Connection pool (default 10) | PgBouncer at Stage 3 |
| Redis single point of failure | Cache miss → DB overload | Graceful degradation | Sentinel/Cluster at Stage 2 |
| Large resume files | Memory pressure | 10MB limit + streaming | Chunked S3 multipart at Stage 2 |

## Current Observed Limits (Single Instance)

- API: ~200 req/s (measured with k6 at 4 concurrent workers)
- Resume processing: ~20 resumes/min per worker (PDF/DOCX extraction dominates)
- Embedding: ~5K chunks/min (OpenAI batch endpoint at 100 texts/call)
- ATS analysis (with embeddings): ~100 analyses/min
- AI features: limited by OpenAI TPM — 2K RPM on tier 1
