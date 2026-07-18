import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { CURRENT_PRIVACY_POLICY_VERSION } from "@dcvp/shared";
import type { AuthSession, ChangePasswordInput, CreateInitialAdminInput, LoginInput, Organization, RegisterInput, SetupStatus, User } from "@dcvp/shared";
import { PrismaService } from "./prisma.service.js";
import { createPasswordHash, isStrongPassword, passwordHashNeedsUpgrade, passwordPolicyMessage, verifyPassword } from "./password-hash.js";
import { AuthSessionRegistry } from "./auth-session-registry.js";

const demoOrganization: Organization = {
  id: "org_demo",
  name: "Acme Engineering Hiring",
  createdAt: new Date().toISOString()
};

const demoUser: User = {
  id: "user_admin_001",
  email: "admin@acme.test",
  name: "Acme Operator",
  role: "ADMIN",
  organizationId: "org_demo",
  createdAt: new Date().toISOString()
};

const failedLoginLimit = 5;
const accountLockDurationMs = 15 * 60 * 1000;
const passwordLifetimeMs = 90 * 24 * 60 * 60 * 1000;
const invalidCredentialsMessage = "이메일 또는 비밀번호가 올바르지 않습니다.";
const dummyPasswordHash = "pbkdf2-sha256$310000$dcvp-dummy-login-salt$woK-CvNd4mKHb7rbtzk6crIhkEbVW_m9nXjISMPo2Zg";

type SessionRevocationListener = (session: AuthSession) => void;

type DatabaseLoginSuccess = {
  readonly kind: "SUCCESS";
  readonly user: User;
  readonly organization: Organization;
  readonly passwordChangeRequired: boolean;
};

type DatabaseLoginFailure = {
  readonly kind: "INVALID_CREDENTIALS";
};

type DatabaseLoginResult = DatabaseLoginSuccess | DatabaseLoginFailure;

@Injectable()
export class AuthService {
  private readonly sessionRevocationListeners = new Set<SessionRevocationListener>();
  private readonly sessions = new AuthSessionRegistry((session) => this.notifySessionRevoked(session));

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async setupStatus(): Promise<SetupStatus> {
    const userCount = await this.trySetupDatabase(() => this.prisma.user.count());
    if (userCount === null) {
      return { enabled: false, reason: "DATABASE_UNAVAILABLE" };
    }
    return userCount === 0 ? { enabled: true, reason: "READY" } : { enabled: false, reason: "USERS_EXIST" };
  }

