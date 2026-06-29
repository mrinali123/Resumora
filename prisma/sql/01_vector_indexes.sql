-- ─── Step 1: Vector similarity indexes ────────────────────────────────────────
-- Run this AFTER the first batch of embeddings has been stored.
--
-- Why run after data?
--   IVFFlat requires at least (lists × 39) rows to build a useful index.
--   Building on an empty table produces a trivially small index.
--   HNSW (below) can be built on an empty table but is slower to populate.
--
-- ─── Similarity metric choice ─────────────────────────────────────────────────
-- OpenAI text-embedding-3-* returns L2-normalised unit vectors, so:
--   cosine_similarity  = 1 - cosine_distance  (pgvector: <=>)
--   cosine_distance    = dot_product_distance  (for unit vectors)
-- We use cosine_ops (<=>) as the similarity metric.
--
-- ─── Index type choice ────────────────────────────────────────────────────────
-- IVFFlat (Phase 3 default):
--   - Faster to build, lower memory, good recall up to ~1 M rows
--   - lists ≈ sqrt(row_count); 100 is fine for < 10 k rows in development
--   - Increase lists to 1000 when approaching 1 M rows
--
-- HNSW (Phase 4 upgrade, pgvector >= 0.5.0):
--   - Better recall, faster queries, higher memory, can index before data
--   - m=16, ef_construction=64 are safe defaults; tune for your workload

-- IVFFlat (default for Phase 3)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resume_chunks_embedding
  ON resume_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_chunks_embedding
  ON job_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── HNSW (comment out IVFFlat above and use these for Phase 4) ───────────────
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resume_chunks_embedding_hnsw
--   ON resume_chunks USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_chunks_embedding_hnsw
--   ON job_chunks USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);

-- ─── Tune the search accuracy/speed tradeoff (IVFFlat only) ──────────────────
-- probes = how many cells the query scans; higher = more accurate but slower.
-- Default is 1; set to sqrt(lists) as a starting point.
-- SET ivfflat.probes = 10;
