CREATE TYPE "ProctorEventType" AS ENUM ('TAB_HIDDEN', 'TAB_VISIBLE', 'WINDOW_BLUR', 'WINDOW_FOCUS', 'COPY', 'PASTE', 'FULLSCREEN_EXIT', 'FULLSCREEN_ENTER');

CREATE TABLE "ProctorEvent" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "type" "ProctorEventType" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProctorEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProctorEvent_candidateId_idx" ON "ProctorEvent"("candidateId");
CREATE INDEX "ProctorEvent_examId_idx" ON "ProctorEvent"("examId");
CREATE INDEX "ProctorEvent_type_idx" ON "ProctorEvent"("type");
CREATE INDEX "ProctorEvent_createdAt_idx" ON "ProctorEvent"("createdAt");

ALTER TABLE "ProctorEvent" ADD CONSTRAINT "ProctorEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProctorEvent" ADD CONSTRAINT "ProctorEvent_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
