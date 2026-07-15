import { ForbiddenException } from "@nestjs/common";
import type {
  Candidate,
  CandidateInvite,
  CodeDraft,
  CodeExecution,
  CompetencyReport,
  EnvironmentCheck,
  Exam,
  ExamSession,
  IdentityVerification,
  InviteEmailLog,
  Organization,
  ProctorAction,
  ProctorDevice,
  ProctorEvent,
  Question,
  Submission,
  TestCase
} from "@dcvp/shared";
import type { CodeRunnerService } from "./code-runner.service.js";
import type { EmailService } from "./email.service.js";
import type { IdentityVerificationService } from "./identity-verification.service.js";
import type { PrismaService } from "./prisma.service.js";
import type { ExamAdminStoreContext } from "./platform-store.exam-admin.js";
import type { IdentityEnvironmentStoreContext } from "./platform-store.identity-environment.js";
import type { InviteEmailStoreContext } from "./platform-store.invite-email.js";
import type { ProctorStoreContext } from "./platform-store.proctor.js";
import { assertExamSessionOpenInStore } from "./platform-store.candidate-workspace.js";
import { ensurePlatformSeedData } from "./platform-store.seed-data.js";
import { createPlatformSeedData } from "./platform-store.seed.js";
import { PlatformStoreDatabase } from "./platform-store.database.js";

const platformSeedData = createPlatformSeedData();

export class PlatformStoreState extends PlatformStoreDatabase {
  protected constructor(
    prisma: PrismaService,
    codeRunner: CodeRunnerService,
    identityVerification: IdentityVerificationService,
    email: EmailService
  ) {
    super(prisma, codeRunner, identityVerification, email);
  }

  protected readonly organization: Organization = platformSeedData.organization;
  protected exams: Exam[] = [...platformSeedData.exams];
  protected questions: Question[] = [...platformSeedData.questions];
  protected candidates: Candidate[] = [...platformSeedData.candidates];
  protected testCases: TestCase[] = [...platformSeedData.testCases];

  protected proctorEvents: ProctorEvent[] = [];
  protected proctorDevices: ProctorDevice[] = [];
  protected proctorActions: ProctorAction[] = [];
  protected competencyReports: CompetencyReport[] = [];
  protected identityVerifications: IdentityVerification[] = [];
  protected environmentChecks: EnvironmentCheck[] = [];
  protected examSessions: ExamSession[] = [];
  protected codeDrafts: CodeDraft[] = [];
  protected codeExecutions: CodeExecution[] = [];
  protected submissions: Submission[] = [];
  protected inviteEmailLogs: InviteEmailLog[] = [];
  protected async ensureSeedData() {
    await ensurePlatformSeedData(this.prisma, this.examAdminMemoryState());
  }

  protected examAdminContext(): ExamAdminStoreContext {
    return {
      prisma: this.prisma,
      runDatabase: <T>(operation: () => Promise<T>) =>
        this.tryDatabase(async () => {
          await this.ensureSeedData();
          return operation();
        })
    };
  }

  protected examAdminMemoryState() {
    return {
      organization: this.organization,
      exams: this.exams,
      questions: this.questions,
      candidates: this.candidates,
      testCases: this.testCases
    };
  }

  protected reportContext() {
    return this.seededDatabaseContext(() => this.ensureSeedData());
  }

  protected dashboardContext() {
    return this.seededDatabaseContext(() => this.ensureSeedData());
  }

  protected reportMemoryState() {
    return {
      exams: this.exams,
      candidates: this.candidates,
      submissions: this.submissions,
      codeExecutions: this.codeExecutions,
      competencyReports: this.competencyReports,
      identityVerifications: this.identityVerifications,
      environmentChecks: this.environmentChecks,
      inviteEmailLogs: this.inviteEmailLogs,
      proctorEvents: this.proctorEvents,
      proctorDevices: this.proctorDevices,
      proctorActions: this.proctorActions
    };
  }

  protected candidatePortalContext() {
    return this.seededDatabaseContext(() => this.ensureSeedData());
  }

  protected candidatePortalMemoryState() {
    return {
      organization: this.organization,
      exams: this.exams,
      questions: this.questions,
      candidates: this.candidates,
      proctorDevices: this.proctorDevices,
      identityVerifications: this.identityVerifications,
      environmentChecks: this.environmentChecks
    };
  }

  protected executionContext() {
    return {
      prisma: this.prisma,
      codeRunner: this.codeRunner,
      runDatabase: <T>(operation: () => Promise<T>) => this.tryDatabase(operation)
    };
  }

  protected executionAccessContext() {
    return this.unseededDatabaseContext();
  }

  protected executionAccessMemoryState() {
    return {
      questions: this.questions,
      testCases: this.testCases
    };
  }

  protected candidateWorkspaceContext() {
    return this.unseededDatabaseContext();
  }

  protected candidateWorkspaceMemoryState() {
    return {
      submissions: this.submissions,
      codeExecutions: this.codeExecutions,
      proctorEvents: this.proctorEvents,
      proctorActions: this.proctorActions,
      codeDrafts: this.codeDrafts,
      examSessions: this.examSessions
    };
  }

  protected candidateAdminContext() {
    return this.seededDatabaseContext(() => this.ensureSeedData());
  }

  protected candidateAdminMemoryState() {
    return {
      candidates: this.candidates,
      exams: this.exams,
      proctorActions: this.proctorActions
    };
  }

  protected inviteEmailContext(): InviteEmailStoreContext {
    return {
      prisma: this.prisma,
      email: this.email,
      runDatabase: <T>(operation: () => Promise<T>) => this.tryDatabase(operation)
    };
  }

  protected identityEnvironmentContext(): IdentityEnvironmentStoreContext {
    return {
      prisma: this.prisma,
      identityVerification: this.identityVerification,
      runDatabase: <T>(operation: () => Promise<T>) => this.tryDatabase(operation)
    };
  }

  protected proctorContext(): ProctorStoreContext {
    return this.unseededDatabaseContext();
  }

  protected assertCandidateCanUseWorkspace(invite: CandidateInvite) {
    if (invite.candidate.status === "INVITED") {
      throw new ForbiddenException("Candidate entry confirmation is required");
    }

    if (!invite.environmentCheck?.requiredPassed) {
      throw new ForbiddenException("Environment check is required");
    }

    if (invite.exam.identityVerificationEnabled && invite.identityVerification?.status !== "VERIFIED") {
      throw new ForbiddenException("Identity verification is required");
    }

    const mobileAuxConnected = invite.proctorDevices.some((device) => device.role === "MOBILE_AUX" && device.status === "CONNECTED");
    if (invite.exam.mobileCameraRequired && !mobileAuxConnected) {
      throw new ForbiddenException("Mobile auxiliary camera connection is required");
    }
  }

  protected async assertExamSessionOpen(invite: CandidateInvite) {
    const result = await assertExamSessionOpenInStore({
      context: this.candidateWorkspaceContext(),
      invite,
      memoryActions: this.proctorActions,
      memorySessions: this.examSessions
    });
    this.examSessions = [...result.examSessions];
  }

}
