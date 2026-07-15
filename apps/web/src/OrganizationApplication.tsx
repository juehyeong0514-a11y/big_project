import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Building2, ChevronLeft, LogIn, PlusCircle, Send } from "lucide-react";
import type { AuthSession, CreateOrganizationSignupRequestInput } from "@dcvp/shared";
import { api } from "./api";
import { OrganizationAccess } from "./OrganizationAccess";

type ApplicationView = "CHOICE" | "CREATE" | "JOIN";

const initialOrganizationRequest = { organizationName: "", reason: "" } satisfies CreateOrganizationSignupRequestInput;

export function OrganizationApplication({ session, onUpdated }: { readonly session: AuthSession; readonly onUpdated: (session: AuthSession) => void }) {
  const [view, setView] = useState<ApplicationView>("CHOICE");
  const [request, setRequest] = useState<CreateOrganizationSignupRequestInput>(initialOrganizationRequest);
  const mutation = useMutation({
    mutationFn: api.createOrganizationSignupRequest,
    onSuccess: () => setRequest(initialOrganizationRequest)
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(request);
  };

  if (view === "JOIN") {
    return <OrganizationAccess session={session} onUpdated={onUpdated} requestedRole="CANDIDATE" onBack={() => setView("CHOICE")} />;
  }

  if (view === "CREATE") {
    return (
      <section className="panel organization-access-panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">새 조직 생성 신청</span>
            <h2>새 조직을 만드세요</h2>
            <p>운영자 승인 후 현재 계정이 해당 조직의 조직 관리자가 됩니다.</p>
          </div>
          <Building2 aria-hidden="true" size={24} />
        </div>
        <form className="form organization-access-form" onSubmit={submit}>
          <label>
            조직명
            <input value={request.organizationName} onChange={(event) => setRequest({ ...request, organizationName: event.target.value })} required />
          </label>
          <label>
            신청 사유
            <textarea value={request.reason} onChange={(event) => setRequest({ ...request, reason: event.target.value })} rows={3} required />
          </label>
          {mutation.isError ? <div className="form-error">{mutation.error instanceof Error ? mutation.error.message : "조직 생성 신청을 제출하지 못했습니다."}</div> : null}
          {mutation.isSuccess ? <div className="ready-banner ready-banner-ok">조직 생성 신청이 제출되었습니다.</div> : null}
          <div className="organization-form-actions">
            <button className="ghost-action" type="button" onClick={() => setView("CHOICE")}><ChevronLeft size={18} />선택으로 돌아가기</button>
            <button className="primary-action" type="submit" disabled={mutation.isPending}><Send size={18} />조직 생성 신청</button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="panel organization-access-panel organization-choice-panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">조직 신청</span>
          <h2>조직을 선택하세요</h2>
          <p>새 조직을 만들거나, 발급받은 조직 코드로 기존 조직에 가입할 수 있습니다.</p>
        </div>
        <Building2 aria-hidden="true" size={24} />
      </div>
      <div className="organization-choice-grid">
        <button className="organization-choice-card" type="button" onClick={() => setView("CREATE")}>
          <PlusCircle aria-hidden="true" size={22} />
          <span>새 조직 만들기</span>
          <small>운영자 승인 후 현재 계정이 조직 관리자가 됩니다.</small>
        </button>
        <button className="organization-choice-card" type="button" onClick={() => setView("JOIN")}>
          <LogIn aria-hidden="true" size={22} />
          <span>기존 조직 들어가기</span>
          <small>조직 관리자에게 받은 조직 코드를 입력합니다.</small>
        </button>
      </div>
    </section>
  );
}
