import type { RefObject } from "react";
import { Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { AlertCircle, Play, Send } from "lucide-react";
import type { CandidateWorkspace, CodeExecution, ProctorAction, Submission } from "@dcvp/shared";
import { formatDuration, type RunnableLanguage } from "./candidateExamConfig";
import { Status } from "./components";

type Question = CandidateWorkspace["questions"][number];
type ResultWithTests = CodeExecution | Submission;

interface ExamTopbarProps {
  readonly workspace: CandidateWorkspace;
  readonly timeRemainingSeconds: number | null;
  readonly draftSavedAt: string;
  readonly pcProctorStatus: string;
}

export function ExamTopbar({ workspace, timeRemainingSeconds, draftSavedAt, pcProctorStatus }: ExamTopbarProps) {
  return (
    <header className="exam-topbar">
      <div>
        <span className="eyebrow">코딩 시험</span>
        <h1>{workspace.exam.title}</h1>
      </div>
      <div className="exam-meta">
        <span>{workspace.candidate.name}</span>
        <span>남은 시간 {formatDuration(timeRemainingSeconds)}</span>
        <span>{draftSavedAt ? `자동 저장 ${draftSavedAt}` : "자동 저장 대기"}</span>
        <span>PC 캠 {pcProctorStatus}</span>
        <Status status={workspace.candidate.status} />
      </div>
    </header>
  );
}

interface QuestionNavigatorProps {
  readonly questions: readonly Question[];
  readonly selectedQuestionId: string;
  readonly onSelectQuestion: (questionId: string) => void;
}

export function QuestionNavigator({ questions, selectedQuestionId, onSelectQuestion }: QuestionNavigatorProps) {
  return (
    <aside className="question-nav">
      <h2>문제</h2>
      {questions.map((item, index) => (
        <button key={item.id} className={item.id === selectedQuestionId ? "question-tab active-question" : "question-tab"} type="button" onClick={() => onSelectQuestion(item.id)}>
          <strong>
            {index + 1}. {item.title}
          </strong>
          <span>{item.difficulty}</span>
        </button>
      ))}
    </aside>
  );
}

interface ProblemPanelProps {
  readonly inviteToken: string;
  readonly selectedQuestion: Question;
  readonly latestSubmission?: Submission;
  readonly pcProctor: {
    readonly status: string;
    readonly videoRef: RefObject<HTMLVideoElement>;
  };
}

export function ProblemPanel({ inviteToken, selectedQuestion, latestSubmission, pcProctor }: ProblemPanelProps) {
  return (
    <section className="problem-panel">
      <div className="section-title">
        <div>
          <h2>{selectedQuestion.title}</h2>
          <p>
            {selectedQuestion.type} / {selectedQuestion.points}점 / {selectedQuestion.timeLimitMs}ms / {selectedQuestion.memoryLimitMb}MB
          </p>
        </div>
        {latestSubmission ? <Status status={`SUBMITTED ${latestSubmission.score}`} /> : null}
      </div>
      <p className="problem-description">{selectedQuestion.description}</p>
      {selectedQuestion.choices.length ? (
        <div className="choice-list">
          {selectedQuestion.choices.map((choice) => (
            <span key={choice}>{choice}</span>
          ))}
        </div>
      ) : null}
      <div className="candidate-proctor-strip">
        <video ref={pcProctor.videoRef} muted playsInline autoPlay />
        <span>PC 캠 {pcProctor.status}</span>
        <Link to={`/candidate/${inviteToken}/mobile-proctor`}>모바일 보조캠</Link>
      </div>
    </section>
  );
}

interface EditorPanelProps {
  readonly examLocked: boolean;
  readonly latestAction?: ProctorAction;
  readonly language: string;
  readonly languageOptions: readonly RunnableLanguage[];
  readonly onLanguageChange: (language: string) => void;
  readonly runDisabled: boolean;
  readonly submitDisabled: boolean;
  readonly onRun: () => void;
  readonly onSubmit: () => void;
  readonly editorFallback: boolean;
  readonly code: string;
  readonly onCodeChange: (code: string) => void;
  readonly onEditorReady: () => void;
  readonly executionOutput: string;
  readonly visibleResult?: ResultWithTests;
}

export function EditorPanel({
  examLocked,
  latestAction,
  language,
  languageOptions,
  onLanguageChange,
  runDisabled,
  submitDisabled,
  onRun,
  onSubmit,
  editorFallback,
  code,
  onCodeChange,
  onEditorReady,
  executionOutput,
  visibleResult
}: EditorPanelProps) {
  return (
    <section className="editor-panel">
      {examLocked ? (
        <div className="ready-banner">
          <AlertCircle size={18} />
          제한 시간이 종료되어 에디터가 잠겼습니다.
        </div>
      ) : null}
      {latestAction ? (
        <div className={latestAction.type === "WARNING_MESSAGE" ? "ready-banner ready-banner-warning" : "ready-banner"}>
          <AlertCircle size={18} />
          감독관 조치: {latestAction.message}
        </div>
      ) : null}
      <div className="editor-toolbar">
        <select value={languageOptions.some((item) => item.value === language) ? language : languageOptions[0].value} onChange={(event) => onLanguageChange(event.target.value)}>
          {languageOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <div className="editor-actions">
          <button className="secondary-action" type="button" onClick={onRun} disabled={runDisabled}>
            <Play size={18} />
            실행
          </button>
          <button className="primary-action" type="button" onClick={onSubmit} disabled={submitDisabled}>
            <Send size={18} />
            제출
          </button>
        </div>
      </div>
      <div className="monaco-shell">
        {editorFallback ? (
          <textarea aria-label="코드 편집기" className="code-editor-fallback" disabled={examLocked} spellCheck={false} value={code} onChange={(event) => onCodeChange(event.target.value)} />
        ) : (
          <Editor
            height="440px"
            language={language}
            theme="vs-dark"
            value={code}
            loading={<div className="editor-loading">편집기를 준비하는 중입니다.</div>}
            onChange={(value) => onCodeChange(value ?? "")}
            onMount={onEditorReady}
            options={{ fontSize: 14, minimap: { enabled: false }, readOnly: examLocked, scrollBeyondLastLine: false, wordWrap: "on" }}
          />
        )}
      </div>
      <div className="run-output">
        <strong>채점 결과</strong>
        <pre>{executionOutput || "아직 실행 결과가 없습니다."}</pre>
      </div>
      {visibleResult?.testResults.length ? <JudgeResults result={visibleResult} /> : null}
    </section>
  );
}

function JudgeResults({ result }: { readonly result: ResultWithTests }) {
  return (
    <div className="judge-results">
      <div className="judge-summary">
        <strong>최근 결과</strong>
        <span>
          {result.passedTests}/{result.totalTests} 통과
        </span>
      </div>
      <div className="judge-result-list">
        {result.testResults.map((testResult) => (
          <article key={testResult.id} className={testResult.passed ? "judge-result passed-result" : "judge-result failed-result"}>
            <div>
              <strong>
                테스트 {testResult.testIndex} / {testResult.isPublic ? "공개" : "숨김"}
              </strong>
              <span>{testResult.executionTimeMs}ms</span>
            </div>
            <dl>
              <dt>입력</dt>
              <dd>{testResult.input}</dd>
              <dt>예상</dt>
              <dd>{testResult.expectedOutput}</dd>
              <dt>실제</dt>
              <dd>{testResult.actualOutput || "(비어 있음)"}</dd>
            </dl>
            {testResult.error ? <p>{testResult.error}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
