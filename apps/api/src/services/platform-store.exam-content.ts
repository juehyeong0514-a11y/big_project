import { NotFoundException } from "@nestjs/common";
import type {
  AuthSession,
  Candidate,
  CreateCandidateInput,
  CreateQuestionInput,
  CreateTestCaseInput,
  Question,
  TestCase
} from "@dcvp/shared";
import type { ExamAdminMemoryState, ExamAdminStoreContext } from "./platform-store.exam-admin.js";
import { assertSessionCanAccessExam, assertSessionCanManageExams } from "./platform-store.exam-admin.js";
import { createId, createSecretToken, nowIso } from "./platform-store.helpers.js";
import { mapCandidate, mapQuestion, mapTestCase } from "./platform-store.mappers.js";

export interface AddQuestionRequest {
  readonly context: ExamAdminStoreContext;
  readonly examId: string;
  readonly input: CreateQuestionInput;
  readonly memoryState: ExamAdminMemoryState;
  readonly session: AuthSession;
}

export interface AddTestCaseRequest {
  readonly context: ExamAdminStoreContext;
  readonly questionId: string;
  readonly input: CreateTestCaseInput;
  readonly memoryState: ExamAdminMemoryState;
  readonly session: AuthSession;
}

export interface AddCandidateRequest {
  readonly context: ExamAdminStoreContext;
  readonly examId: string;
  readonly input: CreateCandidateInput;
  readonly memoryState: ExamAdminMemoryState;
  readonly session: AuthSession;
}

export async function addQuestionInStore(request: AddQuestionRequest) {
  const { context, examId, input, memoryState, session } = request;
  assertSessionCanManageExams(session);
  const db = await context.runDatabase(async () => {
    await assertDbExamExists(context, examId, session);
    const question = await context.prisma.question.create({
      data: {
        id: createId("question"),
        examId,
        title: input.title,
        description: input.description,
        type: input.type,
        points: input.points,
        difficulty: input.difficulty,
        timeLimitMs: input.timeLimitMs,
        memoryLimitMb: input.memoryLimitMb,
        choices: input.choices,
        expectedAnswer: input.expectedAnswer
      }
    });

    return mapQuestion(question);
  });

  if (db) {
    return { question: db, questions: memoryState.questions };
  }

  assertMemoryExamExists(memoryState, examId, session);
  const question: Question = {
    id: createId("question"),
    examId,
    title: input.title,
    description: input.description,
    type: input.type,
    points: input.points,
    difficulty: input.difficulty,
    timeLimitMs: input.timeLimitMs,
    memoryLimitMb: input.memoryLimitMb,
    choices: input.choices,
    expectedAnswer: input.expectedAnswer,
    createdAt: nowIso()
  };

  return { question, questions: [...memoryState.questions, question] };
}

export async function addTestCaseInStore(request: AddTestCaseRequest) {
  const { context, input, memoryState, questionId, session } = request;
  assertSessionCanManageExams(session);
  const db = await context.runDatabase(async () => {
    await assertDbQuestionExists(context, questionId, session);
    const testCase = await context.prisma.testCase.create({
      data: {
        id: createId("case"),
        questionId,
        input: input.input,
        expectedOutput: input.expectedOutput,
        isPublic: input.isPublic
      }
    });

    return mapTestCase(testCase);
  });

  if (db) {
    return { testCase: db, testCases: memoryState.testCases };
  }

  const question = memoryState.questions.find((item) => item.id === questionId);
  if (!question) {
    throw new NotFoundException("Question not found");
  }
  assertMemoryExamExists(memoryState, question.examId, session);

  const testCase: TestCase = {
    id: createId("case"),
    questionId,
    input: input.input,
    expectedOutput: input.expectedOutput,
    isPublic: input.isPublic,
    createdAt: nowIso()
  };

  return { testCase, testCases: [...memoryState.testCases, testCase] };
}

export async function addCandidateInStore(request: AddCandidateRequest) {
  const { context, examId, input, memoryState, session } = request;
  assertSessionCanManageExams(session);
  const db = await context.runDatabase(async () => {
    await assertDbExamExists(context, examId, session);
    const candidate = await context.prisma.candidate.create({
      data: {
        id: createId("candidate"),
        examId,
        name: input.name,
        email: input.email,
        status: "INVITED",
        inviteToken: createSecretToken("invite")
      }
    });

    return mapCandidate(candidate);
  });

  if (db) {
    return { candidate: db, candidates: memoryState.candidates };
  }

  assertMemoryExamExists(memoryState, examId, session);
  const candidate: Candidate = {
    id: createId("candidate"),
    examId,
    name: input.name,
    email: input.email,
    status: "INVITED",
    inviteToken: createSecretToken("invite"),
    createdAt: nowIso()
  };

  return { candidate, candidates: [...memoryState.candidates, candidate] };
}

async function assertDbExamExists(context: ExamAdminStoreContext, examId: string, session: AuthSession) {
  const exam = await context.prisma.exam.findUnique({ where: { id: examId }, select: { id: true, status: true, organizationId: true } });
  if (!exam || exam.status === "DELETED") {
    throw new NotFoundException("Exam not found");
  }
  assertSessionCanAccessExam(session, exam.organizationId);
}

async function assertDbQuestionExists(context: ExamAdminStoreContext, questionId: string, session: AuthSession) {
  const question = await context.prisma.question.findUnique({ where: { id: questionId }, select: { id: true, exam: { select: { status: true, organizationId: true } } } });
  if (!question) {
    throw new NotFoundException("Question not found");
  }
  if (question.exam.status === "DELETED") {
    throw new NotFoundException("Exam not found");
  }
  assertSessionCanAccessExam(session, question.exam.organizationId);
}

function assertMemoryExamExists(memoryState: ExamAdminMemoryState, examId: string, session: AuthSession) {
  const exam = memoryState.exams.find((item) => item.id === examId);
  if (!exam || exam.status === "DELETED") {
    throw new NotFoundException("Exam not found");
  }
  assertSessionCanAccessExam(session, exam.organizationId);
}
