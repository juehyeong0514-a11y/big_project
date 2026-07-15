import type { CodeExecution, Question } from "@dcvp/shared";
import type { CodeRunnerService } from "./code-runner.service.js";

type ExecutionResult = Awaited<ReturnType<CodeRunnerService["judge"]>>;

export function evaluateTextAnswer(question: Question, answer: string): ExecutionResult {
  const expected = question.expectedAnswer;
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedExpected = normalizeAnswer(expected ?? "");
  const isObjective = question.type === "MULTIPLE_CHOICE" || question.type === "SHORT_ANSWER";
  const passed = isObjective && normalizedExpected.length > 0 && normalizedAnswer === normalizedExpected;
  return {
    status: "SUCCESS",
    output: passed ? "정답 기준과 일치합니다." : "주관식 답안이 저장되었습니다.",
    error: undefined,
    executionTimeMs: 0,
    memoryUsageMb: 0,
    passedTests: passed ? 1 : question.type === "ESSAY" ? 1 : 0,
    totalTests: 1,
    testResults: [
      {
        testIndex: 1,
        input: answer,
        expectedOutput: expected ?? "감독관/AI 검토",
        actualOutput: answer,
        passed: question.type === "ESSAY" || passed,
        error: undefined,
        executionTimeMs: 0,
        isPublic: false
      }
    ]
  };
}

export function calculateSubmissionScore(result: { readonly passedTests: number; readonly totalTests: number; readonly status: CodeExecution["status"] }) {
  return result.totalTests > 0 ? Math.round((result.passedTests / result.totalTests) * 100) : result.status === "SUCCESS" ? 100 : 0;
}

function normalizeAnswer(answer: string) {
  return answer.trim().replace(/\s+/g, " ").toLowerCase();
}
