import { ForbiddenException } from "@nestjs/common";
import type {
  CandidateInvite,
  CandidateWorkspace,
  CodeDraft,
  CodeExecution,
  ExamSession,
  ProctorAction,
  ProctorEvent,
  Submission
} from "@dcvp/shared";
import type { PrismaService } from "./prisma.service.js";
import { createId, nowIso } from "./platform-store.helpers.js";
import {
  mapCodeDraft,
  mapCodeExecution,
  mapExamSession,
  mapProctorAction,
  mapProctorEvent,
  mapSubmission,
  withRemainingSeconds
} from "./platform-store.mappers.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface CandidateWorkspaceStoreContext {
  readonly prisma: PrismaService;
  readonly runDatabase: DatabaseRunner;
}

export interface CandidateWorkspaceMemoryState {
  readonly submissions: readonly Submission[];
  readonly codeExecutions: readonly CodeExecution[];
  readonly proctorEvents: readonly ProctorEvent[];
  readonly proctorActions: readonly ProctorAction[];
  readonly codeDrafts: readonly CodeDraft[];
  readonly examSessions: readonly ExamSession[];
}

export async function getCandidateWorkspaceInStore(request: {
  readonly context: CandidateWorkspaceStoreContext;
  readonly invite: CandidateInvite;
  readonly memoryState: CandidateWorkspaceMemoryState;
}) {
  const { context, invite, memoryState } = request;
  const db = await context.runDatabase(async () => {
    const examSession = await ensureExamSession(context, invite);
    const [submissions, executions, proctorEvents, proctorActions, drafts] = await Promise.all([
      context.prisma.submission.findMany({
        where: { candidateId: invite.candidate.id },
        orderBy: { submittedAt: "desc" },
        include: { testResults: { orderBy: { testIndex: "asc" } } }
      }),
      context.prisma.codeExecution.findMany({
        where: { candidateId: invite.candidate.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { testResults: { orderBy: { testIndex: "asc" } } }
      }),
      context.prisma.proctorEvent.findMany({
        where: { candidateId: invite.candidate.id },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      context.prisma.proctorAction.findMany({
        where: { candidateId: invite.candidate.id },
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      context.prisma.codeDraft.findMany({
        where: { candidateId: invite.candidate.id },
        orderBy: { savedAt: "desc" }
      })
    ]);

    return {
      workspace: {
        ...invite,
        submissions: submissions.map((submission) => mapSubmission(submission)),
        executions: executions.map((execution) => mapCodeExecution(execution)),
        proctorEvents: proctorEvents.map((event) => mapProctorEvent(event)),
        proctorActions: proctorActions.map((action) => mapProctorAction(action)),
        examSession,
        drafts: drafts.map((draft) => mapCodeDraft(draft))
      } satisfies CandidateWorkspace,
      examSessions: memoryState.examSessions
    };
  });

  if (db) {
    return db;
  }

  const { session, examSessions } = ensureMemoryExamSession(invite, memoryState.examSessions);
  return {
    workspace: {
      ...invite,
      submissions: memoryState.submissions
        .filter((submission) => submission.candidateId === invite.candidate.id)
        .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt)),
      executions: memoryState.codeExecutions
        .filter((execution) => execution.candidateId === invite.candidate.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 20),
      proctorEvents: memoryState.proctorEvents.filter((event) => event.candidateId === invite.candidate.id),
      proctorActions: memoryState.proctorActions.filter((action) => action.candidateId === invite.candidate.id),
      examSession: session,
      drafts: memoryState.codeDrafts.filter((draft) => draft.candidateId === invite.candidate.id)
    } satisfies CandidateWorkspace,
    examSessions
  };
}

export async function assertExamSessionOpenInStore(request: {
  readonly context: CandidateWorkspaceStoreContext;
  readonly invite: CandidateInvite;
  readonly memoryActions: readonly ProctorAction[];
  readonly memorySessions: readonly ExamSession[];
}) {
  const { context, invite, memoryActions, memorySessions } = request;
  const db = await context.runDatabase(async () => {
    const session = await ensureExamSession(context, invite);
    const latestAction = await latestBlockingAction(context, invite);
    assertProctorActionAllowsExam(latestAction);
    if (session.remainingSeconds <= 0) {
      await context.prisma.examSession.update({
        where: {
          candidateId_examId: {
            candidateId: invite.candidate.id,
            examId: invite.exam.id
          }
        },
        data: { completedAt: new Date() }
      });
      throw new ForbiddenException("Exam time has expired");
    }

    return { examSessions: memorySessions };
  });

  if (db) {
    return db;
  }

  const { session, examSessions } = ensureMemoryExamSession(invite, memorySessions);
  const latestAction = latestMemoryBlockingAction(invite, memoryActions);
  assertProctorActionAllowsExam(latestAction);
  if (session.remainingSeconds <= 0) {
    throw new ForbiddenException("Exam time has expired");
  }
  return { examSessions };
}

async function latestBlockingAction(context: CandidateWorkspaceStoreContext, invite: CandidateInvite): Promise<ProctorAction | null> {
  const action = await context.prisma.proctorAction.findFirst({
    where: {
      candidateId: invite.candidate.id,
      type: { in: ["PAUSE_EXAM", "RESUME_EXAM", "TERMINATE_EXAM"] }
    },
    orderBy: { createdAt: "desc" }
  });
  return action ? mapProctorAction(action) : null;
}

function latestMemoryBlockingAction(invite: CandidateInvite, actions: readonly ProctorAction[]): ProctorAction | null {
  return [...actions]
    .filter((action) => action.candidateId === invite.candidate.id && (action.type === "PAUSE_EXAM" || action.type === "RESUME_EXAM" || action.type === "TERMINATE_EXAM"))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function assertProctorActionAllowsExam(action: ProctorAction | null) {
  if (action?.type === "TERMINATE_EXAM") {
    throw new ForbiddenException("Exam was terminated by a proctor");
  }
  if (action?.type === "PAUSE_EXAM") {
    throw new ForbiddenException("Exam is paused by a proctor");
  }
}

async function ensureExamSession(context: CandidateWorkspaceStoreContext, invite: CandidateInvite): Promise<ExamSession> {
  const now = new Date();
  const endsAt = new Date(now.getTime() + invite.exam.durationMinutes * 60 * 1000);
  const session = await context.prisma.examSession.upsert({
    where: {
      candidateId_examId: {
        candidateId: invite.candidate.id,
        examId: invite.exam.id
      }
    },
    update: {},
    create: {
      id: createId("session"),
      candidateId: invite.candidate.id,
      examId: invite.exam.id,
      startedAt: now,
      endsAt
    }
  });

  return mapExamSession(session);
}

function ensureMemoryExamSession(invite: CandidateInvite, memorySessions: readonly ExamSession[]) {
  const existing = memorySessions.find((session) => session.candidateId === invite.candidate.id && session.examId === invite.exam.id);
  if (existing) {
    return { session: withRemainingSeconds(existing), examSessions: memorySessions };
  }

  const startedAt = new Date();
  const session: ExamSession = {
    id: createId("session"),
    candidateId: invite.candidate.id,
    examId: invite.exam.id,
    startedAt: startedAt.toISOString(),
    endsAt: new Date(startedAt.getTime() + invite.exam.durationMinutes * 60 * 1000).toISOString(),
    serverNow: nowIso(),
    remainingSeconds: invite.exam.durationMinutes * 60
  };
  return { session, examSessions: [session, ...memorySessions] };
}
