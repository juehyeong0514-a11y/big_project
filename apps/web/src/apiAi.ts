import type { CompetencyReport } from "@dcvp/shared";
import { request } from "./apiCore";

export const aiApi = {
  generateExamAiReports: (examId: string) =>
    request<CompetencyReport[]>(`/api/ai/exams/${examId}/reports/generate`, {
      method: "POST"
    })
};
