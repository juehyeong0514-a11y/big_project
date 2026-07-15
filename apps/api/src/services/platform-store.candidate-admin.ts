import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AuthSession, Candidate, CreateProctorActionInput, Exam, ProctorAction } from "@dcvp/shared";
import type { PrismaService } from "./prisma.service.js";
import { assertSessionCanAccessExam, assertSessionCanManageExams } from "./platform-store.exam-admin.js";
import { createId, nowIso } from "./platform-store.helpers.js";
import { mapCandidate, mapExam, mapProctorAction } from "./platform-store.mappers.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface CandidateAdminStoreContext {
  readonly prisma: PrismaService;
  readonly runDatabase: DatabaseRunner;
}

export interface CandidateAdminMemoryState {
  readonly candidates: readonly Candidate[];
  readonly exams: readonly Exam[];
  readonly proctorActions: readonly ProctorAction[];
}

export async function findCandidateWithExamInStore(context: CandidateAdminStoreContext, candidateId: string, memoryState: CandidateAdminMemoryState, session?: AuthSession) {
  const db = await context.runDatabase(async () => {
    const candidate = await context.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { exam: true }
    });

    if (!candidate || candidate.exam.status === "DELETED") {
      throw new NotFoundException("Candidate not found");
    }
    if (session) {
      assertSessionCanAccessExam(session, candidate.exam.organizationId);
    }

    return {
      candidate: mapCandidate(candidate),
      exam: mapExam(candidate.exam)
    };
  });

  if (db) {
    return db;
  }

  const candidate = memoryState.candidates.find((item) => item.id === candidateId);
  if (!candidate) {
    throw new NotFoundException("Candidate not found");
  }

  const exam = memoryState.exams.find((item) => item.id === candidate.examId);
  if (!exam || exam.status === "DELETED") {
    throw new NotFoundException("Exam not found");
  }
  if (session) {
    assertSessionCanAccessExam(session, exam.organizationId);
  }

  return { candidate, exam };
}

export async function findManageableCandidateWithExamInStore(context: CandidateAdminStoreContext, candidateId: string, memoryState: CandidateAdminMemoryState, session: AuthSession) {
  assertSessionCanManageExams(session);
  return findCandidateWithExamInStore(context, candidateId, memoryState, session);
}

export async function createProctorActionInStore(request: {
  readonly context: CandidateAdminStoreContext;
  readonly candidateId: string;
  readonly input: CreateProctorActionInput;
  readonly memoryState: CandidateAdminMemoryState;
  readonly session: AuthSession;
}) {
  const { context, candidateId, input, memoryState, session } = request;
  if (session.user.role !== "ADMIN" && session.user.role !== "ORGANIZATION" && session.user.role !== "PROCTOR") {
    throw new ForbiddenException("감독 권한이 필요합니다.");
  }
  const candidateWithExam = await findCandidateWithExamInStore(context, candidateId, memoryState, session);
  const db = await context.runDatabase(async () => {
    const action = await context.prisma.proctorAction.create({
      data: {
        id: createId("proctor_action"),
        candidateId,
        examId: candidateWithExam.exam.id,
        type: input.type,
        message: input.message
      }
    });

    return mapProctorAction(action);
  });

  if (db) {
    return { action: db, proctorActions: memoryState.proctorActions };
  }

  const action: ProctorAction = {
    id: createId("proctor_action"),
    candidateId,
    examId: candidateWithExam.exam.id,
    type: input.type,
    message: input.message,
    createdAt: nowIso()
  };
  return { action, proctorActions: [action, ...memoryState.proctorActions] };
}
