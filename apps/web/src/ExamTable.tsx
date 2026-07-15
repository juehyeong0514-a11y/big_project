import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, Video } from "lucide-react";
import { api } from "./api";
import { Status } from "./components";

type ExamRows = Awaited<ReturnType<typeof api.exams>>;

export function ExamTable({ exams, canManage = true }: { readonly exams: ExamRows; readonly canManage?: boolean }) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: api.deleteExam,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
  const deleteExam = (examId: string, title: string) => {
    if (!window.confirm(`'${title}' 시험을 삭제할까요? 응시 기록은 보존됩니다.`)) return;
    deleteMutation.mutate(examId);
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>시험</th>
            <th>상태</th>
            <th>일정</th>
            <th>시간</th>
            <th>언어</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {exams.map((exam) => (
            <tr key={exam.id}>
              <td>
                <strong>{exam.title}</strong>
                <span>{exam.description}</span>
              </td>
              <td>
                <Status status={exam.status} />
              </td>
              <td>{new Date(exam.startAt).toLocaleString()}</td>
              <td>{exam.durationMinutes}분</td>
              <td>{exam.languages.join(", ")}</td>
              <td>
                <div className="table-actions">
                  <Link className="secondary-action table-action-button" to={`/exams/${exam.id}`}>
                    <FileText size={16} />상세 보기
                  </Link>
                  <Link className="secondary-action table-action-button" to={`/exams/${exam.id}/proctor`}>
                    <Video size={16} />실시간 감독
                  </Link>
                  {canManage ? (
                    <button className="icon-action danger-action" type="button" title="시험 삭제" onClick={() => deleteExam(exam.id, exam.title)}>
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
