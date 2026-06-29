-- NOTE: pgvector (CREATE EXTENSION vector) is NOT included here.
-- This PostgreSQL installation does not have pgvector compiled in.
-- The embedding vector(1536) columns in resume_chunks and job_chunks
-- must be added separately AFTER installing pgvector:
--   Run: prisma/sql/02_add_embedding_columns.sql

-- CreateEnum
CREATE TYPE "ResumeStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "status" "ResumeStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_contents" (
    "id" TEXT NOT NULL,
    "resume_id" TEXT NOT NULL,
    "extracted_text" TEXT NOT NULL,
    "word_count" INTEGER NOT NULL,
    "page_count" INTEGER,
    "chunk_boundaries" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parsed_resumes" (
    "id" TEXT NOT NULL,
    "resume_id" TEXT NOT NULL,
    "candidate_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "skills" JSONB NOT NULL DEFAULT '[]',
    "education" JSONB NOT NULL DEFAULT '[]',
    "experience" JSONB NOT NULL DEFAULT '[]',
    "projects" JSONB NOT NULL DEFAULT '[]',
    "certifications" JSONB NOT NULL DEFAULT '[]',
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "parser_version" TEXT NOT NULL DEFAULT '2.0.0',
    "raw_output" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parsed_resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- NOTE: "embedding" vector(1536) column intentionally omitted — requires pgvector.
