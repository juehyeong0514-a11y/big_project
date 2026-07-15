import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service.js";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ path?: string; url?: string; headers: Record<string, string | undefined> }>();
    const path = request.path ?? request.url ?? "";

    if (this.isPublicPath(path)) {
      return true;
    }

    await this.auth.me(this.extractBearerToken(request.headers.authorization));
    return true;
  }

  private isPublicPath(path: string) {
    return path === "/health" || path === "/api/mobile-access" || path.startsWith("/api/auth/") || path.startsWith("/api/exams/invites/");
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) {
      return undefined;
    }

    return authorization.slice("Bearer ".length);
  }
}
