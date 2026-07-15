import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateExamInput } from "@dcvp/shared";
import { api } from "./api";
import { ExamEditorForm } from "./ExamEditorForm";

function toDateTimeLocal(value: string) {
  return new Date(value).toISOString().slice(0, 16);
}

export function ExamEdit() {
  const { examId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const examQuery = useQuery({ queryKey: ["exam", examId], queryFn: () => api.examDetail(examId), enabled: Boolean(examId) });
  const mutation = useMutation({
    mutationFn: (input: UpdateExamInput) => api.updateExam(examId, input),
    onSuccess: async (exam) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["exams"] }),
        queryClient.invalidateQueries({ queryKey: ["exam", examId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
      navigate(`/exams/${exam.id}`);
    }
  });

  if (examQuery.isLoading || !examQuery.data) return <div className="panel">시험 정보를 불러오는 중입니다.</div>;

  const initialExam: UpdateExamInput = {
    title: examQuery.data.title,
    description: examQuery.data.description,
    startAt: toDateTimeLocal(examQuery.data.startAt),
    endAt: toDateTimeLocal(examQuery.data.endAt),
    durationMinutes: examQuery.data.durationMinutes,
    languages: examQuery.data.languages,
    proctoringEnabled: examQuery.data.proctoringEnabled,
    identityVerificationEnabled: examQuery.data.identityVerificationEnabled,
    mobileCameraRequired: examQuery.data.mobileCameraRequired,
    screenShareRequired: examQuery.data.screenShareRequired
  };

  return <ExamEditorForm key={examQuery.data.id} initialExam={initialExam} isPending={mutation.isPending} submitLabel="시험 수정 저장" onSubmit={(input) => mutation.mutate(input)} />;
}