CREATE TABLE "resume_chunks" (
    "id" TEXT NOT NULL,
    "resume_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "chunk_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "word_count" INTEGER NOT NULL,
    "token_estimate" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding_model" TEXT,
    "embedded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- NOTE: "embedding" vector(1536) column intentionally omitted — requires pgvector.
CREATE TABLE "job_chunks" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "chunk_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "word_count" INTEGER NOT NULL,
    "token_estimate" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding_model" TEXT,
    "embedded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_descriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_analyses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resume_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "skill_score" DOUBLE PRECISION NOT NULL,
    "experience_score" DOUBLE PRECISION NOT NULL,
    "education_score" DOUBLE PRECISION NOT NULL,
    "keyword_score" DOUBLE PRECISION NOT NULL,
    "semantic_score" DOUBLE PRECISION NOT NULL,
    "matching_skills" JSONB NOT NULL DEFAULT '[]',
    "missing_required_skills" JSONB NOT NULL DEFAULT '[]',
    "missing_preferred_skills" JSONB NOT NULL DEFAULT '[]',
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "keyword_coverage" JSONB NOT NULL DEFAULT '{}',
    "scoring_version" TEXT NOT NULL DEFAULT '4.0.0',
    "embeddings_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_metrics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_response_cache" (
    "id" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "endpoint" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_response_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ats_analyses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resume_id" TEXT NOT NULL,
    "job_description" TEXT,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "grade" TEXT NOT NULL,
    "components" JSONB NOT NULL DEFAULT '[]',
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "improvement_areas" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "shortlist_probability" INTEGER NOT NULL,
    "recruiter_decision" TEXT NOT NULL,
    "top_red_flags" JSONB NOT NULL DEFAULT '[]',
    "top_strengths" JSONB NOT NULL DEFAULT '[]',
    "missing_requirements" JSONB NOT NULL DEFAULT '[]',
    "recruiter_notes" TEXT NOT NULL,
    "scoring_version" TEXT NOT NULL DEFAULT '1.0.0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ats_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_comparisons" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resume_a_id" TEXT NOT NULL,
    "resume_b_id" TEXT NOT NULL,
    "job_description" TEXT,
    "improvement_score_delta" INTEGER NOT NULL,
    "added_skills" JSONB NOT NULL DEFAULT '[]',
    "removed_skills" JSONB NOT NULL DEFAULT '[]',
    "improved_sections" JSONB NOT NULL DEFAULT '[]',
    "ats_score_change" INTEGER NOT NULL,
    "is_meaningful_upgrade" BOOLEAN NOT NULL DEFAULT false,
    "has_regressions" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT NOT NULL,
    "recruiter_summary" TEXT NOT NULL,
    "full_result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "resume_contents_resume_id_key" ON "resume_contents"("resume_id");
CREATE UNIQUE INDEX "parsed_resumes_resume_id_key" ON "parsed_resumes"("resume_id");
CREATE UNIQUE INDEX "resume_chunks_resume_id_chunk_index_key" ON "resume_chunks"("resume_id", "chunk_index");
CREATE UNIQUE INDEX "job_chunks_job_id_chunk_index_key" ON "job_chunks"("job_id", "chunk_index");
CREATE UNIQUE INDEX "ai_response_cache_cache_key_key" ON "ai_response_cache"("cache_key");

-- CreateIndex
CREATE INDEX "resumes_user_id_idx" ON "resumes"("user_id");
CREATE INDEX "resumes_status_idx" ON "resumes"("status");
CREATE INDEX "parsed_resumes_parser_version_idx" ON "parsed_resumes"("parser_version");
CREATE INDEX "resume_chunks_resume_id_idx" ON "resume_chunks"("resume_id");
CREATE INDEX "resume_chunks_chunk_type_idx" ON "resume_chunks"("chunk_type");
CREATE INDEX "resume_chunks_embedded_at_idx" ON "resume_chunks"("embedded_at");
CREATE INDEX "job_chunks_job_id_idx" ON "job_chunks"("job_id");
CREATE INDEX "job_chunks_chunk_type_idx" ON "job_chunks"("chunk_type");
CREATE INDEX "job_chunks_embedded_at_idx" ON "job_chunks"("embedded_at");
CREATE INDEX "job_descriptions_user_id_idx" ON "job_descriptions"("user_id");
CREATE INDEX "match_analyses_user_id_created_at_idx" ON "match_analyses"("user_id", "created_at" DESC);
CREATE INDEX "match_analyses_resume_id_job_id_created_at_idx" ON "match_analyses"("resume_id", "job_id", "created_at" DESC);
CREATE INDEX "match_analyses_resume_id_overall_score_idx" ON "match_analyses"("resume_id", "overall_score" DESC);
CREATE INDEX "ai_metrics_user_id_created_at_idx" ON "ai_metrics"("user_id", "created_at" DESC);
CREATE INDEX "ai_metrics_endpoint_created_at_idx" ON "ai_metrics"("endpoint", "created_at" DESC);
CREATE INDEX "ai_metrics_provider_model_created_at_idx" ON "ai_metrics"("provider", "model", "created_at" DESC);
CREATE INDEX "ai_response_cache_expires_at_idx" ON "ai_response_cache"("expires_at");
CREATE INDEX "ats_analyses_user_id_created_at_idx" ON "ats_analyses"("user_id", "created_at" DESC);
CREATE INDEX "ats_analyses_resume_id_created_at_idx" ON "ats_analyses"("resume_id", "created_at" DESC);
CREATE INDEX "ats_analyses_overall_score_idx" ON "ats_analyses"("overall_score" DESC);
CREATE INDEX "resume_comparisons_user_id_created_at_idx" ON "resume_comparisons"("user_id", "created_at" DESC);
CREATE INDEX "resume_comparisons_resume_a_id_idx" ON "resume_comparisons"("resume_a_id");
CREATE INDEX "resume_comparisons_resume_b_id_idx" ON "resume_comparisons"("resume_b_id");

-- AddForeignKey
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_contents" ADD CONSTRAINT "resume_contents_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parsed_resumes" ADD CONSTRAINT "parsed_resumes_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_chunks" ADD CONSTRAINT "resume_chunks_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_chunks" ADD CONSTRAINT "job_chunks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_metrics" ADD CONSTRAINT "ai_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ats_analyses" ADD CONSTRAINT "ats_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ats_analyses" ADD CONSTRAINT "ats_analyses_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_comparisons" ADD CONSTRAINT "resume_comparisons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_comparisons" ADD CONSTRAINT "resume_comparisons_resume_a_id_fkey" FOREIGN KEY ("resume_a_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resume_comparisons" ADD CONSTRAINT "resume_comparisons_resume_b_id_fkey" FOREIGN KEY ("resume_b_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
