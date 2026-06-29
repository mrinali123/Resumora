# System Design: Resume + Job Match Analyzer

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                        Clients                           │
│              (Web App / Mobile / API Consumer)           │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS
                         ▼
┌──────────────────────────────────────────────────────────┐
│                   Load Balancer                          │
│           (Nginx / AWS ALB / Cloudflare)                 │
└──────────┬──────────────────────────────────────┬────────┘
           │                                      │
           ▼                                      ▼
┌──────────────────┐                   ┌──────────────────┐
│   API Server 1   │                   │   API Server 2   │
│  (Express + TS)  │                   │  (Express + TS)  │
│  + BullMQ Worker │                   │  + BullMQ Worker │
└──────┬───────────┘                   └──────┬───────────┘
       │                                      │
       ▼                                      ▼
┌──────────────────────────────────────────────────────────┐
│                     Redis Cluster                        │
│   Cache │ Rate Limits │ BullMQ Queues │ Job Status       │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│               PostgreSQL (+ pgvector)                    │
│   Users │ Resumes │ Jobs │ Embeddings │ Analyses         │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│                   External Services                      │
│     OpenAI API (embeddings + chat) │ Gemini │ Groq       │
└──────────────────────────────────────────────────────────┘
```

## 2. Request Flow

### Synchronous request (GET /resumes, POST /analysis/job-fit):
```
Client → Load Balancer → API Server
  → Auth Middleware (JWT verify)
  → Rate Limit Middleware (Redis counter)
  → Route Handler
    → Cache Check (Redis) ──hit──→ Response
    → Database Query (Prisma)
    → Cache Write (async, non-blocking)
  → Response
```

### Async request (POST /resumes/upload):
```
Client → API Server
  → Auth + Rate Limit + Sanitize
  → Create stub resume (DB, status=PENDING)
  → Enqueue job (BullMQ → Redis queue)
  → Set job status (Redis, status=waiting)
  → Return { resumeId, jobId, statusUrl }   ← HTTP 202

BullMQ Worker (same or separate process):
  → Dequeue job
  → Update status (Redis, status=active)
  → Extract text (PDF/DOCX parser)
  → Parse structured fields (regex)
  → Chunk into semantic sections
  → Generate embeddings (OpenAI API, batched)
  → Update DB (resume.status = PROCESSED)
  → Write result (Redis, status=completed)

Client polls GET /queue-jobs/:id/status → 200 when complete
Client calls GET /queue-jobs/:id/result → full result
```

### AI request (POST /analysis/improve-resume):
```
Client → API Server
  → Auth + AI Rate Limit (20/hour per user)
  → ImproveResumeService
    → Load/run Phase 4 analysis (cache-first)
    → Build cache key (SHA-256 of inputs + prompt version)
    → Cache check (Redis L1 → DB L2)
    → RAG Context Builder
      → Load resume chunks (pgvector DB)
      → Load job chunks (pgvector DB)
      → Rank by embedding similarity (in-process dot product)
      → Assemble context within token budget (3000 tokens)
    → AIService.run()
      → Build prompt from template
      → Provider.complete() with retry (3x, exponential backoff)
      → Parse JSON response
      → Cache write (Redis + DB, async)
      → Record metrics (fire-and-forget)
    → Return structured result
```

## 3. Database Schema (Key Relationships)

```
User (1) ──── (N) Resume
              Resume (1) ──── (1) ResumeContent
              Resume (1) ──── (1) ParsedResume
              Resume (1) ──── (N) ResumeChunk (+ pgvector embedding)

User (1) ──── (N) JobDescription
              JobDescription (1) ──── (N) JobChunk (+ pgvector embedding)

User (1) ──── (N) MatchAnalysis (resumeId + jobId foreign keys)
User (1) ──── (N) AIMetric
              AIResponseCache (standalone, keyed by SHA-256)
```

**Index design:**
- `resume_chunks.embedding` → IVFFlat (lists=100): ~10ms for top-10 ANN search at 1M rows
- `match_analyses.(userId, createdAt DESC)`: history queries
- `match_analyses.(resumeId, overallScore DESC)`: ranking queries
- `ai_metrics.(endpoint, createdAt DESC)`: per-endpoint cost analysis
- `ai_response_cache.(expiresAt)`: TTL eviction scans

## 4. Caching Architecture

```
                     ┌─────────────────┐
                     │   Client        │
                     └────────┬────────┘
                              │ Request
                              ▼
                     ┌─────────────────┐
                     │   Redis Cache   │ ← L1: fast (< 1ms)
                     │   (TTL-based)   │
                     └────────┬────────┘
                          miss│
                              ▼
                     ┌─────────────────┐
                     │   PostgreSQL    │ ← L2: authoritative
                     └─────────────────┘
