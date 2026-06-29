-- Run this ONLY after installing pgvector for PostgreSQL.
-- On Windows: download the pgvector binary for your PostgreSQL version from
--   https://github.com/pgvector/pgvector/releases
-- On Docker: use image pgvector/pgvector:pg16 which includes pgvector.

CREATE EXTENSION IF NOT EXISTS "vector";

ALTER TABLE "resume_chunks" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "job_chunks"    ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- Vector similarity search indexes (cosine distance)
CREATE INDEX IF NOT EXISTS "resume_chunks_embedding_idx"
  ON "resume_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS "job_chunks_embedding_idx"
  ON "job_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
