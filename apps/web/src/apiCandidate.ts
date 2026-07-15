import type {
  CandidateInvite,
  CandidateWorkspace,
  CodeDraft,
  CodeExecution,
  CodeRunInput,
  CodeSubmitInput,
  CreateEnvironmentCheckInput,
  CreateIdentityVerificationInput,
  CreateProctorEventInput,
  EnvironmentCheck,
  EnvironmentCheckSession,
  IdentityProviderSession,
  IdentityVerification,
  ProctorDevice,
  ProctorEvent,
  SaveCodeDraftInput,
  UpsertProctorDeviceInput
} from "@dcvp/shared";
import { request } from "./apiCore";

export const candidateApi = {
  candidateInvite: (inviteToken: string) => request<CandidateInvite>(`/api/exams/invites/${inviteToken}`),
  markCandidateReady: (inviteToken: string) =>
    request<CandidateInvite>(`/api/exams/invites/${inviteToken}/ready`, {
      method: "POST"
    }),
  createEnvironmentCheckSession: (inviteToken: string) =>
    request<EnvironmentCheckSession>(`/api/exams/invites/${inviteToken}/environment-check-session`, {
      method: "POST"
    }),
  saveEnvironmentCheck: (inviteToken: string, input: CreateEnvironmentCheckInput) =>
    request<EnvironmentCheck>(`/api/exams/invites/${inviteToken}/environment-checks`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  candidateWorkspace: (inviteToken: string) => request<CandidateWorkspace>(`/api/exams/invites/${inviteToken}/workspace`),
  runCandidateCode: (inviteToken: string, input: CodeRunInput) =>
    request<CodeExecution>(`/api/exams/invites/${inviteToken}/run`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  saveCandidateCodeDraft: (inviteToken: string, input: SaveCodeDraftInput) =>
    request<CodeDraft>(`/api/exams/invites/${inviteToken}/drafts`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  submitCandidateCode: (inviteToken: string, input: CodeSubmitInput) =>
    request<CandidateWorkspace["submissions"][number]>(`/api/exams/invites/${inviteToken}/submit`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  logProctorEvent: (inviteToken: string, input: CreateProctorEventInput) =>
    request<ProctorEvent>(`/api/exams/invites/${inviteToken}/proctor-events`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  upsertProctorDevice: (inviteToken: string, input: UpsertProctorDeviceInput) =>
    request<ProctorDevice>(`/api/exams/invites/${inviteToken}/proctor-devices`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  verifyCandidateIdentity: (inviteToken: string, input: CreateIdentityVerificationInput) =>
    request<IdentityVerification>(`/api/exams/invites/${inviteToken}/identity-verifications`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  createIdentityProviderSession: (inviteToken: string) =>
    request<IdentityProviderSession>(`/api/exams/invites/${inviteToken}/identity-session`, {
      method: "POST"
    })
};
