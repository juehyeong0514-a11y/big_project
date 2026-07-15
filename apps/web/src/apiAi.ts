import type { CompetencyReport, GenerateReportInput } from "@dcvp/shared";
import { request } from "./apiCore";

export const aiApi = {
  generateReport: (input: GenerateReportInput) =>
    request<CompetencyReport>("/api/ai/report/generate", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  generateExamAiReports: (examId: string) =>
    request<CompetencyReport[]>(`/api/ai/exams/${examId}/reports/generate`, {
      method: "POST"
    })
};
