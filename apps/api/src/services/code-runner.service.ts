import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import type { TestCase } from "@dcvp/shared";

export interface CodeRunnerResult {
  status: "SUCCESS" | "FAILED";
  output: string;
  error?: string;
  executionTimeMs: number;
  memoryUsageMb: number;
  passedTests: number;
  totalTests: number;
  testResults: CodeRunnerTestResult[];
}

export interface CodeRunnerTestResult {
  testIndex: number;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  error?: string;
  executionTimeMs: number;
  isPublic: boolean;
}

interface RunSingleResult {
  passed: boolean;
  actualOutput: string;
  error?: string;
  executionTimeMs: number;
}

const DOCKER_TIMEOUT_MS = 8000;
const MEMORY_LIMIT = "256m";
const CPU_LIMIT = "0.5";
const MAX_CODE_LENGTH = 100_000;
const MAX_TEST_CASES = 50;
const MAX_CONCURRENT_RUNS = 2;
const MAX_QUEUED_RUNS = 8;
const QUEUE_TIMEOUT_MS = 5000;
const MAX_RUNS_PER_CANDIDATE_PER_MINUTE = 6;
const MAX_JUDGE_DURATION_MS = 30_000;

type QueuedRun = {
  readonly admissionKey: string;
  readonly operation: () => Promise<CodeRunnerResult>;
  readonly resolve: (result: CodeRunnerResult) => void;
  readonly reject: (error: unknown) => void;
  readonly timeout: NodeJS.Timeout;
};

@Injectable()
export class CodeRunnerService {
  private activeRuns = 0;
  private readonly activeAdmissionKeys = new Set<string>();
  private readonly queuedRuns: QueuedRun[] = [];
  private readonly requestWindows = new Map<string, { count: number; resetAt: number }>();

  async judge(language: string, code: string, testCases: TestCase[], admissionKey = "unscoped"): Promise<CodeRunnerResult> {
    if (process.env.NODE_ENV === "production") {
      throw new ServiceUnavailableException("운영 환경의 코드 실행은 별도 격리 러너 서비스가 연결되기 전까지 비활성화됩니다.");
    }
    return this.withAdmission(admissionKey, () => this.judgeAdmitted(language, code, testCases));
  }

  private async judgeAdmitted(language: string, code: string, testCases: TestCase[]): Promise<CodeRunnerResult> {
    const normalizedLanguage = language.toLowerCase();
    if (!code.trim()) {
      return this.failed("Code is empty.", testCases);
    }

    if (code.length > MAX_CODE_LENGTH || testCases.length > MAX_TEST_CASES) {
      return this.failed("Code or test case count exceeds the runner limit.", testCases.slice(0, MAX_TEST_CASES));
    }

    if (!["javascript", "js", "python", "py"].includes(normalizedLanguage)) {
      return this.failed(`Language '${language}' is not supported by the Docker runner yet.`, testCases);
    }

    const startedAt = Date.now();
    const deadlineAt = startedAt + MAX_JUDGE_DURATION_MS;
    const results: RunSingleResult[] = [];

    for (const [index, testCase] of testCases.entries()) {
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) {
        for (let skipped = index; skipped < testCases.length; skipped += 1) {
          results.push({ passed: false, actualOutput: "", error: "Overall judge time limit exceeded.", executionTimeMs: 0 });
        }
        break;
      }
      const result =
        normalizedLanguage === "javascript" || normalizedLanguage === "js"
          ? await this.runJavaScript(code, testCase.input, testCase.expectedOutput, remainingMs)
          : await this.runPython(code, testCase.input, testCase.expectedOutput, remainingMs);
      results.push(result);
    }

    const passedTests = results.filter((result) => result.passed).length;
    const totalTests = testCases.length;
    const failedResult = results.find((result) => !result.passed);
    const testResults = results.map((result, index) => ({
      testIndex: index + 1,
      input: testCases[index].input,
      expectedOutput: testCases[index].expectedOutput,
      actualOutput: result.actualOutput,
      passed: result.passed,
      error: result.error,
      executionTimeMs: result.executionTimeMs,
      isPublic: testCases[index].isPublic
    }));
    const outputLines = results.map((result, index) => {
      const status = result.passed ? "PASS" : "FAIL";
      return `${index + 1}. ${status} (${result.executionTimeMs}ms)`;
    });

