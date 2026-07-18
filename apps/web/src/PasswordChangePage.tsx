import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { AuthSession } from "@dcvp/shared";
import { api } from "./api";
import { PasswordPolicyHint } from "./PasswordPolicyHint";
import { sessionTokenStore } from "./sessionTokenStore";
import { passwordPolicyError } from "./passwordPolicy";
import { privacyContact } from "./privacyContact";

export function PasswordChangePage({ session, onSessionUpdated, onLogout }: {
  readonly session: AuthSession;
  readonly onSessionUpdated: (session: AuthSession) => void;
  readonly onLogout: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { readonly currentPassword: string; readonly newPassword: string }) => api.changePassword(session.token, input),
    onSuccess: (updatedSession) => {
      sessionTokenStore.set(updatedSession.token);
      onSessionUpdated(updatedSession);
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setValidationError(policyError);
      return;
    }
    if (newPassword !== confirmation) {
      setValidationError("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
      return;
    }
    setValidationError(null);
    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="password-change-title">
        <div className="brand login-brand">
          <ShieldCheck size={28} />
          <div>
            <strong>DCVP</strong>
            <span>계정 보안</span>
          </div>
        </div>
        <div className="login-copy">
          <span className="eyebrow">비밀번호 변경 필요</span>
          <h1 id="password-change-title">비밀번호를 변경해주세요</h1>
          <p>보안을 위해 비밀번호를 변경한 후에 관리자 콘솔을 이용할 수 있습니다.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label>
            현재 비밀번호
            <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" maxLength={256} autoComplete="current-password" required />
          </label>
          <label>
            새 비밀번호
            <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={12} maxLength={256} autoComplete="new-password" aria-describedby="password-policy" required />
          </label>
          <PasswordPolicyHint id="password-policy" />
          <label>
            새 비밀번호 확인
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} type="password" minLength={12} maxLength={256} autoComplete="new-password" required />
          </label>
          {validationError ? <div className="form-error" role="alert">{validationError}</div> : null}
          {mutation.isError ? <div className="form-error" role="alert">{mutation.error instanceof Error ? mutation.error.message : "비밀번호를 변경하지 못했습니다. 다시 시도해주세요."}</div> : null}
          <button className="primary-action" type="submit" disabled={mutation.isPending}>
            <KeyRound size={18} />
            {mutation.isPending ? "비밀번호 변경 중" : "비밀번호 변경"}
          </button>
        </form>
        <button className="ghost-action" type="button" onClick={onLogout}>
          <LogOut size={18} />
          로그아웃
        </button>
        <footer className="login-footer">
          <Link to="/privacy">개인정보 처리방침</Link>
          <span>개인정보 문의: {privacyContact.email}</span>
        </footer>
      </section>
    </main>
  );
}
