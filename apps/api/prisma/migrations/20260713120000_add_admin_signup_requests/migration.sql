CREATE TYPE "AdminSignupRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AdminSignupRequest" (
  "id" TEXT NOT NULL,
  "organizationName" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestedRole" "UserRole" NOT NULL DEFAULT 'ORGANIZATION',
  "status" "AdminSignupRequestStatus" NOT NULL DEFAULT 'PENDING',
  "rejectionReason" TEXT,
  "reviewedById" TEXT,
  "approvedUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "AdminSignupRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminSignupRequest_status_idx" ON "AdminSignupRequest"("status");
CREATE INDEX "AdminSignupRequest_email_idx" ON "AdminSignupRequest"("email");
CREATE INDEX "AdminSignupRequest_createdAt_idx" ON "AdminSignupRequest"("createdAt");
