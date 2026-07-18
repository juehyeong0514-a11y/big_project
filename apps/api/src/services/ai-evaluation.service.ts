import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { CompetencyReport, GenerateReportInput } from "@dcvp/shared";
import { OutboundRequestSecurityError, readBoundedJson, secureOutboundFetch } from "./outbound-http-security.js";

@Injectable()
export class AiEvaluationService {
  async generateReport(input: GenerateReportInput): Promise<CompetencyReport> {
    const externalBaseUrl = process.env.AI_API_BASE_URL;

    if (externalBaseUrl) {
      let response: Response;
      try {
        response = await secureOutboundFetch(`${externalBaseUrl.replace(/\/$/, "")}/api/ai/report/generate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(process.env.AI_API_KEY ? { authorization: `Bearer ${process.env.AI_API_KEY}` } : {})
          },
          body: JSON.stringify(input)
        });
      } catch (error) {
        if (error instanceof OutboundRequestSecurityError) {
          throw new ServiceUnavailableException("외부 AI 평가 서비스에 안전하게 연결할 수 없습니다.");
        }
        throw error;
      }

      if (!response.ok) {
        throw new ServiceUnavailableException(`외부 AI 평가 서비스 호출에 실패했습니다 (${response.status}).`);
      }

      try {
        return this.parseExternalReport(await readBoundedJson(response), input);
      } catch (error) {
        if (error instanceof OutboundRequestSecurityError) {
          throw new ServiceUnavailableException("외부 AI 평가 서비스 응답이 올바르지 않습니다.");
        }
        throw error;
      }
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
      passRate >= 70 ? "공개·비공개 테스트 통과율이 안정적입니다." : "필수 코딩 절차를 끝까지 수행했습니다.",
      input.signals.codeRuns >= 2 ? "반복 실행으로 해결 방법을 검증했습니다." : "간결한 실행 흐름을 유지했습니다.",
      integrityScore >= 85 ? "감독 신호상 부정행위 위험이 낮습니다." : "수집된 감독 신호로 신뢰도 검토가 가능합니다."
    ];
    const improvementAreas = [
      input.signals.failedTests > 0 ? `실패한 테스트 ${input.signals.failedTests}개를 검토해야 합니다.` : "최종 제출 전에 경계값 검토를 보강할 수 있습니다.",
      input.signals.pasteEvents > 0 ? "붙여넣기 이벤트를 제출 코드 맥락과 함께 검토해야 합니다." : "간단한 코드 설명으로 사고 과정을 확인할 수 있습니다.",
      input.signals.riskScore >= 20 ? "위험 점수가 높아 관리자의 확인이 필요합니다." : "면접에서 시간 관리와 디버깅 과정을 확인할 수 있습니다."
    ];
    const recommendations = [
      overallScore >= 80 ? "시스템 설계와 선택 근거 중심의 기술 면접을 진행하세요." : "다음 단계 전에 추가 검토를 진행하세요.",
      input.signals.failedTests > 0 ? "응시자와 실패 테스트를 함께 검토하세요." : "통과한 해결 방법을 코드 품질 논의의 근거로 활용하세요.",
      input.signals.riskScore >= 20 ? "채용 결정 전에 감독 이벤트를 확인하세요." : "즉시 신뢰도 위험을 상향할 필요는 없습니다."
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

  private parseExternalReport(value: unknown, input: GenerateReportInput): CompetencyReport {
    if (!this.isRecord(value)) {
      throw new OutboundRequestSecurityError("외부 AI 평가 서비스 응답 객체가 없습니다.");
    }
    return {
      id: this.requiredText(value["id"], "id", 128),
      examSessionId: input.examSessionId,
      candidateId: input.candidateId,
      examId: input.examId,
      problemSolvingScore: this.requiredScore(value["problemSolvingScore"]),
      implementationScore: this.requiredScore(value["implementationScore"]),
      debuggingScore: this.requiredScore(value["debuggingScore"]),
      codeQualityScore: this.requiredScore(value["codeQualityScore"]),
      timeManagementScore: this.requiredScore(value["timeManagementScore"]),
      integrityScore: this.requiredScore(value["integrityScore"]),
      overallScore: this.requiredScore(value["overallScore"]),
      aiSummary: this.requiredText(value["aiSummary"], "aiSummary", 5_000),
      strengths: this.requiredTextList(value["strengths"]),
      improvementAreas: this.requiredTextList(value["improvementAreas"]),
      recommendations: this.requiredTextList(value["recommendations"]),
      createdAt: new Date().toISOString()
    };
  }

  private requiredScore(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new OutboundRequestSecurityError("외부 AI 평가 점수가 올바르지 않습니다.");
    }
    return value;
  }

  private requiredText(value: unknown, fieldName: string, maxLength: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
      throw new OutboundRequestSecurityError(`외부 AI 평가 ${fieldName} 값이 올바르지 않습니다.`);
    }
    return value;
  }

  private requiredTextList(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 20 || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 500)) {
      throw new OutboundRequestSecurityError("외부 AI 평가 목록 값이 올바르지 않습니다.");
    }
    return value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
