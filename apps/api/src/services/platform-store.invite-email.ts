import type { Candidate, Exam, InviteEmailLog, InviteEmailResult } from "@dcvp/shared";
import { EmailProviderConfigurationError, type EmailService, type SendInviteEmailInput, type SendInviteEmailResult } from "./email.service.js";
import type { PrismaService } from "./prisma.service.js";
import { createId, nowIso, publicWebBaseUrl } from "./platform-store.helpers.js";
import { mapInviteEmailLog } from "./platform-store.mappers.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface InviteEmailStoreContext {
  readonly prisma: PrismaService;
  readonly email: EmailService;
  readonly runDatabase: DatabaseRunner;
}

export interface CandidateWithExam {
  readonly candidate: Candidate;
  readonly exam: Exam;
}

export interface SendCandidateInviteEmailRequest {
  readonly context: InviteEmailStoreContext;
  readonly candidateWithExam: CandidateWithExam;
  readonly memoryLogs: readonly InviteEmailLog[];
}

interface SaveInviteEmailLogRequest {
  readonly context: InviteEmailStoreContext;
  readonly input: {
    readonly candidateId: string;
    readonly examId: string;
    readonly email: string;
    readonly inviteUrl: string;
    readonly provider: string;
    readonly providerMessageId?: string;
    readonly status: InviteEmailLog["status"];
    readonly message: string;
    readonly sentAt: Date | null;
  };
  readonly memoryLogs: readonly InviteEmailLog[];
}

export async function sendCandidateInviteEmailInStore(request: SendCandidateInviteEmailRequest) {
  const { candidate, exam } = request.candidateWithExam;
  const inviteUrl = `${publicWebBaseUrl()}/candidate/${candidate.inviteToken}`;
  const result = await trySendInviteEmail(request.context, {
    candidateId: candidate.id,
    candidateName: candidate.name,
    email: candidate.email,
    examTitle: exam.title,
    inviteUrl
  });
  const status: InviteEmailLog["status"] = result.delivered ? "SENT" : "FAILED";
  const sentAt = result.delivered ? new Date() : null;

  const { log, inviteEmailLogs } = await saveInviteEmailLogInStore({
    context: request.context,
    input: {
      candidateId: candidate.id,
      examId: exam.id,
      email: candidate.email,
      inviteUrl,
      provider: result.provider,
      ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
      status,
      message: result.message,
      sentAt
    },
    memoryLogs: request.memoryLogs
  });

  const inviteResult: InviteEmailResult = {
    candidateId: candidate.id,
    email: candidate.email,
    inviteUrl,
    delivered: result.delivered,
    provider: result.provider,
    ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
    message: result.message,
    log
  };

  return { result: inviteResult, inviteEmailLogs };
}

async function trySendInviteEmail(
  context: InviteEmailStoreContext,
  input: SendInviteEmailInput
): Promise<SendInviteEmailResult> {
  try {
    return await context.email.sendInvite(input);
  } catch (error) {
    const provider = error instanceof EmailProviderConfigurationError ? error.provider : context.email.configuredProviderName();
    return {
      delivered: false,
      provider,
      message: error instanceof Error ? error.message : "Email provider failed."
    };
  }
}

async function saveInviteEmailLogInStore(request: SaveInviteEmailLogRequest) {
  const { context, input, memoryLogs } = request;
  const db = await context.runDatabase(async () => {
    const log = await context.prisma.inviteEmailLog.create({
      data: {
        id: createId("invite_email"),
        candidateId: input.candidateId,
        examId: input.examId,
        email: input.email,
        inviteUrl: input.inviteUrl,
        provider: input.provider,
        ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
        status: input.status,
        message: input.message,
        sentAt: input.sentAt
      }
    });

    return mapInviteEmailLog(log);
  });

  if (db) {
    return { log: db, inviteEmailLogs: memoryLogs };
  }

  const log: InviteEmailLog = {
    id: createId("invite_email"),
    candidateId: input.candidateId,
    examId: input.examId,
    email: input.email,
    inviteUrl: input.inviteUrl,
    provider: input.provider,
    ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
    status: input.status,
    message: input.message,
    sentAt: input.sentAt?.toISOString(),
    createdAt: nowIso()
  };
  return { log, inviteEmailLogs: [log, ...memoryLogs] };
}