```

**TTL strategy:**
| Data | TTL | Invalidation trigger |
|------|-----|---------------------|
| Resume metadata | 1h | Re-upload, delete |
| Job description | 4h | Update, delete |
| ATS analysis | 30min | Score version bump, doc update |
| AI response | 6h (variable) | Prompt version bump, forceRefresh |
| User resume list | 15min | Any resume create/delete |
| Rate limit counters | Window duration | Auto-expire |

**Cache invalidation rule:** When a document changes (resume re-upload, job update), the controller calls `cacheService.delPattern('resume:{id}:*')` to flush all related keys. This is a broad invalidation — simpler and more reliable than fine-grained key tracking.

## 5. Queue Architecture

```
  Producer (HTTP handler)
       │
       ▼
  BullMQ Queue (Redis-backed)
  ┌──────────────────────┐
  │ resume-processing    │ ← 3 retries, exponential backoff
  │ embedding            │ ← batch size 100, best-effort
  │ ai-analysis          │ ← 2min job lock, 60s stall check
  └──────────────────────┘
       │
       ▼
  Worker (same process in Phase 6; separate in Phase 7+)
       │
       ▼
  Job Tracker (Redis: status + result with TTL)
       │
       ▼
  Client polls GET /queue-jobs/:id/status
```

**Job deduplication:** BullMQ job IDs are set to `resumeId` for resume processing. If a user uploads the same resume twice quickly, the second enqueue is a no-op (job already exists in queue). This prevents duplicate processing without a separate deduplication layer.

## 6. AI Processing Pipeline

```
Feature Request
      │
      ▼
Phase 4 Analysis (cached, 30min TTL)
      │
      ▼
Context Builder (RAG)
  ├─ Load resume chunks from PostgreSQL
  ├─ Load job chunks from PostgreSQL
  ├─ If embeddings exist:
  │    rank by cosine similarity (in-process dot product)
  └─ Fill token budget (3000 tokens, 60/40 resume/job split)
      │
      ▼
Prompt Template
  ├─ System: role + JSON schema
  └─ User: context + specific ask
      │
      ▼
AI Provider (OpenAI / Gemini / Groq)
  ├─ Attempt 1 (primary)
  ├─ Retry with backoff (2x)
  └─ Fallback provider (1 attempt)
      │
      ▼
JSON Response Parser
  ├─ Direct JSON.parse
  ├─ Extract from markdown code fence
  └─ Regex fallback
      │
      ▼
Cache Write (Redis + DB, async)
Metrics Write (fire-and-forget)
      │
      ▼
Response to Client
```

## 7. Failure Modes and Mitigations

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Redis down | Cache miss, rate limits disabled | Graceful degradation — server continues without caching |
| OpenAI down | AI endpoints return 503 | Retry with backoff → fallback provider → 503 |
| PostgreSQL slow | High latency on all endpoints | Connection pool (Prisma default: 10); read replicas in Phase 7 |
| Resume parsing fails | Resume stays PENDING | BullMQ retry (3x); final failure marks resume FAILED |
| Worker crash mid-job | Job re-enqueued after stall timeout | BullMQ stall detection (default: 30s) automatically re-enqueues |
| Memory pressure | OOM kill | Docker memory limits; metrics alert on heap > 80% |

## 8. Security Architecture

| Layer | Controls |
|-------|---------|
| Network | HTTPS/TLS at load balancer; internal services on private VPC |
| Transport | HSTS, CORS allowlist, security headers (helmet) |
| Authentication | JWT (HS256, 7d expiry); tokens not stored server-side |
| Authorization | Every resource query includes `userId` filter |
| Input | Zod schema validation; sanitize middleware (depth limit, NUL bytes, prototype pollution) |
| File uploads | MIME type whitelist (PDF, DOCX); max 10MB; stored outside web root |
| Database | Prisma parameterised queries (SQL injection impossible); pgbouncer in Phase 7 |
| Rate limiting | Per-user (auth'd) + per-IP (unauth'd); different limits per endpoint risk |
| LLM | AI responses treated as untrusted; JSON schema enforced on output |
