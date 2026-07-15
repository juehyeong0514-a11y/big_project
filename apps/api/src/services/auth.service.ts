import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { AuthSession, CreateInitialAdminInput, LoginInput, Organization, RegisterInput, SetupStatus, User } from "@dcvp/shared";
import { PrismaService } from "./prisma.service.js";
import { createPasswordHash, passwordHashNeedsUpgrade, verifyPassword } from "./password-hash.js";

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

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, AuthSession>();

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
    const status = await this.setupStatus();
    if (status.reason === "DATABASE_UNAVAILABLE") {
      throw new ServiceUnavailableException("Database is required before creating the initial administrator.");
    }
    if (!status.enabled) {
      throw new ConflictException("Initial administrator already exists.");
    }

    const organization = await this.prisma.organization.create({
      data: {
        id: `org_${crypto.randomUUID().slice(0, 12)}`,
        name: parsed.organizationName,
        joinCode: this.createJoinCode()
      }
    });
    const user = await this.prisma.user.create({
      data: {
        id: `user_${crypto.randomUUID().slice(0, 12)}`,
        email: parsed.email,
        passwordHash: createPasswordHash(parsed.password),
        name: parsed.name,
        role: "ADMIN",
        organizationId: organization.id
      }
    });

    return this.createSession(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId ?? undefined,
        createdAt: user.createdAt.toISOString()
      },
      { id: organization.id, name: organization.name, createdAt: organization.createdAt.toISOString() }
    );
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const session = await this.tryDatabase(() => this.loginWithDatabase(input));
    if (session) {
      return session;
    }

    if (!this.demoAuthEnabled()) {
      throw new ServiceUnavailableException("관리자 DB 인증이 필요합니다. 현재 환경에서는 데모 로그인이 비활성화되어 있습니다.");
    }

    if (input.email !== "admin@acme.test" || input.password !== "demo1234") {
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다.");
    }

    return this.createSession(demoUser, demoOrganization);
  }

  async register(input: RegisterInput): Promise<AuthSession> {
    if (!this.databaseAvailable()) throw new ServiceUnavailableException("계정을 생성하려면 데이터베이스 연결이 필요합니다.");
    const parsed = this.parseRegisterInput(input);
    const existingEmail = await this.prisma.user.findUnique({ where: { email: parsed.email } });
    if (existingEmail) throw new ConflictException("이미 등록된 이메일입니다.");
    const user = await this.prisma.user.create({
      data: { id: `user_${crypto.randomUUID().slice(0, 12)}`, email: parsed.email, passwordHash: createPasswordHash(parsed.password), name: parsed.name, role: "CANDIDATE" }
    });
    return this.createSession(this.toUser(user), this.unaffiliatedOrganization());
  }

  async me(token: string | undefined): Promise<AuthSession> {
    if (!token) {
      throw new UnauthorizedException("세션 토큰이 없습니다.");
    }

    const session = this.sessions.get(token);
    if (!session) {
      throw new UnauthorizedException("세션이 만료되었거나 유효하지 않습니다.");
    }

    return session;
  }

  async refreshSession(token: string | undefined): Promise<AuthSession> {
    const session = await this.me(token);
    if (!this.databaseAvailable()) return session;
    const user = await this.prisma.user.findUnique({ where: { id: session.user.id }, include: { organization: true } });
    if (!user) return session;
    const refreshed: AuthSession = { token: session.token, user: this.toUser(user), organization: user.organization ? { id: user.organization.id, name: user.organization.name, joinCode: user.organization.joinCode, createdAt: user.organization.createdAt.toISOString() } : this.unaffiliatedOrganization() };
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
    for (const [token, session] of this.sessions) {
      if (session.user.id === userId) {
        this.sessions.delete(token);
      }
    }
  }

  private async loginWithDatabase(input: LoginInput): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { organization: true }
    });

    if (!user || !this.passwordMatches(input.password, user.passwordHash)) {
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다.");
    }

    if (passwordHashNeedsUpgrade(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: createPasswordHash(input.password) }
      });
    }

    return this.createSession(
      this.toUser(user),
      user.organization ? { id: user.organization.id, name: user.organization.name, joinCode: user.organization.joinCode, createdAt: user.organization.createdAt.toISOString() } : this.unaffiliatedOrganization()
    );
  }

  private createSession(user: User, organization: Organization): AuthSession {
    const token = `session_${crypto.randomUUID()}`;
    const session = { token, user, organization };
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

  private passwordMatches(password: string, storedHash: string) {
    return verifyPassword(password, storedHash) || storedHash === this.hashPassword(password);
  }

  private parseInitialAdminInput(input: CreateInitialAdminInput): CreateInitialAdminInput {
    const organizationName = input.organizationName.trim();
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    if (!organizationName || !name || !email || password.length < 10) {
      throw new BadRequestException("조직명, 이름, 이메일, 10자 이상의 비밀번호가 필요합니다.");
    }
    if (!email.includes("@")) {
      throw new BadRequestException("올바른 관리자 이메일을 입력해주세요.");
    }
    return { organizationName, name, email, password };
  }

  private parseRegisterInput(input: RegisterInput): RegisterInput {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    if (!name || !email || password.length < 10) throw new BadRequestException("이름, 이메일, 10자 이상의 비밀번호를 입력해주세요.");
    if (!email.includes("@")) throw new BadRequestException("올바른 이메일 주소를 입력해주세요.");
    return { name, email, password };
  }

  private demoAuthEnabled() {
    if (process.env.ALLOW_DEMO_AUTH === "1") {
      return true;
    }
    if (process.env.ALLOW_DEMO_AUTH === "0") {
      return false;
    }
    return process.env.NODE_ENV !== "production";
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

      console.error("Auth database operation failed.", error);
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
