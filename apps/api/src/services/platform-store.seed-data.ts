import type { Candidate, Exam, Organization, Question, TestCase } from "@dcvp/shared";
import type { PrismaService } from "./prisma.service.js";

export interface SeedDataState {
  readonly organization: Organization;
  readonly exams: readonly Exam[];
  readonly questions: readonly Question[];
  readonly candidates: readonly Candidate[];
  readonly testCases: readonly TestCase[];
}

export async function ensurePlatformSeedData(prisma: PrismaService, state: SeedDataState) {
  await prisma.organization.upsert({
    where: { id: state.organization.id },
    update: {},
    create: {
      id: state.organization.id,
      name: state.organization.name,
      joinCode: state.organization.joinCode ?? `ORG-${state.organization.id.replace(/^org_/, "").slice(0, 8).toUpperCase()}`
    }
  });

  const examCount = await prisma.exam.count();
  if (examCount === 0) {
    const demoExam = state.exams[0];
    const demoQuestion = state.questions[0];
    const demoCandidate = state.candidates[0];
    if (!demoExam || !demoQuestion || !demoCandidate) {
      return;
    }
    const demoTestCases = state.testCases.filter((testCase) => testCase.questionId === demoQuestion.id);

    await prisma.exam.create({
      data: {
        id: demoExam.id,
        organizationId: demoExam.organizationId,
        title: demoExam.title,
        description: demoExam.description,
        startAt: new Date(demoExam.startAt),
        endAt: new Date(demoExam.endAt),
        durationMinutes: demoExam.durationMinutes,
        status: demoExam.status,
        languages: demoExam.languages,
        proctoringEnabled: demoExam.proctoringEnabled,
        identityVerificationEnabled: demoExam.identityVerificationEnabled,
        mobileCameraRequired: demoExam.mobileCameraRequired,
        screenShareRequired: demoExam.screenShareRequired,
        questions: {
          create: {
            id: demoQuestion.id,
            title: demoQuestion.title,
            description: demoQuestion.description,
            type: demoQuestion.type,
            points: demoQuestion.points,
            difficulty: demoQuestion.difficulty,
            timeLimitMs: demoQuestion.timeLimitMs,
            memoryLimitMb: demoQuestion.memoryLimitMb,
            choices: demoQuestion.choices,
            expectedAnswer: demoQuestion.expectedAnswer,
            testCases: {
              create: demoTestCases.map((testCase) => ({
                id: testCase.id,
                input: testCase.input,
                expectedOutput: testCase.expectedOutput,
                isPublic: testCase.isPublic
              }))
            }
          }
        },
        candidates: {
          create: {
            id: demoCandidate.id,
            name: demoCandidate.name,
            email: demoCandidate.email,
            status: demoCandidate.status,
            inviteToken: demoCandidate.inviteToken
          }
        }
      }
    });

    return;
  }

  const demoQuestion = state.questions[0];
  if (!demoQuestion) {
    return;
  }
  const testCaseCount = await prisma.testCase.count({ where: { questionId: demoQuestion.id } });
  if (testCaseCount === 0) {
    await prisma.testCase.createMany({
      data: state.testCases.map((testCase) => ({
        id: testCase.id,
        questionId: testCase.questionId,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        isPublic: testCase.isPublic
      })),
      skipDuplicates: true
    });
  }
}
