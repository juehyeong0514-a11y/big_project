ALTER TABLE "IdentityVerification"
ADD COLUMN "documentCaptureConfirmed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "IdentityVerification"
SET "documentImageName" = 'document-capture-confirmed',
    "documentCaptureConfirmed" = true;

ALTER TABLE "IdentityVerification"
ALTER COLUMN "documentImageName" SET DEFAULT 'document-capture-confirmed';

ALTER TABLE "IdentityVerification"
ADD CONSTRAINT "IdentityVerification_documentImageName_marker_chk"
CHECK ("documentImageName" = 'document-capture-confirmed');
