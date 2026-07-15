ALTER TYPE "ExamStatus" ADD VALUE IF NOT EXISTS 'DELETED';

ALTER TYPE "ProctorEventType" ADD VALUE IF NOT EXISTS 'PRIMARY_CAMERA_CONNECTED';
ALTER TYPE "ProctorEventType" ADD VALUE IF NOT EXISTS 'PRIMARY_CAMERA_DISCONNECTED';
ALTER TYPE "ProctorEventType" ADD VALUE IF NOT EXISTS 'PRIMARY_CAMERA_PERMISSION_DENIED';
ALTER TYPE "ProctorEventType" ADD VALUE IF NOT EXISTS 'MOBILE_CAMERA_CONNECTED';
ALTER TYPE "ProctorEventType" ADD VALUE IF NOT EXISTS 'MOBILE_CAMERA_DISCONNECTED';
ALTER TYPE "ProctorEventType" ADD VALUE IF NOT EXISTS 'MOBILE_CAMERA_PERMISSION_DENIED';
ALTER TYPE "ProctorEventType" ADD VALUE IF NOT EXISTS 'MOBILE_PAGE_HIDDEN';
ALTER TYPE "ProctorEventType" ADD VALUE IF NOT EXISTS 'MOBILE_PAGE_VISIBLE';
ALTER TYPE "ProctorEventType" ADD VALUE IF NOT EXISTS 'MOBILE_HEARTBEAT_MISSED';

CREATE TYPE "ProctorDeviceRole" AS ENUM ('PRIMARY_PC', 'MOBILE_AUX');
CREATE TYPE "ProctorDeviceStatus" AS ENUM ('WAITING', 'CONNECTED', 'DISCONNECTED', 'PERMISSION_DENIED');

CREATE TABLE "ProctorDevice" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "role" "ProctorDeviceRole" NOT NULL,
    "status" "ProctorDeviceStatus" NOT NULL DEFAULT 'WAITING',
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProctorDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProctorDevice_candidateId_examId_role_key" ON "ProctorDevice"("candidateId", "examId", "role");
CREATE INDEX "ProctorDevice_candidateId_idx" ON "ProctorDevice"("candidateId");
CREATE INDEX "ProctorDevice_examId_idx" ON "ProctorDevice"("examId");
CREATE INDEX "ProctorDevice_role_idx" ON "ProctorDevice"("role");
CREATE INDEX "ProctorDevice_status_idx" ON "ProctorDevice"("status");
CREATE INDEX "ProctorDevice_lastHeartbeatAt_idx" ON "ProctorDevice"("lastHeartbeatAt");

ALTER TABLE "ProctorDevice" ADD CONSTRAINT "ProctorDevice_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProctorDevice" ADD CONSTRAINT "ProctorDevice_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "InviteEmailLog" SET "status" = 'FAILED' WHERE "status" = 'MOCKED';
ALTER TYPE "InviteEmailStatus" RENAME TO "InviteEmailStatus_old";
CREATE TYPE "InviteEmailStatus" AS ENUM ('SENT', 'FAILED');
ALTER TABLE "InviteEmailLog" ALTER COLUMN "status" TYPE "InviteEmailStatus" USING "status"::text::"InviteEmailStatus";
DROP TYPE "InviteEmailStatus_old";
