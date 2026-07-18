import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bot, Play, Send, Users } from "lucide-react";
import type { CompetencyReport } from "@dcvp/shared";
import { api } from "./api";
import { Metric, Status } from "./components";
import { proctorActionLabel, proctorEventLabel, proctorEventTone, riskLabel } from "./proctoring";
import { maskDisplayName, maskEmailAddress } from "./privacyMasking";

type ExamReport = Awaited<ReturnType<typeof api.examReport>>;
type CandidateReportItem = ExamReport["candidates"][number];

export function ExamReportPanel({ report }: { report: ExamReport }) {
  const totalSubmissions = report.candidates.reduce((sum, item) => sum + item.submissionCount, 0);
  const totalExecutions = report.candidates.reduce((sum, item) => sum + item.executionCount, 0);
  const totalRiskEvents = report.candidates.reduce((sum, item) => sum + item.riskEventCount, 0);
  const [aiReports, setAiReports] = useState<Awaited<ReturnType<typeof api.generateExamAiReports>>>([]);
  const queryClient = useQueryClient();
  const displayedAiReports = aiReports.length ? aiReports : report.candidates.flatMap((item) => item.aiReports);
  const aiMutation = useMutation({
    mutationFn: () => api.generateExamAiReports(report.exam.id),
    onSuccess: async (reports) => {
      setAiReports(reports);
      await queryClient.invalidateQueries({ queryKey: ["exam-report", report.exam.id] });
    }
  });

  return (
    <section className="panel report-panel">
      <div className="section-title">
        <div>
          <h2>응시자 결과</h2>
          <p>제출, 실행 횟수, 점수, 감독 이벤트, 본인확인 결과를 확인합니다.</p>
        </div>
        <button className="primary-action" type="button" onClick={() => aiMutation.mutate()} disabled={aiMutation.isPending}>
          <Bot size={18} />AI 평가 생성
        </button>
      </div>
      <div className="report-metrics">
        <Metric icon={<Users />} label="응시자" value={report.candidates.length} />
        <Metric icon={<Send />} label="제출" value={totalSubmissions} />
        <Metric icon={<Play />} label="실행" value={totalExecutions} />
        <Metric icon={<AlertCircle />} label="위험 이벤트" value={totalRiskEvents} />
      </div>
      {displayedAiReports.length ? <div className="ai-report-grid">{displayedAiReports.map((item) => <AiReportCard key={item.id} report={item} />)}</div> : null}
      <div className="candidate-report-list">
        {report.candidates.map((item) => <CandidateReportCard key={item.candidate.id} item={item} />)}
      </div>
    </section>
  );
}

function CandidateReportCard({ item }: { item: CandidateReportItem }) {
  const latest = item.latestSubmission;
  const latestAiReport = item.latestAiReport;
  const latestIdentityVerification = item.latestIdentityVerification;
  const latestEnvironmentCheck = item.latestEnvironmentCheck;
  const failures = latest?.testResults.filter((result) => !result.passed) ?? [];

  return (
    <article className="candidate-report">
      <div className="candidate-report-head">
        <div>
          <strong>{maskDisplayName(item.candidate.name)}</strong>
          <span>{maskEmailAddress(item.candidate.email)}</span>
        </div>
        <div className="candidate-score">
          <strong>{item.bestScore}</strong>
          <span>최고 점수</span>
        </div>
      </div>
      <div className="candidate-report-stats">
        <span>{item.candidate.status}</span>
        <span>제출 {item.submissionCount}</span>
        <span>실행 {item.executionCount}</span>
        <span>위험 이벤트 {item.riskEventCount}</span>
        <span>위험도 {riskLabel(item.riskLevel)}</span>
        <span>위험 점수 {item.riskScore}</span>
        <span>환경 점검 {latestEnvironmentCheck?.requiredPassed ? "통과" : "미완료"}</span>
        <span>본인 인증 {latestIdentityVerification ? `${latestIdentityVerification.status} ${latestIdentityVerification.similarityScore}점` : "미완료"}</span>
        <span>{latest ? `최근 테스트 ${latest.passedTests}/${latest.totalTests}` : "제출 없음"}</span>
      </div>
      <div className="verification-detail-grid">
        <IdentityVerificationSummary verification={latestIdentityVerification} />
        <EnvironmentCheckSummary check={latestEnvironmentCheck} />
      </div>
      {item.inviteEmailLogs.length ? (
        <div className="risk-events">
          <strong>초대 메일 이력</strong>
          {item.inviteEmailLogs.slice(0, 3).map((log) => (
            <div key={log.id} className="risk-event-row">
              <span>{log.status}</span>
              <code>{log.provider}{log.providerMessageId ? ` / ${log.providerMessageId}` : ""} / {log.message}</code>
              <time>{new Date(log.createdAt).toLocaleString()}</time>
            </div>
          ))}
        </div>
      ) : null}
      {item.proctorActions.length ? (
        <div className="risk-events">
          <strong>감독관 조치/메모</strong>
          {item.proctorActions.slice(0, 5).map((action) => (
            <div key={action.id} className="risk-event-row">
              <span>{proctorActionLabel(action.type)}</span>
              <code>{action.message}</code>
              <time>{new Date(action.createdAt).toLocaleString()}</time>
            </div>
          ))}
        </div>
      ) : null}
      {item.proctorEvents.length ? (
        <div className="risk-events">
          <strong>감독 이벤트 타임라인</strong>
          {item.proctorEvents.slice(0, 8).map((event) => (
            <div key={event.id} className={`risk-event-row event-row-${proctorEventTone(event.type)}`}>
              <span>{proctorEventLabel(event.type)}</span>
              <code>{event.detail ?? "세부 정보 없음"}</code>
              <time>{new Date(event.createdAt).toLocaleString()}</time>
            </div>
          ))}
        </div>
      ) : null}
      {latestAiReport ? <AiReportCard report={latestAiReport} compact /> : null}
      {latest ? (
        <div className="latest-submission">
          <div>
            <strong>최근 제출</strong>
            <span>{latest.language} / 점수 {latest.score} / {new Date(latest.submittedAt).toLocaleString()}</span>
          </div>
          {failures.length ? (
            <div className="failure-list">
              {failures.map((failure) => (
                <div key={failure.id} className="failure-row">
                  <strong>테스트 {failure.testIndex} / {failure.isPublic ? "공개" : "숨김"}</strong>
                  <code>{failure.error ?? `예상 ${failure.expectedOutput}, 실제 ${failure.actualOutput || "(비어 있음)"}`}</code>
                </div>
              ))}
            </div>
          ) : <p className="all-pass">최근 제출은 모든 테스트를 통과했습니다.</p>}
        </div>
      ) : null}
    </article>
  );
}

