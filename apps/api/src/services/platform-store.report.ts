import { NotFoundException } from "@nestjs/common";
import type {
  AuthSession,
  Candidate,
  CodeExecution,
  CompetencyReport,
  EnvironmentCheck,
  Exam,
  ExamReport,
  IdentityVerification,
  InviteEmailLog,
  LiveProctorExamState,
  ProctorAction,
  ProctorDevice,
  ProctorEvent,
  Submission
} from "@dcvp/shared";
import type { PrismaService } from "./prisma.service.js";
import { calculateRiskLevel, calculateRiskScore } from "./platform-store.helpers.js";
import { assertSessionCanAccessExam } from "./platform-store.exam-admin.js";
import {
  mapCandidate,
  mapCodeExecution,
  mapCompetencyReport,
  mapEnvironmentCheck,
  mapExam,
  mapIdentityVerification,
  mapInviteEmailLog,
  mapProctorAction,
  mapProctorDevice,
  mapProctorEvent,
  mapSubmission
} from "./platform-store.mappers.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface ReportStoreContext {
  readonly prisma: PrismaService;
  readonly runDatabase: DatabaseRunner;
}

export interface ReportMemoryState {
  readonly exams: readonly Exam[];
  readonly candidates: readonly Candidate[];
  readonly submissions: readonly Submission[];
  readonly codeExecutions: readonly CodeExecution[];
  readonly competencyReports: readonly CompetencyReport[];
  readonly identityVerifications: readonly IdentityVerification[];
  readonly environmentChecks: readonly EnvironmentCheck[];
  readonly inviteEmailLogs: readonly InviteEmailLog[];
  readonly proctorEvents: readonly ProctorEvent[];
  readonly proctorDevices: readonly ProctorDevice[];
  readonly proctorActions: readonly ProctorAction[];
}

export interface GetExamReportRequest {
  readonly context: ReportStoreContext;
  readonly examId: string;
  readonly memoryState: ReportMemoryState;
  readonly session: AuthSession;
}

export async function getExamReportInStore(request: GetExamReportRequest): Promise<ExamReport> {
  const { context, examId, memoryState, session } = request;
  const db = await context.runDatabase(async () => {
    const exam = await context.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        candidates: {
          orderBy: { createdAt: "asc" },
          include: {
            submissions: {
              orderBy: { submittedAt: "desc" },
              include: { testResults: { orderBy: { testIndex: "asc" } } }
            },
            executions: {
              orderBy: { createdAt: "desc" },
              take: 20,
              include: { testResults: { orderBy: { testIndex: "asc" } } }
            },
            proctorEvents: { orderBy: { createdAt: "desc" }, take: 50 },
            proctorDevices: true,
            proctorActions: { orderBy: { createdAt: "desc" }, take: 50 },
            competencyReports: { orderBy: { createdAt: "desc" }, take: 20 },
            identityVerifications: { orderBy: { createdAt: "desc" }, take: 1 },
            environmentChecks: { orderBy: { createdAt: "desc" }, take: 1 },
            inviteEmailLogs: { orderBy: { createdAt: "desc" }, take: 20 }
          }
        }
      }
    });

    if (!exam || exam.status === "DELETED") {
      throw new NotFoundException("Exam not found");
    }
    assertSessionCanAccessExam(session, exam.organizationId);

    return {
      exam: mapExam(exam),
      candidates: exam.candidates.map((candidate) => {
        const submissions = candidate.submissions.map((submission) => mapSubmission(submission));
        const executions = candidate.executions.map((execution) => mapCodeExecution(execution));
        const aiReports = candidate.competencyReports.map((aiReport) => mapCompetencyReport(aiReport));
        const identityVerifications = candidate.identityVerifications.map((verification) => mapIdentityVerification(verification));
        const environmentChecks = candidate.environmentChecks.map((check) => mapEnvironmentCheck(check));
        const inviteEmailLogs = candidate.inviteEmailLogs.map((log) => mapInviteEmailLog(log));
        const proctorEvents = candidate.proctorEvents.map((event) => mapProctorEvent(event));
        const proctorActions = candidate.proctorActions.map((action) => mapProctorAction(action));
        return buildCandidateReport({
          candidate: mapCandidate(candidate),
          submissions,
          executions,
          aiReports,
          identityVerifications,
          environmentChecks,
          inviteEmailLogs,
          proctorEvents,
          proctorDevices: candidate.proctorDevices.map((device) => mapProctorDevice(device)),
          proctorActions
        });
      })
    };
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
    exam,
    candidates: memoryState.candidates
      .filter((candidate) => candidate.examId === examId)
      .map((candidate) =>
        buildCandidateReport({
          candidate,
          submissions: sortByNewest(memoryState.submissions.filter((submission) => submission.candidateId === candidate.id), "submittedAt"),
          executions: sortByNewest(memoryState.codeExecutions.filter((execution) => execution.candidateId === candidate.id), "createdAt"),
          aiReports: memoryState.competencyReports.filter((aiReport) => aiReport.candidateId === candidate.id),
          identityVerifications: memoryState.identityVerifications.filter((verification) => verification.candidateId === candidate.id),
          environmentChecks: memoryState.environmentChecks.filter((check) => check.candidateId === candidate.id),
          inviteEmailLogs: memoryState.inviteEmailLogs.filter((log) => log.candidateId === candidate.id),
          proctorEvents: memoryState.proctorEvents.filter((event) => event.candidateId === candidate.id),
          proctorDevices: memoryState.proctorDevices.filter((device) => device.candidateId === candidate.id),
          proctorActions: memoryState.proctorActions.filter((action) => action.candidateId === candidate.id)
        })
      )
  };
}

