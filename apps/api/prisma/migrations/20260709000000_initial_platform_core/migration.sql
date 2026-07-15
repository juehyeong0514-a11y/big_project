CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED');
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "CandidateStatus" AS ENUM ('INVITED', 'READY', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Exam" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
  "languages" TEXT[],
  "proctoringEnabled" BOOLEAN NOT NULL DEFAULT false,
  "identityVerificationEnabled" BOOLEAN NOT NULL DEFAULT false,
  "mobileCameraRequired" BOOLEAN NOT NULL DEFAULT false,
  "screenShareRequired" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Question" (
  "id" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "difficulty" "Difficulty" NOT NULL,
  "timeLimitMs" INTEGER NOT NULL,
  "memoryLimitMb" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Candidate" (
  "id" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" "CandidateStatus" NOT NULL DEFAULT 'INVITED',
  "inviteToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Candidate_inviteToken_key" ON "Candidate"("inviteToken");
CREATE INDEX "Exam_organizationId_idx" ON "Exam"("organizationId");
CREATE INDEX "Exam_status_idx" ON "Exam"("status");
CREATE INDEX "Exam_createdAt_idx" ON "Exam"("createdAt");
CREATE INDEX "Question_examId_idx" ON "Question"("examId");
CREATE INDEX "Candidate_examId_idx" ON "Candidate"("examId");
CREATE INDEX "Candidate_email_idx" ON "Candidate"("email");

ALTER TABLE "Exam" ADD CONSTRAINT "Exam_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Question" ADD CONSTRAINT "Question_examId_fkey"
  FOREIGN KEY ("examId") REFERENCES "Exam"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_examId_fkey"
  FOREIGN KEY ("examId") REFERENCES "Exam"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
