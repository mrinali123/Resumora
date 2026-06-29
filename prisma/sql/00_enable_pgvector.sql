-- ─── Step 0: Enable pgvector extension ───────────────────────────────────────
-- Run this BEFORE `npx prisma migrate dev` so the `vector` type exists when
-- Prisma tries to create the chunk tables.
--
-- The pgvector/pgvector:pg16 Docker image ships with the extension pre-built;
-- for bare Postgres installs follow: https://github.com/pgvector/pgvector#installation

CREATE EXTENSION IF NOT EXISTS vector;