  async createInitialAdmin(input: CreateInitialAdminInput): Promise<AuthSession> {
    const parsed = this.parseInitialAdminInput(input);
    if (!this.databaseAvailable() || this.demoAuthEnabled()) {
      throw new ServiceUnavailableException("Database is required before creating the initial administrator.");
    }

    for (let retry = 0; retry < 3; retry += 1) {
      try {
        const created = await this.prisma.$transaction(async (transaction) => {
          if (await transaction.user.count() !== 0) {
            throw new ConflictException("Initial administrator already exists.");
          }
          const organization = await transaction.organization.create({
            data: {
              id: `org_${crypto.randomUUID().slice(0, 12)}`,
              name: parsed.organizationName,
              joinCode: this.createJoinCode()
            }
          });
          const user = await transaction.user.create({
            data: {
              id: `user_${crypto.randomUUID().slice(0, 12)}`,
              email: parsed.email,
              passwordHash: await createPasswordHash(parsed.password),
              name: parsed.name,
              role: "ADMIN",
              organizationId: organization.id,
              privacyConsentVersion: parsed.privacyPolicyVersion,
              privacyConsentAcceptedAt: new Date()
            }
          });
          return { organization, user };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        return this.createSession(this.toUser(created.user), {
          id: created.organization.id,
          name: created.organization.name,
          joinCode: created.organization.joinCode,
          createdAt: created.organization.createdAt.toISOString()
        });
      } catch (error) {
        if (this.isSerializationFailure(error) && retry < 2) continue;
        throw error;
      }
    }

    throw new ServiceUnavailableException("Initial administrator transaction retry limit exceeded.");
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const parsed = this.parseLoginInput(input);
    const session = await this.tryDatabase(() => this.loginWithDatabase(parsed));
    if (session) {
      return session;
    }

    if (!this.demoAuthEnabled()) {
      throw new ServiceUnavailableException("관리자 DB 인증이 필요합니다. 현재 환경에서는 데모 로그인이 비활성화되어 있습니다.");
    }

    if (parsed.email !== "admin@acme.test" || parsed.password !== "@A1234567890") {
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다.");
    }

    return this.createSession(demoUser, demoOrganization);
  }

  async register(input: RegisterInput): Promise<AuthSession> {
    if (!this.databaseAvailable()) throw new ServiceUnavailableException("계정을 생성하려면 데이터베이스 연결이 필요합니다.");
    const parsed = this.parseRegisterInput(input);
    try {
      const existingEmail = await this.prisma.user.findUnique({ where: { email: parsed.email } });
      if (existingEmail) throw new ConflictException("이미 등록된 이메일입니다.");
      const user = await this.prisma.user.create({
        data: {
          id: `user_${crypto.randomUUID().slice(0, 12)}`,
          email: parsed.email,
          passwordHash: await createPasswordHash(parsed.password),
          name: parsed.name,
          role: "CANDIDATE",
          privacyConsentVersion: parsed.privacyPolicyVersion,
          privacyConsentAcceptedAt: new Date()
        }
      });
      return this.createSession(this.toUser(user), this.unaffiliatedOrganization());
    } catch (error) {
      if (error instanceof ConflictException || error instanceof ServiceUnavailableException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("이미 등록된 이메일입니다.");
      }
      throw new ServiceUnavailableException("계정 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
    }
  }

  async me(token: string | undefined): Promise<AuthSession> {
    if (!token) {
      throw new UnauthorizedException("세션 토큰이 없습니다.");
    }

    const session = this.sessions.get(token);
    if (!session) {
      throw new UnauthorizedException("세션이 만료되었거나 유효하지 않습니다.");
    }

    if (!this.databaseAvailable()) {
      return session;
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      this.sessions.delete(session.token);
      throw new UnauthorizedException("세션이 만료되었거나 유효하지 않습니다.");
    }

    const passwordChangedAt = user.passwordChangedAt ?? user.createdAt;
    if (user.passwordChangeRequired === true || passwordChangedAt.getTime() <= Date.now() - passwordLifetimeMs) {
      if (!user.passwordChangeRequired) {
        await this.prisma.user.update({ where: { id: user.id }, data: { passwordChangeRequired: true } });
      }
      const restrictedSession = { ...session, passwordChangeRequired: true };
      this.sessions.set(session.token, restrictedSession);
      return restrictedSession;
    }

    return session;
  }

  async requireActiveSession(token: string | undefined): Promise<AuthSession> {
    const session = await this.me(token);
    if (session.passwordChangeRequired) {
      throw new UnauthorizedException("비밀번호 변경이 필요합니다.");
    }

    if (!this.databaseAvailable()) {
      return session;
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      this.sessions.delete(session.token);
      throw new UnauthorizedException("세션이 만료되었거나 유효하지 않습니다.");
    }

    const passwordChangedAt = user.passwordChangedAt ?? user.createdAt;
    if (user.passwordChangeRequired === true || passwordChangedAt.getTime() <= Date.now() - passwordLifetimeMs) {
      if (!user.passwordChangeRequired) {
        await this.prisma.user.update({ where: { id: user.id }, data: { passwordChangeRequired: true } });
      }
      this.sessions.set(session.token, { ...session, passwordChangeRequired: true });
      throw new UnauthorizedException("비밀번호 변경이 필요합니다.");
    }

    return session;
  }

  async changePassword(token: string | undefined, input: ChangePasswordInput): Promise<AuthSession> {
    const session = await this.me(token);
    const parsed = this.parseChangePasswordInput(input);
    const user = await this.prisma.user.findUnique({
      where: { id: session.user.id },
      include: { organization: true }
    });

    if (!user || !(await this.passwordMatches(parsed.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException(invalidCredentialsMessage);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await createPasswordHash(parsed.newPassword),
        failedLoginAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
        passwordChangeRequired: false
      }
    });

    this.revokeUserSessions(updatedUser.id);
    return this.createSession(
      this.toUser(updatedUser),
      user.organization
        ? { id: user.organization.id, name: user.organization.name, joinCode: user.organization.joinCode, createdAt: user.organization.createdAt.toISOString() }
        : this.unaffiliatedOrganization()
    );
  }

  async refreshSession(token: string | undefined): Promise<AuthSession> {
    const session = await this.me(token);
    if (!this.databaseAvailable()) return session;
    const user = await this.prisma.user.findUnique({ where: { id: session.user.id }, include: { organization: true } });
    if (!user) return session;
    const refreshed: AuthSession = { token: session.token, user: this.toUser(user), organization: user.organization ? { id: user.organization.id, name: user.organization.name, joinCode: user.organization.joinCode, createdAt: user.organization.createdAt.toISOString() } : this.unaffiliatedOrganization(), passwordChangeRequired: session.passwordChangeRequired };
    this.sessions.set(session.token, refreshed);
    return refreshed;
  }

  logout(token: string | undefined) {
    if (token) {
      this.sessions.delete(token);
    }

    return { ok: true };
  }

  revokeUserSessions(userId: string) {
    this.sessions.revokeUser(userId);
  }

  onSessionRevoked(listener: SessionRevocationListener) {
    this.sessionRevocationListeners.add(listener);
    return () => this.sessionRevocationListeners.delete(listener);
  }

  private notifySessionRevoked(session: AuthSession) {
    for (const listener of this.sessionRevocationListeners) {
      listener(session);
    }
  }

  private async loginWithDatabase(input: LoginInput): Promise<AuthSession> {
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        const result = await this.prisma.$transaction(
          async (transaction): Promise<DatabaseLoginResult> => {
            const user = await transaction.user.findUnique({
              where: { email: input.email },
              include: { organization: true }
            });

            if (!user) {
              await this.passwordMatches(input.password, dummyPasswordHash);
              return { kind: "INVALID_CREDENTIALS" };
            }

            const now = new Date();
            if (user.lockedUntil && user.lockedUntil > now) {
              await this.passwordMatches(input.password, user.passwordHash);
              return { kind: "INVALID_CREDENTIALS" };
            }

            if (user.lockedUntil && user.lockedUntil <= now) {
              await transaction.user.update({
                where: { id: user.id },
                data: { failedLoginAttempts: 0, lockedUntil: null }
              });
            }

            if (!(await this.passwordMatches(input.password, user.passwordHash))) {
              const updatedUser = await transaction.user.update({
                where: { id: user.id },
                data: { failedLoginAttempts: { increment: 1 } }
              });

              if (updatedUser.failedLoginAttempts >= failedLoginLimit) {
                await transaction.user.update({
                  where: { id: user.id },
                  data: { lockedUntil: new Date(now.getTime() + accountLockDurationMs) }
                });
              }
              return { kind: "INVALID_CREDENTIALS" };
            }

            const passwordChangedAt = user.passwordChangedAt ?? user.createdAt;
            const passwordChangeRequired = user.passwordChangeRequired === true || passwordChangedAt.getTime() <= now.getTime() - passwordLifetimeMs;
            const passwordHash = passwordHashNeedsUpgrade(user.passwordHash) ? await createPasswordHash(input.password) : user.passwordHash;
            if (passwordHash !== user.passwordHash || user.failedLoginAttempts !== 0 || user.lockedUntil || passwordChangeRequired !== user.passwordChangeRequired) {
              await transaction.user.update({
                where: { id: user.id },
                data: {
                  passwordHash,
                  failedLoginAttempts: 0,
                  lockedUntil: null,
                  passwordChangeRequired
                }
              });
            }

            return {
              kind: "SUCCESS",
              user: this.toUser(user),
              organization: user.organization
                ? { id: user.organization.id, name: user.organization.name, joinCode: user.organization.joinCode, createdAt: user.organization.createdAt.toISOString() }
                : this.unaffiliatedOrganization(),
              passwordChangeRequired
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );

        if (result.kind === "INVALID_CREDENTIALS") {
          throw new UnauthorizedException(invalidCredentialsMessage);
        }

        const session = this.createSession(result.user, result.organization);
        const resolvedSession = { ...session, passwordChangeRequired: result.passwordChangeRequired };
        this.sessions.set(resolvedSession.token, resolvedSession);
        return resolvedSession;
      } catch (error) {
        if (this.isSerializationFailure(error) && retry < 2) {
          continue;
        }
        throw error;
      }
    }

    throw new ServiceUnavailableException("Authentication transaction retry limit exceeded.");
  }

  private isSerializationFailure(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
  }

  private createSession(user: User, organization: Organization): AuthSession {
    const token = `session_${crypto.randomUUID()}`;
    const session: AuthSession = { token, user, organization, passwordChangeRequired: false };
    this.sessions.set(token, session);
    return session;
  }

  private toUser(user: { readonly id: string; readonly email: string; readonly name: string; readonly role: User["role"]; readonly organizationId: string | null; readonly createdAt: Date }): User {
    return { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId ?? undefined, createdAt: user.createdAt.toISOString() };
  }

  private unaffiliatedOrganization(): Organization {
    return { id: "", name: "소속 없음", createdAt: new Date(0).toISOString() };
  }

  private createJoinCode(): string {
    return `ORG-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  }

  private hashPassword(password: string) {
    return createHash("sha256").update(password).digest("hex");
  }

  private async passwordMatches(password: string, storedHash: string) {
    return (await verifyPassword(password, storedHash)) || storedHash === this.hashPassword(password);
  }

  private parseInitialAdminInput(input: CreateInitialAdminInput): CreateInitialAdminInput {
    const organizationName = input.organizationName.trim();
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    if (!organizationName || organizationName.length > 160 || !name || name.length > 100 || !email || email.length > 320 || !isStrongPassword(password)) {
      throw new BadRequestException(`조직명, 이름, 이메일과 ${passwordPolicyMessage}`);
    }
    if (!email.includes("@")) {
      throw new BadRequestException("올바른 관리자 이메일을 입력해주세요.");
    }
    this.assertCurrentPrivacyConsent(input.privacyConsentAccepted, input.privacyPolicyVersion);
    return {
      organizationName,
      name,
      email,
      password,
      privacyConsentAccepted: true,
      privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION
    };
  }

  private parseRegisterInput(input: RegisterInput): RegisterInput {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    if (!name || name.length > 100 || !email || email.length > 320 || !isStrongPassword(password)) throw new BadRequestException(`이름, 이메일과 ${passwordPolicyMessage}`);
    if (!email.includes("@")) throw new BadRequestException("올바른 이메일 주소를 입력해주세요.");
    this.assertCurrentPrivacyConsent(input.privacyConsentAccepted, input.privacyPolicyVersion);
    return {
      name,
      email,
      password,
      privacyConsentAccepted: true,
      privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION
    };
  }

  private assertCurrentPrivacyConsent(accepted: boolean, version: string) {
    if (!accepted || version !== CURRENT_PRIVACY_POLICY_VERSION) {
      throw new BadRequestException("회원가입을 위해 현재 개인정보 수집·이용에 동의해 주세요.");
    }
  }

  private parseLoginInput(input: LoginInput): LoginInput {
    if (!input || typeof input.email !== "string" || typeof input.password !== "string") {
      throw new UnauthorizedException(invalidCredentialsMessage);
    }
    const email = input.email.trim().toLowerCase();
    if (!email || email.length > 320 || !email.includes("@") || input.password.length === 0 || input.password.length > 256) {
      throw new UnauthorizedException(invalidCredentialsMessage);
    }
    return { email, password: input.password };
  }

  private parseChangePasswordInput(input: ChangePasswordInput): ChangePasswordInput {
    if (!input || typeof input.currentPassword !== "string" || input.currentPassword.length > 256 || !isStrongPassword(input.newPassword)) {
      throw new BadRequestException(`현재 비밀번호와 ${passwordPolicyMessage}`);
    }
    return { currentPassword: input.currentPassword, newPassword: input.newPassword };
  }

  private demoAuthEnabled() {
    if (process.env.NODE_ENV === "production") {
      return false;
    }
    if (process.env.ALLOW_DEMO_AUTH === "1") {
      return true;
    }
    if (process.env.ALLOW_DEMO_AUTH === "0") {
      return false;
    }
    return true;
  }

  private databaseAvailable() {
    return process.env.DISABLE_DATABASE !== "1" && Boolean(process.env.DATABASE_URL);
  }

  private async tryDatabase<T>(operation: () => Promise<T>): Promise<T | null> {
    if (!this.databaseAvailable()) {
      return null;
    }

    if (this.demoAuthEnabled()) {
      return null;
    }

    try {
      return await operation();
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (this.demoAuthEnabled()) {
        return null;
      }

      console.error("Auth database operation failed; details are suppressed to protect configuration secrets.");
      throw new ServiceUnavailableException("Auth database operation failed.");
    }
  }

  private async trySetupDatabase<T>(operation: () => Promise<T>): Promise<T | null> {
    if (!this.databaseAvailable()) {
      return null;
    }
    if (this.demoAuthEnabled()) {
      return null;
    }
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error) {
        return null;
      }
      throw error;
    }
  }
}
