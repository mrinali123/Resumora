# Phase 5 — AI Intelligence Layer Architecture

## Overview

Phase 5 wraps the Phase 4 ATS scoring engine with a Retrieval-Augmented Generation (RAG) layer that transforms raw analysis data into actionable career guidance. Six LLM-powered features share one provider abstraction, one prompt system, one cache, and one metrics store.

**Design principles:**
1. **RAG-first**: Never send a full resume or full JD to the LLM. Retrieve only the most relevant chunks.
2. **Provider-agnostic**: One interface, three implementations. Swap providers by changing one env var.
3. **Fail cheap**: Cache hits cost $0. Retries protect against transient failures. Fallback protects against outages.
4. **Measure everything**: Every LLM call records latency, token counts, provider, and success status.
5. **Cache aggressively**: Identical inputs produce identical outputs. Most use cases hit cache on second run.

---

## Directory Structure

```
src/
├── ai/
│   ├── providers/
│   │   ├── types.ts            ← AIProvider interface (AIMessage, CompletionResult)
│   │   ├── openai.provider.ts  ← OpenAI gpt-4o-mini (via openai SDK)
│   │   ├── groq.provider.ts    ← Groq llama-3.3-70b (OpenAI-compatible endpoint)
│   │   ├── gemini.provider.ts  ← Google Gemini 1.5 Flash (native fetch)
│   │   └── index.ts            ← getPrimaryProvider() / getFallbackProvider()
│   ├── prompts/
│   │   ├── types.ts            ← PromptTemplate<TContext> interface
│   │   ├── registry.ts         ← Central export + uniqueness validation
│   │   └── templates/
│   │       ├── improve-resume.prompt.ts
│   │       ├── roadmap.prompt.ts
│   │       ├── interview-prep.prompt.ts
│   │       ├── rewrite-bullets.prompt.ts
│   │       ├── career-coach.prompt.ts
│   │       └── learning-plan.prompt.ts
│   ├── context/
│   │   └── context-builder.ts  ← RAG chunk retrieval + ranking + assembly
│   ├── cache/
│   │   └── response-cache.ts   ← DB-backed cache (SHA-256 keyed, TTL enforced)
│   ├── metrics/
│   │   └── ai-metrics.service.ts ← Latency + token usage tracking
│   └── ai.service.ts           ← Orchestrator: cache → provider → retry → parse → write
├── analysis/
│   ├── improve-resume.service.ts
│   ├── roadmap.service.ts
│   ├── interview-prep.service.ts
│   ├── rewrite-bullets.service.ts
│   ├── career-coach.service.ts
│   └── learning-plan.service.ts
```

---

## RAG Pipeline (Context Builder)

The context builder is what makes this a RAG system rather than a naive "send the whole resume" approach.

### When embeddings are available (happy path)

```
Resume chunks (DB)   →  score each chunk vs job requirement embeddings
                          via cosine similarity (dot product on unit vectors)
                     →  sort by relevance descending
                     →  fill token budget (default: 60% of 3000 tokens)

Job chunks (DB)      →  load by type priority
                     →  fill remaining budget (40%)

Final context        →  [EXPERIENCE]\n{content}\n\n[SKILLS]\n{content}...
```

### When embeddings are unavailable (fallback)

Chunks are loaded by type priority order:
- **Resume**: SUMMARY → SKILLS → EXPERIENCE → PROJECT → CERTIFICATIONS → EDUCATION → HEADER
- **Job**: REQUIREMENTS → RESPONSIBILITIES → QUALIFICATIONS → FULL → ABOUT_COMPANY → GENERAL

### Token budget enforcement

```
Total budget: AI_CONTEXT_TOKEN_BUDGET (default 3000 tokens)
Estimation:   Math.ceil(content.length / 4)  — 1 token ≈ 4 chars (conservative)
Split:        60% resume / 40% job (configurable per feature)
```

Each feature service passes different `resumeChunkTypes` and `jobChunkTypes` to the context builder, so the LLM receives only what it actually needs:

