import type {
  Candidate,
  CandidateInvite,
  CodeDraft,
  CodeExecution,
  CodeRunInput,
  CodeSubmitInput,
  Question,
  SaveCodeDraftInput,
  Submission,
  TestCase
} from "@dcvp/shared";
import type { CodeRunnerService } from "./code-runner.service.js";
import type { PrismaService } from "./prisma.service.js";
import { createId, nowIso } from "./platform-store.helpers.js";
import { mapCodeDraft, mapCodeExecution, mapSubmission } from "./platform-store.mappers.js";
import { calculateSubmissionScore, evaluateTextAnswer } from "./platform-store.execution-scoring.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface ExecutionStoreContext {
  readonly prisma: PrismaService;
  readonly codeRunner: CodeRunnerService;
  readonly runDatabase: DatabaseRunner;
}

export interface SaveCodeDraftRequest {
  readonly context: ExecutionStoreContext;
  readonly invite: CandidateInvite;
  readonly input: SaveCodeDraftInput;
  readonly memoryDrafts: readonly CodeDraft[];
}

export interface RunCodeRequest {
  readonly context: ExecutionStoreContext;
  readonly invite: CandidateInvite;
  readonly input: CodeRunInput;
  readonly testCases: readonly TestCase[];
  readonly memoryExecutions: readonly CodeExecution[];
}

export interface SubmitCodeRequest {
  readonly context: ExecutionStoreContext;
  readonly invite: CandidateInvite;
  readonly input: CodeSubmitInput;
  readonly question: Question;
  readonly testCases: readonly TestCase[];
  readonly memoryState: {
    readonly submissions: readonly Submission[];
    readonly candidates: readonly Candidate[];
  };
}

export async function saveCandidateCodeDraftInStore(request: SaveCodeDraftRequest) {
  const { context, input, invite, memoryDrafts } = request;
  const db = await context.runDatabase(async () => {
    const draft = await context.prisma.codeDraft.upsert({
      where: {
        candidateId_questionId_language: {
          candidateId: invite.candidate.id,
          questionId: input.questionId,
          language: input.language
        }
      },
      update: { code: input.code },
      create: {
        id: createId("draft"),
        candidateId: invite.candidate.id,
        examId: invite.exam.id,
        questionId: input.questionId,
        language: input.language,
        code: input.code
      }
    });

    return mapCodeDraft(draft);
  });

  if (db) {
    return { draft: db, codeDrafts: memoryDrafts };
  }

  const existing = memoryDrafts.find(
    (draft) => draft.candidateId === invite.candidate.id && draft.questionId === input.questionId && draft.language === input.language
  );
  const draft: CodeDraft = {
    id: existing?.id ?? createId("draft"),
    candidateId: invite.candidate.id,
    examId: invite.exam.id,
    questionId: input.questionId,
    language: input.language,
    code: input.code,
    savedAt: nowIso(),
    createdAt: existing?.createdAt ?? nowIso()
  };
  return { draft, codeDrafts: [draft, ...memoryDrafts.filter((item) => item.id !== draft.id)] };
}

export async function runCandidateCodeInStore(request: RunCodeRequest) {
  const { context, input, invite, testCases, memoryExecutions } = request;
  const result = await context.codeRunner.judge(input.language, input.code, [...testCases], invite.candidate.id);
  const db = await context.runDatabase(async () => {
    const execution = await context.prisma.codeExecution.create({
      data: {
        id: createId("exec"),
        candidateId: invite.candidate.id,
        questionId: input.questionId,
        language: input.language,
        code: input.code,
        status: result.status,
        output: result.output,
        error: result.error,
        executionTimeMs: result.executionTimeMs,
        memoryUsageMb: result.memoryUsageMb,
        passedTests: result.passedTests,
        totalTests: result.totalTests,
        testResults: {
          create: result.testResults.map((testResult) => ({
            id: createId("result"),
            testIndex: testResult.testIndex,
            input: testResult.input,
            expectedOutput: testResult.expectedOutput,
            actualOutput: testResult.actualOutput,
            passed: testResult.passed,
            error: testResult.error,
            executionTimeMs: testResult.executionTimeMs,
            isPublic: testResult.isPublic
          }))
        }
      },
      include: { testResults: { orderBy: { testIndex: "asc" } } }
    });

    return mapCodeExecution(execution);
  });

  if (db) {
    return { execution: db, codeExecutions: memoryExecutions };
  }

  const executionId = createId("exec");
  const createdAt = nowIso();
  const execution: CodeExecution = {
    id: executionId,
    candidateId: invite.candidate.id,
    questionId: input.questionId,
    language: input.language,
    code: input.code,
    status: result.status,
    output: result.output,
    error: result.error,
    executionTimeMs: result.executionTimeMs,
    memoryUsageMb: result.memoryUsageMb,
    passedTests: result.passedTests,
    totalTests: result.totalTests,
    testResults: result.testResults.map((testResult) => ({
      id: createId("result"),
      codeExecutionId: executionId,
      submissionId: undefined,
      ...testResult,
      createdAt
    })),
    createdAt
  };
  return { execution, codeExecutions: [execution, ...memoryExecutions] };
}

export async function submitCandidateCodeInStore(request: SubmitCodeRequest) {
  const { context, input, invite, question, testCases, memoryState } = request;
  const runResult =
    question.type === "CODING"
      ? await context.codeRunner.judge(input.language, input.code, [...testCases], invite.candidate.id)
      : evaluateTextAnswer(question, input.code);
  const score = calculateSubmissionScore(runResult);

  const db = await context.runDatabase(async () => {
    const submission = await context.prisma.submission.create({
      data: {
        id: createId("submission"),
        examId: invite.exam.id,
        candidateId: invite.candidate.id,
        questionId: input.questionId,
        language: input.language,
        code: input.code,
        score,
        passedTests: runResult.passedTests,
        totalTests: runResult.totalTests,
        testResults: {
          create: runResult.testResults.map((testResult) => ({
            id: createId("result"),
            testIndex: testResult.testIndex,
            input: testResult.input,
            expectedOutput: testResult.expectedOutput,
            actualOutput: testResult.actualOutput,
            passed: testResult.passed,
            error: testResult.error,
            executionTimeMs: testResult.executionTimeMs,
            isPublic: testResult.isPublic
          }))
        }
      },
      include: { testResults: { orderBy: { testIndex: "asc" } } }
    });

    await context.prisma.candidate.update({
      where: { id: invite.candidate.id },
      data: { status: "IN_PROGRESS" }
    });

    return mapSubmission(submission);
  });

  if (db) {
    return { submission: db, submissions: memoryState.submissions, candidates: memoryState.candidates };
  }

  const submissionId = createId("submission");
  const submittedAt = nowIso();
  const submission: Submission = {
    id: submissionId,
    examId: invite.exam.id,
    candidateId: invite.candidate.id,
    questionId: input.questionId,
    language: input.language,
    code: input.code,
    score,
    passedTests: runResult.passedTests,
    totalTests: runResult.totalTests,
    testResults: runResult.testResults.map((testResult) => ({
      id: createId("result"),
      codeExecutionId: undefined,
      submissionId,
      ...testResult,
      createdAt: submittedAt
    })),
    submittedAt
  };
  const candidates = memoryState.candidates.map((candidate) =>
    candidate.id === invite.candidate.id ? { ...candidate, status: "IN_PROGRESS" as const } : candidate
  );
  return { submission, submissions: [submission, ...memoryState.submissions], candidates };
}
