import type { Candidate, Exam, Organization, Question, TestCase } from "@dcvp/shared";
import { nowIso } from "./platform-store.helpers.js";

export function createPlatformSeedData(): {
  readonly organization: Organization;
  readonly exams: Exam[];
  readonly questions: Question[];
  readonly candidates: Candidate[];
  readonly testCases: TestCase[];
} {
  return {
    organization: {
      id: "org_demo",
      name: "Acme Engineering Hiring",
      createdAt: nowIso()
    },
    exams: [
      {
        id: "exam_backend_001",
        organizationId: "org_demo",
        title: "Backend Developer Screening",
        description: "90 minute coding assessment for API design, data structures, and debugging flow.",
        startAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        endAt: new Date(Date.now() + 1000 * 60 * 60 * 30).toISOString(),
        durationMinutes: 90,
        status: "SCHEDULED",
        languages: ["Python", "JavaScript", "Java"],
        proctoringEnabled: true,
        identityVerificationEnabled: true,
        mobileCameraRequired: true,
        screenShareRequired: true,
        createdAt: nowIso()
      }
    ],
    questions: [
      {
        id: "question_cache_001",
        examId: "exam_backend_001",
        title: "Implement LRU Cache",
        description: "Implement an LRU Cache where get and put run in average O(1) time.",
        type: "CODING",
        points: 100,
        difficulty: "MEDIUM",
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        choices: [],
        createdAt: nowIso()
      }
    ],
    candidates: [
      {
        id: "candidate_001",
        examId: "exam_backend_001",
        name: "Kim Minjun",
        email: "minjun@example.com",
        status: "INVITED",
        inviteToken: "invite_demo_001",
        createdAt: nowIso()
      }
    ],
    testCases: [
      {
        id: "case_cache_public_001",
        questionId: "question_cache_001",
        input: "capacity=2; put(1,1); put(2,2); get(1)",
        expectedOutput: "1",
        isPublic: true,
        createdAt: nowIso()
      },
      {
        id: "case_cache_hidden_001",
        questionId: "question_cache_001",
        input: "capacity=2; put(1,1); put(2,2); put(3,3); get(2)",
        expectedOutput: "2",
        isPublic: false,
        createdAt: nowIso()
      }
    ]
  };
}
