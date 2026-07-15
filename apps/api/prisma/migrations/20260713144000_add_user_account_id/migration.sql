ALTER TABLE "User" ADD COLUMN "accountId" TEXT;
UPDATE "User" SET "accountId" = 'member_' || "id";
ALTER TABLE "User" ALTER COLUMN "accountId" SET NOT NULL;
CREATE UNIQUE INDEX "User_accountId_key" ON "User"("accountId");
