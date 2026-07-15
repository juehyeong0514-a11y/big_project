import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ServerCog } from "lucide-react";
import type { OperationsReadinessStatus } from "@dcvp/shared";
import { api } from "./api";

const statusLabel = (status: OperationsReadinessStatus) => {
  switch (status) {
    case "READY":
      return "준비 완료";
    case "WARNING":
      return "확인 필요";
    case "ACTION_REQUIRED":
      return "조치 필요";
  }
};

const statusClassName = (status: OperationsReadinessStatus) => {
  switch (status) {
    case "READY":
      return "status status-active";
    case "WARNING":
      return "status status-scheduled";
    case "ACTION_REQUIRED":
      return "status status-ended";
  }
};

const statusIcon = (status: OperationsReadinessStatus) => (status === "READY" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />);

export function OperationsReadiness() {
  const { data, isLoading } = useQuery({ queryKey: ["operations-readiness"], queryFn: api.operationsReadiness });
  if (isLoading || !data) return <div className="panel">운영 준비도를 불러오는 중입니다.</div>;

  return (
    <div className="stack">
      <section className="panel hero-panel">
        <div>
          <span className="eyebrow">운영 준비도</span>
          <h2>외부 연동과 배포 필수 설정</h2>
          <p>비밀값은 표시하지 않고 연결 준비 상태와 필요한 조치만 보여줍니다.</p>
        </div>
        <span className={statusClassName(data.overallStatus)}>{statusLabel(data.overallStatus)}</span>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>점검 항목</h2>
            <p>생성 시각 {new Date(data.generatedAt).toLocaleString("ko-KR")}</p>
          </div>
          <ServerCog size={24} />
        </div>
        <div className="list">
          {data.checks.map((check) => (
            <article className="list-item environment-card" key={check.id}>
              <div className="environment-icon">{statusIcon(check.status)}</div>
              <div>
                <strong>{check.label}</strong>
                <p>{check.detail}</p>
                <span>{check.action}</span>
              </div>
              <span className={statusClassName(check.status)}>{statusLabel(check.status)}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
