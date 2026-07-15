import type { CompetencyReport, GenerateReportInput } from "@dcvp/shared";
import type { PrismaService } from "./prisma.service.js";
import { nowIso } from "./platform-store.helpers.js";
import { mapCompetencyReport } from "./platform-store.mappers.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface SaveCompetencyReportRequest {
  readonly context: {
    readonly prisma: PrismaService;
    readonly runDatabase: DatabaseRunner;
  };
  readonly input: GenerateReportInput;
  readonly report: CompetencyReport;
  readonly memoryReports: readonly CompetencyReport[];
}

export async function saveCompetencyReportInStore(request: SaveCompetencyReportRequest) {
  const { context, input, report, memoryReports } = request;
  const db = await context.runDatabase(async () => {
    const saved = await context.prisma.competencyReport.create({
      data: {
        id: report.id,
        examSessionId: input.examSessionId,
        examId: input.examId,
        candidateId: input.candidateId,
        problemSolvingScore: report.problemSolvingScore,
        implementationScore: report.implementationScore,
        debuggingScore: report.debuggingScore,
        codeQualityScore: report.codeQualityScore,
        timeManagementScore: report.timeManagementScore,
        integrityScore: report.integrityScore,
        overallScore: report.overallScore,
        aiSummary: report.aiSummary,
        strengths: report.strengths ?? [],
        improvementAreas: report.improvementAreas ?? [],
        recommendations: report.recommendations ?? []
      }
    });

    return mapCompetencyReport(saved);
  });

  if (db) {
    return { report: db, competencyReports: memoryReports };
  }

  const saved = {
    ...report,
    examSessionId: input.examSessionId,
    examId: input.examId,
    candidateId: input.candidateId,
    strengths: report.strengths ?? [],
    improvementAreas: report.improvementAreas ?? [],
    recommendations: report.recommendations ?? [],
    createdAt: report.createdAt ?? nowIso()
  };
  return { report: saved, competencyReports: [saved, ...memoryReports] };
}
