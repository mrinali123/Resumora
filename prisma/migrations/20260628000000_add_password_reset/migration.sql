-- Add password reset columns to users table
ALTER TABLE "users" ADD COLUMN "password_reset_token" TEXT;
ALTER TABLE "users" ADD COLUMN "password_reset_expiry" TIMESTAMP(3);

-- Index for fast token lookup during password reset validation
CREATE INDEX "users_password_reset_token_idx" ON "users"("password_reset_token");
