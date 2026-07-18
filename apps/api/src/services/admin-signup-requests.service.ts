import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { AdminSignupRequest, AuthSession, CreateAdminSignupRequestInput, CreateOrganizationSignupRequestInput, ReviewAdminSignupRequestInput, User } from "@dcvp/shared";
import { PrismaService } from "./prisma.service.js";
import { createPasswordHash, isStrongPassword, passwordPolicyMessage } from "./password-hash.js";

@Injectable()
export class AdminSignupRequestsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createRequest(input: CreateAdminSignupRequestInput): Promise<AdminSignupRequest> {
    if (!this.databaseAvailable()) {
      throw new ServiceUnavailableException("DB 연결이 필요합니다. 운영자 승인 신청은 저장 가능한 DB가 있어야 사용할 수 있습니다.");
    }

    const parsed = this.parseSignupRequestInput(input);
    const existingUser = await this.runDatabase(() => this.prisma.user.findUnique({ where: { email: parsed.email } }));
    const existingPendingRequest = await this.runDatabase(() =>
      this.prisma.adminSignupRequest.findFirst({
        where: { email: parsed.email, status: "PENDING" }
      })
    );
    if (existingUser === undefined || existingPendingRequest === undefined) {
      throw new ServiceUnavailableException("DB 연결이 필요합니다. 운영자 승인 신청을 저장할 수 없습니다.");
    }
    if (existingUser || existingPendingRequest) {
      throw new ConflictException("이미 등록되었거나 승인 대기 중인 이메일입니다.");
    }

    const passwordHash = await createPasswordHash(parsed.password);
    const request = await this.runDatabase(() =>
      this.prisma.adminSignupRequest.create({
        data: {
          id: `signup_${crypto.randomUUID().slice(0, 12)}`,
          organizationName: parsed.organizationName,
          name: parsed.name,
          email: parsed.email,
          passwordHash,
          reason: parsed.reason,
          requestedRole: "ORGANIZATION"
        }
      })
    );
    if (!request) {
      throw new ServiceUnavailableException("DB 연결이 필요합니다. 운영자 승인 신청을 저장할 수 없습니다.");
    }

