CREATE TYPE "OrganizationInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED');

CREATE TABLE "OrganizationInvitation" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "invitedUserId" TEXT NOT NULL,
  "requestedRole" "UserRole" NOT NULL,
  "status" "OrganizationInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "invitedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationInvitation_token_key" UNIQUE ("token"),
  CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OrganizationInvitation_organizationId_status_idx" ON "OrganizationInvitation"("organizationId", "status");
CREATE INDEX "OrganizationInvitation_invitedUserId_status_idx" ON "OrganizationInvitation"("invitedUserId", "status");
