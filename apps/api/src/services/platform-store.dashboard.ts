import type { AuthSession, Candidate, DashboardSummary, Exam, Organization } from "@dcvp/shared";
import type { PrismaService } from "./prisma.service.js";
import { mapExam, mapOrganization } from "./platform-store.mappers.js";
import { canAccessExam } from "./platform-store.exam-admin.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface DashboardStoreContext {
  readonly prisma: PrismaService;
  readonly runDatabase: DatabaseRunner;
}

export interface DashboardMemoryState {
  readonly organization: Organization;
  readonly exams: readonly Exam[];
  readonly candidates: readonly Candidate[];
}

export async function getDashboardInStore(context: DashboardStoreContext, memoryState: DashboardMemoryState, session: AuthSession): Promise<DashboardSummary> {
  const db = await context.runDatabase(async () => {
    const examWhere = session.user.role === "ADMIN" ? { status: { not: "DELETED" as const } } : { status: { not: "DELETED" as const }, organizationId: session.organization.id };
    const activeExamWhere = session.user.role === "ADMIN" ? { status: { in: ["ACTIVE" as const, "SCHEDULED" as const] } } : { status: { in: ["ACTIVE" as const, "SCHEDULED" as const] }, organizationId: session.organization.id };
    const candidateWhere = session.user.role === "ADMIN" ? {} : { exam: { organizationId: session.organization.id } };
    const pendingCandidateWhere = session.user.role === "ADMIN" ? { status: { not: "COMPLETED" as const } } : { status: { not: "COMPLETED" as const }, exam: { organizationId: session.organization.id } };
    const [organization, exams, totalExams, activeExams, totalCandidates, pendingReports] = await Promise.all([
      context.prisma.organization.findUniqueOrThrow({ where: { id: session.organization.id } }),
      context.prisma.exam.findMany({ where: examWhere, orderBy: { createdAt: "desc" }, take: 5 }),
      context.prisma.exam.count({ where: examWhere }),
      context.prisma.exam.count({ where: activeExamWhere }),
      context.prisma.candidate.count({ where: candidateWhere }),
      context.prisma.candidate.count({ where: pendingCandidateWhere })
    ]);

    return {
      organization: mapOrganization(organization),
      totalExams,
      activeExams,
      totalCandidates,
      pendingReports,
      recentExams: exams.map((exam) => mapExam(exam))
    };
  });

  return (
    db ?? {
      organization: session.organization,
      totalExams: memoryState.exams.filter((exam) => canAccessExam(session, exam)).length,
      activeExams: memoryState.exams.filter((exam) => canAccessExam(session, exam) && (exam.status === "ACTIVE" || exam.status === "SCHEDULED")).length,
      totalCandidates: memoryState.candidates.filter((candidate) => memoryState.exams.some((exam) => exam.id === candidate.examId && canAccessExam(session, exam))).length,
      pendingReports: memoryState.candidates.filter((candidate) => candidate.status !== "COMPLETED" && memoryState.exams.some((exam) => exam.id === candidate.examId && canAccessExam(session, exam))).length,
      recentExams: [...memoryState.exams].filter((exam) => canAccessExam(session, exam)).sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 5)
    }
  );
}