| Feature | Resume chunks | Job chunks |
|---------|--------------|------------|
| Improve Resume | SUMMARY, SKILLS, EXPERIENCE, PROJECT | REQUIREMENTS, RESPONSIBILITIES, QUALIFICATIONS |
| Roadmap | SKILLS | REQUIREMENTS, QUALIFICATIONS |
| Interview Prep | SUMMARY, SKILLS, EXPERIENCE, PROJECT | REQUIREMENTS, RESPONSIBILITIES |
| Rewrite Bullets | (none — bullets provided directly) | REQUIREMENTS, RESPONSIBILITIES |
| Career Coach | SUMMARY, SKILLS, EXPERIENCE, PROJECT, EDUCATION | REQUIREMENTS, RESPONSIBILITIES, QUALIFICATIONS |
| Learning Plan | (none — uses gap analysis data) | (none) |

---

## Provider Abstraction

```typescript
interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;
  complete(messages: AIMessage[], options?: CompletionOptions): Promise<CompletionResult>;
}
```

All three implementations translate between this interface and their vendor APIs:

| Provider | Transport | JSON mode | Token counting |
|----------|-----------|-----------|----------------|
| OpenAI | openai SDK | `response_format: {type: 'json_object'}` | API response |
| Groq | openai SDK + custom baseURL | `response_format: {type: 'json_object'}` | API response |
| Gemini | native `fetch` | `responseMimeType: 'application/json'` | usageMetadata |

**Adding a new provider:** Create `src/ai/providers/myprovider.provider.ts` implementing `AIProvider`, add a case in `providers/index.ts`, add the provider name to `env.ts` enum. Nothing else changes.

---

## Prompt Management

Each prompt is a `PromptTemplate<TContext>` with:

```typescript
{
  name: string;           // unique ID (duplicate = startup error)
  version: string;        // '1.0', '1.1', etc.
  description: string;
  cacheTtlSeconds: number;
  estimatedOutputTokens: number;
  build(context: TContext): AIMessage[];
}
```

**Why versioning matters:** The cache key includes `promptVersion`. When you change a prompt (fix a bug, improve instructions), bump the version. Old cached responses are automatically bypassed — no cache flush needed.

### Prompt design principles

- **System prompt = role + format contract**: Tell the model who it is and give it the exact JSON schema.
- **User prompt = context + specific ask**: Inject retrieved chunks + structured inputs.
- **Never ask for URLs**: Prompts say "describe a type of resource" to avoid hallucinated links.
- **JSON schemas in system prompt**: Every prompt specifies the exact output shape. The `ai.service.ts` parses and falls back gracefully if the model wraps in markdown.

---

## Request Lifecycle

```
POST /api/v1/analysis/improve-resume
            │
            ▼
  Feature service (improve-resume.service.ts)
    1. Ownership check (Prisma)
    2. Get/run Phase 4 analysis (cache-first via matchingService)
    3. Build RAG context (contextBuilder.build)
    │
    ▼
  AIService.run()
    4. Build cache key (SHA-256 of {endpoint, promptVersion, resumeId, jobId, analysisId})
    5. Cache hit? → return immediately (0 LLM cost)
    6. Build messages (template.build(context))
    7. Retry loop (3 attempts, 1s/2s/4s backoff)
       └── Primary provider.complete(messages)
             fail → Fallback provider (if configured)
    8. Parse JSON (direct → code fence → regex)
    9. Cache write (async, non-blocking)
   10. Metrics write (fire-and-forget)
   11. Return to client
```

---

## Cost Optimization

### Cache hit rates (expected after warm-up)

Most users run the same analysis multiple times (checking the same resume against the same job). Cache TTLs by feature:

| Feature | TTL | Rationale |
|---------|-----|-----------|
| Improve Resume | 6 hours | Analysis might change if resume is re-uploaded |
| Roadmap | 24 hours | Skill priorities change slowly |
| Interview Prep | 12 hours | Stable per resume+job pair |
| Rewrite Bullets | 1 hour | Highly input-specific; users iterate |
| Career Coach | 6 hours | Stable per analysis snapshot |
| Learning Plan | 24 hours | Stable per gap analysis |

### Model selection

`gpt-4o-mini` is the default: ~10x cheaper than `gpt-4o`, sufficient quality for career advice. Switch to `gpt-4o` for higher-stakes prompts by setting `OPENAI_CHAT_MODEL=gpt-4o`.

