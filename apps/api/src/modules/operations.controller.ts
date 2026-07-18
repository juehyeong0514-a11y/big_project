import { Controller, ForbiddenException, Get, Headers, Inject } from "@nestjs/common";
import { OperationsReadinessService } from "../services/operations-readiness.service.js";
import { AuthService } from "../services/auth.service.js";

@Controller("/api/operations")
export class OperationsController {
  constructor(
    @Inject(OperationsReadinessService) private readonly readiness: OperationsReadinessService,
    @Inject(AuthService) private readonly auth: AuthService
  ) {}

  @Get("/readiness")
  async getReadiness(@Headers("authorization") authorization?: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    if (session.user.role !== "ADMIN") {
      throw new ForbiddenException("운영자만 운영 준비도를 확인할 수 있습니다.");
    }
    return this.readiness.getReadiness();
  }

  private extractBearerToken(authorization?: string) {
    return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
  }
}
