import assert from "node:assert/strict";
import { updateExamInStore } from "../../dist/services/platform-store.exam-admin.js";

const createdAt = new Date("2026-07-15T00:00:00.000Z");
const databaseExam = {
  id: "exam_demo",
  organizationId: "org_demo",
  title: "기존 시험",
  description: "기존 설명",
  startAt: new Date("2026-07-16T01:00:00.000Z"),
  endAt: new Date("2026-07-16T03:00:00.000Z"),
  durationMinutes: 90,
  status: "DRAFT",
  languages: ["Python"],
  proctoringEnabled: true,
  identityVerificationEnabled: true,
  mobileCameraRequired: false,
  screenShareRequired: true,
  createdAt
};

const prisma = {
  exam: {
    findUnique: async ({ where }) => where.id === databaseExam.id ? { ...databaseExam } : null,
    update: async ({ where, data }) => {
      assert.equal(where.id, databaseExam.id);
      Object.assign(databaseExam, data);
      return { ...databaseExam };
    }
  }
};

const session = {
  token: "session_test",
  user: { id: "user_org", email: "manager@example.test", name: "조직 관리자", role: "ORGANIZATION", organizationId: "org_demo", createdAt: createdAt.toISOString() },
  organization: { id: "org_demo", name: "테스트 조직", createdAt: createdAt.toISOString() }
};

const input = {
  title: "수정된 시험",
  description: "수정된 설명",
  startAt: "2026-07-17T01:00:00.000Z",
  endAt: "2026-07-17T04:00:00.000Z",
  durationMinutes: 120,
  languages: ["Python", "JavaScript"],
  proctoringEnabled: true,
  identityVerificationEnabled: true,
  mobileCameraRequired: true,
  screenShareRequired: true
};

const result = await updateExamInStore({
  context: { prisma, runDatabase: async (operation) => operation() },
  examId: databaseExam.id,
  input,
  memoryState: { organization: session.organization, exams: [], questions: [], candidates: [], testCases: [] },
  session
});

assert.equal(result.exam.title, "수정된 시험");
assert.equal(result.exam.durationMinutes, 120);
assert.equal(result.exam.mobileCameraRequired, true);
assert.deepEqual(result.exam.languages, ["Python", "JavaScript"]);
console.log("exam update regression passed");
