ALTER TABLE "InviteEmailLog" ADD COLUMN "providerMessageId" TEXT;

CREATE INDEX "InviteEmailLog_providerMessageId_idx" ON "InviteEmailLog"("providerMessageId");
