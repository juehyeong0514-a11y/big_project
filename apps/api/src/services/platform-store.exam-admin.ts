import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type {
  AuthSession,
  Candidate,
  CreateExamInput,
  Exam,
  ExamDetail,
  Organization,
  Question,
  TestCase,
  UpdateExamInput
} from "@dcvp/shared";
import type { PrismaService } from "./prisma.service.js";
import { createId, nowIso } from "./platform-store.helpers.js";
import { mapExam, mapExamDetail } from "./platform-store.mappers.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface ExamAdminStoreContext {
  readonly prisma: PrismaService;
  readonly runDatabase: DatabaseRunner;
}

export interface ExamAdminMemoryState {
  readonly organization: Organization;
  readonly exams: readonly Exam[];
  readonly questions: readonly Question[];
  readonly candidates: readonly Candidate[];
  readonly testCases: readonly TestCase[];
}

export interface CreateExamRequest {
  readonly context: ExamAdminStoreContext;
  readonly input: CreateExamInput;
  readonly memoryState: ExamAdminMemoryState;
  readonly session: AuthSession;
}

export interface DeleteExamRequest {
  readonly context: ExamAdminStoreContext;
  readonly examId: string;
  readonly memoryState: ExamAdminMemoryState;
  readonly session: AuthSession;
}

export interface UpdateExamRequest {
  readonly context: ExamAdminStoreContext;
  readonly examId: string;
  readonly input: UpdateExamInput;
  readonly memoryState: ExamAdminMemoryState;
  readonly session: AuthSession;
}

export async function listExamsInStore(context: ExamAdminStoreContext, memoryState: ExamAdminMemoryState, session: AuthSession) {
  const db = await context.runDatabase(async () => {
    const exams = await context.prisma.exam.findMany({ where: scopedExamWhere(session), orderBy: { createdAt: "desc" } });
    return exams.map((exam) => mapExam(exam));
  });

  return db ?? [...memoryState.exams].filter((exam) => canAccessExam(session, exam)).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getExamDetailInStore(context: ExamAdminStoreContext, examId: string, memoryState: ExamAdminMemoryState, session: AuthSession) {
  const db = await context.runDatabase(async () => {
    const exam = await context.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          orderBy: { createdAt: "asc" },
          include: { testCases: { orderBy: { createdAt: "asc" } } }
        },
        candidates: { orderBy: { createdAt: "asc" } }
      }
    });

    if (!exam || exam.status === "DELETED") {
      throw new NotFoundException("Exam not found");
    }
    assertSessionCanAccessExam(session, exam.organizationId);

    return mapExamDetail(exam);
  });

  if (db) {
    return db;
  }

  const exam = memoryState.exams.find((item) => item.id === examId);
  if (!exam || exam.status === "DELETED") {
    throw new NotFoundException("Exam not found");
  }
  assertSessionCanAccessExam(session, exam.organizationId);

  return {
    ...exam,
    questions: memoryState.questions
      .filter((question) => question.examId === examId)
      .map((question) => ({
        ...question,
        testCases: memoryState.testCases.filter((testCase) => testCase.questionId === question.id)
      })),
    candidates: memoryState.candidates.filter((candidate) => candidate.examId === examId)
  } satisfies ExamDetail;
}

