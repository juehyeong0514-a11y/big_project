import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateExamInput } from "@dcvp/shared";
import { api } from "./api";
import { ExamEditorForm } from "./ExamEditorForm";

const defaultExam: CreateExamInput = {
  title: "",
  description: "",
  startAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().slice(0, 16),
  endAt: new Date(Date.now() + 1000 * 60 * 60 * 27).toISOString().slice(0, 16),
  durationMinutes: 90,
  languages: ["Python", "JavaScript"],
  proctoringEnabled: true,
  identityVerificationEnabled: true,
  mobileCameraRequired: false,
  screenShareRequired: true
};

export function ExamCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: api.createExam,
    onSuccess: async (exam) => {
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/exams/${exam.id}`);
    }
  });

  return <ExamEditorForm initialExam={defaultExam} isPending={mutation.isPending} submitLabel="시험 생성" onSubmit={(input) => mutation.mutate(input)} />;
}
