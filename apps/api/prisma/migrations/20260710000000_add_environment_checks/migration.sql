-- CreateTable
CREATE TABLE "EnvironmentCheck" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "requiredPassed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvironmentCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnvironmentCheck_candidateId_idx" ON "EnvironmentCheck"("candidateId");

-- CreateIndex
CREATE INDEX "EnvironmentCheck_examId_idx" ON "EnvironmentCheck"("examId");

-- CreateIndex
CREATE INDEX "EnvironmentCheck_requiredPassed_idx" ON "EnvironmentCheck"("requiredPassed");

-- CreateIndex
CREATE INDEX "EnvironmentCheck_createdAt_idx" ON "EnvironmentCheck"("createdAt");

-- AddForeignKey
ALTER TABLE "EnvironmentCheck" ADD CONSTRAINT "EnvironmentCheck_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentCheck" ADD CONSTRAINT "EnvironmentCheck_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
