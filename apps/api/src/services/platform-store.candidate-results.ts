import type { CandidateWorkspace, CodeExecution, JudgeTestResult, Submission } from "@dcvp/shared";

const hiddenTestMessage = "숨김 테스트 결과는 공개되지 않습니다.";
const runnerErrorMessage = "실행 중 오류가 발생했습니다. 코드와 출력 형식을 확인해주세요.";

export function toCandidateCodeExecution(execution: CodeExecution): CodeExecution {
  return {
    ...execution,
    error: execution.error ? runnerErrorMessage : undefined,
    testResults: execution.testResults.map((result) => toCandidateJudgeTestResult(result))
  };
}

export function toCandidateSubmission(submission: Submission): Submission {
  return {
    ...submission,
    testResults: submission.testResults.map((result) => toCandidateJudgeTestResult(result))
  };
}

export function toCandidateWorkspace(workspace: CandidateWorkspace): CandidateWorkspace {
  return {
    ...workspace,
    executions: workspace.executions.map((execution) => toCandidateCodeExecution(execution)),
    submissions: workspace.submissions.map((submission) => toCandidateSubmission(submission))
  };
}

function toCandidateJudgeTestResult(result: JudgeTestResult): JudgeTestResult {
  if (!result.isPublic) {
    return {
      ...result,
      input: hiddenTestMessage,
      expectedOutput: hiddenTestMessage,
      actualOutput: "",
      error: undefined
    };
  }

  return {
    ...result,
    error: result.error ? runnerErrorMessage : undefined
  };
}
