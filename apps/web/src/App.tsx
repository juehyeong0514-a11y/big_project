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

export function App() {
  const location = useLocation();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    if (location.pathname.startsWith("/candidate/")) {
      setCheckingSession(false);
      return;
    }
    const token = localStorage.getItem("dcvp_session_token");
    if (!token) {
      setCheckingSession(false);
      return;
    }
    api.me(token).then(setSession).catch(() => localStorage.removeItem("dcvp_session_token")).finally(() => setCheckingSession(false));
  }, [location.pathname]);
  const logout = () => {
    const token = localStorage.getItem("dcvp_session_token");
    if (token) void api.logout(token);
    localStorage.removeItem("dcvp_session_token");
    setSession(null);
  };
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
  if (location.pathname === "/login") return <Navigate to="/" replace />;
  return <AdminShell session={session} onLogout={logout} onSessionUpdated={setSession} />;
}
