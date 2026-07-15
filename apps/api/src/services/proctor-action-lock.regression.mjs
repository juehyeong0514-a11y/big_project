import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { assertExamSessionOpenInStore } from "../../dist/services/platform-store.candidate-workspace.js";

const invite = {
  candidate: { id: "candidate_001" },
  exam: { id: "exam_backend_001", durationMinutes: 30 }
};

const context = {
  prisma: {},
  runDatabase: async () => null
};

const pausedAction = {
  id: "action_pause",
  candidateId: "candidate_001",
  examId: "exam_backend_001",
  type: "PAUSE_EXAM",
  message: "pause during review",
  createdAt: "2026-07-13T00:00:00.000Z"
};

const resumedAction = {
  id: "action_resume",
  candidateId: "candidate_001",
  examId: "exam_backend_001",
  type: "RESUME_EXAM",
  message: "resume after review",
  createdAt: "2026-07-13T00:01:00.000Z"
};

const terminatedAction = {
  id: "action_terminate",
  candidateId: "candidate_001",
  examId: "exam_backend_001",
  type: "TERMINATE_EXAM",
  message: "terminate for policy breach",
  createdAt: "2026-07-13T00:02:00.000Z"
};

const otherCandidateAction = {
  id: "action_other_pause",
  candidateId: "candidate_999",
  examId: "exam_backend_001",
  type: "PAUSE_EXAM",
  message: "other candidate paused",
  createdAt: "2026-07-13T00:03:00.000Z"
};

function request(memoryActions) {
  return {
    context,
    invite,
    memoryActions,
    memorySessions: []
  };
}

await assert.rejects(
  () => assertExamSessionOpenInStore(request([pausedAction])),
  (error) => error instanceof ForbiddenException && error.message.includes("paused")
);

const resumed = await assertExamSessionOpenInStore(request([pausedAction, resumedAction]));
assert.equal(resumed.examSessions.length, 1);

await assert.rejects(
  () => assertExamSessionOpenInStore(request([resumedAction, terminatedAction])),
  (error) => error instanceof ForbiddenException && error.message.includes("terminated")
);

const unaffected = await assertExamSessionOpenInStore(request([otherCandidateAction]));
assert.equal(unaffected.examSessions.length, 1);

console.log("proctor action lock regression passed");
