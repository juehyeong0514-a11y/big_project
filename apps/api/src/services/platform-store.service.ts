import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuthSession, Candidate, CandidateInvite, CandidateWorkspace, CodeDraft, CodeExecution, CodeRunInput, CodeSubmitInput, CompetencyReport, CreateCandidateInput, CreateExamInput, CreateEnvironmentCheckInput, CreateIdentityVerificationInput, CreateProctorActionInput, CreateProctorEventInput, CreateQuestionInput, CreateTestCaseInput, DashboardSummary, EnvironmentCheck, EnvironmentCheckResult, Exam, ExamDetail, ExamReport, GenerateReportInput, IdentityVerification, InviteEmailResult, LiveProctorExamState, ProctorAction, ProctorDevice, ProctorEvent, Question, SaveCodeDraftInput, Submission, TestCase, UpdateExamInput, UpsertProctorDeviceInput } from "@dcvp/shared";
import { PrismaService } from "./prisma.service.js";
import { CodeRunnerService } from "./code-runner.service.js";
import { IdentityVerificationService } from "./identity-verification.service.js";
import { EmailService } from "./email.service.js";
import { assertEnvironmentCheckSession, createEnvironmentCheckSession } from "./environment-check-evidence.js";
import { logProctorEventInStore, markStaleProctorDevicesInStore, upsertProctorDeviceInStore } from "./platform-store.proctor.js";
import { sendCandidateInviteEmailInStore } from "./platform-store.invite-email.js";
import { saveCandidateEnvironmentCheckInStore, verifyCandidateIdentityInStore } from "./platform-store.identity-environment.js";
import { createCandidateIdentitySessionInStore } from "./platform-store.identity-session.js";
import { createExamInStore, deleteExamInStore, getExamDetailInStore, listExamsInStore, updateExamInStore } from "./platform-store.exam-admin.js";
import { addCandidateInStore, addQuestionInStore, addTestCaseInStore } from "./platform-store.exam-content.js";
import { buildLiveProctorState, getExamReportInStore } from "./platform-store.report.js";
import { saveCompetencyReportInStore } from "./platform-store.report-save.js";
import { getCandidateInviteInStore, markCandidateReadyInStore } from "./platform-store.candidate-portal.js";
import { getDashboardInStore } from "./platform-store.dashboard.js";
import { runCandidateCodeInStore, saveCandidateCodeDraftInStore, submitCandidateCodeInStore } from "./platform-store.execution.js";
import { toCandidateCodeExecution, toCandidateSubmission, toCandidateWorkspace } from "./platform-store.candidate-results.js";
import { getCandidateWorkspaceInStore } from "./platform-store.candidate-workspace.js";
import { createProctorActionInStore, findManageableCandidateWithExamInStore } from "./platform-store.candidate-admin.js";
import { assertLanguageCanRun, assertQuestionBelongsToInvite, getQuestionForEvaluationInStore, getQuestionTestCasesInStore } from "./platform-store.execution-access.js";
import { PlatformStoreState } from "./platform-store.state.js";

