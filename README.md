# Resume + Job Match Analyzer — API

Production-grade REST API · **Node.js · TypeScript · Express · PostgreSQL · pgvector · Prisma · JWT · Docker**

---

## Architecture

```
src/
├── config/          # Env validation (Zod), Prisma client, multer upload config
├── controllers/     # HTTP layer — parse request, call service, send response
├── middleware/      # validate (Zod), protect (JWT), errorHandler, multer wrapper
├── parsers/         # Text extraction (PDF/DOCX) + structured resume parsing
│   ├── types.ts             # Shared interfaces: ParsedResumeData, Education, Experience…
│   ├── text-extractor.ts    # pdf-parse + mammoth
│   └── resume.parser.ts     # Regex-based section splitter + field extractor
├── chunkers/        # Phase 3 — semantic chunking for RAG retrieval
│   ├── types.ts             # Chunk, ChunkType, ChunkMetadata
│   ├── resume.chunker.ts    # Section-based chunker (1 chunk per job entry/school/project)
│   └── job.chunker.ts       # Pattern + sliding-window hybrid chunker
├── embeddings/      # Phase 3 — provider-agnostic embedding generation
│   ├── types.ts             # EmbeddingProvider interface
│   ├── providers/
│   │   └── openai.provider.ts    # text-embedding-3-small implementation
│   ├── embedding.service.ts      # Batching, progress callbacks
│   └── index.ts             # Singleton factory — returns null if no API key
├── retrieval/       # Phase 3 — pgvector similarity search
│   ├── types.ts             # SearchQuery, SearchResult, SimilarResume
│   └── retrieval.service.ts # Vector search + similar-resume discovery
├── routes/          # Express routers, one file per domain
├── services/
│   ├── auth.service.ts           # Register / login business logic
│   ├── resume.service.ts         # CRUD + findDetails
│   ├── resume-upload.service.ts  # Upload → extract → parse → chunk → embed pipeline
│   ├── job.service.ts            # Job description CRUD + chunk + embed
│   └── file-storage.service.ts   # File I/O abstraction (local → S3 in Phase 4)
├── validators/      # Zod schemas shared between middleware and TypeScript types
├── utils/           # errors, logger (Pino), jwt helpers, asyncHandler
└── types/           # Express type augmentations (req.user)
```

### Key architectural decisions

| Decision | Reason |
|---|---|
| Section-based resume chunking | One chunk per job entry preserves context; a query for "Redis at a startup" retrieves the right role, not a mixed blob of 5 companies |
| Hybrid job-description chunking | Pattern matching handles ~80 % of JDs; sliding window (400-word / 50-word overlap) handles the rest without silent truncation |
| FULL chunk (first 500 words) | Single holistic vector per document — enables resume↔resume similarity without aggregating across chunk types |
| `Unsupported("vector(1536)")` on chunk tables | Prisma creates the column via migration but can't type it; all vector reads/writes go through `$queryRawUnsafe` parameterised SQL |
| Two-step chunk storage | Prisma `createMany` inserts rows; raw SQL `UPDATE … SET embedding = $1::vector` sets the vector — keeps concerns separated and the schema Prisma-managed |
| Embedding is best-effort | Chunking always succeeds; embedding failure only leaves `embedded_at IS NULL` rows for a background worker to re-process. Avoids false FAILED status for transient API errors |
| User-scoped search | Every vector query JOINs through the parent resume/job table to filter on `user_id` — users never see each other's documents |
| IVFFlat index (Phase 3) → HNSW (Phase 4) | IVFFlat is faster to build; HNSW gives better recall at > 1M rows. Swap by running `prisma/sql/01_vector_indexes.sql` with HNSW variant |

---

## Database Schema

```
User ─────────────────────────────────────────────────────────────────────
  id · email · password · firstName · lastName

Resume (N per User) ─────────────────────────────────────────────────────
  id · userId · title · originalFileName · storagePath
  fileSize · mimeType · status (PENDING/PROCESSING/PROCESSED/FAILED)
  metadata Json?   ← { embeddingModel, chunkCount, embeddedAt, … }

ResumeContent (1:1 per Resume) ──────────────────────────────────────────
  resumeId · extractedText · wordCount · pageCount
  chunkBoundaries Json?   ← [{ index, type, wordCount }]

ParsedResume (1:1 per Resume) ───────────────────────────────────────────
  resumeId · candidateName · email · phone
  skills Json · education Json · experience Json · projects Json
  confidenceScore · parserVersion · rawOutput Json?

ResumeChunk (N per Resume) — Phase 3 ────────────────────────────────────
  id · resumeId · chunkIndex · chunkType · content
  wordCount · tokenEstimate · metadata Json
  embeddingModel · embeddedAt
  embedding vector(1536)   ← pgvector; set via raw SQL

JobDescription (N per User) ─────────────────────────────────────────────
  id · userId · title · company · content
  metadata Json?   ← { embeddingModel, chunkCount, embeddedAt, … }

JobChunk (N per JobDescription) — Phase 3 ───────────────────────────────
  id · jobId · chunkIndex · chunkType · content
  wordCount · tokenEstimate · metadata Json
  embeddingModel · embeddedAt
  embedding vector(1536)   ← pgvector; set via raw SQL
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Docker + Docker Compose (ships `pgvector/pgvector:pg16`)

### 1. Install and configure

```bash
git clone <repo>
cd resume-analyzer
npm install

