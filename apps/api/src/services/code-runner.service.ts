import { Injectable } from "@nestjs/common";
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

@Injectable()
export class CodeRunnerService {
  async judge(language: string, code: string, testCases: TestCase[]): Promise<CodeRunnerResult> {
    const normalizedLanguage = language.toLowerCase();
    if (!code.trim()) {
      return this.failed("Code is empty.", testCases);
    }

    if (!["javascript", "js", "python", "py"].includes(normalizedLanguage)) {
      return this.failed(`Language '${language}' is not supported by the Docker runner yet.`, testCases);
    }

    const startedAt = Date.now();
    const results: RunSingleResult[] = [];

    for (const testCase of testCases) {
      const result =
        normalizedLanguage === "javascript" || normalizedLanguage === "js"
          ? await this.runJavaScript(code, testCase.input, testCase.expectedOutput)
          : await this.runPython(code, testCase.input, testCase.expectedOutput);
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

  private async runJavaScript(code: string, input: string, expectedOutput: string): Promise<RunSingleResult> {
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
      expectedOutput
    });
  }

  private async runPython(code: string, input: string, expectedOutput: string): Promise<RunSingleResult> {
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
      expectedOutput
    });
  }

  private async runInDocker(options: {
    image: string;
    fileName: string;
    fileContent: string;
    command: string[];
    input: string;
    expectedOutput: string;
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
      ], options.input);

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

function execFileAsync(file: string, args: string[], input: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout: DOCKER_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ""}`));
        return;
      }

      resolve({ stdout, stderr });
    });

    child.stdin?.end(input);
  });
}
