import type { SendInviteEmailInput } from "./email.types.js";

export interface InviteEmailContent {
  subject: string;
  html: string;
  text: string;
}

export function renderInviteEmail(input: SendInviteEmailInput): InviteEmailContent {
  const candidateName = escapeHtml(input.candidateName);
  const examTitle = escapeHtml(input.examTitle);
  const inviteUrl = escapeHtml(input.inviteUrl);
  return {
    subject: `[DCVP] ${input.examTitle} 시험 초대`,
    html: [
      `<p>${candidateName}님, ${examTitle} 시험에 초대되었습니다.</p>`,
      "<p>아래 링크로 접속해 환경 점검, 본인 확인, 시험을 순서대로 진행해주세요.</p>",
      `<p><a href="${inviteUrl}">${inviteUrl}</a></p>`
    ].join(""),
    text: `${input.candidateName}님, ${input.examTitle} 시험에 초대되었습니다.\n${input.inviteUrl}`
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}