function IdentityVerificationSummary({ verification }: { verification: CandidateReportItem["latestIdentityVerification"] }) {
  if (!verification) {
    return <div className="verification-detail-card"><strong>본인확인</strong><p>아직 본인확인이 완료되지 않았습니다.</p></div>;
  }
  const scoreItems = [
    ["신분증 진위", verification.documentAuthenticityScore],
    ["얼굴 매칭", verification.faceMatchScore],
    ["라이브니스", verification.livenessScore]
  ];
  return (
    <div className="verification-detail-card">
      <div className="verification-detail-head"><strong>본인확인</strong><Status status={verification.status} /></div>
      <p>Provider {verification.provider} / 결정 {verification.providerDecision} / 참조 {verification.providerReferenceId}</p>
      {verification.failureReason ? <p>실패 사유: {verification.failureReason}</p> : null}
      <div className="verification-score-list">
        {scoreItems.map(([label, value]) => <span key={label}>{label} <b>{value}</b></span>)}
      </div>
      <p>{verification.ocrNameMatched ? "OCR 이름 일치" : "OCR 이름 추가 확인 필요"}</p>
      <ul>{verification.verificationChecks.map((check) => <li key={check}>{check}</li>)}</ul>
    </div>
  );
}

function EnvironmentCheckSummary({ check }: { check: CandidateReportItem["latestEnvironmentCheck"] }) {
  if (!check) {
    return <div className="verification-detail-card"><strong>환경 점검</strong><p>환경 점검 기록이 없습니다.</p></div>;
  }
  return (
    <div className="verification-detail-card">
      <div className="verification-detail-head"><strong>환경 점검</strong><span>{check.requiredPassed ? "통과" : "미완료"}</span></div>
      <ul>{check.results.map((result) => <li key={result.id}>{result.id}: {result.status}</li>)}</ul>
    </div>
  );
}

function AiReportCard({ report, compact = false }: { report: CompetencyReport; compact?: boolean }) {
  const scoreItems = [
    ["문제해결", report.problemSolvingScore],
    ["구현", report.implementationScore],
    ["디버깅", report.debuggingScore],
    ["코드품질", report.codeQualityScore],
    ["시간관리", report.timeManagementScore],
    ["무결성", report.integrityScore]
  ];
  return (
    <article className={compact ? "ai-report-card ai-report-card-compact" : "ai-report-card"}>
      <div className="ai-report-head">
        <div>
          <strong>{compact ? "AI 최신 종합 점수" : "AI 종합 점수"} {report.overallScore}</strong>
          <span>{new Date(report.createdAt).toLocaleString()}</span>
        </div>
        <span className="ai-report-count">{report.recommendations.length}개 조치</span>
      </div>
      <div className="ai-score-grid">{scoreItems.map(([label, value]) => <span key={label}>{label} {value}</span>)}</div>
      <p>{report.aiSummary}</p>
      {!compact ? <div className="ai-evidence-grid"><EvidenceList title="강점" items={report.strengths} /><EvidenceList title="개선 영역" items={report.improvementAreas} /><EvidenceList title="추천 조치" items={report.recommendations} /></div> : null}
    </article>
  );
}

function EvidenceList({ title, items }: { title: string; items: readonly string[] }) {
  return <div className="ai-evidence-list"><strong>{title}</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}
