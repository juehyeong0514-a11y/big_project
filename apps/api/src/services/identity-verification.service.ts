import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { IdentityProviderSession, KycProviderDecision } from "@dcvp/shared";
import { providerBaseUrl, rejectUnsafeUploadReference } from "./identity-provider-security.js";

export interface IdentityVerificationEngineInput {
  candidateId: string;
  candidateName: string;
  examId: string;
  providerSessionId?: string;
  documentCaptured: boolean;
  faceImageCaptured: boolean;
  livenessConfirmed: boolean;
  documentUploadRef?: string;
  faceUploadRef?: string;
}

export interface IdentityVerificationEngineResult {
  documentAuthenticityScore: number;
  faceMatchScore: number;
  livenessScore: number;
  ocrNameMatched: boolean;
  verificationChecks: string[];
  provider: string;
  providerDecision: KycProviderDecision;
  providerReferenceId: string;
  failureReason?: string;
}

interface SandboxKycResponse {
  provider?: string;
  providerDecision?: unknown;
  providerReferenceId?: unknown;
  failureReason?: unknown;
  documentAuthenticityScore?: unknown;
  faceMatchScore?: unknown;
  livenessScore?: unknown;
  ocrNameMatched?: unknown;
  verificationChecks?: unknown;
}

interface KycProviderSessionResponse {
  provider?: string;
  providerSessionId?: unknown;
  documentUploadRef?: unknown;
  faceUploadRef?: unknown;
  expiresAt?: unknown;
}

@Injectable()
export class IdentityVerificationService {
  async createSession(input: Pick<IdentityVerificationEngineInput, "candidateId" | "candidateName" | "examId">): Promise<IdentityProviderSession> {
    const baseUrl = providerBaseUrl();
    const apiKey = process.env.KYC_SANDBOX_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException("KYC 세션 생성에는 KYC_SANDBOX_API_BASE_URL과 KYC_SANDBOX_API_KEY가 필요합니다.");
    }