Groq with `llama-3.3-70b-versatile` is ~5-10x cheaper than OpenAI and faster (lower TTFT). Use as fallback for cost efficiency.

### Token budget design

```
Total input budget:    ~3500 tokens (3000 context + ~500 system prompt)
Max response tokens:  1500 tokens
gpt-4o-mini cost:     $0.15/1M input, $0.60/1M output
Estimated per call:   ~$0.001–0.002 (before cache)
```

At 70% cache hit rate: effective cost drops to ~$0.0003–0.0006 per user request.

---

## Observability

All LLM calls are recorded in `ai_metrics` (PostgreSQL):

```sql
SELECT endpoint, 
       AVG(latency_ms) AS avg_latency,
       SUM(total_tokens) AS tokens_used,
       COUNT(*) FILTER (WHERE cached) AS cache_hits,
       COUNT(*) AS total_calls
FROM ai_metrics
WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
GROUP BY endpoint
ORDER BY tokens_used DESC;
```

Exposed via `GET /api/v1/analysis/ai-metrics?days=7`.

**Phase 6:** Stream rows to Prometheus push gateway → Grafana dashboard. Partition `ai_metrics` by month for cheap time-series aggregation.

---

## Retry & Fallback

```
Primary provider
  │  Attempt 1
  │  fail (5xx / timeout) → sleep 1s
  │  Attempt 2
  │  fail (5xx / timeout) → sleep 2s
  │  Attempt 3
  │  fail (5xx / timeout) → sleep 4s
  │  exhausted
  └─→ Fallback provider (1 attempt, no retry)
        fail → 503 "AI request failed on both providers"
```

4xx errors (bad request, auth) skip the retry loop — they indicate a configuration error, not a transient failure.

---

## Phase 6 Preparation

The Phase 5 architecture is designed so these Phase 6 changes are minimal:

| Concern | Phase 5 | Phase 6 upgrade |
|---------|---------|-----------------|
| Response cache | PostgreSQL + TTL check | Redis + TTL auto-expiry — change `response-cache.ts` only |
| Background analysis | Inline on request | BullMQ worker — change feature service `analyze()` call only |
| Metrics storage | PostgreSQL append | TimescaleDB / Prometheus push — change `ai-metrics.service.ts` only |
| Bulk operations | Sequential | Parallel workers — no interface changes |

---

## API Reference

All endpoints require `Authorization: Bearer <JWT>`.

### POST /api/v1/analysis/improve-resume
```json
{ "resumeId": "uuid", "jobId": "uuid", "forceRefresh": false }
```
Returns: `{ suggestions[], overallAssessment, quickWins[], atsKeywordsToAdd[], cached }`

### POST /api/v1/analysis/roadmap
```json
{ "resumeId": "uuid", "jobId": "uuid", "weeklyHoursAvailable": 10 }
```
Returns: `{ roadmap[], suggestedSequence[], estimatedTotalWeeks, cached }`

### POST /api/v1/analysis/interview-prep
```json
{ "resumeId": "uuid", "jobId": "uuid", "focusAreas": ["technical", "behavioral"] }
```
Returns: `{ technical[], project[], behavioral[], gapProbes[], cached }`

### POST /api/v1/analysis/rewrite-bullets
```json
{ "bullets": ["..."], "jobId": "optional-uuid", "targetRole": "optional" }
```
Returns: `{ rewritten[{original, improved, improvements[]}], generalAdvice, cached }`

### POST /api/v1/analysis/career-coach
```json
{ "resumeId": "uuid", "jobId": "uuid" }
```
Returns: `{ headline, strengths[], weaknesses[], immediateActions[], shortTermGoals[], longTermVision, cached }`

### POST /api/v1/analysis/learning-plan
```json
{ "resumeId": "uuid", "jobId": "uuid", "weeklyHoursAvailable": 10 }
```
Returns: `{ weeklyPlan[], monthlyMilestones[], progressionPath[], studyTips[], cached }`

### GET /api/v1/analysis/ai-metrics?days=7
Returns token usage, latency, cache hit rate, and per-endpoint breakdown.
