import { BadRequestException } from "@nestjs/common";
import { CURRENT_PRIVACY_POLICY_VERSION } from "@dcvp/shared";
import type {
  CandidateInvite,
  CreateEnvironmentCheckInput,
  CreateIdentityVerificationInput,
  EnvironmentCheck,
  IdentityVerification
} from "@dcvp/shared";
import type { IdentityVerificationService } from "./identity-verification.service.js";
import type { PrismaService } from "./prisma.service.js";
import {
  createId,
  didPassRequiredEnvironmentChecks,
  normalizeEnvironmentResults,
  nowIso,
  toEnvironmentCheckJson
} from "./platform-store.helpers.js";
import { mapEnvironmentCheck, mapIdentityVerification } from "./platform-store.mappers.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface IdentityEnvironmentStoreContext {
  readonly prisma: PrismaService;
  readonly identityVerification: IdentityVerificationService;
  readonly runDatabase: DatabaseRunner;
}

export interface SaveCandidateEnvironmentCheckRequest {
  readonly context: IdentityEnvironmentStoreContext;
  readonly invite: CandidateInvite;
  readonly input: CreateEnvironmentCheckInput;
  readonly memoryChecks: readonly EnvironmentCheck[];
}

export interface VerifyCandidateIdentityRequest {
  readonly context: IdentityEnvironmentStoreContext;
  readonly invite: CandidateInvite;
  readonly input: CreateIdentityVerificationInput;
  readonly memoryVerifications: readonly IdentityVerification[];
}

const documentCaptureMarker = "document-capture-confirmed";
const minimumDocumentAuthenticityScore = 85;
const minimumFaceMatchScore = 80;
const minimumLivenessScore = 80;
const requiredIdentityVerificationChecks = ["DOCUMENT_AUTHENTICITY", "FACE_MATCH", "LIVENESS", "OCR_NAME_MATCH"] as const;

function rejectRawIdentityMedia(input: CreateIdentityVerificationInput) {
  if (input.documentImageName) {
    throw new BadRequestException("원본 신분증/얼굴 파일명이나 데이터는 저장하지 않습니다. KYC provider upload reference를 사용하세요.");
  }
}

function didPassIdentityProviderChecks(engineResult: Awaited<ReturnType<IdentityVerificationService["verify"]>>) {
  return (
    engineResult.providerDecision === "VERIFIED" &&
    engineResult.documentAuthenticityScore >= minimumDocumentAuthenticityScore &&
    engineResult.faceMatchScore >= minimumFaceMatchScore &&
    engineResult.livenessScore >= minimumLivenessScore &&
    engineResult.ocrNameMatched &&
    requiredIdentityVerificationChecks.every((check) => engineResult.verificationChecks.includes(check))
  );
}

function identityFailureReason(engineResult: Awaited<ReturnType<IdentityVerificationService["verify"]>>) {
  if (engineResult.providerDecision !== "VERIFIED") {
    return "KYC provider가 본인확인을 승인하지 않았습니다.";
  }

  return "KYC provider 점수 기준을 충족하지 못했습니다.";
}

export async function saveCandidateEnvironmentCheckInStore(request: SaveCandidateEnvironmentCheckRequest) {
  const { context, input, invite, memoryChecks } = request;
  const results = normalizeEnvironmentResults(input.results);
  const browserEvidenceDetail = `secureContext=${input.browserEvidence.secureContext}; checkedAt=${input.browserEvidence.checkedAt}`;
  const resultsWithEvidence = results.map((result) =>
    result.id === "browser" ? { ...result, detail: result.detail ? `${result.detail}; ${browserEvidenceDetail}` : browserEvidenceDetail } : result
  );
  const storedResults = toEnvironmentCheckJson(resultsWithEvidence);
  const requiredPassed = didPassRequiredEnvironmentChecks(resultsWithEvidence);

  const db = await context.runDatabase(async () => {
    const check = await context.prisma.environmentCheck.create({
      data: {
        id: createId("envcheck"),
        candidateId: invite.candidate.id,
        examId: invite.exam.id,
        results: storedResults,
        requiredPassed
      }
    });

    return mapEnvironmentCheck(check);
  });

  if (db) {
    return { check: db, environmentChecks: memoryChecks };
  }

  const check: EnvironmentCheck = {
    id: createId("envcheck"),
    candidateId: invite.candidate.id,
    examId: invite.exam.id,
    results: resultsWithEvidence,
    requiredPassed,
    createdAt: nowIso()
  };
  return { check, environmentChecks: [check, ...memoryChecks] };
}

