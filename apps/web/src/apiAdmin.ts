import type {
  Candidate,
  AdminSignupRequest,
  AdminOrganizationOption,
  AcceptOrganizationInvitationInput,
  CreateOrganizationAccessRequestInput,
  CreateOrganizationInvitationInput,
  CreateOrganizationSignupRequestInput,
  CreateCandidateInput,
  CreateExamInput,
  CreateProctorActionInput,
  CreateQuestionInput,
  CreateTestCaseInput,
  DashboardSummary,
  Exam,
  ExamDetail,
  ExamReport,
  InviteEmailResult,
  LiveProctorExamState,
  MobileAccessInfo,
  OperationsReadiness,
  PendingApprovalCount,
  ProctorAction,
  Question,
  ReviewAdminSignupRequestInput,
  ReviewOrganizationAccessRequestInput,
  OrganizationAccessRequest,
  OrganizationInvitation,
  TestCase,
  UpdateExamInput,
  UpdateAdminUserInput,
  User
} from "@dcvp/shared";
import { request } from "./apiCore";

export const adminApi = {
  dashboard: () => request<DashboardSummary>("/api/dashboard"),
  operationsReadiness: () => request<OperationsReadiness>("/api/operations/readiness"),
  mobileAccess: () => request<MobileAccessInfo>("/api/mobile-access"),
  adminUsers: () => request<User[]>("/api/admin/users"),
  adminOrganizations: () => request<AdminOrganizationOption[]>("/api/admin/users/organizations"),
  pendingApprovalCount: () => request<PendingApprovalCount>("/api/admin/users/pending-approval-count"),
  updateAdminUser: (userId: string, input: UpdateAdminUserInput) =>
    request<User>(`/api/admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(input)
    }),
  deleteAdminUser: (userId: string) =>
    request<{ readonly id: string }>(`/api/admin/users/${userId}`, {
      method: "DELETE"
    }),
  adminSignupRequests: () => request<AdminSignupRequest[]>("/api/admin/users/signup-requests"),
  reviewAdminSignupRequest: (requestId: string, input: ReviewAdminSignupRequestInput) =>
    request<AdminSignupRequest>(`/api/admin/users/signup-requests/${requestId}/review`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  createOrganizationAccessRequest: (input: CreateOrganizationAccessRequestInput) =>
    request<OrganizationAccessRequest>("/api/admin/users/organization-requests", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  createOrganizationSignupRequest: (input: CreateOrganizationSignupRequestInput) =>
    request<AdminSignupRequest>("/api/admin/users/organization-creation-requests", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  createOrganizationInvitation: (input: CreateOrganizationInvitationInput) =>
    request<OrganizationInvitation>("/api/admin/users/organization-invitations", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  organizationInvitations: () => request<OrganizationInvitation[]>("/api/admin/users/organization-invitations"),
  receivedOrganizationInvitations: () => request<OrganizationInvitation[]>("/api/admin/users/received-organization-invitations"),
  acceptOrganizationInvitation: (input: AcceptOrganizationInvitationInput) =>
    request<OrganizationInvitation>("/api/admin/users/received-organization-invitations/accept", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  organizationAccessRequests: () => request<OrganizationAccessRequest[]>("/api/admin/users/organization-requests"),
  reviewOrganizationAccessRequest: (requestId: string, input: ReviewOrganizationAccessRequestInput) =>
    request<OrganizationAccessRequest>(`/api/admin/users/organization-requests/${requestId}/review`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  exams: () => request<Exam[]>("/api/exams"),
  createExam: (input: CreateExamInput) =>
    request<Exam>("/api/exams", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updateExam: (examId: string, input: UpdateExamInput) =>
    request<Exam>(`/api/exams/${examId}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  examDetail: (examId: string) => request<ExamDetail>(`/api/exams/${examId}`),
  deleteExam: (examId: string) =>
    request<Exam>(`/api/exams/${examId}`, {
      method: "DELETE"
    }),
  examReport: (examId: string) => request<ExamReport>(`/api/exams/${examId}/report`),
  proctorLive: (examId: string) => request<LiveProctorExamState>(`/api/exams/${examId}/proctor-live`),
  addQuestion: (examId: string, input: CreateQuestionInput) =>
    request<Question>(`/api/exams/${examId}/questions`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  addTestCase: (questionId: string, input: CreateTestCaseInput) =>
    request<TestCase>(`/api/exams/questions/${questionId}/test-cases`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  addCandidate: (examId: string, input: CreateCandidateInput) =>
    request<Candidate>(`/api/exams/${examId}/candidates`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  sendCandidateInviteEmail: (candidateId: string) =>
    request<InviteEmailResult>(`/api/exams/candidates/${candidateId}/invite-email`, {
      method: "POST"
    }),
  createProctorAction: (candidateId: string, input: CreateProctorActionInput) =>
    request<ProctorAction>(`/api/exams/candidates/${candidateId}/proctor-actions`, {
      method: "POST",
      body: JSON.stringify(input)
    })
};
