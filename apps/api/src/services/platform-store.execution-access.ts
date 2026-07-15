import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { CandidateInvite, Question, TestCase } from "@dcvp/shared";
import type { PrismaService } from "./prisma.service.js";
import { supportedRunnerLanguages } from "./platform-store.helpers.js";
import { mapQuestion, mapTestCase } from "./platform-store.mappers.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface ExecutionAccessContext {
  readonly prisma: PrismaService;
  readonly runDatabase: DatabaseRunner;
}

export interface ExecutionAccessMemoryState {
  readonly questions: readonly Question[];
  readonly testCases: readonly TestCase[];
}

export function assertQuestionBelongsToInvite(invite: CandidateInvite, questionId: string) {
  if (!invite.questions.some((question) => question.id === questionId)) {
    throw new NotFoundException("Question not found");
  }
}

export async function getQuestionTestCasesInStore(
  context: ExecutionAccessContext,
  memoryState: ExecutionAccessMemoryState,
  questionId: string,
  publicOnly: boolean
): Promise<TestCase[]> {
  const db = await context.runDatabase(async () => {
    const testCases = await context.prisma.testCase.findMany({
      where: {
        questionId,
        ...(publicOnly ? { isPublic: true } : {})
      },
      orderBy: { createdAt: "asc" }
    });
    return testCases.map((testCase) => mapTestCase(testCase));
  });

  return db ?? memoryState.testCases.filter((testCase) => testCase.questionId === questionId && (!publicOnly || testCase.isPublic));
}

export async function getQuestionForEvaluationInStore(
  context: ExecutionAccessContext,
  memoryState: ExecutionAccessMemoryState,
  invite: CandidateInvite,
  questionId: string
): Promise<Question> {
  const db = await context.runDatabase(async () => {
    const question = await context.prisma.question.findUnique({ where: { id: questionId } });
    if (!question || question.examId !== invite.exam.id) {
      throw new NotFoundException("Question not found");
    }

    return mapQuestion(question);
  });

  if (db) {
    return db;
  }

  const question = memoryState.questions.find((item) => item.id === questionId && item.examId === invite.exam.id);
  if (!question) {
    throw new NotFoundException("Question not found");
  }

  return question;
}

export function assertLanguageCanRun(invite: CandidateInvite, language: string) {
  const normalizedLanguage = normalizeRunnerLanguage(language);
  const allowedLanguages = invite.exam.languages.map((item) => normalizeRunnerLanguage(item)).filter(Boolean);

  if (!normalizedLanguage || !supportedRunnerLanguages.has(normalizedLanguage)) {
    throw new BadRequestException(`Language '${language}' is not supported by the Docker runner yet`);
  }

  if (!allowedLanguages.includes(normalizedLanguage)) {
    throw new BadRequestException(`Language '${language}' is not enabled for this exam`);
  }
}

function normalizeRunnerLanguage(language: string) {
  const value = language.trim().toLowerCase();
  if (value === "javascript" || value === "js") return "javascript";
  if (value === "python" || value === "py") return "python";
  return "";
}
