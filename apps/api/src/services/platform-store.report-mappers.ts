import type { Prisma } from "@prisma/client";
import type { CompetencyReport, EnvironmentCheck, IdentityVerification, InviteEmailLog, KycProviderDecision, ProctorAction, ProctorDevice, ProctorEvent } from "@dcvp/shared";
import { normalizeEnvironmentResults } from "./platform-store.helpers.js";

function normalizeKycProviderDecision(decision: string): KycProviderDecision {
  switch (decision) {
    case "VERIFIED":
      return "VERIFIED";
    case "REJECTED":
      return "REJECTED";
    case "REVIEW_REQUIRED":
      return "REVIEW_REQUIRED";
    default:
      return "REVIEW_REQUIRED";
  }
}

export function mapProctorEvent(event: {
    id: string;
    candidateId: string;
    examId: string;
    type: ProctorEvent["type"];
    detail: string | null;
    createdAt: Date;
  }): ProctorEvent {
    return {
      id: event.id,
      candidateId: event.candidateId,
      examId: event.examId,
      type: event.type,
      detail: event.detail ?? undefined,
      createdAt: event.createdAt.toISOString()
    };
  }

export function mapProctorDevice(device: {
    id: string;
    candidateId: string;
    examId: string;
    role: ProctorDevice["role"];
    status: ProctorDevice["status"];
    connectedAt: Date | null;
    disconnectedAt: Date | null;
    lastHeartbeatAt: Date | null;
    detail: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ProctorDevice {
    return {
      id: device.id,
      candidateId: device.candidateId,
      examId: device.examId,
      role: device.role,
      status: device.status,
      connectedAt: device.connectedAt?.toISOString(),
      disconnectedAt: device.disconnectedAt?.toISOString(),
      lastHeartbeatAt: device.lastHeartbeatAt?.toISOString(),
      detail: device.detail ?? undefined,
      createdAt: device.createdAt.toISOString(),
      updatedAt: device.updatedAt.toISOString()
    };
  }

export function mapProctorAction(action: {
    id: string;
    candidateId: string;
    examId: string;
    type: ProctorAction["type"];
    message: string;
    createdAt: Date;
  }): ProctorAction {
    return {
      id: action.id,
      candidateId: action.candidateId,
      examId: action.examId,
      type: action.type,
      message: action.message,
      createdAt: action.createdAt.toISOString()
    };
  }

export function mapIdentityVerification(verification: {
    id: string;
    candidateId: string;
    examId: string;
    documentImageName: string;
    documentCaptureConfirmed?: boolean;
    faceImageCaptured: boolean;
    provider: string;
    providerDecision: string;
    providerReferenceId: string;
    failureReason: string | null;
    similarityScore: number;
    documentAuthenticityScore: number;
    faceMatchScore: number;
    livenessScore: number;
    ocrNameMatched: boolean;
    verificationChecks: string[];
    privacyConsentVersion: string | null;
    privacyConsentAcceptedAt: Date | null;
    status: IdentityVerification["status"];
    verifiedAt: Date | null;
    createdAt: Date;
  }): IdentityVerification {
    return {
      id: verification.id,
      candidateId: verification.candidateId,
      examId: verification.examId,
      documentCaptureConfirmed: verification.documentCaptureConfirmed ?? verification.documentImageName === "document-capture-confirmed",
      documentImageName: verification.documentImageName,
      faceImageCaptured: verification.faceImageCaptured,
      provider: verification.provider,
      providerDecision: normalizeKycProviderDecision(verification.providerDecision),
      providerReferenceId: verification.providerReferenceId,
      failureReason: verification.failureReason ?? undefined,
      similarityScore: verification.similarityScore,
      documentAuthenticityScore: verification.documentAuthenticityScore,
      faceMatchScore: verification.faceMatchScore,
      livenessScore: verification.livenessScore,
      ocrNameMatched: verification.ocrNameMatched,
      verificationChecks: verification.verificationChecks,
      privacyConsentVersion: verification.privacyConsentVersion ?? undefined,
      privacyConsentAcceptedAt: verification.privacyConsentAcceptedAt?.toISOString(),
      status: verification.status,
      verifiedAt: verification.verifiedAt?.toISOString(),
      createdAt: verification.createdAt.toISOString()
    };
  }

export function mapEnvironmentCheck(check: {
    id: string;
    candidateId: string;
    examId: string;
    results: Prisma.JsonValue;
    requiredPassed: boolean;
    createdAt: Date;
  }): EnvironmentCheck {
    return {
      id: check.id,
      candidateId: check.candidateId,
      examId: check.examId,
      results: normalizeEnvironmentResults(Array.isArray(check.results) ? check.results : []),
      requiredPassed: check.requiredPassed,
      createdAt: check.createdAt.toISOString()
    };
  }

export function mapInviteEmailLog(log: {
    id: string;
    candidateId: string;
    examId: string;
    email: string;
    inviteUrl: string;
    provider: string;
    providerMessageId: string | null;
    status: InviteEmailLog["status"];
    message: string;
    sentAt: Date | null;
    createdAt: Date;
  }): InviteEmailLog {
    return {
      id: log.id,
      candidateId: log.candidateId,
      examId: log.examId,
      email: log.email,
      inviteUrl: log.inviteUrl,
      provider: log.provider,
      ...(log.providerMessageId ? { providerMessageId: log.providerMessageId } : {}),
      status: log.status,
      message: log.message,
      sentAt: log.sentAt?.toISOString(),
      createdAt: log.createdAt.toISOString()
    };
  }

export function mapCompetencyReport(report: {
    id: string;
    examSessionId: string;
    candidateId: string;
    examId: string;
    problemSolvingScore: number;
    implementationScore: number;
    debuggingScore: number;
    codeQualityScore: number;
    timeManagementScore: number;
    integrityScore: number;
    overallScore: number;
    aiSummary: string;
    strengths: string[];
    improvementAreas: string[];
    recommendations: string[];
    createdAt: Date;
  }): CompetencyReport {
    return {
      id: report.id,
      examSessionId: report.examSessionId,
      candidateId: report.candidateId,
      examId: report.examId,
      problemSolvingScore: report.problemSolvingScore,
      implementationScore: report.implementationScore,
      debuggingScore: report.debuggingScore,
      codeQualityScore: report.codeQualityScore,
      timeManagementScore: report.timeManagementScore,
      integrityScore: report.integrityScore,
      overallScore: report.overallScore,
      aiSummary: report.aiSummary,
      strengths: report.strengths,
      improvementAreas: report.improvementAreas,
      recommendations: report.recommendations,
      createdAt: report.createdAt.toISOString()
    };
  }
