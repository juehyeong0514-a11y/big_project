import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { CreateQuestionInput, CreateTestCaseInput } from "@dcvp/shared";
import { api } from "./api";
import { Toggle } from "./components";

export function QuestionManager({ examId, questions, canManage }: { readonly examId: string; readonly questions: Awaited<ReturnType<typeof api.examDetail>>["questions"]; readonly canManage: boolean }) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState<CreateQuestionInput>({
    title: "",
    description: "",
    type: "CODING",
    points: 100,
    difficulty: "MEDIUM",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    choices: []
  });
  const [choiceText, setChoiceText] = useState("");
  const [testCase, setTestCase] = useState<CreateTestCaseInput & { questionId: string }>({ questionId: "", input: "", expectedOutput: "", isPublic: true });
  const [questionSaveState, setQuestionSaveState] = useState("");
  const [testCaseSaveState, setTestCaseSaveState] = useState("");
  const questionMutation = useMutation({
    mutationFn: (input: CreateQuestionInput) => api.addQuestion(examId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
      setQuestion({ title: "", description: "", type: "CODING", points: 100, difficulty: "MEDIUM", timeLimitMs: 2000, memoryLimitMb: 256, choices: [] });
      setChoiceText("");
      setQuestionSaveState("저장 완료");
    },
    onError: () => {
      setQuestionSaveState("저장 실패");
    }
  });
  const testCaseMutation = useMutation({
    mutationFn: (input: CreateTestCaseInput & { questionId: string }) => api.addTestCase(input.questionId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
      setTestCase({ questionId: "", input: "", expectedOutput: "", isPublic: true });
      setTestCaseSaveState("저장 완료");
    },
    onError: () => {
      setTestCaseSaveState("저장 실패");
    }
  });

  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h2>문제</h2>
          <p>코딩 문제와 채점 테스트케이스를 등록합니다.</p>
        </div>
      </div>
      <div className="list">
        {questions.map((item) => (
          <article key={item.id} className="list-item">
            <div>
              <strong>{item.title}</strong>
              <span>{item.type} / {item.points}점 / {item.difficulty} / {item.timeLimitMs}ms / {item.memoryLimitMb}MB</span>
              <p>{item.description}</p>
              {item.choices.length ? <code>선택지: {item.choices.join(" / ")}</code> : null}
              {item.expectedAnswer ? <code>정답 기준: {item.expectedAnswer}</code> : null}
              {item.testCases.map((test) => (
                <code key={test.id}>{test.isPublic ? "공개" : "숨김"}: {test.input} =&gt; {test.expectedOutput}</code>
              ))}
            </div>
          </article>
        ))}
      </div>
      {canManage ? (
        <>
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); setQuestionSaveState("저장 중"); questionMutation.mutate({ ...question, choices: choiceText.split("\n").map((choice) => choice.trim()).filter(Boolean) }); }}>
            <input value={question.title} onChange={(event) => setQuestion({ ...question, title: event.target.value })} placeholder="문제 제목" required />
            <select value={question.type} onChange={(event) => setQuestion({ ...question, type: event.target.value as CreateQuestionInput["type"] })}>
              <option value="CODING">코딩</option>
              <option value="MULTIPLE_CHOICE">객관식</option>
              <option value="SHORT_ANSWER">단답형</option>
              <option value="ESSAY">서술형</option>
            </select>
            <input type="number" min={1} value={question.points} onChange={(event) => setQuestion({ ...question, points: Number(event.target.value) })} placeholder="배점" required />
            <select value={question.difficulty} onChange={(event) => setQuestion({ ...question, difficulty: event.target.value as CreateQuestionInput["difficulty"] })}>
              <option value="EASY">EASY</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HARD">HARD</option>
            </select>
            <input value={question.description} onChange={(event) => setQuestion({ ...question, description: event.target.value })} placeholder="문제 설명" required />
            <textarea value={choiceText} onChange={(event) => setChoiceText(event.target.value)} placeholder="객관식 선택지, 줄마다 1개" />
            <input value={question.expectedAnswer ?? ""} onChange={(event) => setQuestion({ ...question, expectedAnswer: event.target.value || undefined })} placeholder="단답/서술/객관식 정답 기준" />
            <button className="secondary-action" type="submit" disabled={questionMutation.isPending}><Plus size={18} />문제 저장</button>
            {questionSaveState ? <span className={`save-state ${questionSaveState === "저장 실패" ? "save-state-error" : ""}`}>{questionSaveState}</span> : null}
          </form>
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); setTestCaseSaveState("저장 중"); testCaseMutation.mutate(testCase); }}>
            <select value={testCase.questionId} onChange={(event) => setTestCase({ ...testCase, questionId: event.target.value })} required>
              <option value="">문제 선택</option>
              {questions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <input value={testCase.input} onChange={(event) => setTestCase({ ...testCase, input: event.target.value })} placeholder="입력" required />
            <input value={testCase.expectedOutput} onChange={(event) => setTestCase({ ...testCase, expectedOutput: event.target.value })} placeholder="예상 출력" required />
            <Toggle label="공개" checked={testCase.isPublic} onChange={(value) => setTestCase({ ...testCase, isPublic: value })} />
            <button className="secondary-action" type="submit" disabled={testCaseMutation.isPending}>테스트 저장</button>
            {testCaseSaveState ? <span className={`save-state ${testCaseSaveState === "저장 실패" ? "save-state-error" : ""}`}>{testCaseSaveState}</span> : null}
          </form>
        </>
      ) : null}
    </section>
  );
}
