import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, ClipboardList, FileCode2, Users } from "lucide-react";
import type { AuthSession } from "@dcvp/shared";
import { api } from "./api";
import { Metric } from "./components";
import { ExamTable } from "./ExamManagement";

export function Dashboard({ session }: { readonly session: AuthSession }) {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
  const canManageExams = session.user.role === "ADMIN" || session.user.role === "ORGANIZATION";
  if (isLoading || !data) return <div className="panel">대시보드를 불러오는 중입니다.</div>;

  return (
    <div className="stack">
      <section className="metric-grid">
        <Metric icon={<ClipboardList />} label="전체 시험" value={data.totalExams} />
        <Metric icon={<Activity />} label="진행 예정/진행 중" value={data.activeExams} />
        <Metric icon={<Users />} label="응시자" value={data.totalCandidates} />
        <Metric icon={<FileCode2 />} label="대기 리포트" value={data.pendingReports} />
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>최근 시험</h2>
            <p>{data.organization.name}</p>
          </div>
          <Link to="/exams">전체 보기</Link>
        </div>
        <ExamTable exams={data.recentExams} canManage={canManageExams} />
      </section>
    </div>
  );
}
