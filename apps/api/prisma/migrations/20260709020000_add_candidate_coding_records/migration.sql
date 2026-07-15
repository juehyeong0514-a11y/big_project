CREATE TYPE "CodeExecutionStatus" AS ENUM ('SUCCESS', 'FAILED');

CREATE TABLE "Submission" (
  "id" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CodeExecution" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "CodeExecutionStatus" NOT NULL,
  "output" TEXT NOT NULL,
  "error" TEXT,
  "executionTimeMs" INTEGER NOT NULL,
  "memoryUsageMb" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodeExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Submission_examId_idx" ON "Submission"("examId");
CREATE INDEX "Submission_candidateId_idx" ON "Submission"("candidateId");
CREATE INDEX "Submission_questionId_idx" ON "Submission"("questionId");
CREATE INDEX "Submission_submittedAt_idx" ON "Submission"("submittedAt");
CREATE INDEX "CodeExecution_candidateId_idx" ON "CodeExecution"("candidateId");
CREATE INDEX "CodeExecution_questionId_idx" ON "CodeExecution"("questionId");
CREATE INDEX "CodeExecution_createdAt_idx" ON "CodeExecution"("createdAt");

ALTER TABLE "Submission" ADD CONSTRAINT "Submission_examId_fkey"
  FOREIGN KEY ("examId") REFERENCES "Exam"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Submission" ADD CONSTRAINT "Submission_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Submission" ADD CONSTRAINT "Submission_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CodeExecution" ADD CONSTRAINT "CodeExecution_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CodeExecution" ADD CONSTRAINT "CodeExecution_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
