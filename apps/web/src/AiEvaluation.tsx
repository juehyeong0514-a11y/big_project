import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, FileCode2, Play, Send, Users } from "lucide-react";
import type { CompetencyReport, ExamReport } from "@dcvp/shared";
import { api } from "./api";
import { Metric, Status } from "./components";
import { riskLabel } from "./proctoring";
import { maskDisplayName, maskEmailAddress } from "./privacyMasking";

type CandidateReport = ExamReport["candidates"][number];

export function AiEvaluation() {
  const queryClient = useQueryClient();
  const { data: exams = [], isLoading: examsLoading } = useQuery({ queryKey: ["exams"], queryFn: api.exams });
  const [selectedExamId, setSelectedExamId] = useState("");
  const selectedExam = useMemo(() => exams.find((exam) => exam.id === selectedExamId), [exams, selectedExamId]);
  const reportQuery = useQuery({
    queryKey: ["exam-report", selectedExamId],
    queryFn: () => api.examReport(selectedExamId),
    enabled: Boolean(selectedExamId)
  });
  const [generatedReports, setGeneratedReports] = useState<readonly CompetencyReport[]>([]);
  const generateMutation = useMutation({
    mutationFn: () => api.generateExamAiReports(selectedExamId),
    onSuccess: async (reports) => {
      setGeneratedReports(reports);
      await queryClient.invalidateQueries({ queryKey: ["exam-report", selectedExamId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });

  useEffect(() => {
    if (!selectedExamId && exams[0]) {
      setSelectedExamId(exams[0].id);
    }
  }, [exams, selectedExamId]);

  const report = reportQuery.data;
  const currentReports = generatedReports.length ? generatedReports : report?.candidates.flatMap((candidate) => candidate.aiReports) ?? [];
  const totalSubmissions = report?.candidates.reduce((sum, candidate) => sum + candidate.submissionCount, 0) ?? 0;
  const totalExecutions = report?.candidates.reduce((sum, candidate) => sum + candidate.executionCount, 0) ?? 0;
  const canGenerate = Boolean(selectedExamId) && !generateMutation.isPending;

  return (
    <section className="panel ai-evaluation-panel">
      <div className="section-title">
        <div>
          <h2>AI 평가</h2>
          <p>선택한 시험의 제출, 실행, 감독 신호를 기반으로 응시자별 역량 리포트를 생성합니다.</p>
        </div>
        <button className="primary-action" type="button" onClick={() => generateMutation.mutate()} disabled={!canGenerate}>
          <Bot size={18} />
          선택 시험 AI 평가 생성
        </button>
      </div>

      <label>
        평가할 시험
        <select value={selectedExamId} onChange={(event) => { setGeneratedReports([]); setSelectedExamId(event.target.value); }} disabled={examsLoading || exams.length === 0}>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.title} / {exam.status}
            </option>
          ))}
        </select>
      </label>

      {generateMutation.isError ? <div className="ready-banner ready-banner-error">AI 평가 생성에 실패했습니다. 외부 AI API 설정과 시험 데이터를 확인해주세요.</div> : null}
      {generateMutation.isSuccess ? <div className="ready-banner ready-banner-ok">{generatedReports.length}명의 AI 평가 리포트를 생성했습니다.</div> : null}
      {!examsLoading && exams.length === 0 ? <div className="ready-banner">AI 평가를 생성할 시험이 없습니다. 먼저 시험을 생성해주세요.</div> : null}

      {selectedExam ? (
        <div className="report-metrics">
          <Metric icon={<Users />} label="응시자" value={report?.candidates.length ?? 0} />
          <Metric icon={<Send />} label="제출" value={totalSubmissions} />
          <Metric icon={<Play />} label="실행" value={totalExecutions} />
          <Metric icon={<FileCode2 />} label="AI 리포트" value={currentReports.length} />
        </div>
      ) : null}

      {reportQuery.isLoading ? <p>시험 리포트를 불러오는 중입니다.</p> : null}
      {report ? (
        <>
          <div className="list">
            {report.candidates.map((candidateReport) => <CandidateSignalCard key={candidateReport.candidate.id} item={candidateReport} />)}
          </div>
          {currentReports.length ? <AiReportList reports={currentReports} /> : <div className="ready-banner">아직 생성된 AI 평가 리포트가 없습니다.</div>}
        </>
      ) : null}
    </section>
  );
}

function CandidateSignalCard({ item }: { readonly item: CandidateReport }) {
  return (
    <article className="list-item">
      <div>
        <strong>{maskDisplayName(item.candidate.name)}</strong>
        <span>{maskEmailAddress(item.candidate.email)}</span>
      </div>
      <div className="candidate-report-stats">
        <Status status={item.candidate.status} />
        <span>제출 {item.submissionCount}</span>
        <span>실행 {item.executionCount}</span>
        <span>최고 점수 {item.bestScore}</span>
        <span>위험도 {riskLabel(item.riskLevel)}</span>
        <span>위험 점수 {item.riskScore}</span>
      </div>
    </article>
  );
}

function AiReportList({ reports }: { readonly reports: readonly CompetencyReport[] }) {
  return (
    <div className="ai-report-grid">
      {reports.map((report) => (
        <article className="ai-report-card" key={report.id}>
          <div className="ai-report-head">
            <div>
              <strong>종합 점수 {report.overallScore}</strong>
              <span>{new Date(report.createdAt).toLocaleString()}</span>
            </div>
            <span className="ai-report-count">응시자 {report.candidateId}</span>
          </div>
          <div className="ai-score-grid">
            <span>문제 해결 {report.problemSolvingScore}</span>
            <span>구현 {report.implementationScore}</span>
            <span>디버깅 {report.debuggingScore}</span>
            <span>코드 품질 {report.codeQualityScore}</span>
            <span>시간 관리 {report.timeManagementScore}</span>
            <span>무결성 {report.integrityScore}</span>
          </div>
          <p>{report.aiSummary}</p>
        </article>
      ))}
    </div>
  );
}