cp .env.example .env
# Fill in JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# For semantic search, also set:
# OPENAI_API_KEY=sk-...
```

### 2. Start the database

```bash
docker compose up postgres -d
```

### 3. Enable pgvector (must run before migration)

```bash
npm run db:enable-vector
# or: psql $DATABASE_URL -f prisma/sql/00_enable_pgvector.sql
```

### 4. Run migrations

```bash
npm run prisma:migrate
```

### 5. Start the API

```bash
npm run dev          # hot-reload development
npm run build && npm start   # production
```

### 6. (Optional) Create vector similarity indexes

Run this **after** the first batch of embeddings is stored (IVFFlat requires data to build a useful index):

```bash
npm run db:vector-indexes
# or: psql $DATABASE_URL -f prisma/sql/01_vector_indexes.sql
```

---

## Docker (full stack)

```bash
cp .env.example .env   # set JWT_SECRET (and optionally OPENAI_API_KEY)
docker compose up --build
# Then in another terminal:
psql $DATABASE_URL -f prisma/sql/00_enable_pgvector.sql
npx prisma migrate deploy
```

API available at `http://localhost:3000`.

---

## API Endpoints

Base URL: `http://localhost:3000/api/v1`

Protected endpoints require `Authorization: Bearer <token>`.

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness check |

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | — | Register + receive JWT |
| POST | `/api/v1/auth/login` | — | Login + receive JWT |

### Resumes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/resumes/upload` | ✓ | Upload PDF/DOCX → extract → parse → chunk → embed |
| POST | `/api/v1/resumes` | ✓ | Metadata-only create |
| GET | `/api/v1/resumes` | ✓ | List all user resumes (slim) |
| GET | `/api/v1/resumes/:id` | ✓ | Single resume metadata |
| GET | `/api/v1/resumes/:id/details` | ✓ | Metadata + extracted text + parsed fields |
| GET | `/api/v1/resumes/:id/similar` | ✓ | Top N semantically similar resumes (`?limit=5`) |
| DELETE | `/api/v1/resumes/:id` | ✓ | Delete resume + file |

### Job Descriptions

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/jobs` | ✓ | Create + chunk + embed |
| GET | `/api/v1/jobs` | ✓ | List job descriptions |
| GET | `/api/v1/jobs/:id` | ✓ | Get single job description |
| DELETE | `/api/v1/jobs/:id` | ✓ | Delete job description |

### Semantic Search — Phase 3

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/search` | ✓ | Natural-language vector search across resumes + jobs |

---

## Sample Requests

### Upload a resume (Phase 2 + 3)

```bash
curl -X POST http://localhost:3000/api/v1/resumes/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/resume.pdf" \
  -F "title=Software Engineer 2025"
```

**Response 201** includes parsed fields + embedding metadata:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Software Engineer 2025",
    "status": "PROCESSED",
    "metadata": {
      "embeddingModel": "text-embedding-3-small",
      "chunkCount": 8,
      "embeddedChunkCount": 8,
      "embeddedAt": "2026-06-24T10:00:00Z"
    },
    "content": { "wordCount": 487, "pageCount": 2 },
    "parsedData": {
      "candidateName": "Jane Doe",
      "skills": ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker"],
      "experience": [
        {
          "title": "Senior Software Engineer",
          "company": "Acme Corp",
          "startDate": "Jan 2021",
          "current": true,
          "bullets": ["Built scalable REST APIs", "Reduced P99 latency by 40%"]
        }
      ],
      "confidenceScore": 1.0
    }
  }
}
```

### Semantic search

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "backend engineer with Redis and PostgreSQL",
    "filters": { "chunkTypes": ["EXPERIENCE", "SKILLS"], "sourceType": "resume" },
    "limit": 5,
    "minSimilarity": 0.7
  }'
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "chunkId": "uuid",
      "content": "Senior Software Engineer at Acme Corp (Jan 2021 – Present)\n- Built Redis caching layer reducing P99 by 40%\n- Migrated from MongoDB to PostgreSQL",
      "chunkType": "EXPERIENCE",
      "similarity": 0.892,
      "source": {
        "type": "resume",
        "id": "uuid",
        "title": "Software Engineer 2025",
        "candidateName": "Jane Doe"
      },
      "metadata": {
        "company": "Acme Corp",
        "title": "Senior Software Engineer",
        "startDate": "Jan 2021",
        "isCurrent": true
      }
    }
  ],
  "meta": { "query": "backend engineer with Redis and PostgreSQL", "total": 1, "limit": 5, "offset": 0 }
}
```

