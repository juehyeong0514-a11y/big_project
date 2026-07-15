import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Users, XCircle } from "lucide-react";
import type { AdminSignupRequest, AuthSession, OrganizationAccessRequest, UpdateAdminUserInput, User } from "@dcvp/shared";
import { api } from "./api";
import { UsersTable } from "./AdminUsersTable";
import { OrganizationInvitationsPanel } from "./OrganizationInvitationsPanel";
import "./AdminUsers.css";

const requestStatusLabels: Record<AdminSignupRequest["status"], string> = {
  PENDING: "승인 대기",
  APPROVED: "승인 완료",
  REJECTED: "거절"
};

function userEditState(user: User): UpdateAdminUserInput {
  return { name: user.name, email: user.email, role: user.role, organizationId: user.organizationId };
}

export function AdminUsers({ session }: { readonly session: AuthSession }) {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, UpdateAdminUserInput>>({});
  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: api.adminUsers });
  const organizationsQuery = useQuery({ queryKey: ["admin-organizations"], queryFn: api.adminOrganizations });
  const requestsQuery = useQuery({ queryKey: ["admin-signup-requests"], queryFn: api.adminSignupRequests, enabled: session.user.role === "ADMIN" });
  const organizationRequestsQuery = useQuery({ queryKey: ["organization-access-requests"], queryFn: api.organizationAccessRequests, enabled: session.user.role === "ADMIN" || session.user.role === "ORGANIZATION" });
  const organizationNameById = useMemo(() => Object.fromEntries((organizationsQuery.data ?? []).map((organization) => [organization.id, organization.name])), [organizationsQuery.data]);
  const updateMutation = useMutation({
    mutationFn: ({ userId, input }: { readonly userId: string; readonly input: UpdateAdminUserInput }) => api.updateAdminUser(userId, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin-users"] })
  });
  const deleteMutation = useMutation({
    mutationFn: api.deleteAdminUser,
    onSuccess: async () => {
      setEdits({});
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    }
  });
  const reviewMutation = useMutation({
    mutationFn: ({ requestId, action, rejectionReason }: { readonly requestId: string; readonly action: "APPROVE" | "REJECT"; readonly rejectionReason?: string }) =>
      api.reviewAdminSignupRequest(requestId, { action, rejectionReason }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-signup-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["pending-approval-count"] })
      ]);
    }
  });
  const organizationReviewMutation = useMutation({
    mutationFn: ({ requestId, action }: { readonly requestId: string; readonly action: "APPROVE" | "REJECT" }) => api.reviewOrganizationAccessRequest(requestId, { action }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organization-access-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["pending-approval-count"] })
      ]);
    }
  });

  const updateEdit = (user: User, patch: Partial<UpdateAdminUserInput>) => setEdits({ ...edits, [user.id]: { ...(edits[user.id] ?? userEditState(user)), ...patch } });
  const saveUser = (user: User) => updateMutation.mutate({ userId: user.id, input: edits[user.id] ?? userEditState(user) });
  const deleteUser = (user: User) => deleteMutation.mutate(user.id);
  const tableProps = { session, users: usersQuery.data ?? [], organizations: organizationsQuery.data ?? [], organizationNameById, edits, updateEdit, saveUser, deleteUser, isSaving: updateMutation.isPending, isDeleting: deleteMutation.isPending, isLoading: usersQuery.isLoading || organizationsQuery.isLoading, error: usersQuery.error ?? organizationsQuery.error ?? updateMutation.error ?? deleteMutation.error };

  return (
    <div className="stack">
      <section className="panel hero-panel">
        <div>
          <span className="eyebrow">계정 관리</span>
          <h2>{session.user.role === "ADMIN" ? "운영자 계정 관리" : "조직 계정 관리"}</h2>
          <p>{session.user.role === "ADMIN" ? "운영자는 모든 조직의 계정, 조직, 권한, 이메일을 수정할 수 있습니다." : "조직 관리자는 가입된 계정 이메일로 관리자와 감독관 초대를 등록하고, 자기 조직의 계정을 수정할 수 있습니다."}</p>
        </div>
        <Users size={24} />
      </section>
      {session.user.role === "ADMIN" ? <SignupRequestsPanel requests={requestsQuery.data ?? []} isLoading={requestsQuery.isLoading} error={requestsQuery.error} reviewMutation={reviewMutation} /> : null}
      <OrganizationAccessRequestsPanel requests={organizationRequestsQuery.data ?? []} isLoading={organizationRequestsQuery.isLoading} error={organizationRequestsQuery.error ?? organizationReviewMutation.error} reviewMutation={organizationReviewMutation} />
      {session.user.role === "ORGANIZATION" ? <OrganizationInvitationsPanel session={session} /> : null}
      <UsersTable {...tableProps} />
    </div>
  );
}

