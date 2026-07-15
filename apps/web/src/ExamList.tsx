import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import type { AuthSession } from "@dcvp/shared";
import { api } from "./api";
import { ExamTable } from "./ExamTable";

export function ExamList({ session }: { readonly session: AuthSession }) {
  const [query, setQuery] = useState("");
  const canManageExams = session.user.role === "ADMIN" || session.user.role === "ORGANIZATION";
  const { data = [], isLoading } = useQuery({ queryKey: ["exams"], queryFn: api.exams });
  const filtered = useMemo(() => data.filter((exam) => exam.title.toLowerCase().includes(query.toLowerCase())), [data, query]);

  return (
    <div className="stack">
      <section className="toolbar">
        <div className="search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="시험 검색" />
        </div>
        {canManageExams ? (
          <Link className="secondary-action" to="/exams/new">
            <Plus size={18} />새 시험
          </Link>
        ) : null}
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>시험 목록</h2>
            <p>{canManageExams ? "채용과 역량 검증을 위한 코딩 평가를 관리합니다." : "배정된 조직의 시험과 실시간 감독 현황을 확인합니다."}</p>
          </div>
        </div>
        {isLoading ? <p>시험 목록을 불러오는 중입니다.</p> : <ExamTable exams={filtered} canManage={canManageExams} />}
      </section>
    </div>
  );
}
