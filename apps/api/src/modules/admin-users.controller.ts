import { Body, Controller, Delete, Get, Headers, Inject, Param, Post, Put } from "@nestjs/common";
import type { AcceptOrganizationInvitationInput, CreateOrganizationAccessRequestInput, CreateOrganizationInvitationInput, CreateOrganizationSignupRequestInput, ReviewAdminSignupRequestInput, ReviewOrganizationAccessRequestInput, UpdateAdminUserInput } from "@dcvp/shared";
import { AdminUsersService } from "../services/admin-users.service.js";
import { AuthService } from "../services/auth.service.js";
import { AdminSignupRequestsService } from "../services/admin-signup-requests.service.js";
import { OrganizationRequestsService } from "../services/organization-requests.service.js";
import { OrganizationInvitationsService } from "../services/organization-invitations.service.js";

@Controller("/api/admin/users")
export class AdminUsersController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AdminUsersService) private readonly adminUsers: AdminUsersService,
    @Inject(AdminSignupRequestsService) private readonly signupRequests: AdminSignupRequestsService,
    @Inject(OrganizationRequestsService) private readonly organizationRequests: OrganizationRequestsService,
    @Inject(OrganizationInvitationsService) private readonly organizationInvitations: OrganizationInvitationsService
  ) {}

  @Get()
  async list(@Headers("authorization") authorization?: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.adminUsers.listOrganizationUsers(session);
  }

  @Get("/organizations")
  async organizations(@Headers("authorization") authorization?: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.adminUsers.listManagedOrganizations(session);
  }

  @Get("/pending-approval-count")
  async pendingApprovalCount(@Headers("authorization") authorization?: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.adminUsers.getPendingApprovalCount(session);
  }

  @Put("/:userId")
  async update(@Headers("authorization") authorization: string | undefined, @Param("userId") userId: string, @Body() body: UpdateAdminUserInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    const user = await this.adminUsers.updateManagedUser(session, userId, body);
    this.auth.revokeUserSessions(userId);
    return user;
  }

  @Delete("/:userId")
  async delete(@Headers("authorization") authorization: string | undefined, @Param("userId") userId: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    const deleted = await this.adminUsers.deleteManagedUser(session, userId);
    this.auth.revokeUserSessions(userId);
    return deleted;
  }

  @Get("/signup-requests")
  async listSignupRequests(@Headers("authorization") authorization?: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.signupRequests.listRequests(session);
  }

  @Post("/signup-requests/:requestId/review")
  async reviewSignupRequest(@Headers("authorization") authorization: string | undefined, @Param("requestId") requestId: string, @Body() body: ReviewAdminSignupRequestInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    const request = await this.signupRequests.reviewRequest(session, requestId, body);
    if (request.status === "APPROVED" && request.approvedUserId) this.auth.revokeUserSessions(request.approvedUserId);
    return request;
  }

  @Post("/organization-requests")
  async createOrganizationRequest(@Headers("authorization") authorization: string | undefined, @Body() body: CreateOrganizationAccessRequestInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.organizationRequests.createRequest(session, body);
  }

  @Post("/organization-creation-requests")
  async createOrganizationCreationRequest(@Headers("authorization") authorization: string | undefined, @Body() body: CreateOrganizationSignupRequestInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.signupRequests.createRequestForRegisteredUser(session, body);
  }

  @Post("/organization-invitations")
  async createOrganizationInvitation(@Headers("authorization") authorization: string | undefined, @Body() body: CreateOrganizationInvitationInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.organizationInvitations.createInvitation(session, body);
  }

  @Get("/organization-invitations")
  async listOrganizationInvitations(@Headers("authorization") authorization?: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.organizationInvitations.listInvitations(session);
  }

  @Get("/received-organization-invitations")
  async listReceivedOrganizationInvitations(@Headers("authorization") authorization?: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.organizationInvitations.listReceivedInvitations(session);
  }

  @Post("/received-organization-invitations/accept")
  async acceptOrganizationInvitation(@Headers("authorization") authorization: string | undefined, @Body() body: AcceptOrganizationInvitationInput) {
    const token = this.extractBearerToken(authorization);
    const session = await this.auth.me(token);
    const invitation = await this.organizationInvitations.acceptInvitation(session, body);
    await this.auth.refreshSession(token);
    return invitation;
  }

  @Get("/organization-requests")
  async listOrganizationRequests(@Headers("authorization") authorization?: string) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    return this.organizationRequests.listRequests(session);
  }

  @Post("/organization-requests/:requestId/review")
  async reviewOrganizationRequest(@Headers("authorization") authorization: string | undefined, @Param("requestId") requestId: string, @Body() body: ReviewOrganizationAccessRequestInput) {
    const session = await this.auth.me(this.extractBearerToken(authorization));
    const request = await this.organizationRequests.reviewRequest(session, requestId, body);
    if (request.status === "APPROVED") this.auth.revokeUserSessions(request.user.id);
    return request;
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) {
      return undefined;
    }

    return authorization.slice("Bearer ".length);
  }
}
