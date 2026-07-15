import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MailCheck } from "lucide-react";
import type { AuthSession, OrganizationInvitation } from "@dcvp/shared";
import { api } from "./api";

const roleLabels: Record<OrganizationInvitation["requestedRole"], string> = { ORGANIZATION: "조직 관리자", PROCTOR: "감독관" };

export function OrganizationInvitationInbox({ session, onUpdated }: { readonly session: AuthSession; readonly onUpdated: (session: AuthSession) => void }) {
  const queryClient = useQueryClient();
  const invitationsQuery = useQuery({ queryKey: ["received-organization-invitations"], queryFn: api.receivedOrganizationInvitations });
  const acceptMutation = useMutation({
    mutationFn: (invitationId: string) => api.acceptOrganizationInvitation({ invitationId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["received-organization-invitations"] });
      onUpdated(await api.me(session.token));
    }
  });
  const invitations = invitationsQuery.data ?? [];
  return (
    <section className="panel organization-invitation-inbox">
      <div className="section-title"><div><span className="eyebrow">조직 초대 알림</span><h2>내 계정의 조직 초대</h2><p>내 계정에 등록된 조직 초대를 수락하면 해당 조직의 권한이 활성화됩니다.</p></div><MailCheck size={24} /></div>
      {invitationsQuery.isLoading ? <div className="ready-banner">초대를 불러오는 중입니다.</div> : null}
      {invitationsQuery.isError ? <div className="ready-banner ready-banner-error">{errorMessage(invitationsQuery.error)}</div> : null}
      {invitations.map((invitation) => <article className="organization-invitation-received" key={invitation.id}><div><strong>{invitation.organization.name}</strong><span>{roleLabels[invitation.requestedRole]} 권한</span><small>{invitation.organization.joinCode}</small></div><button className="primary-action" type="button" onClick={() => acceptMutation.mutate(invitation.id)} disabled={acceptMutation.isPending}><CheckCircle2 size={18} />초대 수락</button></article>)}
      {!invitationsQuery.isLoading && invitations.length === 0 ? <div className="ready-banner">받은 조직 초대가 없습니다.</div> : null}
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "조직 초대를 불러오지 못했습니다.";
}
