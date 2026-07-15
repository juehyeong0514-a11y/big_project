CREATE TYPE "InviteEmailStatus" AS ENUM ('MOCKED', 'SENT', 'FAILED');

CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CodeDraft" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InviteEmailLog" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "inviteUrl" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "InviteEmailStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamSession_candidateId_examId_key" ON "ExamSession"("candidateId", "examId");
CREATE INDEX "ExamSession_candidateId_idx" ON "ExamSession"("candidateId");
CREATE INDEX "ExamSession_examId_idx" ON "ExamSession"("examId");
CREATE INDEX "ExamSession_endsAt_idx" ON "ExamSession"("endsAt");

CREATE UNIQUE INDEX "CodeDraft_candidateId_questionId_language_key" ON "CodeDraft"("candidateId", "questionId", "language");
CREATE INDEX "CodeDraft_candidateId_idx" ON "CodeDraft"("candidateId");
CREATE INDEX "CodeDraft_examId_idx" ON "CodeDraft"("examId");
CREATE INDEX "CodeDraft_questionId_idx" ON "CodeDraft"("questionId");
CREATE INDEX "CodeDraft_savedAt_idx" ON "CodeDraft"("savedAt");

CREATE INDEX "InviteEmailLog_candidateId_idx" ON "InviteEmailLog"("candidateId");
CREATE INDEX "InviteEmailLog_examId_idx" ON "InviteEmailLog"("examId");
CREATE INDEX "InviteEmailLog_status_idx" ON "InviteEmailLog"("status");
CREATE INDEX "InviteEmailLog_createdAt_idx" ON "InviteEmailLog"("createdAt");

ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CodeDraft" ADD CONSTRAINT "CodeDraft_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodeDraft" ADD CONSTRAINT "CodeDraft_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodeDraft" ADD CONSTRAINT "CodeDraft_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InviteEmailLog" ADD CONSTRAINT "InviteEmailLog_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteEmailLog" ADD CONSTRAINT "InviteEmailLog_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
