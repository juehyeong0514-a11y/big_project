import type { CodeDraft, CodeExecution, ExamSession, JudgeTestResult, Submission } from "@dcvp/shared";

export function mapJudgeTestResult(testResult: {
    id: string;
    codeExecutionId: string | null;
    submissionId: string | null;
    testIndex: number;
    input: string;
    expectedOutput: string;
    actualOutput: string;
    passed: boolean;
    error: string | null;
    executionTimeMs: number;
    isPublic: boolean;
    createdAt: Date;
  }): JudgeTestResult {
    return {
      id: testResult.id,
      codeExecutionId: testResult.codeExecutionId ?? undefined,
      submissionId: testResult.submissionId ?? undefined,
      testIndex: testResult.testIndex,
      input: testResult.input,
      expectedOutput: testResult.expectedOutput,
      actualOutput: testResult.actualOutput,
      passed: testResult.passed,
      error: testResult.error ?? undefined,
      executionTimeMs: testResult.executionTimeMs,
      isPublic: testResult.isPublic,
      createdAt: testResult.createdAt.toISOString()
    };
  }

export function mapSubmission(submission: {
    id: string;
    examId: string;
    candidateId: string;
    questionId: string;
    language: string;
    code: string;
    score: number;
    passedTests: number;
    totalTests: number;
    submittedAt: Date;
    testResults?: Array<{
      id: string;
      codeExecutionId: string | null;
      submissionId: string | null;
      testIndex: number;
      input: string;
      expectedOutput: string;
      actualOutput: string;
      passed: boolean;
      error: string | null;
      executionTimeMs: number;
      isPublic: boolean;
      createdAt: Date;
    }>;
  }): Submission {
    return {
      id: submission.id,
      examId: submission.examId,
      candidateId: submission.candidateId,
      questionId: submission.questionId,
      language: submission.language,
      code: submission.code,
      score: submission.score,
      passedTests: submission.passedTests,
      totalTests: submission.totalTests,
      testResults: (submission.testResults ?? []).map((testResult) => mapJudgeTestResult(testResult)),
      submittedAt: submission.submittedAt.toISOString()
    };
  }

export function mapCodeExecution(execution: {
    id: string;
    candidateId: string;
    questionId: string;
    language: string;
    code: string;
    status: CodeExecution["status"];
    output: string;
    error: string | null;
    executionTimeMs: number;
    memoryUsageMb: number;
    passedTests: number;
    totalTests: number;
    createdAt: Date;
    testResults?: Array<{
      id: string;
      codeExecutionId: string | null;
      submissionId: string | null;
      testIndex: number;
      input: string;
      expectedOutput: string;
      actualOutput: string;
      passed: boolean;
      error: string | null;
      executionTimeMs: number;
      isPublic: boolean;
      createdAt: Date;
    }>;
  }): CodeExecution {
    return {
      id: execution.id,
      candidateId: execution.candidateId,
      questionId: execution.questionId,
      language: execution.language,
      code: execution.code,
      status: execution.status,
      output: execution.output,
      error: execution.error ?? undefined,
      executionTimeMs: execution.executionTimeMs,
      memoryUsageMb: execution.memoryUsageMb,
      passedTests: execution.passedTests,
      totalTests: execution.totalTests,
      testResults: (execution.testResults ?? []).map((testResult) => mapJudgeTestResult(testResult)),
      createdAt: execution.createdAt.toISOString()
    };
  }

export function mapExamSession(session: {
    id: string;
    candidateId: string;
    examId: string;
    startedAt: Date;
    endsAt: Date;
    completedAt: Date | null;
  }): ExamSession {
    const serverNow = new Date();
    return {
      id: session.id,
      candidateId: session.candidateId,
      examId: session.examId,
      startedAt: session.startedAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      serverNow: serverNow.toISOString(),
      remainingSeconds: Math.max(0, Math.floor((session.endsAt.getTime() - serverNow.getTime()) / 1000))
    };
  }

export function withRemainingSeconds(session: ExamSession): ExamSession {
    const serverNow = new Date();
    return {
      ...session,
      serverNow: serverNow.toISOString(),
      remainingSeconds: Math.max(0, Math.floor((new Date(session.endsAt).getTime() - serverNow.getTime()) / 1000))
    };
  }

export function mapCodeDraft(draft: {
    id: string;
    candidateId: string;
    examId: string;
    questionId: string;
    language: string;
    code: string;
    savedAt: Date;
    createdAt: Date;
  }): CodeDraft {
    return {
      id: draft.id,
      candidateId: draft.candidateId,
      examId: draft.examId,
      questionId: draft.questionId,
      language: draft.language,
      code: draft.code,
      savedAt: draft.savedAt.toISOString(),
      createdAt: draft.createdAt.toISOString()
    };
  }
