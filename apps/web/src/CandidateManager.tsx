import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Send, UserPlus } from "lucide-react";
import type { Candidate, CreateCandidateInput } from "@dcvp/shared";
import { api } from "./api";
import { maskDisplayName, maskEmailAddress } from "./privacyMasking";

interface InviteEmailNotice {
  readonly delivered: boolean;
  readonly title: string;
  readonly message: string;
}

const candidateStatusLabels: Record<Candidate["status"], string> = {
  INVITED: "초대됨",
  READY: "입장 준비",
  IN_PROGRESS: "응시 중",
  COMPLETED: "응시 완료"
};

export function CandidateManager({ examId, candidates, canManage }: { readonly examId: string; readonly candidates: Awaited<ReturnType<typeof api.examDetail>>["candidates"]; readonly canManage: boolean }) {
  const [form, setForm] = useState<CreateCandidateInput>({ name: "", email: "" });
  const [inviteEmailNotice, setInviteEmailNotice] = useState<InviteEmailNotice | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: CreateCandidateInput) => api.addCandidate(examId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setForm({ name: "", email: "" });
      setInviteEmailNotice(null);
    },
    onError: (error) => {
      setInviteEmailNotice({
        delivered: false,
        title: "응시자 추가 실패",
        message: error instanceof Error ? error.message : "응시자 추가 중 오류가 발생했습니다."
      });
    }
  });
  const inviteEmailMutation = useMutation({
    mutationFn: (candidateId: string) => api.sendCandidateInviteEmail(candidateId),
    onSuccess: async (result) => {
      const providerMessage = result.providerMessageId ? `, 추적 ID ${result.providerMessageId}` : "";
      const deliveryState = result.delivered ? "발송 완료" : "발송 실패";
      setInviteEmailNotice({
        delivered: result.delivered,
        title: `${deliveryState}: ${maskEmailAddress(result.email)}`,
        message: `${result.provider}${providerMessage} - ${result.message} 초대 링크: ${result.inviteUrl}`
      });
      await queryClient.invalidateQueries({ queryKey: ["exam", examId] });
      await queryClient.invalidateQueries({ queryKey: ["exam-report", examId] });
    },
    onError: (error) => {
      setInviteEmailNotice({
        delivered: false,
        title: "초대 메일 요청 실패",
        message: error instanceof Error ? error.message : "초대 메일 발송 요청 중 오류가 발생했습니다."
      });
    }
  });
  const copyInvite = async (inviteToken: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/candidate/${inviteToken}`);
  };

  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h2>응시자</h2>
          <p>응시자를 초대하고 입장 상태를 추적합니다.</p>
        </div>
      </div>
      <div className="list">
        {candidates.map((candidate) => {
          const invitePath = `/candidate/${candidate.inviteToken}`;
          return (
            <article key={candidate.id} className="list-item candidate-card">
              <div>
                <strong>{maskDisplayName(candidate.name)}</strong>
                <span>{maskEmailAddress(candidate.email)} / {candidateStatusLabels[candidate.status]}</span>
                <code>{invitePath}</code>
              </div>
              <div className="item-actions">
                {canManage ? (
                  <button className="icon-action" type="button" title="초대 메일 발송" onClick={() => inviteEmailMutation.mutate(candidate.id)} disabled={inviteEmailMutation.isPending}>
                    <Send size={16} />
                  </button>
                ) : null}
                <button className="icon-action" type="button" title="초대 링크 복사" onClick={() => void copyInvite(candidate.inviteToken)}>
                  <Copy size={16} />
                </button>
                <Link className="icon-action" title="응시자 입장 화면 열기" to={invitePath}>
                  <ExternalLink size={16} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {inviteEmailNotice ? (
        <div className={inviteEmailNotice.delivered ? "ready-banner ready-banner-ok" : "ready-banner ready-banner-error"} role="status" aria-live="polite">
          {inviteEmailNotice.delivered ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <div className="notice-copy">
            <strong>{inviteEmailNotice.title}</strong>
            <span>{inviteEmailNotice.message}</span>
          </div>
        </div>
      ) : null}
      {canManage ? (
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(form); }}>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="이름" required />
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="이메일" required />
          <button className="secondary-action" type="submit"><UserPlus size={18} />응시자 추가</button>
        </form>
      ) : null}
    </section>
  );
}
