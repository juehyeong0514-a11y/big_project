import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Send, UserPlus } from "lucide-react";
import type { AuthSession, CreateOrganizationInvitationInput, OrganizationInvitation } from "@dcvp/shared";
import { api } from "./api";
import { maskEmailAddress } from "./privacyMasking";

const invitationDefaults = { email: "", requestedRole: "PROCTOR" } satisfies CreateOrganizationInvitationInput;

const roleLabels: Record<CreateOrganizationInvitationInput["requestedRole"], string> = {
  ORGANIZATION: "조직 관리자",
  PROCTOR: "감독관"
};

const invitationStatusLabels: Record<OrganizationInvitation["status"], string> = {
  PENDING: "수락 대기",
  ACCEPTED: "수락 완료",
  CANCELLED: "취소됨"
};

export function OrganizationInvitationsPanel({ session }: { readonly session: AuthSession }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateOrganizationInvitationInput>(invitationDefaults);
  const [copied, setCopied] = useState(false);
  const invitationsQuery = useQuery({ queryKey: ["organization-invitations"], queryFn: api.organizationInvitations });
  const invitationMutation = useMutation({
    mutationFn: api.createOrganizationInvitation,
    onSuccess: async () => {
      setForm(invitationDefaults);
      await queryClient.invalidateQueries({ queryKey: ["organization-invitations"] });
    }
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    invitationMutation.mutate(form);
  };
  const copyJoinCode = async () => {
    await navigator.clipboard.writeText(session.organization.joinCode ?? "");
    setCopied(true);
  };

  return (
    <section className="panel organization-invitations-panel">
      <div className="section-title"><div><h2>조직 코드와 멤버 초대</h2><p>조직 코드는 직접 가입 요청에 사용하고, 가입된 계정 이메일에는 지정한 권한의 조직 초대 알림을 등록합니다.</p></div></div>
      <div className="organization-invitation-grid">
        <div className="organization-code-card">
          <span>내 조직 코드</span>
          <strong>{session.organization.joinCode}</strong>
          <p>다른 사용자가 이 코드로 조직 참가 요청을 보낼 수 있습니다.</p>
          <button className="ghost-action compact-action" type="button" onClick={() => void copyJoinCode()}><Copy size={16} />{copied ? "복사됨" : "코드 복사"}</button>
        </div>
        <form className="organization-invitation-form" onSubmit={submit}>
          <div className="invitation-form-heading"><UserPlus size={20} /><strong>조직 멤버 등록</strong></div>
          <label>가입된 계정 이메일<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" placeholder="예: member@example.com" required /></label>
          <label>부여할 권한<select value={form.requestedRole} onChange={(event) => setForm({ ...form, requestedRole: event.target.value === "ORGANIZATION" ? "ORGANIZATION" : "PROCTOR" })}><option value="PROCTOR">감독관</option><option value="ORGANIZATION">조직 관리자</option></select></label>
          <p>이메일은 발송하지 않습니다. 초대 상대 계정의 조직 초대 알림에 등록되며, 사용자는 로그인 후 권한을 확인하고 수락합니다.</p>
          {invitationMutation.isError ? <div className="form-error">{errorMessage(invitationMutation.error)}</div> : null}
          {invitationMutation.isSuccess ? <div className="ready-banner ready-banner-ok">{invitationMutation.data.message}</div> : null}
          <button className="primary-action" type="submit" disabled={invitationMutation.isPending}><Send size={18} />초대 등록</button>
        </form>
      </div>
      <InvitationList invitations={invitationsQuery.data ?? []} isLoading={invitationsQuery.isLoading} error={invitationsQuery.error} />
    </section>
  );
}

function InvitationList({ invitations, isLoading, error }: { readonly invitations: readonly OrganizationInvitation[]; readonly isLoading: boolean; readonly error: unknown }) {
  return (
    <div className="organization-invitation-list">
      <strong>등록한 초대</strong>
      {isLoading ? <span>초대 목록을 불러오는 중입니다.</span> : null}
      {error ? <span className="form-error">{errorMessage(error)}</span> : null}
      {!isLoading && !error && invitations.length === 0 ? <span>아직 보낸 초대가 없습니다.</span> : null}
      {invitations.length > 0 ? <div className="organization-invitation-row organization-invitation-row-heading"><span>계정 이메일</span><span>권한</span><span>상태</span></div> : null}
      {invitations.map((invitation) => <div className="organization-invitation-row" key={invitation.id}><span>{maskEmailAddress(invitation.email)}</span><span>{roleLabels[invitation.requestedRole]}</span><span>{invitationStatusLabels[invitation.status]}</span></div>)}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "초대를 처리하지 못했습니다.";
}
