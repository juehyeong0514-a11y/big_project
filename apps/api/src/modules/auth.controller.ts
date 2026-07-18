import { Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Inject, Post, Req } from "@nestjs/common";
import type { ChangePasswordInput, CreateInitialAdminInput, LoginInput, RegisterInput } from "@dcvp/shared";
import { AuthService } from "../services/auth.service.js";
import { AccountCreationRateLimiter, LoginRateLimiter } from "../services/login-rate-limiter.js";

@Controller("/api/auth")
export class AuthController {
  private readonly loginRateLimiter = new LoginRateLimiter();
  private readonly accountCreationRateLimiter = new AccountCreationRateLimiter();

  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("/login")
  @HttpCode(HttpStatus.OK)
  login(@Req() request: Parameters<LoginRateLimiter["consume"]>[0], @Body() body: LoginInput) {
    const retryAfter = this.loginRateLimiter.consume(request, body?.email);
    if (retryAfter !== null) {
      throw new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message: "로그인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.auth.login(body);
  }

  @Post("/register")
  register(@Req() request: Parameters<AccountCreationRateLimiter["consume"]>[0], @Body() body: RegisterInput) {
    this.assertAccountCreationRate(request, body?.email);
    return this.auth.register(body);
  }

  @Post("/change-password")
  changePassword(@Headers("authorization") authorization: string | undefined, @Body() body: ChangePasswordInput) {
    return this.auth.changePassword(this.extractBearerToken(authorization), body);
  }

  @Get("/setup")
  setupStatus() {
    return this.auth.setupStatus();
  }

  @Post("/setup")
  createInitialAdmin(@Req() request: Parameters<AccountCreationRateLimiter["consume"]>[0], @Body() body: CreateInitialAdminInput) {
    this.assertAccountCreationRate(request, body?.email);
    return this.auth.createInitialAdmin(body);
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

  private assertAccountCreationRate(request: Parameters<AccountCreationRateLimiter["consume"]>[0], email: unknown): void {
    const retryAfter = this.accountCreationRateLimiter.consume(request, email);
    if (retryAfter !== null) {
      throw new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message: "계정 생성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
