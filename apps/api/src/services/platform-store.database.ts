import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { CodeRunnerService } from "./code-runner.service.js";
import type { EmailService } from "./email.service.js";
import type { IdentityVerificationService } from "./identity-verification.service.js";
import type { PrismaService } from "./prisma.service.js";

export class PlatformStoreDatabase {
  private databaseUnavailable = false;

  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly codeRunner: CodeRunnerService,
    protected readonly identityVerification: IdentityVerificationService,
    protected readonly email: EmailService
  ) {}

  protected async tryDatabase<T>(operation: () => Promise<T>): Promise<T | null> {
    if (process.env.DISABLE_DATABASE === "1" || !process.env.DATABASE_URL) {
      return null;
    }

    if (this.demoAuthEnabled()) {
      return null;
    }

    if (this.databaseUnavailable && this.databaseFallbackEnabled()) {
      return null;
    }

    try {
      return await operation();
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }

      if (this.databaseFallbackEnabled()) {
        this.databaseUnavailable = true;
        return null;
      }

      console.error("Database operation failed; details are suppressed to protect configuration secrets.");
      throw new ServiceUnavailableException("Database operation failed.");
    }
  }

  protected seededDatabaseContext(ensureSeedData: () => Promise<void>) {
    return {
      prisma: this.prisma,
      runDatabase: <T>(operation: () => Promise<T>) =>
        this.tryDatabase(async () => {
          await ensureSeedData();
          return operation();
        })
    };
  }

  protected unseededDatabaseContext() {
    return {
      prisma: this.prisma,
      runDatabase: <T>(operation: () => Promise<T>) => this.tryDatabase(operation)
    };
  }

  private databaseFallbackEnabled() {
    if (process.env.DISABLE_DATABASE === "1" || this.demoAuthEnabled()) {
      return true;
    }
    return process.env.NODE_ENV !== "production";
  }

  private demoAuthEnabled() {
    if (process.env.ALLOW_DEMO_AUTH === "1") {
      return process.env.NODE_ENV !== "production";
    }
    if (process.env.ALLOW_DEMO_AUTH === "0") {
      return false;
    }
    return process.env.NODE_ENV !== "production";
  }
}
