import { NotFoundException } from "@nestjs/common";
import type {
  Candidate,
  CandidateInvite,
  EnvironmentCheck,
  Exam,
  IdentityVerification,
  Organization,
  ProctorDevice,
  Question
} from "@dcvp/shared";
import type { PrismaService } from "./prisma.service.js";
import {
  mapCandidate,
  mapCandidateQuestion,
  mapEnvironmentCheck,
  mapExam,
  mapIdentityVerification,
  mapOrganization,
  mapProctorDevice,
  omitExpectedAnswer
} from "./platform-store.mappers.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface CandidatePortalStoreContext {
  readonly prisma: PrismaService;
  readonly runDatabase: DatabaseRunner;
}

export interface CandidatePortalMemoryState {
  readonly organization: Organization;
  readonly exams: readonly Exam[];
  readonly questions: readonly Question[];
  readonly candidates: readonly Candidate[];
  readonly proctorDevices: readonly ProctorDevice[];
  readonly identityVerifications: readonly IdentityVerification[];
  readonly environmentChecks: readonly EnvironmentCheck[];
}

export interface CandidatePortalRequest {
  readonly context: CandidatePortalStoreContext;
  readonly inviteToken: string;
  readonly memoryState: CandidatePortalMemoryState;
}

export async function getCandidateInviteInStore(request: CandidatePortalRequest): Promise<CandidateInvite> {
  const { context, inviteToken, memoryState } = request;
  const db = await context.runDatabase(async () => {
    const candidate = await context.prisma.candidate.findUnique({
      where: { inviteToken },
      include: {
        identityVerifications: { orderBy: { createdAt: "desc" }, take: 1 },
        environmentChecks: { orderBy: { createdAt: "desc" }, take: 1 },
        proctorDevices: true,
        exam: {
          include: {
            organization: true,
            questions: { orderBy: { createdAt: "asc" } }
          }
        }
      }
    });

    if (!candidate || candidate.exam.status === "DELETED") {
      throw new NotFoundException("Invite not found");
    }

    return {
      candidate: mapCandidate(candidate),
      exam: mapExam(candidate.exam),
      organization: mapOrganization(candidate.exam.organization),
      questions: candidate.exam.questions.map((question) => mapCandidateQuestion(question)),
      proctorDevices: candidate.proctorDevices.map((device) => mapProctorDevice(device)),
      identityVerification: candidate.identityVerifications[0] ? mapIdentityVerification(candidate.identityVerifications[0]) : undefined,
      environmentCheck: candidate.environmentChecks[0] ? mapEnvironmentCheck(candidate.environmentChecks[0]) : undefined
    };
  });

  if (db) {
    return db;
  }

  const candidate = memoryState.candidates.find((item) => item.inviteToken === inviteToken);
  if (!candidate) {
    throw new NotFoundException("Invite not found");
  }

  const exam = memoryState.exams.find((item) => item.id === candidate.examId);
  if (!exam || exam.status === "DELETED") {
    throw new NotFoundException("Exam not found");
  }

  return {
    candidate,
    exam,
    organization: memoryState.organization,
    questions: memoryState.questions.filter((question) => question.examId === exam.id).map((question) => omitExpectedAnswer(question)),
    proctorDevices: memoryState.proctorDevices.filter((device) => device.candidateId === candidate.id),
    identityVerification: memoryState.identityVerifications.find((verification) => verification.candidateId === candidate.id),
    environmentCheck: memoryState.environmentChecks.find((check) => check.candidateId === candidate.id)
  };
}

export async function markCandidateReadyInStore(request: CandidatePortalRequest) {
  const { context, inviteToken, memoryState } = request;
  const db = await context.runDatabase(async () => {
    const candidate = await context.prisma.candidate.findUnique({ where: { inviteToken } });
    if (!candidate) {
      throw new NotFoundException("Invite not found");
    }

    await context.prisma.candidate.update({
      where: { inviteToken },
      data: { status: "READY" }
    });

    return getCandidateInviteInStore(request);
  });

  if (db) {
    return { invite: db, candidates: memoryState.candidates };
  }

  const candidate = memoryState.candidates.find((item) => item.inviteToken === inviteToken);
  if (!candidate) {
    throw new NotFoundException("Invite not found");
  }

  const candidates = memoryState.candidates.map((item) => (item.inviteToken === inviteToken ? { ...item, status: "READY" as const } : item));
  return {
    invite: await getCandidateInviteInStore({ ...request, memoryState: { ...memoryState, candidates } }),
    candidates
  };
}
