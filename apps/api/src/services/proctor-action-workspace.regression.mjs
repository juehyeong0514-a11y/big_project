import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { PlatformStore } from "../../dist/services/platform-store.service.js";

const originalEnv = { ...process.env };
const adminSession = {
  token: "session_regression_admin",
  organization: {
    id: "org_regression",
    name: "Regression Organization",
    joinCode: "ORG-REGRESS",
    createdAt: new Date().toISOString()
  },
  user: {
    id: "user_regression_admin",
    email: "admin@example.test",
    name: "Regression Admin",
    role: "ADMIN",
    organizationId: "org_regression",
    createdAt: new Date().toISOString()
  }
};

const fakeCodeRunner = {
  async judge(_language, _code, testCases) {
    return {
      status: "SUCCESS",
      output: "1",
      executionTimeMs: 1,
      memoryUsageMb: 1,
      passedTests: testCases.length,
      totalTests: testCases.length,
      testResults: testCases.map((testCase, index) => ({
        testIndex: index,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: testCase.expectedOutput,
        passed: true,
        executionTimeMs: 1,
        isPublic: testCase.isPublic
      }))
    };
  }
};

try {
  process.env.DISABLE_DATABASE = "1";
  process.env.ALLOW_DEMO_AUTH = "1";

  const store = new PlatformStore({}, fakeCodeRunner, {}, {});
  const now = Date.now();
  const exam = await store.createExam({
    title: "Proctor action workspace regression",
    description: "Verifies public workspace methods honor proctor pause and terminate.",
    startAt: new Date(now - 60_000).toISOString(),
    endAt: new Date(now + 3_600_000).toISOString(),
    durationMinutes: 30,
    languages: ["javascript"],
    proctoringEnabled: true,
    identityVerificationEnabled: false,
    mobileCameraRequired: false,
    screenShareRequired: false
  }, adminSession);
  const question = await store.addQuestion(exam.id, {
    title: "Return one",
    description: "Return 1.",
    type: "CODING",
    points: 10,
    difficulty: "EASY",
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    choices: []
  }, adminSession);
  await store.addTestCase(question.id, {
    input: "",
    expectedOutput: "1",
    isPublic: true
  }, adminSession);
  const candidate = await store.addCandidate(exam.id, {
    name: "Workspace Lock Candidate",
    email: "workspace-lock@example.test"
  }, adminSession);
  await store.markCandidateReady(candidate.inviteToken);
  const checkSession = await store.createCandidateEnvironmentCheckSession(candidate.inviteToken);
  await store.saveCandidateEnvironmentCheck(candidate.inviteToken, {
    sessionId: checkSession.sessionId,
    evidenceToken: checkSession.evidenceToken,
    results: [
      { id: "browser", status: "PASSED", detail: "qa browser" },
      { id: "network", status: "PASSED", detail: "qa network" },
      { id: "camera", status: "PASSED", detail: "qa camera" },
      { id: "microphone", status: "PASSED", detail: "qa microphone" },
      { id: "screen", status: "PASSED", detail: "qa screen" }
    ],
    browserEvidence: {
      userAgent: "qa",
      secureContext: true,
      checkedAt: new Date(now).toISOString()
    }
  });

  const draftInput = {
    questionId: question.id,
    language: "javascript",
    code: "function solution() { return 1; }"
  };

  await store.createProctorAction(candidate.id, {
    type: "PAUSE_EXAM",
    message: "pause before workspace writes"
  }, adminSession);
  await assert.rejects(
    () => store.saveCandidateCodeDraft(candidate.inviteToken, draftInput),
    (error) => error instanceof ForbiddenException && error.message.includes("paused")
  );
  await assert.rejects(
    () => store.runCandidateCode(candidate.inviteToken, draftInput),
    (error) => error instanceof ForbiddenException && error.message.includes("paused")
  );

  await store.createProctorAction(candidate.id, {
    type: "RESUME_EXAM",
    message: "resume workspace writes"
  }, adminSession);
  const draft = await store.saveCandidateCodeDraft(candidate.inviteToken, draftInput);
  assert.equal(draft.questionId, question.id);
  const execution = await store.runCandidateCode(candidate.inviteToken, draftInput);
  assert.equal(execution.status, "SUCCESS");

  await store.createProctorAction(candidate.id, {
    type: "TERMINATE_EXAM",
    message: "terminate before submit"
  }, adminSession);
  await assert.rejects(
    () => store.submitCandidateCode(candidate.inviteToken, draftInput),
    (error) => error instanceof ForbiddenException && error.message.includes("terminated")
  );

  console.log("proctor action workspace regression passed");
} finally {
  process.env = originalEnv;
}