export function buildLiveProctorState(report: ExamReport): LiveProctorExamState {
  return {
    exam: report.exam,
    candidates: report.candidates
      .map((item) => ({
        candidate: item.candidate,
        riskScore: item.riskScore,
        riskLevel: item.riskLevel,
        proctorEvents: item.proctorEvents,
        proctorDevices: item.proctorDevices,
        proctorActions: item.proctorActions
      }))
      .sort((left, right) => right.riskScore - left.riskScore)
  };
}

function buildCandidateReport(input: {
  readonly candidate: Candidate;
  readonly submissions: readonly Submission[];
  readonly executions: readonly CodeExecution[];
  readonly aiReports: readonly CompetencyReport[];
  readonly identityVerifications: readonly ReturnType<typeof mapIdentityVerification>[];
  readonly environmentChecks: readonly EnvironmentCheck[];
  readonly inviteEmailLogs: readonly InviteEmailLog[];
  readonly proctorEvents: readonly ProctorEvent[];
  readonly proctorDevices: readonly ProctorDevice[];
  readonly proctorActions: readonly ProctorAction[];
}) {
  const riskScore = calculateRiskScore(input.proctorEvents.map((event) => event.type));
  return {
    candidate: input.candidate,
    submissions: [...input.submissions],
    executions: [...input.executions],
    latestSubmission: input.submissions[0],
    latestExecution: input.executions[0],
    latestAiReport: input.aiReports[0],
    latestIdentityVerification: input.identityVerifications[0],
    latestEnvironmentCheck: input.environmentChecks[0],
    bestScore: input.submissions.reduce((best, submission) => Math.max(best, submission.score), 0),
    submissionCount: input.submissions.length,
    executionCount: input.executions.length,
    riskEventCount: input.proctorEvents.length,
    riskScore,
    riskLevel: calculateRiskLevel(riskScore),
    proctorEvents: [...input.proctorEvents],
    proctorDevices: [...input.proctorDevices],
    proctorActions: [...input.proctorActions],
    aiReports: [...input.aiReports],
    inviteEmailLogs: [...input.inviteEmailLogs]
  };
}

function sortByNewest<T>(items: readonly T[], key: keyof T) {
  return [...items].sort((left, right) => String(right[key]).localeCompare(String(left[key])));
}
