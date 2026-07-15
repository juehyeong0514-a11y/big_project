import { Body, Controller, Get, Headers, Inject, Post } from "@nestjs/common";
import type { CreateAdminSignupRequestInput, CreateInitialAdminInput, LoginInput, RegisterInput } from "@dcvp/shared";
import { AuthService } from "../services/auth.service.js";
import { AdminSignupRequestsService } from "../services/admin-signup-requests.service.js";

@Controller("/api/auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AdminSignupRequestsService) private readonly signupRequests: AdminSignupRequestsService
  ) {}

  @Post("/login")
  login(@Body() body: LoginInput) {
    return this.auth.login(body);
  }

  @Post("/register")
  register(@Body() body: RegisterInput) {
    return this.auth.register(body);
  }

  @Get("/setup")
  setupStatus() {
    return this.auth.setupStatus();
  }

  @Post("/setup")
  createInitialAdmin(@Body() body: CreateInitialAdminInput) {
    return this.auth.createInitialAdmin(body);
  }

  @Post("/admin-signup-requests")
  createAdminSignupRequest(@Body() body: CreateAdminSignupRequestInput) {
    return this.signupRequests.createRequest(body);
  }

  @Get("/me")
  me(@Headers("authorization") authorization?: string) {
    return this.auth.me(this.extractBearerToken(authorization));
  }

  @Post("/logout")
  logout(@Headers("authorization") authorization?: string) {
    return this.auth.logout(this.extractBearerToken(authorization));
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) {
      return undefined;
    }

    return authorization.slice("Bearer ".length);
  }
}
