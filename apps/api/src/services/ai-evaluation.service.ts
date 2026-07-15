import { Injectable } from "@nestjs/common";
import type { CompetencyReport, GenerateReportInput } from "@dcvp/shared";

@Injectable()
export class AiEvaluationService {
  async generateReport(input: GenerateReportInput): Promise<CompetencyReport> {
    const externalBaseUrl = process.env.AI_API_BASE_URL;

    if (externalBaseUrl) {
      const response = await fetch(`${externalBaseUrl.replace(/\/$/, "")}/api/ai/report/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.AI_API_KEY ? { authorization: `Bearer ${process.env.AI_API_KEY}` } : {})
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`AI evaluation API failed with ${response.status}`);
      }

      return (await response.json()) as CompetencyReport;
    }

    const passRate =
      input.signals.passedTests + input.signals.failedTests === 0
        ? 70
        : Math.round((input.signals.passedTests / (input.signals.passedTests + input.signals.failedTests)) * 100);
    const integrityScore = Math.max(0, 100 - input.signals.riskScore);
    const codeQualityScore = Math.max(55, 88 - input.signals.pasteEvents * 4);
    const timeManagementScore = Math.max(45, 92 - Math.max(0, input.signals.elapsedMinutes - 60));
    const debuggingScore = Math.min(95, 65 + input.signals.codeRuns * 3 - input.signals.failedTests * 2);
    const implementationScore = Math.round((passRate + codeQualityScore) / 2);
    const problemSolvingScore = Math.round((passRate + timeManagementScore) / 2);
    const overallScore = Math.round(
      (problemSolvingScore + implementationScore + debuggingScore + codeQualityScore + timeManagementScore + integrityScore) / 6
    );
    const strengths = [
      passRate >= 70 ? "Public and hidden test pass rate is solid." : "Candidate attempted the required coding workflow.",
      input.signals.codeRuns >= 2 ? "Candidate used iterative execution to validate the solution." : "Candidate kept the workflow concise.",
      integrityScore >= 85 ? "Proctoring signals show a low integrity risk." : "Integrity score remains measurable with captured proctoring signals."
    ];
    const improvementAreas = [
      input.signals.failedTests > 0 ? `${input.signals.failedTests} failed tests need review.` : "Add edge-case review before final submission.",
      input.signals.pasteEvents > 0 ? "Paste events should be reviewed with the submitted code context." : "Ask for a brief code walkthrough to confirm reasoning.",
      input.signals.riskScore >= 20 ? "Risk score is elevated and should be checked by an administrator." : "Time and debugging notes can be discussed in interview."
    ];
    const recommendations = [
      overallScore >= 80 ? "Proceed to a technical interview focused on system design and tradeoffs." : "Use a follow-up review before advancing.",
      input.signals.failedTests > 0 ? "Review failed test cases with the candidate." : "Use the passing solution as a basis for code quality discussion.",
      input.signals.riskScore >= 20 ? "Review proctoring events before making a hiring decision." : "No immediate integrity escalation is required."
    ];

    return {
      id: `report_${crypto.randomUUID().slice(0, 8)}`,
      examSessionId: input.examSessionId,
      candidateId: input.candidateId,
      examId: input.examId,
      problemSolvingScore,
      implementationScore,
      debuggingScore,
      codeQualityScore,
      timeManagementScore,
      integrityScore,
      overallScore,
      createdAt: new Date().toISOString(),
      strengths,
      improvementAreas,
      recommendations,
      aiSummary:
        `제출 ${input.signals.submissions}회, 실행 ${input.signals.codeRuns}회, 실패 테스트 ${input.signals.failedTests}개, 위험 점수 ${input.signals.riskScore}점을 종합해 산출한 설명형 평가입니다. 외부 AI 평가 API가 연결되면 동일한 신호에 제출 코드와 감독 타임라인을 함께 전달합니다.`
    };
  }
}
