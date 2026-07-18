ALTER TABLE "User"
ADD COLUMN "privacyConsentVersion" TEXT,
ADD COLUMN "privacyConsentAcceptedAt" TIMESTAMP(3);

ALTER TABLE "User"
ADD CONSTRAINT "User_privacy_consent_pair_chk"
CHECK (
  ("privacyConsentVersion" IS NULL AND "privacyConsentAcceptedAt" IS NULL)
  OR
  ("privacyConsentVersion" IS NOT NULL AND "privacyConsentAcceptedAt" IS NOT NULL)
);
