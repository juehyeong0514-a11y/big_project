import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DashboardController } from "./dashboard.controller.js";
import { ExamsController } from "./exams.controller.js";
import { AiController } from "./ai.controller.js";
import { AuthController } from "./auth.controller.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { OperationsController } from "./operations.controller.js";
import { PlatformStore } from "../services/platform-store.service.js";
import { AiEvaluationService } from "../services/ai-evaluation.service.js";
import { PrismaService } from "../services/prisma.service.js";
import { AuthService } from "../services/auth.service.js";
import { AdminUsersService } from "../services/admin-users.service.js";
import { AdminSignupRequestsService } from "../services/admin-signup-requests.service.js";
import { OrganizationRequestsService } from "../services/organization-requests.service.js";
import { OrganizationInvitationsService } from "../services/organization-invitations.service.js";
import { CodeRunnerService } from "../services/code-runner.service.js";
import { IdentityVerificationService } from "../services/identity-verification.service.js";
import { EmailService } from "../services/email.service.js";
import { OperationsReadinessService } from "../services/operations-readiness.service.js";
import { AdminAuthGuard } from "../services/admin-auth.guard.js";
import { ProctorGateway } from "./proctor.gateway.js";

@Module({
  controllers: [AuthController, AdminUsersController, DashboardController, ExamsController, AiController, OperationsController],
  providers: [
    PlatformStore,
    AiEvaluationService,
    PrismaService,
    AuthService,
    AdminUsersService,
    AdminSignupRequestsService,
    OrganizationRequestsService,
    OrganizationInvitationsService,
    CodeRunnerService,
    IdentityVerificationService,
    EmailService,
    OperationsReadinessService,
    ProctorGateway,
    {
      provide: APP_GUARD,
      useClass: AdminAuthGuard
    }
  ]
})
export class AppModule {}
