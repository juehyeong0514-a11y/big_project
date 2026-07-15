-- CreateTable
CREATE TABLE "CompetencyReport" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "problemSolvingScore" INTEGER NOT NULL,
    "implementationScore" INTEGER NOT NULL,
    "debuggingScore" INTEGER NOT NULL,
    "codeQualityScore" INTEGER NOT NULL,
    "timeManagementScore" INTEGER NOT NULL,
    "integrityScore" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "aiSummary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetencyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetencyReport_examId_idx" ON "CompetencyReport"("examId");

-- CreateIndex
CREATE INDEX "CompetencyReport_candidateId_idx" ON "CompetencyReport"("candidateId");

-- CreateIndex
CREATE INDEX "CompetencyReport_createdAt_idx" ON "CompetencyReport"("createdAt");

-- AddForeignKey
ALTER TABLE "CompetencyReport" ADD CONSTRAINT "CompetencyReport_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyReport" ADD CONSTRAINT "CompetencyReport_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
