import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Pencil, ShieldCheck, Trash2, Users, Video } from "lucide-react";
import type { AuthSession } from "@dcvp/shared";
import { api } from "./api";
import { ExamReportPanel } from "./AdminReportPanel";
import { CandidateManager } from "./CandidateManager";
import { Status } from "./components";
import { QuestionManager } from "./QuestionManager";

export function ExamDetail({ session }: { readonly session: AuthSession }) {
  const { examId = "" } = useParams();
  const canManageExams = session.user.role === "ADMIN" || session.user.role === "ORGANIZATION";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["exam", examId], queryFn: () => api.examDetail(examId), enabled: Boolean(examId) });
  const { data: report } = useQuery({ queryKey: ["exam-report", examId], queryFn: () => api.examReport(examId), enabled: Boolean(examId) });
  const deleteMutation = useMutation({
    mutationFn: api.deleteExam,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate("/exams");
    }
  });

  if (isLoading || !data) return <div className="panel">시험 상세를 불러오는 중입니다.</div>;

  return (
    <div className="stack">
      <section className="panel hero-panel">
        <div>
          <Status status={data.status} />
          <h2>{data.title}</h2>
          <p>{data.description}</p>
        </div>
        <div className="policy-row">
          <span><CalendarDays size={16} />{data.durationMinutes}분</span>
          <span><ShieldCheck size={16} />감독 {data.proctoringEnabled ? "사용" : "미사용"}</span>
          <span><Users size={16} />{data.candidates.length}명</span>
          <Link className="secondary-action" to={`/exams/${data.id}/proctor`}><Video size={16} />실시간 감독</Link>
          {canManageExams ? <Link className="secondary-action" to={`/exams/${data.id}/edit`}><Pencil size={16} />시험 수정</Link> : null}
          {canManageExams ? (
            <button className="secondary-action danger-action" type="button" onClick={() => {
              if (window.confirm(`'${data.title}' 시험을 삭제할까요? 응시 기록은 보존됩니다.`)) deleteMutation.mutate(data.id);
            }} disabled={deleteMutation.isPending}><Trash2 size={16} />시험 삭제</button>
          ) : null}
        </div>
      </section>
      <div className="detail-grid">
        <QuestionManager examId={data.id} questions={data.questions} canManage={canManageExams} />
        <CandidateManager examId={data.id} candidates={data.candidates} canManage={canManageExams} />
      </div>
      {report ? <ExamReportPanel report={report} /> : null}
    </div>
  );
}
