ALTER TABLE "Submission" ADD COLUMN "passedTests" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Submission" ADD COLUMN "totalTests" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CodeExecution" ADD COLUMN "passedTests" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CodeExecution" ADD COLUMN "totalTests" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "JudgeTestResult" (
    "id" TEXT NOT NULL,
    "codeExecutionId" TEXT,
    "submissionId" TEXT,
    "testIndex" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "expectedOutput" TEXT NOT NULL,
    "actualOutput" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "error" TEXT,
    "executionTimeMs" INTEGER NOT NULL,
    "isPublic" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeTestResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JudgeTestResult_codeExecutionId_idx" ON "JudgeTestResult"("codeExecutionId");
CREATE INDEX "JudgeTestResult_submissionId_idx" ON "JudgeTestResult"("submissionId");
CREATE INDEX "JudgeTestResult_passed_idx" ON "JudgeTestResult"("passed");

ALTER TABLE "JudgeTestResult" ADD CONSTRAINT "JudgeTestResult_codeExecutionId_fkey" FOREIGN KEY ("codeExecutionId") REFERENCES "CodeExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JudgeTestResult" ADD CONSTRAINT "JudgeTestResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
