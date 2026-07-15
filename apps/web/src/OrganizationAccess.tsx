import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Building2, Send } from "lucide-react";
import type { AuthSession, CreateOrganizationAccessRequestInput } from "@dcvp/shared";
import { api } from "./api";

type OrganizationAccessProps = {
  readonly session: AuthSession;
  readonly onUpdated: (session: AuthSession) => void;
  readonly requestedRole: "CANDIDATE" | "ORGANIZATION";
  readonly onBack?: () => void;
};

export function OrganizationAccess({ session, onUpdated, requestedRole, onBack }: OrganizationAccessProps) {
  const isOrganizationManagerRequest = requestedRole === "ORGANIZATION";
  const [request, setRequest] = useState<CreateOrganizationAccessRequestInput>({
    joinCode: isOrganizationManagerRequest ? session.organization.joinCode ?? "" : "",
    requestedRole,
    reason: ""
  });
  const mutation = useMutation({
    mutationFn: api.createOrganizationAccessRequest,
    onSuccess: () => void api.me(session.token).then(onUpdated)
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(request);
  };
  const title = isOrganizationManagerRequest ? "조직 관리자 권한 신청" : "조직 신청";
  const description = isOrganizationManagerRequest
    ? "현재 소속된 조직의 조직 관리자 권한을 신청합니다. 승인 후 권한이 활성화됩니다."
    : "조직 관리자에게 받은 조직 코드를 입력하면 가입 요청을 보낼 수 있습니다.";

  return (
    <section className="panel organization-access-panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">{isOrganizationManagerRequest ? "권한 승격 신청" : "조직 소속 신청"}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Building2 aria-hidden="true" size={24} />
      </div>
      <form className="form organization-access-form" onSubmit={submit}>
        <label>
          {isOrganizationManagerRequest ? "소속 조직 코드" : "조직 코드"}
          <input
            value={request.joinCode}
            onChange={(event) => setRequest({ ...request, joinCode: event.target.value })}
            placeholder="ORG-XXXXXXXX"
            readOnly={isOrganizationManagerRequest}
            required
          />
        </label>
        <label>
          신청 사유
          <textarea value={request.reason} onChange={(event) => setRequest({ ...request, reason: event.target.value })} rows={3} required />
        </label>
        {mutation.isError ? <div className="form-error">{mutation.error instanceof Error ? mutation.error.message : "조직 요청을 제출하지 못했습니다."}</div> : null}
        {mutation.isSuccess ? <div className="ready-banner ready-banner-ok">{title}이 제출되었습니다.</div> : null}
        <div className="organization-form-actions">
          {onBack ? <button className="ghost-action" type="button" onClick={onBack}>선택으로 돌아가기</button> : null}
          <button className="primary-action organization-access-submit" type="submit" disabled={mutation.isPending}>
            <Send size={18} />
            {title}
          </button>
        </div>
      </form>
    </section>
  );
}
