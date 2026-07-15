-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateTable
CREATE TABLE "IdentityVerification" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "documentImageName" TEXT NOT NULL,
    "faceImageCaptured" BOOLEAN NOT NULL DEFAULT false,
    "similarityScore" INTEGER NOT NULL,
    "status" "IdentityVerificationStatus" NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdentityVerification_candidateId_idx" ON "IdentityVerification"("candidateId");

-- CreateIndex
CREATE INDEX "IdentityVerification_examId_idx" ON "IdentityVerification"("examId");

-- CreateIndex
CREATE INDEX "IdentityVerification_status_idx" ON "IdentityVerification"("status");

-- CreateIndex
CREATE INDEX "IdentityVerification_createdAt_idx" ON "IdentityVerification"("createdAt");

-- AddForeignKey
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
