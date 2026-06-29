-- Auto-verify accounts that existed before the email verification feature was introduced.
-- These users have email_verified = false and email_verification_token IS NULL,
-- meaning they were created before the migration 20260629000001_add_email_verification
-- ran and they have never been given a token to verify with.
-- Leaving them unverifiable would permanently lock them out of their accounts.

UPDATE "users"
SET "email_verified" = true
WHERE "email_verified" = false
  AND "email_verification_token" IS NULL;
