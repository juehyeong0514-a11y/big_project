import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AcceptOrganizationInvitationInput, AuthSession, CreateOrganizationInvitationInput, InvitableOrganizationRole, OrganizationInvitation } from "@dcvp/shared";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class OrganizationInvitationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createInvitation(session: AuthSession, input: CreateOrganizationInvitationInput): Promise<OrganizationInvitation> {
    const organizationId = await this.managedOrganizationId(session);
    const parsed = this.parseCreateInput(input);
    const invitedUser = await this.prisma.user.findUnique({ where: { email: parsed.email } });
    if (!invitedUser) throw new NotFoundException("가입된 계정 이메일을 찾을 수 없습니다.");
    if (invitedUser.organizationId) throw new ConflictException("이미 조직에 소속된 계정입니다.");
    const pending = await this.prisma.organizationInvitation.findFirst({ where: { organizationId, invitedUserId: invitedUser.id, status: "PENDING" } });
    if (pending) throw new ConflictException("이 계정에는 이미 대기 중인 초대가 있습니다.");
    const invitation = await this.prisma.organizationInvitation.create({
      data: { id: `org_invite_${crypto.randomUUID().slice(0, 12)}`, token: crypto.randomUUID(), organizationId, invitedUserId: invitedUser.id, requestedRole: parsed.requestedRole, invitedById: session.user.id },
      include: { organization: true }
    });
    return this.toInvitation(invitation, invitedUser.email);
  }

  async listInvitations(session: AuthSession): Promise<OrganizationInvitation[]> {
    const organizationId = await this.managedOrganizationId(session);
    const invitations = await this.prisma.organizationInvitation.findMany({ where: { organizationId }, include: { organization: true }, orderBy: { createdAt: "desc" } });
    const result: OrganizationInvitation[] = [];
    for (const invitation of invitations) {
      const invitedUser = await this.prisma.user.findUnique({ where: { id: invitation.invitedUserId } });
      if (invitedUser) result.push(this.toInvitation(invitation, invitedUser.email));
    }
    return result;
  }

  async listReceivedInvitations(session: AuthSession): Promise<OrganizationInvitation[]> {
    const invitations = await this.prisma.organizationInvitation.findMany({ where: { invitedUserId: session.user.id, status: "PENDING" }, include: { organization: true }, orderBy: { createdAt: "desc" } });
    return invitations.map((invitation) => this.toInvitation(invitation, session.user.email));
  }

  async acceptInvitation(session: AuthSession, input: AcceptOrganizationInvitationInput): Promise<OrganizationInvitation> {
    const invitation = await this.prisma.organizationInvitation.findUnique({ where: { id: input.invitationId }, include: { organization: true } });
    if (!invitation) throw new NotFoundException("조직 초대를 찾을 수 없습니다.");
    if (invitation.invitedUserId !== session.user.id) throw new ForbiddenException("본인에게 온 초대만 수락할 수 있습니다.");
    if (invitation.status !== "PENDING") throw new ConflictException("이미 처리된 조직 초대입니다.");
    const accepted = await this.prisma.$transaction(async (tx) => {
      const userUpdate = await tx.user.updateMany({
        where: { id: session.user.id, organizationId: null },
        data: { organizationId: invitation.organizationId, role: invitation.requestedRole }
      });
      if (userUpdate.count !== 1) throw new ConflictException("이미 다른 조직에 소속된 계정입니다.");

      const invitationUpdate = await tx.organizationInvitation.updateMany({
        where: { id: invitation.id, invitedUserId: session.user.id, status: "PENDING" },
        data: { status: "ACCEPTED", acceptedAt: new Date() }
      });
      if (invitationUpdate.count !== 1) throw new ConflictException("이미 처리된 조직 초대입니다.");

      const updatedInvitation = await tx.organizationInvitation.findUnique({ where: { id: invitation.id }, include: { organization: true } });
      if (!updatedInvitation) throw new NotFoundException("조직 초대를 찾을 수 없습니다.");
      return updatedInvitation;
    });
    return this.toInvitation(accepted, session.user.email);
  }

  private async managedOrganizationId(session: AuthSession): Promise<string> {
    const manager = await this.prisma.user.findUnique({ where: { id: session.user.id } });
    if (!manager || manager.role !== "ORGANIZATION" || !manager.organizationId) throw new ForbiddenException("조직 관리자만 구성원을 초대할 수 있습니다.");
    return manager.organizationId;
  }

  private parseCreateInput(input: CreateOrganizationInvitationInput): CreateOrganizationInvitationInput {
    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) throw new BadRequestException("가입된 계정 이메일을 입력하세요.");
    if (input.requestedRole !== "ORGANIZATION" && input.requestedRole !== "PROCTOR") throw new BadRequestException("조직 관리자 또는 감독관만 초대할 수 있습니다.");
    return { email, requestedRole: input.requestedRole };
  }

  private toInvitation(invitation: { readonly id: string; readonly token: string; readonly organization: { readonly id: string; readonly name: string; readonly joinCode: string; readonly createdAt: Date }; readonly requestedRole: string; readonly status: "PENDING" | "ACCEPTED" | "CANCELLED"; readonly createdAt: Date; readonly acceptedAt: Date | null }, email: string): OrganizationInvitation {
    return { id: invitation.id, token: invitation.token, organization: { id: invitation.organization.id, name: invitation.organization.name, joinCode: invitation.organization.joinCode, createdAt: invitation.organization.createdAt.toISOString() }, email, requestedRole: this.invitableRole(invitation.requestedRole), status: invitation.status, createdAt: invitation.createdAt.toISOString(), acceptedAt: invitation.acceptedAt?.toISOString(), message: "초대 상대 계정에 조직 초대 알림을 등록했습니다." };
  }

  private invitableRole(role: string): InvitableOrganizationRole {
    if (role === "ORGANIZATION" || role === "PROCTOR") return role;
    throw new BadRequestException("초대 권한이 올바르지 않습니다.");
  }
}
