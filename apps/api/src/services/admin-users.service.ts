import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { AdminOrganizationOption, AuthSession, PendingApprovalCount, UpdateAdminUserInput, User, UserRole } from "@dcvp/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class AdminUsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listOrganizationUsers(session: AuthSession): Promise<User[]> {
    if (!this.databaseAvailable()) {
      return [session.user];
    }

    const users = await this.runDatabase(() =>
      this.prisma.user.findMany({
        where: session.user.role === "ADMIN" ? {} : { organizationId: session.organization.id },
        orderBy: { createdAt: "asc" }
      })
    );
    if (!users) {
      return [session.user];
    }

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId ?? undefined,
      createdAt: user.createdAt.toISOString()
    }));
  }

  async listManagedOrganizations(session: AuthSession): Promise<AdminOrganizationOption[]> {
    if (!this.databaseAvailable()) {
      return [{ id: session.organization.id, name: session.organization.name }];
    }

    const organizations = await this.runDatabase(() =>
      this.prisma.organization.findMany({
        where: session.user.role === "ADMIN" ? { users: { some: {} } } : { id: session.organization.id },
        orderBy: { name: "asc" }
      })
    );
    return organizations?.map((organization) => ({ id: organization.id, name: organization.name })) ?? [{ id: session.organization.id, name: session.organization.name }];
  }

  async getPendingApprovalCount(session: AuthSession): Promise<PendingApprovalCount> {
    if (session.user.role !== "ADMIN" && session.user.role !== "ORGANIZATION") {
      throw new ForbiddenException("운영자 또는 조직 관리자만 승인 요청을 확인할 수 있습니다.");
    }
    if (!this.databaseAvailable()) return { count: 0 };

    const count = await this.runDatabase(async () => {
      if (session.user.role === "ADMIN") {
        const [signupRequests, organizationRequests] = await Promise.all([
          this.prisma.adminSignupRequest.count({ where: { status: "PENDING" } }),
          this.prisma.organizationAccessRequest.count({ where: { status: "PENDING" } })
        ]);
        return signupRequests + organizationRequests;
      }

      return this.prisma.organizationAccessRequest.count({
        where: { organizationId: session.organization.id, status: "PENDING" }
      });
    });
    return { count: count ?? 0 };
  }

  async updateManagedUser(session: AuthSession, userId: string, input: UpdateAdminUserInput): Promise<User> {
    if (!this.databaseAvailable()) {
      throw new ServiceUnavailableException("DB 연결이 필요합니다. 계정 정보를 수정할 수 없습니다.");
    }

    const target = await this.runDatabase(() => this.prisma.user.findUnique({ where: { id: userId } }));
    if (target === undefined) {
      throw new ServiceUnavailableException("DB 연결이 필요합니다. 계정 정보를 수정할 수 없습니다.");
    }
    if (!target) {
      throw new BadRequestException("수정할 계정을 찾을 수 없습니다.");
    }

    const parsed = this.parseUpdateUserInput(session, input);
    if (session.user.role !== "ADMIN" && target.organizationId !== session.organization.id) {
      throw new ForbiddenException("자기 조직의 계정만 수정할 수 있습니다.");
    }
    if (target.role === "ADMIN" && session.user.role !== "ADMIN") {
      throw new ForbiddenException("운영자 계정은 조직 관리자가 수정할 수 없습니다.");
    }

    const existing = await this.runDatabase(() => this.prisma.user.findUnique({ where: { email: parsed.email } }));
    if (existing === undefined) {
      throw new ServiceUnavailableException("DB 연결이 필요합니다. 이메일 중복을 확인할 수 없습니다.");
    }
    if (existing && existing.id !== userId) {
      throw new ConflictException("이미 등록된 이메일입니다.");
    }

    const user = await this.runDatabase(() =>
      this.prisma.user.update({
        where: { id: userId },
        data: {
          name: parsed.name,
          email: parsed.email,
          role: parsed.role,
          organizationId: parsed.organizationId
        }
      })
    );
    if (!user) {
      throw new ServiceUnavailableException("계정 정보를 수정할 수 없습니다.");
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId ?? undefined,
      createdAt: user.createdAt.toISOString()
    };
  }

  async deleteManagedUser(session: AuthSession, userId: string): Promise<{ readonly id: string }> {
    if (!this.databaseAvailable()) {
      throw new ServiceUnavailableException("DB 연결이 필요합니다. 계정을 삭제할 수 없습니다.");
    }

    const deleted = await this.runDatabase(() => this.prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: session.user.id } });
      if (!actor || actor.role !== "ADMIN") {
        throw new ForbiddenException("운영자만 계정을 삭제할 수 있습니다.");
      }
      if (actor.id === userId) {
        throw new ForbiddenException("자기 계정은 삭제할 수 없습니다.");
      }

      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) {
        throw new BadRequestException("삭제할 계정을 찾을 수 없습니다.");
      }
      if (target.role === "ADMIN") {
        const administratorCount = await tx.user.count({ where: { role: "ADMIN" } });
        if (administratorCount <= 1) {
          throw new ConflictException("마지막 운영자 계정은 삭제할 수 없습니다.");
        }
      }

      await tx.organizationInvitation.deleteMany({ where: { OR: [{ invitedUserId: userId }, { invitedById: userId }] } });
      return tx.user.delete({ where: { id: userId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    if (deleted === undefined) {
      throw new ServiceUnavailableException("DB 연결이 필요합니다. 계정을 삭제할 수 없습니다.");
    }
    if (!deleted) {
      throw new ServiceUnavailableException("계정을 삭제할 수 없습니다.");
    }
    return { id: deleted.id };
  }

  private parseUpdateUserInput(session: AuthSession, input: UpdateAdminUserInput): Required<UpdateAdminUserInput> {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const role = this.parseEditableRole(session, input.role);
    const organizationId = session.user.role === "ADMIN" ? input.organizationId?.trim() : session.organization.id;
    if (!name || !email || !organizationId) {
      throw new BadRequestException("이름, 이메일, 조직이 필요합니다.");
    }
    if (!email.includes("@")) {
      throw new BadRequestException("올바른 이메일을 입력해주세요.");
    }
    return { name, email, role, organizationId };
  }

  private parseEditableRole(session: AuthSession, role: UserRole): UserRole {
    if (session.user.role === "ADMIN") {
      if (role === "ADMIN" || role === "ORGANIZATION" || role === "PROCTOR") {
        return role;
      }
      throw new BadRequestException("운영자는 운영자, 조직 관리자, 감독관 역할만 지정할 수 있습니다.");
    }

    if (session.user.role === "ORGANIZATION" && (role === "ORGANIZATION" || role === "PROCTOR")) {
      return role;
    }
    throw new ForbiddenException("조직 관리자는 자기 조직의 조직 관리자와 감독관 역할만 지정할 수 있습니다.");
  }

  private databaseAvailable() {
    return process.env.DISABLE_DATABASE !== "1" && Boolean(process.env.DATABASE_URL);
  }

  private async runDatabase<T>(operation: () => Promise<T>): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof Error) {
        return undefined;
      }
      throw error;
    }
  }
}