@Injectable()
export class PlatformStore extends PlatformStoreState {
  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(CodeRunnerService) codeRunner: CodeRunnerService,
    @Inject(IdentityVerificationService) identityVerification: IdentityVerificationService,
    @Inject(EmailService) email: EmailService
  ) {
    super(prisma, codeRunner, identityVerification, email);
  }

  async getDashboard(session: AuthSession): Promise<DashboardSummary> {
    return getDashboardInStore(this.dashboardContext(), { organization: this.organization, exams: this.exams, candidates: this.candidates }, session);
  }

  async listExams(session: AuthSession): Promise<Exam[]> {
    return listExamsInStore(this.examAdminContext(), this.examAdminMemoryState(), session);
  }

  async getExamDetail(examId: string, session: AuthSession): Promise<ExamDetail> {
    return getExamDetailInStore(this.examAdminContext(), examId, this.examAdminMemoryState(), session);
  }

  async getExamReport(examId: string, session: AuthSession): Promise<ExamReport> {
    await this.markStaleProctorDevices(examId);
    return getExamReportInStore({ context: this.reportContext(), examId, memoryState: this.reportMemoryState(), session });
  }

  async saveCompetencyReport(input: GenerateReportInput, report: CompetencyReport): Promise<CompetencyReport> {
    const result = await saveCompetencyReportInStore({ context: this.reportContext(), input, report, memoryReports: this.competencyReports });
    this.competencyReports = [...result.competencyReports];
    return result.report;
  }

  async createExam(input: CreateExamInput, session: AuthSession): Promise<Exam> {
    const result = await createExamInStore({ context: this.examAdminContext(), input, memoryState: this.examAdminMemoryState(), session });
    this.exams = [...result.exams];
    return result.exam;
  }

  async updateExam(examId: string, input: UpdateExamInput, session: AuthSession): Promise<Exam> {
    const result = await updateExamInStore({ context: this.examAdminContext(), examId, input, memoryState: this.examAdminMemoryState(), session });
    this.exams = [...result.exams];
    return result.exam;
  }

  async deleteExam(examId: string, session: AuthSession): Promise<Exam> {
    const result = await deleteExamInStore({ context: this.examAdminContext(), examId, memoryState: this.examAdminMemoryState(), session });
    this.exams = [...result.exams];
    return result.exam;
  }

  async addQuestion(examId: string, input: CreateQuestionInput, session: AuthSession): Promise<Question> {
    const result = await addQuestionInStore({ context: this.examAdminContext(), examId, input, memoryState: this.examAdminMemoryState(), session });
    this.questions = [...result.questions];
    return result.question;
  }

  async addTestCase(questionId: string, input: CreateTestCaseInput, session: AuthSession): Promise<TestCase> {
    const result = await addTestCaseInStore({ context: this.examAdminContext(), questionId, input, memoryState: this.examAdminMemoryState(), session });
    this.testCases = [...result.testCases];
    return result.testCase;
  }

  async addCandidate(examId: string, input: CreateCandidateInput, session: AuthSession): Promise<Candidate> {
    const result = await addCandidateInStore({ context: this.examAdminContext(), examId, input, memoryState: this.examAdminMemoryState(), session });
    this.candidates = [...result.candidates];
    return result.candidate;
  }

  async sendCandidateInviteEmail(candidateId: string, session: AuthSession): Promise<InviteEmailResult> {
    const candidateWithExam = await findManageableCandidateWithExamInStore(this.candidateAdminContext(), candidateId, this.candidateAdminMemoryState(), session);
    const { result, inviteEmailLogs } = await sendCandidateInviteEmailInStore({
      context: this.inviteEmailContext(),
      candidateWithExam,
      memoryLogs: this.inviteEmailLogs
    });
    this.inviteEmailLogs = [...inviteEmailLogs];
    return result;
  }

  async getCandidateInvite(inviteToken: string): Promise<CandidateInvite> {
    const invite = await this.getCandidateInviteSnapshot(inviteToken);
    await this.markStaleProctorDevices(invite.exam.id);
    return this.getCandidateInviteSnapshot(inviteToken);
  }

  async createCandidateEnvironmentCheckSession(inviteToken: string) { await this.getCandidateInvite(inviteToken); return createEnvironmentCheckSession(inviteToken); }

  async saveCandidateEnvironmentCheck(inviteToken: string, input: CreateEnvironmentCheckInput): Promise<EnvironmentCheck> {
    const invite = await this.getCandidateInvite(inviteToken);
    assertEnvironmentCheckSession({
      inviteToken,
      sessionId: input.sessionId,
      evidenceToken: input.evidenceToken
    });
    const result = await saveCandidateEnvironmentCheckInStore({
      context: this.identityEnvironmentContext(),
      invite,
      input,
      memoryChecks: this.environmentChecks
    });
    this.environmentChecks = [...result.environmentChecks];
    return result.check;
  }

  async verifyCandidateIdentity(inviteToken: string, input: CreateIdentityVerificationInput): Promise<IdentityVerification> {
    const invite = await this.getCandidateInvite(inviteToken);
    const result = await verifyCandidateIdentityInStore({
      context: this.identityEnvironmentContext(),
      invite,
      input,
      memoryVerifications: this.identityVerifications
    });
    this.identityVerifications = [...result.identityVerifications];
    return result.verification;
  }

  async createCandidateIdentitySession(inviteToken: string) { const invite = await this.getCandidateInvite(inviteToken); return createCandidateIdentitySessionInStore(this.identityVerification, invite); }

  async markCandidateReady(inviteToken: string): Promise<CandidateInvite> {
    const result = await markCandidateReadyInStore({ context: this.candidatePortalContext(), inviteToken, memoryState: this.candidatePortalMemoryState() });
    this.candidates = [...result.candidates];
    return result.invite;
  }

  async getCandidateWorkspace(inviteToken: string): Promise<CandidateWorkspace> {
    const invite = await this.getInviteForWorkspaceUse(inviteToken);
    const result = await getCandidateWorkspaceInStore({ context: this.candidateWorkspaceContext(), invite, memoryState: this.candidateWorkspaceMemoryState() });
    this.examSessions = [...result.examSessions];
    return toCandidateWorkspace(result.workspace);
  }

  async logProctorEvent(inviteToken: string, input: CreateProctorEventInput): Promise<ProctorEvent> {
    const invite = await this.getCandidateInvite(inviteToken);
    const result = await logProctorEventInStore({
      context: this.proctorContext(),
      invite,
      input,
      memoryEvents: this.proctorEvents
    });
    this.proctorEvents = [...result.proctorEvents];
    return result.event;
  }

  async createProctorAction(candidateId: string, input: CreateProctorActionInput, session: AuthSession): Promise<ProctorAction> {
    const result = await createProctorActionInStore({ context: this.candidateAdminContext(), candidateId, input, memoryState: this.candidateAdminMemoryState(), session });
    this.proctorActions = [...result.proctorActions];
    return result.action;
  }

  async upsertProctorDevice(inviteToken: string, input: UpsertProctorDeviceInput): Promise<ProctorDevice> {
    const invite = await this.getCandidateInviteSnapshot(inviteToken);
    const result = await upsertProctorDeviceInStore({
      context: this.proctorContext(),
      invite,
      input,
      memoryDevices: this.proctorDevices
    });
    this.proctorDevices = [...result.proctorDevices];
    return result.device;
  }

  async getLiveProctorState(examId: string, session: AuthSession): Promise<LiveProctorExamState> {
    const report = await this.getExamReport(examId, session);
    return buildLiveProctorState(report);
  }

  private async markStaleProctorDevices(examId: string) {
    const result = await markStaleProctorDevicesInStore({
      context: this.proctorContext(),
      examId,
      memoryState: {
        proctorDevices: this.proctorDevices,
        proctorEvents: this.proctorEvents
      }
    });
    this.proctorDevices = [...result.proctorDevices];
    this.proctorEvents = [...result.proctorEvents];
  }

  async saveCandidateCodeDraft(inviteToken: string, input: SaveCodeDraftInput): Promise<CodeDraft> {
    const invite = await this.getInviteForWorkspaceUse(inviteToken);
    assertQuestionBelongsToInvite(invite, input.questionId);
    assertLanguageCanRun(invite, input.language);
    await this.assertExamSessionOpen(invite);
    const result = await saveCandidateCodeDraftInStore({
      context: this.executionContext(),
      invite,
      input,
      memoryDrafts: this.codeDrafts
    });
    this.codeDrafts = [...result.codeDrafts];
    return result.draft;
  }

  async runCandidateCode(inviteToken: string, input: CodeRunInput): Promise<CodeExecution> {
    const invite = await this.getInviteForWorkspaceUse(inviteToken);
    assertQuestionBelongsToInvite(invite, input.questionId);
    assertLanguageCanRun(invite, input.language);
    await this.assertExamSessionOpen(invite);
    const testCases = await getQuestionTestCasesInStore(this.executionAccessContext(), this.executionAccessMemoryState(), input.questionId, true);
    const result = await runCandidateCodeInStore({
      context: this.executionContext(),
      invite,
      input,
      testCases,
      memoryExecutions: this.codeExecutions
    });
    this.codeExecutions = [...result.codeExecutions];
    return toCandidateCodeExecution(result.execution);
  }

  async submitCandidateCode(inviteToken: string, input: CodeSubmitInput): Promise<Submission> {
    const invite = await this.getInviteForWorkspaceUse(inviteToken);
    assertQuestionBelongsToInvite(invite, input.questionId);
    await this.assertExamSessionOpen(invite);
    const question = await getQuestionForEvaluationInStore(this.executionAccessContext(), this.executionAccessMemoryState(), invite, input.questionId);
    if (question.type === "CODING") {
      assertLanguageCanRun(invite, input.language);
    }
    const testCases = question.type === "CODING" ? await getQuestionTestCasesInStore(this.executionAccessContext(), this.executionAccessMemoryState(), input.questionId, false) : [];
    const result = await submitCandidateCodeInStore({
      context: this.executionContext(),
      invite,
      input,
      question,
      testCases,
      memoryState: {
        submissions: this.submissions,
        candidates: this.candidates
      }
    });
    this.submissions = [...result.submissions];
    this.candidates = [...result.candidates];
    return toCandidateSubmission(result.submission);
  }

  private async getInviteForWorkspaceUse(inviteToken: string): Promise<CandidateInvite> {
    const invite = await this.getCandidateInvite(inviteToken);
    this.assertCandidateCanUseWorkspace(invite);
    return invite;
  }

  private async getCandidateInviteSnapshot(inviteToken: string): Promise<CandidateInvite> { return getCandidateInviteInStore({ context: this.candidatePortalContext(), inviteToken, memoryState: this.candidatePortalMemoryState() }); }
}
