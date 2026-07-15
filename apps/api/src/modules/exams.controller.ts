import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post } from "@nestjs/common";
import type {
  CodeRunInput,
  CodeSubmitInput,
  CreateCandidateInput,
  CreateEnvironmentCheckInput,
  CreateExamInput,
  CreateIdentityVerificationInput,
  CreateProctorActionInput,
  CreateProctorEventInput,
  CreateQuestionInput,
  CreateTestCaseInput,
  SaveCodeDraftInput,
  UpdateExamInput,
  UpsertProctorDeviceInput
} from "@dcvp/shared";
import { PlatformStore } from "../services/platform-store.service.js";
import { AuthService } from "../services/auth.service.js";

@Controller("/api/exams")
export class ExamsController {
  constructor(
    @Inject(PlatformStore) private readonly store: PlatformStore,
    @Inject(AuthService) private readonly auth: AuthService
  ) {}

  @Get()
  async list(@Headers("authorization") authorization?: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.listExams(session);
  }

  @Post()
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: CreateExamInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.createExam(body, session);
  }

  @Patch("/:examId")
  async update(@Headers("authorization") authorization: string | undefined, @Param("examId") examId: string, @Body() body: UpdateExamInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.updateExam(examId, body, session);
  }

  @Get("/invites/:inviteToken")
  invite(@Param("inviteToken") inviteToken: string) {
    return this.store.getCandidateInvite(inviteToken);
  }

  @Post("/invites/:inviteToken/ready")
  markReady(@Param("inviteToken") inviteToken: string) {
    return this.store.markCandidateReady(inviteToken);
  }

  @Post("/invites/:inviteToken/environment-check-session")
  createEnvironmentCheckSession(@Param("inviteToken") inviteToken: string) {
    return this.store.createCandidateEnvironmentCheckSession(inviteToken);
  }

  @Post("/invites/:inviteToken/environment-checks")
  saveEnvironmentCheck(@Param("inviteToken") inviteToken: string, @Body() body: CreateEnvironmentCheckInput) {
    return this.store.saveCandidateEnvironmentCheck(inviteToken, body);
  }

  @Get("/invites/:inviteToken/workspace")
  workspace(@Param("inviteToken") inviteToken: string) {
    return this.store.getCandidateWorkspace(inviteToken);
  }

  @Post("/invites/:inviteToken/run")
  runCode(@Param("inviteToken") inviteToken: string, @Body() body: CodeRunInput) {
    return this.store.runCandidateCode(inviteToken, body);
  }

  @Post("/invites/:inviteToken/drafts")
  saveCodeDraft(@Param("inviteToken") inviteToken: string, @Body() body: SaveCodeDraftInput) {
    return this.store.saveCandidateCodeDraft(inviteToken, body);
  }

  @Post("/invites/:inviteToken/submit")
  submitCode(@Param("inviteToken") inviteToken: string, @Body() body: CodeSubmitInput) {
    return this.store.submitCandidateCode(inviteToken, body);
  }

  @Post("/invites/:inviteToken/proctor-events")
  logProctorEvent(@Param("inviteToken") inviteToken: string, @Body() body: CreateProctorEventInput) {
    return this.store.logProctorEvent(inviteToken, body);
  }

  @Post("/invites/:inviteToken/proctor-devices")
  upsertProctorDevice(@Param("inviteToken") inviteToken: string, @Body() body: UpsertProctorDeviceInput) {
    return this.store.upsertProctorDevice(inviteToken, body);
  }

  @Post("/invites/:inviteToken/identity-verifications")
  verifyIdentity(@Param("inviteToken") inviteToken: string, @Body() body: CreateIdentityVerificationInput) {
    return this.store.verifyCandidateIdentity(inviteToken, body);
  }

  @Post("/invites/:inviteToken/identity-session")
  createIdentitySession(@Param("inviteToken") inviteToken: string) {
    return this.store.createCandidateIdentitySession(inviteToken);
  }

  @Get("/:examId/report")
  async report(@Headers("authorization") authorization: string | undefined, @Param("examId") examId: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.getExamReport(examId, session);
  }

  @Get("/:examId/proctor-live")
  async proctorLive(@Headers("authorization") authorization: string | undefined, @Param("examId") examId: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.getLiveProctorState(examId, session);
  }

  @Get("/:examId")
  async detail(@Headers("authorization") authorization: string | undefined, @Param("examId") examId: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.getExamDetail(examId, session);
  }

  @Delete("/:examId")
  async delete(@Headers("authorization") authorization: string | undefined, @Param("examId") examId: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.deleteExam(examId, session);
  }

  @Post("/:examId/questions")
  async addQuestion(@Headers("authorization") authorization: string | undefined, @Param("examId") examId: string, @Body() body: CreateQuestionInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.addQuestion(examId, body, session);
  }

  @Post("/questions/:questionId/test-cases")
  async addTestCase(@Headers("authorization") authorization: string | undefined, @Param("questionId") questionId: string, @Body() body: CreateTestCaseInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.addTestCase(questionId, body, session);
  }

  @Post("/:examId/candidates")
  async addCandidate(@Headers("authorization") authorization: string | undefined, @Param("examId") examId: string, @Body() body: CreateCandidateInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.addCandidate(examId, body, session);
  }

  @Post("/candidates/:candidateId/invite-email")
  async sendCandidateInviteEmail(@Headers("authorization") authorization: string | undefined, @Param("candidateId") candidateId: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.sendCandidateInviteEmail(candidateId, session);
  }

  @Post("/candidates/:candidateId/proctor-actions")
  async createProctorAction(@Headers("authorization") authorization: string | undefined, @Param("candidateId") candidateId: string, @Body() body: CreateProctorActionInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.store.createProctorAction(candidateId, body, session);
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) {
      return undefined;
    }

    return authorization.slice("Bearer ".length);
  }
}
