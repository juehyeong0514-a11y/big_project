import { Body, Controller, Delete, Get, Headers, HttpException, HttpStatus, Inject, Param, Patch, Post, Req } from "@nestjs/common";
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
import type { IdentityPrivacyConsentInput } from "@dcvp/shared";
import { PlatformStore } from "../services/platform-store.service.js";
import { AuthService } from "../services/auth.service.js";
import { CandidateExecutionRateLimiter } from "../services/login-rate-limiter.js";

@Controller("/api/exams")
export class ExamsController {
  private readonly candidateExecutionRateLimiter = new CandidateExecutionRateLimiter();

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
  async runCode(@Req() request: Parameters<CandidateExecutionRateLimiter["consume"]>[0], @Param("inviteToken") inviteToken: string, @Body() body: CodeRunInput) {
    await this.store.assertCandidateInviteExists(inviteToken);
    this.assertCandidateExecutionRate(request, inviteToken);
    return this.store.runCandidateCode(inviteToken, body);
  }

  @Post("/invites/:inviteToken/drafts")
  saveCodeDraft(@Param("inviteToken") inviteToken: string, @Body() body: SaveCodeDraftInput) {
    return this.store.saveCandidateCodeDraft(inviteToken, body);
  }

  @Post("/invites/:inviteToken/submit")
  async submitCode(@Req() request: Parameters<CandidateExecutionRateLimiter["consume"]>[0], @Param("inviteToken") inviteToken: string, @Body() body: CodeSubmitInput) {
    await this.store.assertCandidateInviteExists(inviteToken);
    this.assertCandidateExecutionRate(request, inviteToken);
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
  createIdentitySession(@Param("inviteToken") inviteToken: string, @Body() body: IdentityPrivacyConsentInput) {
    return this.store.createCandidateIdentitySession(inviteToken, body);
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

  private assertCandidateExecutionRate(request: Parameters<CandidateExecutionRateLimiter["consume"]>[0], inviteToken: string): void {
    const retryAfter = this.candidateExecutionRateLimiter.consume(request, inviteToken);
    if (retryAfter !== null) {
      throw new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message: "코드 실행 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
