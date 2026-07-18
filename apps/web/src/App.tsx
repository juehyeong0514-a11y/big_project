import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { AuthSession } from "@dcvp/shared";
import { api } from "./api";
import { AdminShell } from "./AdminShell";
import { CandidateMobileProctor } from "./CandidateProctor";
import { CandidateEnvironmentCheck } from "./CandidateEnvironmentCheck";
import { CandidateEntry, CandidateIdentityVerification, CandidateMobileIdentityVerification } from "./CandidateFlow";
import { CandidateExamWorkspace } from "./CandidateExamWorkspace";
import { LoginPage } from "./LoginPage";
import { PasswordChangePage } from "./PasswordChangePage";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage";
import { sessionTokenStore } from "./sessionTokenStore";

export function App() {
  const location = useLocation();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    if (location.pathname.startsWith("/candidate/")) {
      setCheckingSession(false);
      return;
    }
    const token = sessionTokenStore.get();
    if (!token) {
      setCheckingSession(false);
      return;
    }
    api.me(token).then(setSession).catch(() => sessionTokenStore.remove()).finally(() => setCheckingSession(false));
  }, [location.pathname]);
  const logout = () => {
    const token = sessionTokenStore.get();
    if (token) void api.logout(token);
    sessionTokenStore.remove();
    setSession(null);
  };
  if (location.pathname === "/privacy") return <PrivacyPolicyPage />;
  if (location.pathname.startsWith("/candidate/")) {
    return (
      <Routes>
        <Route path="/candidate/:inviteToken" element={<CandidateEntry />} />
        <Route path="/candidate/:inviteToken/check" element={<CandidateEnvironmentCheck />} />
        <Route path="/candidate/:inviteToken/identity" element={<CandidateIdentityVerification />} />
        <Route path="/candidate/:inviteToken/mobile-identity" element={<CandidateMobileIdentityVerification />} />
        <Route path="/candidate/:inviteToken/mobile-proctor" element={<CandidateMobileProctor />} />
        <Route path="/candidate/:inviteToken/exam" element={<CandidateExamWorkspace />} />
      </Routes>
    );
  }
  if (checkingSession) return <main className="login-page">세션을 확인하는 중입니다.</main>;
  if (!session) return <LoginPage onLogin={setSession} />;
  if (session.passwordChangeRequired) return <PasswordChangePage session={session} onSessionUpdated={setSession} onLogout={logout} />;
  if (location.pathname === "/login") return <Navigate to="/" replace />;
  return <AdminShell session={session} onLogout={logout} onSessionUpdated={setSession} />;
}
