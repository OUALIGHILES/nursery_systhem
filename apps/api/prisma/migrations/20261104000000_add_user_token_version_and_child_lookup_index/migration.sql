-- Phase 3: access-token revocation + duplicate-child lookup index.
-- tokenVersion defaults to 0 so existing rows need no backfill or data cleanup.
-- Existing access JWTs without a `tv` claim are treated as version 0 by the
-- guard; the first password change bumps the version to 1+, which invalidates
-- those legacy tokens.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Non-unique lookup index for EnrollmentService duplicate detection
-- (firstName, lastName, dateOfBirth). Deliberately NON-unique: siblings,
-- twins, and unrelated children may legally share names/DOB; a unique
-- constraint on names alone would be unsafe and is intentionally avoided.
CREATE INDEX "Child_firstName_lastName_dateOfBirth_idx" ON "Child"("firstName", "lastName", "dateOfBirth");
