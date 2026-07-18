import type { Prisma } from "@prisma/client";
import type { Candidate, Exam, ExamDetail, Organization, Question, TestCase } from "@dcvp/shared";

export type ExamWithRelations = Prisma.ExamGetPayload<{
  include: {
    questions: {
      include: {
        testCases: true;
      };
    };
    candidates: true;
  };
}>;

export function mapOrganization(organization: { id: string; name: string; createdAt: Date }): Organization {
    return {
      id: organization.id,
      name: organization.name,
      createdAt: organization.createdAt.toISOString()
    };
  }

export function mapExam(exam: {
    id: string;
    organizationId: string;
    title: string;
    description: string;
    startAt: Date;
    endAt: Date;
    durationMinutes: number;
    status: Exam["status"];
    languages: string[];
    proctoringEnabled: boolean;
    identityVerificationEnabled: boolean;
    mobileCameraRequired: boolean;
    screenShareRequired: boolean;
    createdAt: Date;
  }): Exam {
    return {
      id: exam.id,
      organizationId: exam.organizationId,
      title: exam.title,
      description: exam.description,
      startAt: exam.startAt.toISOString(),
      endAt: exam.endAt.toISOString(),
      durationMinutes: exam.durationMinutes,
      status: exam.status,
      languages: exam.languages,
      proctoringEnabled: exam.proctoringEnabled,
      identityVerificationEnabled: exam.identityVerificationEnabled,
      mobileCameraRequired: exam.mobileCameraRequired,
      screenShareRequired: exam.screenShareRequired,
      createdAt: exam.createdAt.toISOString()
    };
  }

export function mapQuestion(question: {
    id: string;
    examId: string;
    title: string;
    description: string;
    type: Question["type"];
    points: number;
    difficulty: Question["difficulty"];
    timeLimitMs: number;
    memoryLimitMb: number;
    choices: string[];
    expectedAnswer: string | null;
    createdAt: Date;
  }): Question {
    return {
      id: question.id,
      examId: question.examId,
      title: question.title,
      description: question.description,
      type: question.type,
      points: question.points,
      difficulty: question.difficulty,
      timeLimitMs: question.timeLimitMs,
      memoryLimitMb: question.memoryLimitMb,
      choices: question.choices,
      expectedAnswer: question.expectedAnswer ?? undefined,
      createdAt: question.createdAt.toISOString()
    };
  }

export function mapCandidateQuestion(question: Parameters<typeof mapQuestion>[0]): Question {
    const candidateQuestion = mapQuestion(question);
    delete candidateQuestion.expectedAnswer;
    return candidateQuestion;
  }

export function omitExpectedAnswer(question: Question): Question {
    const candidateQuestion = { ...question };
    delete candidateQuestion.expectedAnswer;
    return candidateQuestion;
  }

export function mapTestCase(testCase: {
    id: string;
    questionId: string;
    input: string;
    expectedOutput: string;
    isPublic: boolean;
    createdAt: Date;
  }): TestCase {
    return {
      id: testCase.id,
      questionId: testCase.questionId,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      isPublic: testCase.isPublic,
      createdAt: testCase.createdAt.toISOString()
    };
  }

export function mapCandidate(candidate: {
    id: string;
    examId: string;
    name: string;
    email: string;
    status: Candidate["status"];
    inviteToken: string;
    identityPrivacyConsentVersion?: string | null;
    identityPrivacyConsentAcceptedAt?: Date | null;
    createdAt: Date;
  }): Candidate {
    return {
      id: candidate.id,
      examId: candidate.examId,
      name: candidate.name,
      email: candidate.email,
      status: candidate.status,
      inviteToken: candidate.inviteToken,
      identityPrivacyConsentVersion: candidate.identityPrivacyConsentVersion ?? undefined,
      identityPrivacyConsentAcceptedAt: candidate.identityPrivacyConsentAcceptedAt?.toISOString(),
      createdAt: candidate.createdAt.toISOString()
    };
  }

export function mapExamDetail(exam: ExamWithRelations): ExamDetail {
    return {
      ...mapExam(exam),
      questions: exam.questions.map((question) => ({
        ...mapQuestion(question),
        testCases: question.testCases.map((testCase) => mapTestCase(testCase))
      })),
      candidates: exam.candidates.map((candidate) => mapCandidate(candidate))
    };
  }
