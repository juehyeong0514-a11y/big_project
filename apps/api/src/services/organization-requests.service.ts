import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { AuthSession, CreateOrganizationAccessRequestInput, OrganizationAccessRequest, RequestableOrganizationRole, ReviewOrganizationAccessRequestInput } from "@dcvp/shared";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class OrganizationRequestsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createRequest(session: AuthSession, input: CreateOrganizationAccessRequestInput): Promise<OrganizationAccessRequest> {
    if (!this.databaseAvailable()) throw new ServiceUnavailableException("조직 요청을 제출하려면 데이터베이스 연결이 필요합니다.");
    const parsed = this.parseCreateInput(input);
    const organization = await this.prisma.organization.findUnique({ where: { joinCode: parsed.joinCode } });
    if (!organization) throw new NotFoundException("조직 코드를 찾을 수 없습니다.");
    this.assertRequestAllowed(session, organization.id, parsed.requestedRole);

    const pending = await this.prisma.organizationAccessRequest.findFirst({ where: { userId: session.user.id, status: "PENDING" } });
    if (pending) throw new ConflictException("처리 대기 중인 조직 요청이 이미 있습니다.");

    const request = await this.prisma.organizationAccessRequest.create({
      data: {
        id: `org_request_${crypto.randomUUID().slice(0, 12)}`,
        userId: session.user.id,
        organizationId: organization.id,
        requestedRole: parsed.requestedRole,
        reason: parsed.reason
      },
      include: { user: true, organization: true }
    });
    return this.toRequest(request);
  }

  async listRequests(session: AuthSession): Promise<OrganizationAccessRequest[]> {
    this.assertCanReview(session);
    if (!this.databaseAvailable()) return [];
    const requests = await this.prisma.organizationAccessRequest.findMany({
      where: session.user.role === "ADMIN" ? {} : { organizationId: this.organizationId(session) },
      include: { user: true, organization: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }]
    });
    return requests.map((request) => this.toRequest(request));
  }

  async reviewRequest(session: AuthSession, requestId: string, input: ReviewOrganizationAccessRequestInput): Promise<OrganizationAccessRequest> {
    this.assertCanReview(session);
    if (!this.databaseAvailable()) throw new ServiceUnavailableException("조직 요청을 처리하려면 데이터베이스 연결이 필요합니다.");
    const action = this.parseReviewInput(input);
    const request = await this.prisma.organizationAccessRequest.findUnique({ where: { id: requestId }, include: { user: true, organization: true } });
    if (!request) throw new NotFoundException("조직 요청을 찾을 수 없습니다.");
    if (session.user.role !== "ADMIN" && request.organizationId !== this.organizationId(session)) throw new ForbiddenException("자기 조직의 요청만 처리할 수 있습니다.");
    if (request.status !== "PENDING") throw new ConflictException("이미 처리된 조직 요청입니다.");

    const reviewed = await this.prisma.$transaction(async (tx) => {
      if (action.kind === "APPROVE") {
        await tx.user.update({ where: { id: request.userId }, data: { organizationId: request.organizationId, role: request.requestedRole } });
      }
      return tx.organizationAccessRequest.update({
        where: { id: request.id },
        data: {
          status: action.kind === "APPROVE" ? "APPROVED" : "REJECTED",
          rejectionReason: action.kind === "REJECT" ? action.rejectionReason : null,
          reviewedById: session.user.id,
          reviewedAt: new Date()
        },
        include: { user: true, organization: true }
      });
    });
    return this.toRequest(reviewed);
  }

  private parseCreateInput(input: CreateOrganizationAccessRequestInput): CreateOrganizationAccessRequestInput {
    const joinCode = input.joinCode.trim().toUpperCase();
    const reason = input.reason.trim();
    const requestedRole = input.requestedRole;
    if (!joinCode || !reason) throw new BadRequestException("조직 코드와 신청 사유를 입력해주세요.");
    if (requestedRole !== "CANDIDATE" && requestedRole !== "PROCTOR" && requestedRole !== "ORGANIZATION") throw new BadRequestException("요청 권한이 올바르지 않습니다.");
    return { joinCode, requestedRole, reason };
  }

  private parseReviewInput(input: ReviewOrganizationAccessRequestInput): { readonly kind: "APPROVE" } | { readonly kind: "REJECT"; readonly rejectionReason: string } {
    if (input.action === "APPROVE") return { kind: "APPROVE" };
    if (input.action === "REJECT") return { kind: "REJECT", rejectionReason: input.rejectionReason?.trim() || "조직 접근 요청이 거절되었습니다." };
    throw new BadRequestException("처리 방식이 올바르지 않습니다.");
  }

  private assertRequestAllowed(session: AuthSession, organizationId: string, requestedRole: RequestableOrganizationRole) {
    if (!session.user.organizationId) {
      if (requestedRole !== "CANDIDATE") throw new ForbiddenException("소속이 없는 사용자는 일반 회원 권한만 신청할 수 있습니다.");
      return;
    }
    if (session.user.organizationId !== organizationId) throw new ForbiddenException("다른 조직에는 권한을 신청할 수 없습니다.");
    if (requestedRole === "CANDIDATE") throw new BadRequestException("이미 이 조직에 소속되어 있습니다.");
    if (session.user.role === "PROCTOR" && requestedRole === "ORGANIZATION") return;
    if (session.user.role === "CANDIDATE" && (requestedRole === "PROCTOR" || requestedRole === "ORGANIZATION")) return;
    throw new ConflictException("현재 권한에는 이 요청이 필요하지 않습니다.");
  }

  private assertCanReview(session: AuthSession) {
    if (session.user.role !== "ADMIN" && session.user.role !== "ORGANIZATION") throw new ForbiddenException("조직 요청은 조직 관리자만 처리할 수 있습니다.");
  }

  private organizationId(session: AuthSession): string {
    if (!session.user.organizationId) throw new ForbiddenException("조직 소속이 필요합니다.");
    return session.user.organizationId;
  }

  private toRequest(request: {
    readonly id: string; readonly user: { readonly id: string; readonly name: string; readonly email: string }; readonly organization: { readonly id: string; readonly name: string; readonly joinCode: string; readonly createdAt: Date }; readonly requestedRole: string; readonly reason: string; readonly status: "PENDING" | "APPROVED" | "REJECTED"; readonly rejectionReason: string | null; readonly reviewedById: string | null; readonly createdAt: Date; readonly reviewedAt: Date | null;
  }): OrganizationAccessRequest {
    return { id: request.id, user: { id: request.user.id, name: request.user.name, email: request.user.email }, organization: { id: request.organization.id, name: request.organization.name, joinCode: request.organization.joinCode, createdAt: request.organization.createdAt.toISOString() }, requestedRole: this.requestableRole(request.requestedRole), reason: request.reason, status: request.status, rejectionReason: request.rejectionReason ?? undefined, reviewedById: request.reviewedById ?? undefined, createdAt: request.createdAt.toISOString(), reviewedAt: request.reviewedAt?.toISOString() };
  }

  private requestableRole(role: string): RequestableOrganizationRole {
    if (role === "CANDIDATE" || role === "PROCTOR" || role === "ORGANIZATION") return role;
    throw new BadRequestException("저장된 요청 권한이 올바르지 않습니다.");
  }

  private databaseAvailable() { return process.env.DISABLE_DATABASE !== "1" && Boolean(process.env.DATABASE_URL); }
}