export async function verifyCandidateIdentityInStore(request: VerifyCandidateIdentityRequest) {
  const { context, input, invite, memoryVerifications } = request;
  const privacyConsentAcceptedAt = invite.candidate.identityPrivacyConsentAcceptedAt;
  if (!invite.exam.identityVerificationEnabled) {
    throw new BadRequestException("이 시험은 본인확인이 비활성화되어 있습니다.");
  }
  if (invite.candidate.identityPrivacyConsentVersion !== CURRENT_PRIVACY_POLICY_VERSION || !privacyConsentAcceptedAt) {
    throw new BadRequestException("현재 개인정보 처리방침에 동의한 후 본인확인을 진행해주세요.");
  }
  rejectRawIdentityMedia(input);
  if (!input.providerSessionId || !input.documentUploadRef || !input.faceUploadRef) {
    throw new BadRequestException("본인확인에는 KYC provider session과 upload reference가 필요합니다.");
  }
  if (!input.documentCaptured || !input.faceImageCaptured || !input.livenessConfirmed) {
    throw new BadRequestException("본인확인에는 신분증 촬영, 얼굴 촬영, 라이브니스 확인이 모두 필요합니다.");
  }

  const engineResult = await context.identityVerification.verify({
    candidateId: invite.candidate.id,
    candidateName: invite.candidate.name,
    examId: invite.exam.id,
    providerSessionId: input.providerSessionId,
    documentCaptured: input.documentCaptured,
    faceImageCaptured: input.faceImageCaptured,
    livenessConfirmed: input.livenessConfirmed,
    documentUploadRef: input.documentUploadRef,
    faceUploadRef: input.faceUploadRef
  });
  const documentAuthenticityScore = engineResult.documentAuthenticityScore;
  const faceMatchScore = engineResult.faceMatchScore;
  const livenessScore = engineResult.livenessScore;
  const ocrNameMatched = engineResult.ocrNameMatched;
  const verificationChecks = engineResult.verificationChecks;
  const similarityScore = faceMatchScore;
  const provider = engineResult.provider;
  const providerDecision = engineResult.providerDecision;
  const providerReferenceId = engineResult.providerReferenceId;
  const status = didPassIdentityProviderChecks(engineResult) ? "VERIFIED" : "FAILED";
  const failureReason = status === "VERIFIED" ? undefined : identityFailureReason(engineResult);
  const verifiedAt = status === "VERIFIED" ? new Date() : null;

  const db = await context.runDatabase(async () => {
    const verification = await context.prisma.identityVerification.create({
      data: {
        id: createId("identity"),
        candidateId: invite.candidate.id,
        examId: invite.exam.id,
        documentImageName: documentCaptureMarker,
        documentCaptureConfirmed: true,
        faceImageCaptured: input.faceImageCaptured,
        provider,
        providerDecision,
        providerReferenceId,
        failureReason,
        similarityScore,
        documentAuthenticityScore,
        faceMatchScore,
        livenessScore,
        ocrNameMatched,
        verificationChecks,
        privacyConsentVersion: CURRENT_PRIVACY_POLICY_VERSION,
        privacyConsentAcceptedAt: new Date(privacyConsentAcceptedAt),
        status,
        verifiedAt
      }
    });

    return mapIdentityVerification(verification);
  });

  if (db) {
    return { verification: db, identityVerifications: memoryVerifications };
  }

  const verification: IdentityVerification = {
    id: createId("identity"),
    candidateId: invite.candidate.id,
    examId: invite.exam.id,
    documentImageName: documentCaptureMarker,
    documentCaptureConfirmed: true,
    faceImageCaptured: input.faceImageCaptured,
    provider,
    providerDecision,
    providerReferenceId,
    failureReason,
    similarityScore,
    documentAuthenticityScore,
    faceMatchScore,
    livenessScore,
    ocrNameMatched,
    verificationChecks,
    privacyConsentVersion: CURRENT_PRIVACY_POLICY_VERSION,
    privacyConsentAcceptedAt,
    status,
    verifiedAt: verifiedAt?.toISOString(),
    createdAt: nowIso()
  };
  return { verification, identityVerifications: [verification, ...memoryVerifications] };
}