function OrganizationAccessRequestsPanel(props: {
  readonly requests: readonly OrganizationAccessRequest[];
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly reviewMutation: ReturnType<typeof useMutation<OrganizationAccessRequest, Error, { readonly requestId: string; readonly action: "APPROVE" | "REJECT" }>>;
}) {
  return (
    <section className="panel">
      <div className="section-title"><div><h2>조직 참여 및 권한 요청</h2><p>조직 코드 가입 신청과 권한 승격 요청을 승인하거나 거절합니다.</p></div></div>
      {props.isLoading ? <div className="ready-banner">조직 요청을 불러오는 중입니다.</div> : null}
      {props.error ? <div className="ready-banner ready-banner-error">{errorMessage(props.error)}</div> : null}
      <div className="table-wrap"><table><thead><tr><th>상태</th><th>조직</th><th>신청자</th><th>요청 권한</th><th>신청 사유</th><th>처리</th></tr></thead><tbody>
        {props.requests.map((request) => <tr key={request.id}><td><span className={requestStatusClass(request.status)}>{requestStatusLabels[request.status]}</span></td><td>{request.organization.name}<br /><small>{request.organization.joinCode}</small></td><td>{request.user.name}<br /><small>{request.user.email}</small></td><td>{request.requestedRole}</td><td>{request.reason}</td><td>{request.status === "PENDING" ? <div className="approval-actions"><button className="primary-action compact-action" type="button" onClick={() => props.reviewMutation.mutate({ requestId: request.id, action: "APPROVE" })} disabled={props.reviewMutation.isPending}>승인</button><button className="ghost-action compact-action danger-action" type="button" onClick={() => props.reviewMutation.mutate({ requestId: request.id, action: "REJECT" })} disabled={props.reviewMutation.isPending}>거절</button></div> : request.rejectionReason ?? "-"}</td></tr>)}
        {props.requests.length === 0 ? <tr><td colSpan={6}>조직 참여 또는 권한 요청이 없습니다.</td></tr> : null}
      </tbody></table></div>
    </section>
  );
}

function SignupRequestsPanel(props: {
  readonly requests: readonly AdminSignupRequest[];
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly reviewMutation: ReturnType<typeof useMutation<AdminSignupRequest, Error, { readonly requestId: string; readonly action: "APPROVE" | "REJECT"; readonly rejectionReason?: string }>>;
}) {
  return (
    <section className="panel">
      <div className="section-title"><div><h2>새 조직 생성 신청</h2><p>승인하면 신청자의 조직과 조직 관리자 계정이 생성됩니다.</p></div></div>
      {props.isLoading ? <div className="ready-banner">가입 신청을 불러오는 중입니다.</div> : null}
      {props.error ? <div className="ready-banner ready-banner-error">{errorMessage(props.error)}</div> : null}
      {props.reviewMutation.error ? <div className="ready-banner ready-banner-error">{errorMessage(props.reviewMutation.error)}</div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>상태</th><th>조직</th><th>신청자</th><th>이메일</th><th>신청일</th><th>처리</th></tr></thead>
          <tbody>
            {props.requests.map((request) => (
              <tr key={request.id}>
                <td><span className={requestStatusClass(request.status)}>{requestStatusLabels[request.status]}</span></td>
                <td>{request.organizationName}</td><td>{request.name}</td><td>{request.email}</td><td>{new Date(request.createdAt).toLocaleString("ko-KR")}</td>
                <td>{request.status === "PENDING" ? <ReviewControls request={request} {...props} /> : request.rejectionReason ?? "-"}</td>
              </tr>
            ))}
            {props.requests.length === 0 ? <tr><td colSpan={6}>가입 신청이 없습니다.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReviewControls(props: {
  readonly request: AdminSignupRequest;
  readonly reviewMutation: ReturnType<typeof useMutation<AdminSignupRequest, Error, { readonly requestId: string; readonly action: "APPROVE" | "REJECT"; readonly rejectionReason?: string }>>;
}) {
  return (
    <div className="approval-actions">
      <button className="primary-action compact-action" type="button" onClick={() => props.reviewMutation.mutate({ requestId: props.request.id, action: "APPROVE" })} disabled={props.reviewMutation.isPending}><CheckCircle2 size={16} />승인</button>
      <button className="ghost-action compact-action danger-action" type="button" onClick={() => props.reviewMutation.mutate({ requestId: props.request.id, action: "REJECT" })} disabled={props.reviewMutation.isPending}><XCircle size={16} />거절</button>
    </div>
  );
}


function requestStatusClass(status: AdminSignupRequest["status"]) {
  switch (status) {
    case "PENDING": return "status-pill status-warning";
    case "APPROVED": return "status-pill status-ok";
    case "REJECTED": return "status-pill status-danger";
    default: return assertNeverStatus(status);
  }
}

function assertNeverStatus(status: never): never {
  throw new Error(`Unhandled request status: ${status}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}
