import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { CURRENT_PRIVACY_POLICY_VERSION } from "@dcvp/shared";
import type { AuthSession, CreateInitialAdminInput, RegisterInput, SetupStatus } from "@dcvp/shared";
import { Link } from "react-router-dom";
import { api } from "./api";
import { PasswordPolicyHint } from "./PasswordPolicyHint";
import { PrivacyConsentField } from "./PrivacyConsentField";
import { sessionTokenStore } from "./sessionTokenStore";
import { privacyContact } from "./privacyContact";
import { passwordPolicyError } from "./passwordPolicy";
import "./LoginPage.css";

const demoLoginDefaults = import.meta.env.DEV ? { email: "admin@acme.test", password: "@A1234567890" } : { email: "", password: "" };
const initialOperatorDefaults = { organizationName: "", name: "", email: "", password: "", privacyConsentAccepted: false, privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION } satisfies CreateInitialAdminInput;
const registrationDefaults = { name: "", email: "", password: "", privacyConsentAccepted: false, privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION } satisfies RegisterInput;

function setupStatusMessage(status?: SetupStatus) {
  if (!status) return "초기 운영자 계정 생성 가능 여부를 확인하는 중입니다.";
  switch (status.reason) {
    case "DATABASE_UNAVAILABLE":
      return "DB 연결이 없어 초기 운영자 생성은 비활성화되었습니다. 로컬 개발 환경에서는 테스트 계정으로 로그인할 수 있습니다.";
    case "USERS_EXIST":
      return "이미 운영자 계정이 생성되어 있습니다. 관리자 권한이 필요하면 가입 신청을 보내주세요.";
    case "READY":
      return "DB에 계정이 없으면 최초 운영자 계정을 생성할 수 있습니다.";
    default:
      return assertNeverSetupReason(status.reason);
  }
}

function assertNeverSetupReason(reason: never): never {
  throw new Error(`Unhandled setup status reason: ${reason}`);
}