    const response = await fetch(`${baseUrl}/identity/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        candidate: {
          id: input.candidateId,
          name: input.candidateName
        },
        examId: input.examId,
        requiredChecks: ["DOCUMENT_AUTHENTICITY", "FACE_MATCH", "LIVENESS", "OCR_NAME_MATCH"]
      })
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`KYC 세션 provider 호출 실패 (${response.status}). provider 응답 본문은 보안상 노출하지 않습니다.`);
    }

    return this.normalizeSession(this.parseSessionResponse(await response.json()));
  }

  async verify(input: IdentityVerificationEngineInput): Promise<IdentityVerificationEngineResult> {
    return this.verifyWithSandboxProvider(input);
  }

  private async verifyWithSandboxProvider(input: IdentityVerificationEngineInput): Promise<IdentityVerificationEngineResult> {
    const baseUrl = providerBaseUrl();
    const apiKey = process.env.KYC_SANDBOX_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException("KYC 본인확인에는 KYC_SANDBOX_API_BASE_URL과 KYC_SANDBOX_API_KEY가 필요합니다.");
    }
    rejectUnsafeUploadReference(input.documentUploadRef, "documentUploadRef");
    rejectUnsafeUploadReference(input.faceUploadRef, "faceUploadRef");

    const response = await fetch(`${baseUrl}/identity/verify`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        candidate: {
          id: input.candidateId,
          name: input.candidateName
        },
        examId: input.examId,
        providerSessionId: input.providerSessionId,
        documentUploadRef: input.documentUploadRef,
        faceUploadRef: input.faceUploadRef,
        captureSignals: {
          documentCaptured: input.documentCaptured,
          faceImageCaptured: input.faceImageCaptured,
          livenessConfirmed: input.livenessConfirmed
        }
      })
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`KYC provider 호출 실패 (${response.status}). provider 응답 본문은 보안상 노출하지 않습니다.`);
    }

    return this.normalizeProviderResult(this.parseProviderResponse(await response.json()));
  }

  private normalizeSession(result: KycProviderSessionResponse): IdentityProviderSession {
    const providerSessionId = this.requiredString(result.providerSessionId, "providerSessionId");
    const documentUploadRef = this.requiredString(result.documentUploadRef, "documentUploadRef");
    const faceUploadRef = this.requiredString(result.faceUploadRef, "faceUploadRef");
    const expiresAt = this.requiredString(result.expiresAt, "expiresAt");
    return {
      provider: result.provider ?? "kyc-sandbox",
      providerSessionId,
      documentUploadRef,
      faceUploadRef,
      expiresAt
    };
  }

  private normalizeProviderResult(result: SandboxKycResponse): IdentityVerificationEngineResult {
    return {
      documentAuthenticityScore: this.requiredScore(result.documentAuthenticityScore, "documentAuthenticityScore"),
      faceMatchScore: this.requiredScore(result.faceMatchScore, "faceMatchScore"),
      livenessScore: this.requiredScore(result.livenessScore, "livenessScore"),
      ocrNameMatched: result.ocrNameMatched === true,
      verificationChecks: this.normalizeChecks(result.verificationChecks),
      provider: result.provider ?? "kyc-sandbox",
      providerDecision: this.requiredDecision(result.providerDecision),
      providerReferenceId: this.requiredString(result.providerReferenceId, "providerReferenceId"),
      failureReason: this.sanitizedFailureReason(result.failureReason)
    };
  }

  private parseProviderResponse(value: unknown): SandboxKycResponse {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return {
      provider: this.readString(value, "provider"),
      providerDecision: this.readUnknown(value, "providerDecision"),
      providerReferenceId: this.readUnknown(value, "providerReferenceId"),
      failureReason: this.readUnknown(value, "failureReason"),
      documentAuthenticityScore: this.readUnknown(value, "documentAuthenticityScore"),
      faceMatchScore: this.readUnknown(value, "faceMatchScore"),
      livenessScore: this.readUnknown(value, "livenessScore"),
      ocrNameMatched: this.readUnknown(value, "ocrNameMatched"),
      verificationChecks: this.readUnknown(value, "verificationChecks")
    };
  }

  private parseSessionResponse(value: unknown): KycProviderSessionResponse {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return {
      provider: this.readString(value, "provider"),
      providerSessionId: this.readUnknown(value, "providerSessionId"),
      documentUploadRef: this.readUnknown(value, "documentUploadRef"),
      faceUploadRef: this.readUnknown(value, "faceUploadRef"),
      expiresAt: this.readUnknown(value, "expiresAt")
    };
  }

  private normalizeChecks(checks: unknown) {
    if (!Array.isArray(checks)) {
      return [];
    }

    return checks.filter((check): check is string => typeof check === "string");
  }

  private requiredScore(score: unknown, fieldName: string) {
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) {
      throw new ServiceUnavailableException(`KYC provider 응답의 ${fieldName} 값이 0~100 범위의 숫자가 아닙니다.`);
    }

    return score;
  }

  private requiredDecision(decision: unknown): KycProviderDecision {
    switch (decision) {
      case "VERIFIED":
        return "VERIFIED";
      case "REJECTED":
        return "REJECTED";
      case "REVIEW_REQUIRED":
        return "REVIEW_REQUIRED";
      default:
        throw new ServiceUnavailableException("KYC provider 응답에 유효한 providerDecision 값이 없습니다.");
    }
  }

  private requiredString(value: unknown, fieldName: string) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    throw new ServiceUnavailableException(`KYC provider 응답에 ${fieldName} 값이 없습니다.`);
  }

  private readUnknown(value: object, key: string): unknown {
    return Object.prototype.hasOwnProperty.call(value, key) ? Reflect.get(value, key) : undefined;
  }

  private readString(value: object, key: string) {
    const field = this.readUnknown(value, key);
    return typeof field === "string" && field.trim() ? field : undefined;
  }

  private sanitizedFailureReason(failureReason: unknown) {
    return typeof failureReason === "string" && failureReason.trim() ? "KYC provider가 본인확인을 거절했습니다." : undefined;
  }
}