    return this.toSignupRequest(request);
  }

  async createRequestForRegisteredUser(session: AuthSession, input: CreateOrganizationSignupRequestInput): Promise<AdminSignupRequest> {
    if (!this.databaseAvailable()) throw new ServiceUnavailableException("조직 생성 신청을 저장하려면 데이터베이스 연결이 필요합니다.");
    if (session.user.role === "ADMIN" || session.user.organizationId) throw new ForbiddenException("소속 없는 일반 계정만 새 조직을 신청할 수 있습니다.");
    const organizationName = input.organizationName.trim();
    const reason = input.reason.trim();
    if (!organizationName || !reason) throw new BadRequestException("조직명과 신청 사유를 입력해 주세요.");
    const pending = await this.runDatabase(() => this.prisma.adminSignupRequest.findFirst({ where: { email: session.user.email, status: "PENDING" } }));
    if (pending === undefined) throw new ServiceUnavailableException("조직 생성 신청을 저장할 수 없습니다.");
    if (pending) throw new ConflictException("처리 대기 중인 조직 생성 신청이 이미 있습니다.");
    const request = await this.runDatabase(() => this.prisma.adminSignupRequest.create({
      data: {
        id: `signup_${crypto.randomUUID().slice(0, 12)}`,
        organizationName,
        name: session.user.name,
        email: session.user.email,
        passwordHash: "",
        reason,
        requestedRole: "ORGANIZATION"
      }
    }));
    if (!request) throw new ServiceUnavailableException("조직 생성 신청을 저장할 수 없습니다.");
    return this.toSignupRequest(request);
  }

  async listRequests(session: AuthSession): Promise<AdminSignupRequest[]> {
    this.assertOperator(session);
    if (!this.databaseAvailable()) {
      return [];
    }

    const requests = await this.runDatabase(() =>
      this.prisma.adminSignupRequest.findMany({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }]
      })
    );
    return requests?.map((request) => this.toSignupRequest(request)) ?? [];
  }

  async reviewRequest(session: AuthSession, requestId: string, input: ReviewAdminSignupRequestInput): Promise<AdminSignupRequest> {
    this.assertOperator(session);
    const action = this.parseReviewAction(input);
    if (!this.databaseAvailable()) {
      throw new ServiceUnavailableException("DB 연결이 필요합니다. 관리자 가입 신청을 승인할 수 없습니다.");
    }

    const request = await this.runDatabase(() => this.prisma.adminSignupRequest.findUnique({ where: { id: requestId } }));
    if (request === undefined) {
      throw new ServiceUnavailableException("DB 연결이 필요합니다. 관리자 가입 신청을 승인할 수 없습니다.");
    }
    if (!request) {
      throw new NotFoundException("가입 신청을 찾을 수 없습니다.");
    }
    if (request.status !== "PENDING") {
      throw new ConflictException("이미 처리된 가입 신청입니다.");
    }

    if (action.kind === "REJECT") {
      const rejected = await this.runDatabase(() =>
        this.prisma.adminSignupRequest.update({
          where: { id: request.id },
          data: {
            status: "REJECTED",
            rejectionReason: action.rejectionReason,
            reviewedById: session.user.id,
            reviewedAt: new Date()
          }
        })
      );
      if (!rejected) {
        throw new ServiceUnavailableException("가입 신청 거절 상태를 저장할 수 없습니다.");
      }
      return this.toSignupRequest(rejected);
    }

    const existingUser = await this.runDatabase(() => this.prisma.user.findUnique({ where: { email: request.email } }));
    if (existingUser === undefined) {
      throw new ServiceUnavailableException("DB 연결이 필요합니다. 관리자 계정을 생성할 수 없습니다.");
    }
    if (!request.passwordHash && !existingUser) {
      throw new NotFoundException("조직 생성 신청자의 계정을 찾을 수 없습니다.");
    }
    if (existingUser && request.passwordHash) {
      throw new ConflictException("이미 같은 이메일의 사용자가 있습니다.");
    }

    const approved = await this.runDatabase(async () =>
      this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            id: `org_${crypto.randomUUID().slice(0, 12)}`,
            name: request.organizationName,
            joinCode: `ORG-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`
          }
        });
        const user = existingUser
          ? await tx.user.update({ where: { id: existingUser.id }, data: { role: "ORGANIZATION", organizationId: organization.id } })
          : await tx.user.create({
            data: {
              id: `user_${crypto.randomUUID().slice(0, 12)}`,
              email: request.email,
              passwordHash: request.passwordHash,
              name: request.name,
              role: "ORGANIZATION",
              organizationId: organization.id
            }
          });
        return tx.adminSignupRequest.update({
          where: { id: request.id },
          data: {
            status: "APPROVED",
            reviewedById: session.user.id,
            approvedUserId: user.id,
            reviewedAt: new Date()
          }
        });
      })
    );
    if (!approved) {
      throw new ServiceUnavailableException("관리자 계정을 생성할 수 없습니다.");
    }

    return this.toSignupRequest(approved);
  }

  private parseSignupRequestInput(input: CreateAdminSignupRequestInput): CreateAdminSignupRequestInput {
    const organizationName = input.organizationName.trim();
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    const reason = input.reason.trim();
    if (!organizationName || !name || !email || !reason || !isStrongPassword(password)) {
      throw new BadRequestException(`조직명, 이름, 이메일, 신청 사유와 ${passwordPolicyMessage}`);
    }
    if (!email.includes("@")) {
      throw new BadRequestException("올바른 이메일을 입력해주세요.");
    }
    return { organizationName, name, email, password, reason };
  }

  private parseReviewAction(input: ReviewAdminSignupRequestInput): { readonly kind: "APPROVE" } | { readonly kind: "REJECT"; readonly rejectionReason: string } {
    if (input.action === "APPROVE") {
      return { kind: "APPROVE" };
    }
    if (input.action === "REJECT") {
      const rejectionReason = input.rejectionReason?.trim() || "운영자가 가입 신청을 거절했습니다.";
      return { kind: "REJECT", rejectionReason };
    }
    throw new BadRequestException("승인 또는 거절만 처리할 수 있습니다.");
  }

  private assertOperator(session: AuthSession) {
    if (session.user.role !== "ADMIN") {
      throw new ForbiddenException("운영자만 관리자 가입 신청을 처리할 수 있습니다.");
    }
  }

  private toSignupRequest(request: {
    readonly id: string;
    readonly organizationName: string;
    readonly name: string;
    readonly email: string;
    readonly requestedRole: User["role"];
    readonly status: AdminSignupRequest["status"];
    readonly rejectionReason: string | null;
    readonly reviewedById: string | null;
    readonly approvedUserId: string | null;
    readonly createdAt: Date;
    readonly reviewedAt: Date | null;
  }): AdminSignupRequest {
    return {
      id: request.id,
      organizationName: request.organizationName,
      name: request.name,
      email: request.email,
      requestedRole: "ORGANIZATION",
      status: request.status,
      rejectionReason: request.rejectionReason ?? undefined,
      reviewedById: request.reviewedById ?? undefined,
      approvedUserId: request.approvedUserId ?? undefined,
      createdAt: request.createdAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString()
    };
  }

  private databaseAvailable() {
    return process.env.DISABLE_DATABASE !== "1" && Boolean(process.env.DATABASE_URL);
  }

  private async runDatabase<T>(operation: () => Promise<T>): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error) {
        return undefined;
      }
      throw error;
    }
  }
}