export function LoginPage({ onLogin }: { readonly onLogin: (session: AuthSession) => void }) {
  const [email, setEmail] = useState(demoLoginDefaults.email);
  const [password, setPassword] = useState(demoLoginDefaults.password);
  const [initialOperator, setInitialOperator] = useState<CreateInitialAdminInput>(initialOperatorDefaults);
  const [registration, setRegistration] = useState<RegisterInput>(registrationDefaults);
  const [registrationValidationError, setRegistrationValidationError] = useState<string | null>(null);
  const [initialOperatorValidationError, setInitialOperatorValidationError] = useState<string | null>(null);
  const setupQuery = useQuery({ queryKey: ["auth-setup"], queryFn: api.setupStatus });
  const mutation = useMutation({
    mutationFn: api.login,
    onSuccess: (session) => {
      sessionTokenStore.set(session.token);
      onLogin(session);
    }
  });
  const setupMutation = useMutation({
    mutationFn: api.createInitialAdmin,
    onSuccess: (session) => {
      sessionTokenStore.set(session.token);
      onLogin(session);
    }
  });
  const registrationMutation = useMutation({
    mutationFn: api.register,
    onSuccess: (session) => {
      sessionTokenStore.set(session.token);
      onLogin(session);
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({ email, password });
  };
  const submitInitialOperator = (event: FormEvent) => {
    event.preventDefault();
    const validationError = passwordPolicyError(initialOperator.password);
    if (validationError) {
      setInitialOperatorValidationError(validationError);
      return;
    }
    setInitialOperatorValidationError(null);
    setupMutation.mutate(initialOperator);
  };
  const submitRegistration = (event: FormEvent) => {
    event.preventDefault();
    const validationError = passwordPolicyError(registration.password);
    if (validationError) {
      setRegistrationValidationError(validationError);
      return;
    }
    setRegistrationValidationError(null);
    registrationMutation.mutate(registration);
  };
  const fillDemoAccount = () => {
    setEmail(demoLoginDefaults.email);
    setPassword(demoLoginDefaults.password);
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand login-brand">
          <ShieldCheck size={28} />
          <div>
            <strong>DCVP</strong>
            <span>관리자 콘솔</span>
          </div>
        </div>
        <div className="login-copy">
          <span className="eyebrow">보안 로그인</span>
          <h1>관리자 콘솔</h1>
          <p>시험, 문제, 응시자, 실시간 감독, 평가 리포트를 관리합니다.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label>
            이메일
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            비밀번호
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" maxLength={256} required />
          </label>
          {import.meta.env.DEV ? (
            <div className="login-demo-account">
              <div>
                <strong>테스트 운영자</strong>
                <span>{demoLoginDefaults.email} / {demoLoginDefaults.password}</span>
              </div>
              <button className="ghost-action" type="button" onClick={fillDemoAccount}>
                <KeyRound size={16} />
                입력
              </button>
            </div>
          ) : null}
          {mutation.isError ? <div className="form-error" role="alert">로그인 정보를 확인해주세요.</div> : null}
          <button className="primary-action" type="submit" disabled={mutation.isPending}>
            <ShieldCheck size={18} />
            로그인
          </button>
        </form>

        <div className="login-divider" />

        <form className="login-form" onSubmit={submitRegistration}>
          <div className="login-copy login-copy-compact">
            <span className="eyebrow">일반 회원가입</span>
            <h2>일반 계정 생성</h2>
            <p>계정을 만든 뒤 조직 코드 또는 초대를 통해 소속 신청을 할 수 있습니다.</p>
          </div>
          <label>이름<input value={registration.name} onChange={(event) => setRegistration({ ...registration, name: event.target.value })} required /></label>
          <label>이메일<input value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} type="email" required /></label>
          <label>비밀번호<input value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })} type="password" minLength={12} maxLength={256} autoComplete="new-password" aria-describedby="registration-password-policy" required /></label>
          <PasswordPolicyHint id="registration-password-policy" />
          <PrivacyConsentField checked={registration.privacyConsentAccepted} describedBy="registration-privacy-consent" onChange={(privacyConsentAccepted) => setRegistration({ ...registration, privacyConsentAccepted })} />
          {registrationValidationError ? <div className="form-error" role="alert">{registrationValidationError}</div> : null}
          {registrationMutation.isError ? <div className="form-error" role="alert">{registrationMutation.error instanceof Error ? registrationMutation.error.message : "계정을 생성하지 못했습니다."}</div> : null}
          <button className="secondary-action" type="submit" disabled={registrationMutation.isPending}><UserPlus size={18} />계정 생성</button>
        </form>

        {setupQuery.data?.enabled ? (
          <>
            <div className="login-divider" />
            <form className="login-form" onSubmit={submitInitialOperator}>
              <div className="login-copy login-copy-compact">
                <span className="eyebrow">초기 설정</span>
                <h2>최초 운영자 생성</h2>
                <p>{setupStatusMessage(setupQuery.data)}</p>
              </div>
              <label>
                운영 조직명
                <input value={initialOperator.organizationName} onChange={(event) => setInitialOperator({ ...initialOperator, organizationName: event.target.value })} required />
              </label>
              <label>
                운영자 이름
                <input value={initialOperator.name} onChange={(event) => setInitialOperator({ ...initialOperator, name: event.target.value })} required />
              </label>
              <label>
                운영자 이메일
                <input value={initialOperator.email} onChange={(event) => setInitialOperator({ ...initialOperator, email: event.target.value })} type="email" required />
              </label>
              <label>
                운영자 비밀번호
                <input value={initialOperator.password} onChange={(event) => setInitialOperator({ ...initialOperator, password: event.target.value })} type="password" minLength={12} maxLength={256} autoComplete="new-password" aria-describedby="initial-operator-password-policy" required />
              </label>
              <PasswordPolicyHint id="initial-operator-password-policy" />
              <PrivacyConsentField checked={initialOperator.privacyConsentAccepted} describedBy="initial-operator-privacy-consent" onChange={(privacyConsentAccepted) => setInitialOperator({ ...initialOperator, privacyConsentAccepted })} />
              {initialOperatorValidationError ? <div className="form-error" role="alert">{initialOperatorValidationError}</div> : null}
              {setupMutation.isError ? <div className="form-error" role="alert">{setupMutation.error instanceof Error ? setupMutation.error.message : "최초 운영자 생성에 실패했습니다."}</div> : null}
              <button className="secondary-action" type="submit" disabled={setupMutation.isPending}>
                <UserPlus size={18} />
                최초 운영자 생성
              </button>
            </form>
          </>
        ) : null}
        <footer className="login-footer"><Link to="/privacy">개인정보 처리방침</Link><span>개인정보 문의: {privacyContact.email}</span></footer>
      </section>
    </main>
  );
}