export async function createExamInStore(request: CreateExamRequest) {
  const { context, input, memoryState, session } = request;
  assertSessionCanManageExams(session);
  const db = await context.runDatabase(async () => {
    const exam = await context.prisma.exam.create({
      data: {
        id: createId("exam"),
        organizationId: session.organization.id,
        title: input.title,
        description: input.description,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        durationMinutes: input.durationMinutes,
        status: "DRAFT",
        languages: input.languages,
        proctoringEnabled: input.proctoringEnabled,
        identityVerificationEnabled: input.identityVerificationEnabled,
        mobileCameraRequired: input.mobileCameraRequired,
        screenShareRequired: input.screenShareRequired
      }
    });

    return mapExam(exam);
  });

  if (db) {
    return { exam: db, exams: memoryState.exams };
  }

  const exam: Exam = {
    id: createId("exam"),
    organizationId: session.organization.id,
    title: input.title,
    description: input.description,
    startAt: input.startAt,
    endAt: input.endAt,
    durationMinutes: input.durationMinutes,
    status: "DRAFT",
    languages: input.languages,
    proctoringEnabled: input.proctoringEnabled,
    identityVerificationEnabled: input.identityVerificationEnabled,
    mobileCameraRequired: input.mobileCameraRequired,
    screenShareRequired: input.screenShareRequired,
    createdAt: nowIso()
  };

  return { exam, exams: [exam, ...memoryState.exams] };
}

export async function updateExamInStore(request: UpdateExamRequest) {
  const { context, examId, input, memoryState, session } = request;
  assertSessionCanManageExams(session);
  const db = await context.runDatabase(async () => {
    const exam = await context.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || exam.status === "DELETED") {
      throw new NotFoundException("Exam not found");
    }
    assertSessionCanAccessExam(session, exam.organizationId);
    const updated = await context.prisma.exam.update({
      where: { id: examId },
      data: {
        title: input.title,
        description: input.description,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        durationMinutes: input.durationMinutes,
        languages: input.languages,
        proctoringEnabled: input.proctoringEnabled,
        identityVerificationEnabled: input.identityVerificationEnabled,
        mobileCameraRequired: input.mobileCameraRequired,
        screenShareRequired: input.screenShareRequired
      }
    });
    return mapExam(updated);
  });

  if (db) {
    return { exam: db, exams: memoryState.exams };
  }

  const exam = memoryState.exams.find((item) => item.id === examId);
  if (!exam || exam.status === "DELETED") {
    throw new NotFoundException("Exam not found");
  }
  assertSessionCanAccessExam(session, exam.organizationId);
  const updated: Exam = { ...exam, ...input };
  return { exam: updated, exams: memoryState.exams.map((item) => item.id === examId ? updated : item) };
}

export async function deleteExamInStore(request: DeleteExamRequest) {
  const { context, examId, memoryState, session } = request;
  assertSessionCanManageExams(session);
  const db = await context.runDatabase(async () => {
    const exam = await context.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || exam.status === "DELETED") {
      throw new NotFoundException("Exam not found");
    }
    assertSessionCanAccessExam(session, exam.organizationId);
    const deleted = await context.prisma.exam.update({ where: { id: examId }, data: { status: "DELETED" } });
    return mapExam(deleted);
  });

  if (db) {
    return { exam: db, exams: memoryState.exams };
  }

  const exam = memoryState.exams.find((item) => item.id === examId);
  if (!exam || exam.status === "DELETED") {
    throw new NotFoundException("Exam not found");
  }
  assertSessionCanAccessExam(session, exam.organizationId);

  const deleted: Exam = { ...exam, status: "DELETED" };
  return { exam: deleted, exams: memoryState.exams.map((item) => (item.id === examId ? deleted : item)) };
}

export function assertSessionCanManageExams(session: AuthSession) {
  if (session.user.role !== "ADMIN" && session.user.role !== "ORGANIZATION") {
    throw new ForbiddenException("조직 관리자 이상만 시험을 관리할 수 있습니다.");
  }
}

export function assertSessionCanAccessExam(session: AuthSession, organizationId: string) {
  if (session.user.role !== "ADMIN" && session.organization.id !== organizationId) {
    throw new NotFoundException("Exam not found");
  }
}

export function canAccessExam(session: AuthSession, exam: Exam) {
  return exam.status !== "DELETED" && (session.user.role === "ADMIN" || exam.organizationId === session.organization.id);
}

function scopedExamWhere(session: AuthSession) {
  return session.user.role === "ADMIN"
    ? { status: { not: "DELETED" as const } }
    : { status: { not: "DELETED" as const }, organizationId: session.organization.id };
}
