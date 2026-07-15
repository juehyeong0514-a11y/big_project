CREATE TYPE "QuestionType" AS ENUM ('CODING', 'MULTIPLE_CHOICE', 'SHORT_ANSWER', 'ESSAY');
CREATE TYPE "ProctorActionType" AS ENUM ('WARNING_MESSAGE', 'PAUSE_EXAM', 'RESUME_EXAM', 'TERMINATE_EXAM', 'MEMO');

ALTER TABLE "Question"
ADD COLUMN "type" "QuestionType" NOT NULL DEFAULT 'CODING',
ADD COLUMN "points" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "choices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "expectedAnswer" TEXT;

CREATE TABLE "ProctorAction" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "type" "ProctorActionType" NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProctorAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProctorAction_candidateId_idx" ON "ProctorAction"("candidateId");
CREATE INDEX "ProctorAction_examId_idx" ON "ProctorAction"("examId");
CREATE INDEX "ProctorAction_type_idx" ON "ProctorAction"("type");
CREATE INDEX "ProctorAction_createdAt_idx" ON "ProctorAction"("createdAt");

ALTER TABLE "ProctorAction" ADD CONSTRAINT "ProctorAction_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProctorAction" ADD CONSTRAINT "ProctorAction_examId_fkey"
  FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
