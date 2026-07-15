import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProctorEventType } from "@dcvp/shared";
import { api } from "./api";
import { useCandidateProctorStream } from "./CandidateProctor";
import { CandidateError } from "./CandidateFlow";
import { runnableLanguages, starterCode } from "./candidateExamConfig";
import { EditorPanel, ExamTopbar, ProblemPanel, QuestionNavigator } from "./CandidateExamWorkspacePanels";

export function CandidateExamWorkspace() {
  const { inviteToken = "" } = useParams();
  const queryClient = useQueryClient();
  const lastProctorEventRef = useRef<Record<string, number>>({});
  const timeoutSubmittedRef = useRef(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ["candidate-workspace", inviteToken], queryFn: () => api.candidateWorkspace(inviteToken), enabled: Boolean(inviteToken), refetchInterval: 5000 });
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState(starterCode);
  const [executionOutput, setExecutionOutput] = useState("");
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [examLocked, setExamLocked] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [editorFallback, setEditorFallback] = useState(false);
  const pcProctor = useCandidateProctorStream({
    inviteToken,
    examId: data?.exam.id ?? "",
    candidateId: data?.candidate.id ?? "",
    deviceRole: "PRIMARY_PC",
    facingMode: "user"
  });
  useEffect(() => { if (data?.questions.length && !selectedQuestionId) setSelectedQuestionId(data.questions[0].id); }, [data, selectedQuestionId]);
  useEffect(() => {
    if (!data) return;
    const enabledLanguages = runnableLanguages.filter((item) => data.exam.languages.some((examLanguage) => item.aliases.includes(examLanguage.toLowerCase())));
    const selectableLanguages = enabledLanguages.length ? enabledLanguages : runnableLanguages;
    if (!selectableLanguages.some((item) => item.value === language)) setLanguage(selectableLanguages[0].value);
  }, [data, language]);
  useEffect(() => {
    if (!inviteToken) return;
    const logEvent = (type: ProctorEventType, detail?: string) => {
      const now = Date.now();
      const lastLoggedAt = lastProctorEventRef.current[type] ?? 0;
      if (now - lastLoggedAt < 3000) return;
      lastProctorEventRef.current[type] = now;
      void api.logProctorEvent(inviteToken, { type, detail }).then(() => queryClient.invalidateQueries({ queryKey: ["candidate-workspace", inviteToken] }));
    };
    const handleVisibility = () => logEvent(document.hidden ? "TAB_HIDDEN" : "TAB_VISIBLE", document.visibilityState);
    const handleBlur = () => logEvent("WINDOW_BLUR");
    const handleFocus = () => logEvent("WINDOW_FOCUS");
    const handleCopy = () => logEvent("COPY", "Candidate copied text from the exam page.");
    const handlePaste = () => logEvent("PASTE", "Candidate pasted text into the exam page.");
    const handleFullscreen = () => logEvent(document.fullscreenElement ? "FULLSCREEN_ENTER" : "FULLSCREEN_EXIT");
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("fullscreenchange", handleFullscreen);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("fullscreenchange", handleFullscreen);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [inviteToken, queryClient]);
  useEffect(() => {
    if (editorReady) return;
    const timeoutId = window.setTimeout(() => setEditorFallback(true), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [editorReady, language]);
  const runMutation = useMutation({
    mutationFn: () => api.runCandidateCode(inviteToken, { questionId: selectedQuestionId, language, code }),
    onSuccess: async (result) => {
      setExecutionOutput(result.status === "SUCCESS" ? result.output : result.error ?? "실행에 실패했습니다.");
      await queryClient.invalidateQueries({ queryKey: ["candidate-workspace", inviteToken] });
    }
  });
  const submitMutation = useMutation({
    mutationFn: () => api.submitCandidateCode(inviteToken, { questionId: selectedQuestionId, language, code }),
    onSuccess: async (submission) => {
      setExecutionOutput(`제출 완료. 점수: ${submission.score}`);
      await queryClient.invalidateQueries({ queryKey: ["candidate-workspace", inviteToken] });
    }
  });
  useEffect(() => {
    if (!data || !inviteToken) return;
    const latestAction = data.proctorActions[0];
    if (latestAction?.type === "PAUSE_EXAM" || latestAction?.type === "TERMINATE_EXAM") {
      setExamLocked(true);
      return;
    }
    if (latestAction?.type === "RESUME_EXAM") {
      setExamLocked(false);
    }
    const serverOffsetMs = new Date(data.examSession.serverNow).getTime() - Date.now();
    const endsAt = new Date(data.examSession.endsAt).getTime();
    const updateRemaining = () => {
      const serverNow = Date.now() + serverOffsetMs;
      const remainingSeconds = Math.max(0, Math.floor((endsAt - serverNow) / 1000));
      setTimeRemainingSeconds(remainingSeconds);
      setExamLocked((latestAction?.type === "PAUSE_EXAM" || latestAction?.type === "TERMINATE_EXAM") || remainingSeconds === 0);
    };
    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(intervalId);
  }, [data, inviteToken]);
  useEffect(() => {
    if (!data || !selectedQuestionId) return;
    const serverDraft = data.drafts.find((draft) => draft.questionId === selectedQuestionId && draft.language === language);
    setCode(serverDraft?.code ?? starterCode);
    setDraftSavedAt(serverDraft ? new Date(serverDraft.savedAt).toLocaleTimeString() : "");
  }, [data, language, selectedQuestionId]);
  useEffect(() => {
    if (!inviteToken || !selectedQuestionId || examLocked) return;
    const timeoutId = window.setTimeout(() => {
      api
        .saveCandidateCodeDraft(inviteToken, { questionId: selectedQuestionId, language, code })
        .then((draft) => setDraftSavedAt(new Date(draft.savedAt).toLocaleTimeString()))
        .catch(() => setDraftSavedAt("저장 실패"));
    }, 600);
    return () => window.clearTimeout(timeoutId);
  }, [code, examLocked, inviteToken, language, selectedQuestionId]);
  useEffect(() => {
    if (timeRemainingSeconds !== 0 || timeoutSubmittedRef.current || !selectedQuestionId || submitMutation.isPending) return;
    timeoutSubmittedRef.current = true;
    setExecutionOutput("제한 시간이 종료되어 현재 답안을 자동 제출합니다.");
    submitMutation.mutate();
  }, [selectedQuestionId, submitMutation, timeRemainingSeconds]);
  if (isLoading) return <main className="exam-page">시험 화면을 불러오는 중입니다.</main>;
  if (isError || !data || !selectedQuestionId) return <CandidateError />;
  const selectedQuestion = data.questions.find((item) => item.id === selectedQuestionId) ?? data.questions[0];
  const latestAction = data.proctorActions[0];
  const isCodingQuestion = selectedQuestion.type === "CODING";
  const latestSubmission = data.submissions.find((item) => item.questionId === selectedQuestion.id);
  const latestExecution = data.executions.find((item) => item.questionId === selectedQuestion.id);
  const visibleResult = latestExecution?.testResults.length ? latestExecution : latestSubmission;
  const selectableLanguages = runnableLanguages.filter((item) => data.exam.languages.some((examLanguage) => item.aliases.includes(examLanguage.toLowerCase())));
  const languageOptions = selectableLanguages.length ? selectableLanguages : runnableLanguages;
  return (
    <main className="exam-page">
      <ExamTopbar workspace={data} timeRemainingSeconds={timeRemainingSeconds} draftSavedAt={draftSavedAt} pcProctorStatus={pcProctor.status} />
      <section className="exam-workspace">
        <QuestionNavigator questions={data.questions} selectedQuestionId={selectedQuestion.id} onSelectQuestion={setSelectedQuestionId} />
        <ProblemPanel inviteToken={inviteToken} selectedQuestion={selectedQuestion} latestSubmission={latestSubmission} pcProctor={pcProctor} />
        <EditorPanel
          examLocked={examLocked}
          latestAction={latestAction}
          language={language}
          languageOptions={languageOptions}
          onLanguageChange={setLanguage}
          runDisabled={runMutation.isPending || examLocked || !isCodingQuestion}
          submitDisabled={submitMutation.isPending || examLocked}
          onRun={() => runMutation.mutate()}
          onSubmit={() => submitMutation.mutate()}
          editorFallback={editorFallback}
          code={code}
          onCodeChange={setCode}
          onEditorReady={() => {
            setEditorReady(true);
            setEditorFallback(false);
          }}
          executionOutput={executionOutput}
          visibleResult={visibleResult}
        />
      </section>
    </main>
  );
}
