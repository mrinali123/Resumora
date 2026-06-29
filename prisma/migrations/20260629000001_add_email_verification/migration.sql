-- Email verification columns on users table.
-- All nullable — existing rows keep email_verified = false (applied by DEFAULT).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified"            BOOLEAN      NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verification_token"  TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verification_expiry" TIMESTAMPTZ;

-- Index for token lookup during verification
CREATE INDEX IF NOT EXISTS "users_email_verification_token_idx"
    ON "users" ("email_verification_token")
    WHERE "email_verification_token" IS NOT NULL;
