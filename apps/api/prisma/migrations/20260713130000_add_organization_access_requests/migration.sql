CREATE TYPE "OrganizationAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Organization" ADD COLUMN "joinCode" TEXT;
UPDATE "Organization"
SET "joinCode" = 'ORG-' || upper(substring(md5("id") from 1 for 8));
ALTER TABLE "Organization" ALTER COLUMN "joinCode" SET NOT NULL;
CREATE UNIQUE INDEX "Organization_joinCode_key" ON "Organization"("joinCode");

ALTER TABLE "User" ALTER COLUMN "organizationId" DROP NOT NULL;
ALTER TABLE "User" DROP CONSTRAINT "User_organizationId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OrganizationAccessRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestedRole" "UserRole" NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "OrganizationAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
  "rejectionReason" TEXT,
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationAccessRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationAccessRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganizationAccessRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OrganizationAccessRequest_organizationId_status_idx" ON "OrganizationAccessRequest"("organizationId", "status");
CREATE INDEX "OrganizationAccessRequest_userId_status_idx" ON "OrganizationAccessRequest"("userId", "status");
