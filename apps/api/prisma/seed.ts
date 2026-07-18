import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { createPasswordHash, isStrongPassword } from "../src/services/password-hash.js";

config({ path: "../../.env" });
config();

const prisma = new PrismaClient();

async function main() {
  const organizationId = "org_demo";
  const examId = "exam_backend_001";
  const admin = initialAdminSeed();

  await prisma.organization.upsert({
    where: { id: organizationId },
    update: { name: admin.organizationName, joinCode: "ORG-DEMO2026" },
    create: {
      id: organizationId,
      name: admin.organizationName,
      joinCode: "ORG-DEMO2026"
    }
  });

  await prisma.user.upsert({
    where: { email: admin.email },
    update: {
      name: admin.name,
      role: admin.role,
      organizationId
    },
    create: {
      id: "user_admin_001",
      email: admin.email,
      passwordHash: await createPasswordHash(admin.password),
      name: admin.name,
      role: admin.role,
      organizationId
    }
  });

  if (process.env.NODE_ENV === "production") {
    return;
  }

  await prisma.exam.upsert({
    where: { id: examId },
    update: {},
    create: {
      id: examId,
      organizationId,
      title: "Backend Developer Screening",
      description: "API 설계, 자료구조, 디버깅 흐름을 함께 확인하는 90분 코딩 평가입니다.",
      startAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      endAt: new Date(Date.now() + 1000 * 60 * 60 * 30),
      durationMinutes: 90,
      status: "SCHEDULED",
      languages: ["Python", "JavaScript", "Java"],
      proctoringEnabled: true,
      identityVerificationEnabled: true,
      mobileCameraRequired: false,
      screenShareRequired: true
    }
  });

  await prisma.question.upsert({
    where: { id: "question_cache_001" },
    update: {},
    create: {
      id: "question_cache_001",
      examId,
      title: "LRU Cache 구현",
      description: "get, put 연산이 평균 O(1)에 동작하는 LRU Cache를 구현하세요.",
      difficulty: "MEDIUM",
      timeLimitMs: 2000,
      memoryLimitMb: 256
    }
  });

  await prisma.candidate.upsert({
    where: { id: "candidate_001" },
    update: {},
    create: {
      id: "candidate_001",
      examId,
      name: "Kim Minjun",
      email: "minjun@example.com",
      status: "INVITED",
      inviteToken: "invite_demo_001"
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(`Database seed failed (${error instanceof Error ? error.name : "unknown error"}); details are suppressed to protect configuration secrets.`);
    await prisma.$disconnect();
    process.exit(1);
  });

function initialAdminSeed() {
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (process.env.NODE_ENV === "production" && !password) {
    throw new Error("INITIAL_ADMIN_PASSWORD is required when seeding production.");
  }
  if (process.env.NODE_ENV === "production" && !isStrongPassword(password)) {
    throw new Error("INITIAL_ADMIN_PASSWORD must be at least 12 characters and contain three character groups.");
  }

  return {
    email: process.env.INITIAL_ADMIN_EMAIL ?? "admin@acme.test",
    password: password ?? "@A1234567890",
    name: process.env.INITIAL_ADMIN_NAME ?? "Acme Operator",
    organizationName: process.env.INITIAL_ORGANIZATION_NAME ?? "Acme Engineering Hiring",
    role: "ADMIN" as const
  };
}
