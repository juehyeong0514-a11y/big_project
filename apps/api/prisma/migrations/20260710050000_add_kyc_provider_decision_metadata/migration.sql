ALTER TABLE "IdentityVerification"
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "providerDecision" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
ADD COLUMN "providerReferenceId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "failureReason" TEXT;

CREATE INDEX "IdentityVerification_providerDecision_idx" ON "IdentityVerification"("providerDecision");
CREATE INDEX "IdentityVerification_providerReferenceId_idx" ON "IdentityVerification"("providerReferenceId");
