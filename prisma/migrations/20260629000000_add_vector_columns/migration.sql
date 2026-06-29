-- Adds the `embedding vector(1536)` column to resume_chunks and job_chunks.
-- This column was intentionally omitted from the init migration because pgvector
-- may not be installed in all environments.
--
-- This migration no-ops gracefully when pgvector is absent: the EXECUTE statements
-- are inside a string literal and are never evaluated unless the IF condition is met,
-- so the `vector` type is never looked up in environments without pgvector.
--
-- Prerequisites (to enable vector search):
--   psql $DATABASE_URL -c 'CREATE EXTENSION IF NOT EXISTS vector'
--   (or: psql $DATABASE_URL -f prisma/sql/00_enable_pgvector.sql)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER TABLE "resume_chunks" ADD COLUMN IF NOT EXISTS "embedding" vector(1536)';
    EXECUTE 'ALTER TABLE "job_chunks"    ADD COLUMN IF NOT EXISTS "embedding" vector(1536)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "resume_chunks_embedding_idx" ON "resume_chunks" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "job_chunks_embedding_idx"    ON "job_chunks"    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
    RAISE NOTICE 'pgvector: embedding columns added to resume_chunks and job_chunks.';
  ELSE
    RAISE NOTICE 'pgvector not installed — embedding columns skipped. Install pgvector and re-run migrations to enable vector search.';
  END IF;
END $$;