### Similar resumes

```bash
curl "http://localhost:3000/api/v1/resumes/<id>/similar?limit=5" \
  -H "Authorization: Bearer <token>"
```

**Response 200:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "resumeId": "uuid",
      "title": "Full Stack Engineer 2024",
      "candidateName": "John Smith",
      "maxSimilarity": 0.85,
      "avgSimilarity": 0.77,
      "matchedChunkCount": 6
    }
  ]
}
```

---

## RAG Pipeline Architecture

```
POST /resumes/upload
  │
  ├─ multer                  saves file, validates size + MIME
  │
  ├─ ResumeUploadService.processUpload()
  │    │
  │    ├─ Step 1  prisma.resume.create()         status = PENDING
  │    ├─ Step 2  readStoredFile()                Buffer from disk
  │    ├─ Step 3  extractTextFromBuffer()         pdf-parse | mammoth
  │    │           └─ prisma.resumeContent.create()
  │    ├─ Step 4  parseResumeText()               regex section parser
  │    │           └─ prisma.parsedResume.create()
  │    ├─ Step 5  chunkResume()                   section-based chunker
  │    │           └─ prisma.resumeChunk.createMany()
  │    ├─ Step 6  embeddingService.embedBatch()   OpenAI text-embedding-3-small
  │    │           └─ UPDATE resume_chunks SET embedding = $1::vector
  │    └─ Step 7  prisma.resume.update()          status = PROCESSED + metadata
  │
  └─ 201 + structured response

POST /search
  │
  ├─ protect (JWT)
  ├─ validate (Zod)
  │
  ├─ RetrievalService.search()
  │    ├─ EmbeddingService.embedOne(query)      query → vector
  │    ├─ searchResumeChunks()                  pgvector <=> cosine search
  │    ├─ searchJobChunks()                     (if sourceType = 'all'|'job')
  │    └─ merge + re-rank + slice(limit)
  │
  └─ 200 + SearchResult[]
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | — | `development` | `development` / `production` / `test` |
| `PORT` | — | `3000` | HTTP port |
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✓ | — | Min 32 chars random hex string |
| `JWT_EXPIRES_IN` | — | `7d` | Token TTL |
| `BCRYPT_ROUNDS` | — | `12` | bcrypt cost factor |
| `LOG_LEVEL` | — | `info` | `trace` / `debug` / `info` / `warn` / `error` |
| `CORS_ORIGIN` | — | `*` | Allowed CORS origin |
| `UPLOAD_DIR` | — | `uploads` | Local directory for uploaded files |
| `MAX_FILE_SIZE_MB` | — | `10` | Maximum upload file size (MB) |
| `OPENAI_API_KEY` | — | — | Required for semantic search; chunking still runs without it |
| `EMBEDDING_MODEL` | — | `text-embedding-3-small` | OpenAI model for embeddings |
| `EMBEDDING_DIMENSIONS` | — | `1536` | Vector dimensions; must match schema `vector(N)` |
| `EMBEDDING_BATCH_SIZE` | — | `100` | Texts per OpenAI API call |
| `SEARCH_TOP_K` | — | `10` | Default search result count |
| `SEARCH_MIN_SIMILARITY` | — | `0.5` | Minimum cosine similarity to include a result |

---

## Phase 4 Roadmap

| Feature | What's needed |
|---|---|
| **Background embedding** | Move steps 5–6 of the upload pipeline into a BullMQ worker to keep `POST /upload` latency under 200 ms |
| **Re-embedding worker** | Query `WHERE embedded_at IS NULL` to embed chunks that failed due to transient API errors |
| **HNSW indexes** | Swap IVFFlat for HNSW in `prisma/sql/01_vector_indexes.sql` once row count exceeds ~1M |
| **LLM re-parse** | `confidenceScore < 0.5` → enqueue LLM re-parse; `parserVersion` field tracks which records need it |
| **ATS scoring** | `POST /analysis/match?resumeId=&jobId=` — LLM-powered keyword + semantic gap analysis |
| **Redis caching** | Cache embedding lookups + search results; TTL invalidated on re-embed |
| **S3 storage** | Replace 3 functions in `file-storage.service.ts`; rest of codebase unaffected |
| **OCR support** | Scanned PDFs: route to Tesseract.js or AWS Textract when `confidence < 0.3` |