    return {
      status: failedResult ? "FAILED" : "SUCCESS",
      output: totalTests > 0 ? `Docker 채점 완료. ${passedTests}/${totalTests} 테스트 통과.\n${outputLines.join("\n")}` : "설정된 테스트케이스가 없습니다.",
      error: failedResult?.error,
      executionTimeMs: Date.now() - startedAt,
      memoryUsageMb: 0,
      passedTests,
      totalTests,
      testResults
    };
  }

  private withAdmission(admissionKey: string, operation: () => Promise<CodeRunnerResult>): Promise<CodeRunnerResult> {
    this.assertRequestRate(admissionKey);
    if (this.activeRuns < MAX_CONCURRENT_RUNS && !this.activeAdmissionKeys.has(admissionKey)) {
      return this.runAdmitted(admissionKey, operation);
    }
    if (this.queuedRuns.length >= MAX_QUEUED_RUNS) {
      return Promise.reject(this.busyError());
    }
    return new Promise((resolve, reject) => {
      const queued: QueuedRun = {
        admissionKey,
        operation,
        resolve,
        reject,
        timeout: setTimeout(() => {
          const index = this.queuedRuns.indexOf(queued);
          if (index >= 0) this.queuedRuns.splice(index, 1);
          reject(this.busyError());
        }, QUEUE_TIMEOUT_MS)
      };
      queued.timeout.unref();
      this.queuedRuns.push(queued);
    });
  }

  private async runAdmitted(admissionKey: string, operation: () => Promise<CodeRunnerResult>): Promise<CodeRunnerResult> {
    this.activeRuns += 1;
    this.activeAdmissionKeys.add(admissionKey);
    try {
      return await operation();
    } finally {
      this.activeRuns -= 1;
      this.activeAdmissionKeys.delete(admissionKey);
      this.dispatchQueuedRuns();
    }
  }

  private dispatchQueuedRuns(): void {
    while (this.activeRuns < MAX_CONCURRENT_RUNS) {
      const index = this.queuedRuns.findIndex((queued) => !this.activeAdmissionKeys.has(queued.admissionKey));
      if (index < 0) return;
      const [queued] = this.queuedRuns.splice(index, 1);
      clearTimeout(queued.timeout);
      void this.runAdmitted(queued.admissionKey, queued.operation).then(queued.resolve, queued.reject);
    }
  }

  private assertRequestRate(admissionKey: string): void {
    const now = Date.now();
    const existing = this.requestWindows.get(admissionKey);
    const window = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : existing;
    window.count += 1;
    this.requestWindows.set(admissionKey, window);
    if (window.count > MAX_RUNS_PER_CANDIDATE_PER_MINUTE) throw this.busyError();
    if (this.requestWindows.size > 10_000) {
      for (const [key, candidateWindow] of this.requestWindows) {
        if (candidateWindow.resetAt <= now) this.requestWindows.delete(key);
      }
    }
  }

  private busyError(): HttpException {
    return new HttpException("코드 실행 요청이 많습니다. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
  }

  private async runJavaScript(code: string, input: string, expectedOutput: string, remainingMs: number): Promise<RunSingleResult> {
    const runner = `
const fs = require("node:fs");
const input = fs.readFileSync(0, "utf8");
${code}
Promise.resolve()
  .then(() => {
    if (typeof solution !== "function") {
      throw new Error("Define function solution(input).");
    }
    return solution(input);
  })
  .then((result) => {
    if (result !== undefined) process.stdout.write(String(result));
  })
  .catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  });
`;

    return this.runInDocker({
      image: "node:20-alpine",
      fileName: "runner.js",
      fileContent: runner,
      command: ["node", "/workspace/runner.js"],
      input,
      expectedOutput,
      timeoutMs: Math.max(1, Math.min(DOCKER_TIMEOUT_MS, remainingMs))
    });
  }

  private async runPython(code: string, input: string, expectedOutput: string, remainingMs: number): Promise<RunSingleResult> {
    const runner = `
import sys

${code}

if "solution" not in globals() or not callable(solution):
    raise RuntimeError("Define function solution(input).")

result = solution(sys.stdin.read())
if result is not None:
    sys.stdout.write(str(result))
`;

    return this.runInDocker({
      image: "python:3.12-alpine",
      fileName: "runner.py",
      fileContent: runner,
      command: ["python", "/workspace/runner.py"],
      input,
      expectedOutput,
      timeoutMs: Math.max(1, Math.min(DOCKER_TIMEOUT_MS, remainingMs))
    });
  }

  private async runInDocker(options: {
    image: string;
    fileName: string;
    fileContent: string;
    command: string[];
    input: string;
    expectedOutput: string;
    timeoutMs: number;
  }): Promise<RunSingleResult> {
    const workDir = await mkdtemp(join(tmpdir(), "dcvp-run-"));
    const startedAt = Date.now();

    try {
      await writeFile(join(workDir, options.fileName), options.fileContent, "utf8");
      const { stdout, stderr } = await execFileAsync("docker", [
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--user",
        "65534:65534",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=16m",
        "--memory",
        MEMORY_LIMIT,
        "--cpus",
        CPU_LIMIT,
        "--pids-limit",
        "64",
        "-i",
        "-v",
        `${workDir}:/workspace:ro`,
        "-w",
        "/workspace",
        options.image,
        ...options.command
      ], options.input, options.timeoutMs);

      const actualOutput = normalizeOutput(stdout);
      const expectedOutput = normalizeOutput(options.expectedOutput);

      return {
        passed: actualOutput === expectedOutput,
        actualOutput,
        error: actualOutput === expectedOutput ? undefined : `Expected '${expectedOutput}', received '${actualOutput}'.${stderr ? ` Stderr: ${stderr}` : ""}`,
        executionTimeMs: Date.now() - startedAt
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        passed: false,
        actualOutput: "",
        error: message,
        executionTimeMs: Date.now() - startedAt
      };
    } finally {
      await rm(workDir, { force: true, recursive: true });
    }
  }

  private failed(error: string, testCases: TestCase[]): CodeRunnerResult {
    return {
      status: "FAILED",
      output: "",
      error,
      executionTimeMs: 0,
      memoryUsageMb: 0,
      passedTests: 0,
      totalTests: testCases.length,
      testResults: testCases.map((testCase, index) => ({
        testIndex: index + 1,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: "",
        passed: false,
        error,
        executionTimeMs: 0,
        isPublic: testCase.isPublic
      }))
    };
  }
}

function normalizeOutput(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function execFileAsync(file: string, args: string[], input: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ""}`));
        return;
      }

      resolve({ stdout, stderr });
    });

    child.stdin?.end(input);
  });
}
