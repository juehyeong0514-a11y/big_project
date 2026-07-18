ALTER TABLE "Candidate"
ADD COLUMN "identityPrivacyConsentVersion" TEXT,
ADD COLUMN "identityPrivacyConsentAcceptedAt" TIMESTAMP(3);

ALTER TABLE "Candidate"
ADD CONSTRAINT "Candidate_identity_privacy_consent_pair_chk"
CHECK (
  ("identityPrivacyConsentVersion" IS NULL AND "identityPrivacyConsentAcceptedAt" IS NULL)
  OR
  ("identityPrivacyConsentVersion" IS NOT NULL AND "identityPrivacyConsentAcceptedAt" IS NOT NULL)
);

ALTER TABLE "IdentityVerification"
ADD COLUMN "privacyConsentVersion" TEXT,
ADD COLUMN "privacyConsentAcceptedAt" TIMESTAMP(3);
