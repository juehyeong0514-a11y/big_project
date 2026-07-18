import { Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import type { GenerateReportInput } from "@dcvp/shared";
import { AiEvaluationService } from "../services/ai-evaluation.service.js";
import { PlatformStore } from "../services/platform-store.service.js";
import { AuthService } from "../services/auth.service.js";

@Controller("/api/ai")
export class AiController {
  constructor(
    @Inject(AiEvaluationService) private readonly aiEvaluation: AiEvaluationService,
    @Inject(PlatformStore) private readonly store: PlatformStore,
    @Inject(AuthService) private readonly auth: AuthService
  ) {}

  @Post("/exams/:examId/reports/generate")
  async generateExamReports(@Headers("authorization") authorization: string | undefined, @Param("examId") examId: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    const report = await this.store.getExamReport(examId, session);

    return Promise.all(
      report.candidates.map(async (candidateReport) => {
        const passedTests = candidateReport.submissions.reduce((sum, submission) => sum + submission.passedTests, 0);
        const totalTests = candidateReport.submissions.reduce((sum, submission) => sum + submission.totalTests, 0);
        const pasteEvents = candidateReport.proctorEvents.filter((event) => event.type === "PASTE").length;

        const input: GenerateReportInput = {
          examSessionId: `${examId}_${candidateReport.candidate.id}`,
          candidateId: candidateReport.candidate.id,
          examId,
          signals: {
            submissions: candidateReport.submissionCount,
            passedTests,
            failedTests: Math.max(0, totalTests - passedTests),
            codeRuns: candidateReport.executionCount,
            pasteEvents,
            riskScore: candidateReport.riskScore,
            elapsedMinutes: report.exam.durationMinutes
          }
        };
        const aiReport = await this.aiEvaluation.generateReport(input);
        return this.store.saveCompetencyReport(input, aiReport);
      })
    );
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) {
      return undefined;
    }

    return authorization.slice("Bearer ".length);
  }
}
