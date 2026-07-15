import { BadRequestException } from "@nestjs/common";
import type { CandidateInvite, IdentityProviderSession } from "@dcvp/shared";
import type { IdentityVerificationService } from "./identity-verification.service.js";

export function createCandidateIdentitySessionInStore(identityVerification: IdentityVerificationService, invite: CandidateInvite): Promise<IdentityProviderSession> {
  if (!invite.exam.identityVerificationEnabled) {
    throw new BadRequestException("이 시험은 본인확인이 비활성화되어 있습니다.");
  }
  return identityVerification.createSession({
    candidateId: invite.candidate.id,
    candidateName: invite.candidate.name,
    examId: invite.exam.id
  });
}
